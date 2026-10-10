import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { VoiceInput } from "../src/ui/composer/voice_input.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import {
  FakeMediaRecorder,
  FakeMediaStream,
  installFakeMedia,
  type PendingPrompt,
} from "./helpers/fake_media.js";

/** Drain microtasks so the async start/finish chain settles. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** A promise and the two hands that settle it, to hold an await open. */
interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Everything about the button a user or a screen reader can perceive. */
function perceived(button: HTMLButtonElement): Record<string, unknown> {
  return {
    state: button.dataset["state"],
    title: button.title,
    label: button.getAttribute("aria-label"),
    pressed: button.getAttribute("aria-pressed"),
    disabled: button.disabled,
  };
}

/**
 * Replace the helper's always-granting `getUserMedia` with one that waits, the
 * way a permission prompt the user has not answered yet does. The helper's
 * `restore()` puts the original back, so this needs no undo of its own.
 */
function holdPermissionPrompt(): Deferred<MediaStream> {
  const prompt = deferred<MediaStream>();
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: () => prompt.promise },
  });
  return prompt;
}

let media: ReturnType<typeof installFakeMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
  vi.useRealTimers();
});

describe("VoiceInput", () => {
  it("starts idle with the record label and mic glyph", () => {
    const voice = new VoiceInput({ transcribe: async () => "", onText: () => {} });
    expect(voice.element.getAttribute("part")).toBe("voice-button");
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.getAttribute("aria-label")).toBe("Record voice");
    // The glyph is slotted, so a host can project its own mic mark.
    expect(voice.element.querySelector('slot[name="icon-voice"] svg')).not.toBeNull();
  });

  it("records, transcribes on stop, and delivers the text", async () => {
    media = installFakeMedia();
    const transcribe = vi.fn().mockResolvedValue("transcribed words");
    const got: string[] = [];
    const voice = new VoiceInput({ transcribe, onText: (t) => got.push(t) });

    voice.element.click(); // start
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");
    expect(voice.element.getAttribute("aria-pressed")).toBe("true");

    voice.element.click(); // stop → transcribe
    await flush();
    // A clip was handed to the transcriber, the text delivered, button back to idle.
    expect(transcribe).toHaveBeenCalledOnce();
    const clip = transcribe.mock.calls[0]?.[0] as Blob | undefined;
    expect(clip?.type).toBe("audio/webm");
    expect(got).toEqual(["transcribed words"]);
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.getAttribute("aria-pressed")).toBe("false");
    // The mic track was released.
    expect(media.recorder().stream.track.stopped).toBe(true);
  });

  it("does not deliver empty transcripts (and defaults a blank codec mime)", async () => {
    media = installFakeMedia();
    const seen: Blob[] = [];
    const voice = new VoiceInput({
      transcribe: async (audio) => {
        seen.push(audio);
        return "";
      },
      onText: (t) => seen.push(new Blob([t])),
    });
    voice.element.click();
    await flush();
    // A recorder that reports no mime type falls back to audio/webm.
    media.recorder().mimeType = "";
    voice.element.click();
    await flush();
    expect(seen).toHaveLength(1); // the clip; no onText for empty text
    expect(seen[0]?.type).toBe("audio/webm");
    expect(voice.element.dataset["state"]).toBe("idle");
  });

  it("falls back to a generic message when a non-Error is thrown", async () => {
    media = installFakeMedia();
    const voice = new VoiceInput({
      transcribe: () => Promise.reject("nope"),
      onText: () => {},
    });
    voice.element.click();
    await flush();
    voice.element.click();
    await flush();
    expect(voice.element.title).toBe("Transcription failed");
  });

  it("surfaces a denied-permission failure and stays idle", async () => {
    media = installFakeMedia({ deny: true });
    const voice = new VoiceInput({ transcribe: async () => "x", onText: () => {} });
    voice.element.click();
    await flush();
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.title).toBe("Transcription failed");
  });

  // A granted stream the browser then cannot record. The click discards the
  // promise, so each test awaits toggle() itself: a rejection is what an
  // unhandled one looks like from outside.
  it.each([
    ["constructor throws", { failConstruct: 1 }],
    ["start() throws", { failStart: 1 }],
  ])("treats a recorder that fails to start like a refused mic (%s)", async (_name, options) => {
    media = installFakeMedia(options);
    const voice = new VoiceInput({ transcribe: async () => "x", onText: () => {} });
    await expect(voice.toggle()).resolves.toBeUndefined();
    expect(media.streams()).toHaveLength(1);
    expect(media.streams()[0]?.track.stopped).toBe(true);
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.title).toBe("Transcription failed");
  });

  it.each([
    ["constructor throws", { failConstruct: 1 }],
    ["start() throws", { failStart: 1 }],
  ])(
    "records normally after a failed start releases the first stream (%s)",
    async (_name, options) => {
      media = installFakeMedia(options);
      const onText = vi.fn();
      const voice = new VoiceInput({ transcribe: async () => "heard", onText });
      // Swallowed so that, unfixed, the assertions below still run and name
      // the leaked first stream rather than the rejection.
      await voice.toggle().catch(() => {});
      await voice.toggle();
      expect(voice.element.dataset["state"]).toBe("recording");
      await voice.toggle();
      await flush();
      expect(onText).toHaveBeenCalledWith("heard");
      expect(media.streams()).toHaveLength(2);
      expect(media.streams().map((stream) => stream.track.stopped)).toEqual([true, true]);
    },
  );

  it("surfaces a transcription failure on the button title", async () => {
    media = installFakeMedia();
    const voice = new VoiceInput({
      transcribe: async () => {
        throw new Error("server is down");
      },
      onText: () => {},
    });
    voice.element.click();
    await flush();
    voice.element.click();
    await flush();
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.title).toBe("server is down");
  });

  it("ignores clicks while a clip is transcribing", async () => {
    media = installFakeMedia();
    let resolve: (text: string) => void = () => {};
    const transcribe = vi.fn().mockReturnValue(
      new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const voice = new VoiceInput({ transcribe, onText: () => {} });
    voice.element.click(); // start
    await flush();
    voice.element.click(); // stop → transcribing (promise pending)
    await flush();
    expect(voice.element.dataset["state"]).toBe("transcribing");
    expect(voice.element.disabled).toBe(true);

    // A programmatic toggle while transcribing is a no-op (the button is also
    // disabled, so a click can't reach it — exercise the guard directly).
    await voice.toggle();
    expect(transcribe).toHaveBeenCalledOnce();

    resolve("done");
    await flush();
    expect(voice.element.dataset["state"]).toBe("idle");
  });

  it("dispose while recording releases the mic and suppresses transcription", async () => {
    media = installFakeMedia();
    const transcribe = vi.fn().mockResolvedValue("late");
    const got: string[] = [];
    const voice = new VoiceInput({ transcribe, onText: (t) => got.push(t) });
    voice.element.click(); // start
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");

    voice.dispose();
    await flush();
    // The mic track was stopped and the pending stop never transcribed.
    expect(media.recorder().stream.track.stopped).toBe(true);
    expect(transcribe).not.toHaveBeenCalled();
    expect(got).toEqual([]);
  });

  it("stops itself at the recording cap instead of holding the mic open", async () => {
    // A user who taps the mic, is interrupted, and leaves the tab open: nothing
    // else stops the recorder, so the chunks grow and the browser's recording
    // indicator stays lit until they come back.
    vi.useFakeTimers();
    media = installFakeMedia();
    const transcribe = vi.fn().mockResolvedValue("dictated words");
    const got: string[] = [];
    const voice = new VoiceInput({ transcribe, onText: (t) => got.push(t) });

    voice.element.click();
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");

    vi.advanceTimersByTime(120_000);
    await flush();

    // The mic is released and the clip is kept, not discarded: the user gets
    // the words they already spoke.
    expect(media.recorder().state).toBe("inactive");
    expect(media.recorder().stream.track.stopped).toBe(true);
    expect(transcribe).toHaveBeenCalledOnce();
    expect(got).toEqual(["dictated words"]);
    expect(voice.element.dataset["state"]).toBe("idle");
    // ...and the button says why it stopped on its own, rather than leaving the
    // user to guess whether the recording is still running.
    expect(voice.element.title).toBe(DEFAULT_UI_STRINGS.recordingLimit.replace("{n}", "2"));
  });

  it("fills the recording cap everywhere a translation uses it", async () => {
    // A string pattern fills only its first occurrence.
    vi.useFakeTimers();
    media = installFakeMedia();
    const voice = new VoiceInput({
      transcribe: vi.fn().mockResolvedValue("dictated words"),
      onText: () => {},
      strings: { ...DEFAULT_UI_STRINGS, recordingLimit: "{n} min cap: stopped at {n} min" },
    });

    voice.element.click();
    await flush();
    vi.advanceTimersByTime(120_000);
    await flush();

    expect(voice.element.title).toBe("2 min cap: stopped at 2 min");
  });

  it("drops the cap when a recording ends on its own terms", async () => {
    // A stale timer would stop the *next* recording early, or fire into a
    // control that has already gone idle.
    vi.useFakeTimers();
    media = installFakeMedia();
    const transcribe = vi.fn().mockResolvedValue("short answer");
    const voice = new VoiceInput({ transcribe, onText: () => {} });

    voice.element.click(); // start
    await flush();
    voice.element.click(); // stop, well inside the cap
    await flush();
    expect(transcribe).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(120_000);
    await flush();
    expect(transcribe).toHaveBeenCalledOnce();
    expect(voice.element.title).toBe(DEFAULT_UI_STRINGS.recordVoice);
  });

  it("dispose when idle is a safe no-op", () => {
    const voice = new VoiceInput({ transcribe: async () => "", onText: () => {} });
    expect(() => voice.dispose()).not.toThrow();
  });
});

describe("VoiceInput after dispose", () => {
  /** Record, then stop, so the clip is posted and the await is open. */
  async function transcribing(voice: VoiceInput): Promise<void> {
    voice.element.click(); // start
    await flush();
    voice.element.click(); // stop, which posts the clip
    await flush();
    expect(voice.element.dataset["state"]).toBe("transcribing");
  }

  it("drops a transcript that comes back after dispose, and leaves the button alone", async () => {
    media = installFakeMedia();
    const pending = deferred<string>();
    const got: string[] = [];
    const voice = new VoiceInput({ transcribe: () => pending.promise, onText: (t) => got.push(t) });
    await transcribing(voice);

    voice.dispose();
    const before = perceived(voice.element);
    pending.resolve("words dictated before dispose");
    await flush();

    expect(got).toEqual([]);
    expect(perceived(voice.element)).toEqual(before);
  });

  it("draws no error for a transcription that fails after dispose", async () => {
    media = installFakeMedia();
    const pending = deferred<string>();
    const voice = new VoiceInput({ transcribe: () => pending.promise, onText: () => {} });
    await transcribing(voice);

    voice.dispose();
    const before = perceived(voice.element);
    pending.reject(new Error("server is down"));
    await flush();

    expect(voice.element.title).not.toBe("server is down");
    expect(perceived(voice.element)).toEqual(before);
  });

  it("delivers only the live clip when a fresh control replaces a disposed one", async () => {
    // What the host does on a change of user-key: dispose this mic, then build
    // a new one writing into the same composer. The old clip's answer arrives
    // while the next principal is mid-recording.
    media = installFakeMedia();
    const composer: string[] = [];
    const pending = deferred<string>();
    const previous = new VoiceInput({
      transcribe: () => pending.promise,
      onText: (t) => composer.push(t),
    });
    await transcribing(previous);
    previous.dispose();

    const next = new VoiceInput({
      transcribe: vi.fn().mockResolvedValue("the next principal's words"),
      onText: (t) => composer.push(t),
    });
    next.element.click(); // start
    await flush();
    pending.resolve("the previous principal's words");
    await flush();
    expect(composer).toEqual([]);
    expect(next.element.dataset["state"]).toBe("recording");

    next.element.click(); // stop and transcribe, as today
    await flush();
    expect(composer).toEqual(["the next principal's words"]);
    expect(next.element.dataset["state"]).toBe("idle");
    expect(next.element.title).toBe(DEFAULT_UI_STRINGS.recordVoice);
  });

  it("releases a mic granted after dispose instead of recording on it", async () => {
    // The permission prompt was still open when the control went away. Nothing
    // can stop a recording that starts now: dispose has already run and the
    // button is no longer on the page.
    media = installFakeMedia();
    const prompt = holdPermissionPrompt();
    const voice = new VoiceInput({ transcribe: async () => "x", onText: () => {} });
    voice.element.click();
    await flush();

    voice.dispose();
    const before = perceived(voice.element);
    const stream = new FakeMediaStream();
    prompt.resolve(stream as unknown as MediaStream);
    await flush();

    expect(stream.track.stopped).toBe(true);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(perceived(voice.element)).toEqual(before);
  });

  it("draws no error for a mic refused after dispose", async () => {
    media = installFakeMedia();
    const prompt = holdPermissionPrompt();
    const voice = new VoiceInput({ transcribe: async () => "x", onText: () => {} });
    voice.element.click();
    await flush();

    voice.dispose();
    const before = perceived(voice.element);
    prompt.reject(new Error("denied"));
    await flush();

    expect(voice.element.title).not.toBe(DEFAULT_UI_STRINGS.transcriptionFailed);
    expect(perceived(voice.element)).toEqual(before);
  });
});

describe("VoiceInput with overlapping starts", () => {
  // The button stays idle for the whole of the permission prompt, so a second
  // click during it is accepted as a second start. The latest click wins: a
  // start that settles after a newer one began belongs to a click nobody is
  // waiting on any more, and must release what it was given without touching
  // what the newer start owns. Every test here uses a prompt it settles by hand.

  function gatedControl(): { voice: VoiceInput; fake: ReturnType<typeof installFakeMedia> } {
    const fake = installFakeMedia({ gated: true });
    media = fake;
    const voice = new VoiceInput({
      transcribe: vi.fn().mockResolvedValue("words"),
      onText: () => {},
    });
    return { voice, fake };
  }

  /** Two clicks while the first prompt is still open. */
  async function clickTwice(voice: VoiceInput): Promise<void> {
    voice.element.click();
    voice.element.click();
    await flush();
    expect(voice.element.dataset["state"]).toBe("idle");
  }

  function prompt(fake: ReturnType<typeof installFakeMedia>, index: number): PendingPrompt {
    const found = fake.prompts()[index];
    if (found === undefined) {
      throw new Error(`getUserMedia was not called ${index + 1} times`);
    }
    return found;
  }

  it("records once when two starts resolve in order, and one stop click ends everything", async () => {
    vi.useFakeTimers();
    const { voice, fake } = gatedControl();
    await clickTwice(voice);

    // The first grant belongs to a click that has been superseded: its mic is
    // released and nothing records on it.
    const first = prompt(fake, 0);
    first.grant();
    await flush();
    expect(first.stream.track.stopped).toBe(true);
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(voice.element.dataset["state"]).toBe("idle");

    const second = prompt(fake, 1);
    second.grant();
    await flush();
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(second.stream.track.stopped).toBe(false);
    expect(voice.element.dataset["state"]).toBe("recording");

    voice.element.click(); // one stop click
    await flush();
    expect(fake.recorder().state).toBe("inactive");
    expect(first.stream.track.stopped).toBe(true);
    expect(second.stream.track.stopped).toBe(true);
    expect(voice.element.dataset["state"]).toBe("idle");
    // No cap timer is left armed for a recording that is over.
    expect(vi.getTimerCount()).toBe(0);
  });

  it("records once when the second start resolves first and the first resolves late", async () => {
    vi.useFakeTimers();
    const { voice, fake } = gatedControl();
    await clickTwice(voice);

    const first = prompt(fake, 0);
    const second = prompt(fake, 1);
    second.grant();
    await flush();
    const recorder = fake.recorder();
    expect(voice.element.dataset["state"]).toBe("recording");

    // The late grant must not take the recording over, restart it, or arm a
    // second timer: it only releases its own mic.
    first.grant();
    await flush();
    expect(first.stream.track.stopped).toBe(true);
    expect(second.stream.track.stopped).toBe(false);
    expect(FakeMediaRecorder.instances).toEqual([recorder]);
    expect(recorder.state).toBe("recording");
    expect(vi.getTimerCount()).toBe(1);

    voice.element.click();
    await flush();
    expect(recorder.state).toBe("inactive");
    expect(second.stream.track.stopped).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves nothing live when the start that wins fails to record", async () => {
    vi.useFakeTimers();
    const transcribe = vi.fn().mockResolvedValue("words");
    const fake = installFakeMedia({ gated: true });
    media = fake;
    const voice = new VoiceInput({ transcribe, onText: () => {} });
    await clickTwice(voice);

    const first = prompt(fake, 0);
    first.grant();
    await flush();
    // Armed after the first settles, so only the second start's recorder throws.
    FakeMediaRecorder.startFailures = 1;
    const second = prompt(fake, 1);
    second.grant();
    await flush();

    expect(first.stream.track.stopped).toBe(true);
    expect(second.stream.track.stopped).toBe(true);
    // The superseded start never built a recorder; only the winner's, which threw.
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.title).toBe(DEFAULT_UI_STRINGS.transcriptionFailed);
    expect(vi.getTimerCount()).toBe(0);
    // A first recorder that had started would still be running here, with no
    // handle to stop it by; the cap would fire into nothing.
    vi.advanceTimersByTime(120_000);
    await flush();
    expect(transcribe).not.toHaveBeenCalled();
  });

  it("does not cut a later recording short with an earlier start's timer", async () => {
    vi.useFakeTimers();
    const { voice, fake } = gatedControl();
    await clickTwice(voice);
    prompt(fake, 0).grant();
    prompt(fake, 1).grant();
    await flush();
    voice.element.click(); // stop, well inside the cap
    await flush();
    expect(voice.element.dataset["state"]).toBe("idle");

    // A new, unrelated recording a hundred seconds in.
    vi.advanceTimersByTime(100_000);
    voice.element.click();
    await flush();
    prompt(fake, 2).grant();
    await flush();
    const later = fake.recorder();
    expect(later.state).toBe("recording");

    // The first start's two minutes are up: only the later recording's own
    // cap, at 220 s, may stop it.
    vi.advanceTimersByTime(20_000);
    await flush();
    expect(later.state).toBe("recording");
    expect(voice.element.dataset["state"]).toBe("recording");
    expect(voice.element.title).not.toBe(DEFAULT_UI_STRINGS.recordingLimit.replace("{n}", "2"));
    vi.advanceTimersByTime(100_000);
    await flush();
    expect(later.state).toBe("inactive");
  });

  it("keeps the recording the later start made when the earlier one is refused late", async () => {
    vi.useFakeTimers();
    const { voice, fake } = gatedControl();
    await clickTwice(voice);

    const second = prompt(fake, 1);
    second.grant();
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");

    // A refusal on the superseded click must not release the live stream, drop
    // the recorder or draw an error over a recording that is going fine.
    prompt(fake, 0).refuse();
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");
    expect(voice.element.title).toBe(DEFAULT_UI_STRINGS.stopRecording);
    expect(second.stream.track.stopped).toBe(false);
    expect(vi.getTimerCount()).toBe(1);

    voice.element.click();
    await flush();
    expect(fake.recorder().state).toBe("inactive");
    expect(second.stream.track.stopped).toBe(true);
  });

  it("draws no error for a superseded start that is refused while the newer one waits", async () => {
    const { voice, fake } = gatedControl();
    await clickTwice(voice);

    prompt(fake, 0).refuse();
    await flush();
    expect(voice.element.title).toBe(DEFAULT_UI_STRINGS.recordVoice);

    prompt(fake, 1).grant();
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");
  });

  // A guard against the design this fix rejects, not a regression of the leak:
  // the code before the fix also starts here. A blocking flag that ignored
  // clicks until getUserMedia settled would fail it, and getUserMedia is allowed
  // never to settle (a dismissed prompt), which would leave the mic dead.
  it("still starts on a later click when an earlier prompt never settles", async () => {
    const { voice, fake } = gatedControl();
    voice.element.click(); // dismissed without an answer: never settled
    await flush();
    expect(voice.element.disabled).toBe(false);

    voice.element.click();
    await flush();
    prompt(fake, 1).grant();
    await flush();
    expect(voice.element.dataset["state"]).toBe("recording");
    expect(FakeMediaRecorder.instances).toHaveLength(1);

    voice.element.click();
    await flush();
    expect(fake.recorder().state).toBe("inactive");
    expect(prompt(fake, 1).stream.track.stopped).toBe(true);
  });
});

describe("VoiceInput in <ag-ui-chat>, across a change of user-key", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("drops a clip already posted for transcription, so it lands in nobody's composer", async () => {
    media = installFakeMedia();
    const pending = deferred<string>();
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("user-key", "alice");
    el.setAttribute("data-start-open", "");
    el.transcribeHandler = () => pending.promise;
    document.body.appendChild(el);
    const root = el.shadowRoot;
    const input = root?.querySelector(".input");
    if (root === null || !(input instanceof HTMLTextAreaElement)) {
      throw new Error("expected a shadow root with a composer");
    }
    const aliceMic = root.querySelector<HTMLButtonElement>(".voice-btn");
    aliceMic?.click(); // start
    await flush();
    aliceMic?.click(); // stop, which posts her clip
    await flush();
    expect(aliceMic?.dataset["state"]).toBe("transcribing");

    el.setAttribute("user-key", "bob");
    await flush();
    pending.resolve("alice's dictated account number");
    await flush();

    expect(input.value).toBe("");
    // Bob has a mic of his own, idle, and her clip coming back did not touch it.
    const mics = root.querySelectorAll<HTMLButtonElement>(".voice-btn");
    expect(mics).toHaveLength(1);
    expect(mics[0]).not.toBe(aliceMic);
    expect(mics[0]?.dataset["state"]).toBe("idle");
    expect(mics[0]?.title).toBe(DEFAULT_UI_STRINGS.recordVoice);
  });
});
