import { afterEach, describe, expect, it, vi } from "vitest";
import { VoiceInput } from "../src/ui/voice_input.js";
import { installFakeMedia } from "./helpers/fake_media.js";

/** Drain microtasks so the async start/finish chain settles. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

let media: ReturnType<typeof installFakeMedia> | null = null;

afterEach(() => {
  media?.restore();
  media = null;
});

describe("VoiceInput", () => {
  it("starts idle with the record label and mic glyph", () => {
    const voice = new VoiceInput({ transcribe: async () => "", onText: () => {} });
    expect(voice.element.getAttribute("part")).toBe("voice-button");
    expect(voice.element.dataset["state"]).toBe("idle");
    expect(voice.element.getAttribute("aria-label")).toBe("Record voice");
    expect(voice.element.textContent).toBe("🎤");
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
    expect((transcribe.mock.calls[0]?.[0] as Blob).type).toBe("audio/webm");
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
});
