import { ICON_VOICE } from "../constants.js";
import type { TranscribeHandler } from "../core/transcribe_audio.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** Lifecycle of the mic button, reflected on its `data-state` for CSS. */
type VoiceState = "idle" | "recording" | "transcribing";

/**
 * How long one recording may run before it stops itself.
 *
 * Two minutes is a ceiling, not a target: dictating into a chat composer is a
 * sentence or two, and two minutes of speech is roughly 350 words — longer than
 * any message this control is for. What it bounds is the case that has no end
 * at all, a mic left live in a forgotten tab: about a megabyte of accumulated
 * Opus, a recording indicator the user is no longer watching, and eventually a
 * multipart upload no client-side check sizes.
 *
 * Hitting it stops and transcribes; the audio is never discarded, because a cap
 * the user was not told about must not cost them the words they already spoke.
 */
const MAX_RECORDING_MS = 120_000;

/** Construction options for {@link VoiceInput}. */
export interface VoiceInputOptions {
  /** Turns a recorded clip into text (the built-in or a custom transport). */
  readonly transcribe: TranscribeHandler;
  /** Called with the transcript when a recording transcribes successfully. */
  readonly onText: (text: string) => void;
  /** UI string table (labels/tooltips). */
  readonly strings?: UiStrings;
}

/**
 * The composer's voice-input control: a mic button that records via
 * `MediaRecorder`, then POSTs the clip through a {@link TranscribeHandler} and
 * hands the transcript back via `onText`.
 *
 * Click to start recording, which prompts for mic permission, and again to stop
 * and transcribe. The button reflects its `idle` / `recording` / `transcribing`
 * state on `data-state` for theming and is exposed as `part="voice-button"`; a
 * capture or transcription failure returns it to idle and surfaces the message
 * on its tooltip.
 *
 * Pure DOM. The host mounts {@link element} in the input row.
 */
export class VoiceInput {
  /** The mic button; mount this in the composer. */
  readonly element: HTMLButtonElement;

  readonly #transcribe: TranscribeHandler;
  readonly #onText: (text: string) => void;
  readonly #strings: UiStrings;
  #state: VoiceState = "idle";
  #recorder: MediaRecorder | null = null;
  #stream: MediaStream | null = null;
  #chunks: Blob[] = [];
  #capTimer: ReturnType<typeof setTimeout> | null = null;
  #hitCap = false;
  #disposed = false;

  constructor(options: VoiceInputOptions) {
    this.#transcribe = options.transcribe;
    this.#onText = options.onText;
    this.#strings = options.strings ?? DEFAULT_UI_STRINGS;

    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.className = "voice-btn";
    this.element.setAttribute("part", "voice-button");
    // The mic glyph, in a slot so a host can project its own mark. Author-written
    // constant markup, never user or server data.
    const glyph = document.createElement("slot");
    glyph.name = "icon-voice";
    glyph.innerHTML = ICON_VOICE;
    this.element.append(glyph);
    this.#setState("idle");
    this.element.addEventListener("click", () => {
      void this.toggle();
    });
  }

  /** Start recording when idle, stop (and transcribe) when recording. */
  async toggle(): Promise<void> {
    if (this.#state === "recording") {
      this.#stop();
      return;
    }
    if (this.#state === "transcribing") {
      return;
    }
    await this.#start();
  }

  async #start(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      this.#fail(this.#strings.transcriptionFailed);
      return;
    }
    this.#stream = stream;
    this.#chunks = [];
    this.#hitCap = false;
    const recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
      this.#chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      void this.#finish(recorder.mimeType);
    });
    this.#recorder = recorder;
    recorder.start();
    // Nothing else ends a recording: `MediaRecorder` runs until it is told to
    // stop, so without this the only exits are a second click and `dispose()`.
    this.#capTimer = setTimeout(() => {
      this.#hitCap = true;
      this.#stop();
    }, MAX_RECORDING_MS);
    this.#setState("recording");
  }

  #stop(): void {
    this.#clearCap();
    // ``stop`` flushes a final ``dataavailable`` then fires ``stop`` → #finish.
    this.#recorder?.stop();
  }

  /** Drop the cap timer; recording is over, by whichever route. */
  #clearCap(): void {
    if (this.#capTimer !== null) {
      clearTimeout(this.#capTimer);
      this.#capTimer = null;
    }
  }

  /**
   * Tear the control down, for a host element removed mid-recording. Stops any
   * live `MediaRecorder`, releases the mic tracks so the browser's recording
   * indicator clears, and suppresses the pending transcription — a
   * disconnected control must not fire `onText` into a detached element.
   */
  dispose(): void {
    this.#disposed = true;
    this.#clearCap();
    if (this.#recorder !== null && this.#recorder.state !== "inactive") {
      this.#recorder.stop();
    }
    this.#recorder = null;
    this.#releaseStream();
  }

  async #finish(mimeType: string): Promise<void> {
    if (this.#disposed) {
      return;
    }
    this.#releaseStream();
    this.#setState("transcribing");
    const audio = new Blob(this.#chunks, { type: mimeType || "audio/webm" });
    try {
      const text = await this.#transcribe(audio);
      this.#setState("idle");
      if (this.#hitCap) {
        // #setState has just reset the tooltip to the idle label, so this goes
        // after it. It says why the mic went quiet on its own — the transcript
        // below is the proof nothing was thrown away.
        this.element.title = this.#strings.recordingLimit.replace(
          "{n}",
          String(MAX_RECORDING_MS / 60_000),
        );
      }
      if (text !== "") {
        this.#onText(text);
      }
    } catch (error) {
      this.#fail(error instanceof Error ? error.message : this.#strings.transcriptionFailed);
    } finally {
      this.#recorder = null;
    }
  }

  /** Stop the mic tracks so the browser's recording indicator clears. */
  #releaseStream(): void {
    for (const track of this.#stream?.getTracks() ?? []) {
      track.stop();
    }
    this.#stream = null;
  }

  #fail(message: string): void {
    this.#releaseStream();
    this.#recorder = null;
    this.#setState("idle");
    this.element.title = message;
  }

  #setState(state: VoiceState): void {
    this.#state = state;
    this.element.dataset["state"] = state;
    const label = this.#labelFor(state);
    this.element.title = label;
    this.element.setAttribute("aria-label", label);
    this.element.setAttribute("aria-pressed", String(state === "recording"));
    // The control is inert while a clip transcribes (no second recording yet).
    this.element.disabled = state === "transcribing";
  }

  #labelFor(state: VoiceState): string {
    if (state === "recording") {
      return this.#strings.stopRecording;
    }
    if (state === "transcribing") {
      return this.#strings.transcribing;
    }
    return this.#strings.recordVoice;
  }
}
