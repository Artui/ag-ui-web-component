import type { TranscribeHandler } from "../core/transcribe_audio.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** Lifecycle of the mic button, reflected on its `data-state` for CSS. */
type VoiceState = "idle" | "recording" | "transcribing";

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
 * Click to start recording (browser mic permission prompt), click again to stop
 * — the clip is transcribed and dropped into the composer. The button reflects
 * its `idle` / `recording` / `transcribing` state on `data-state` for theming
 * and is exposed as `part="voice-button"`. A capture or transcription failure
 * returns the button to idle and surfaces the message on its tooltip.
 *
 * Pure DOM (no framework); the host mounts {@link element} in the input row.
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
  #disposed = false;

  constructor(options: VoiceInputOptions) {
    this.#transcribe = options.transcribe;
    this.#onText = options.onText;
    this.#strings = options.strings ?? DEFAULT_UI_STRINGS;

    this.element = document.createElement("button");
    this.element.type = "button";
    this.element.className = "voice-btn";
    this.element.setAttribute("part", "voice-button");
    this.element.textContent = "🎤";
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
    const recorder = new MediaRecorder(stream);
    recorder.addEventListener("dataavailable", (event) => {
      this.#chunks.push(event.data);
    });
    recorder.addEventListener("stop", () => {
      void this.#finish(recorder.mimeType);
    });
    this.#recorder = recorder;
    recorder.start();
    this.#setState("recording");
  }

  #stop(): void {
    // ``stop`` flushes a final ``dataavailable`` then fires ``stop`` → #finish.
    this.#recorder?.stop();
  }

  /**
   * Tear the control down — the teardown path when the host element is removed
   * mid-recording. Stops any live `MediaRecorder`, releases the mic tracks (so
   * the browser's recording indicator clears), and suppresses the pending
   * transcription: a disconnected control must not fire `onText` back into a
   * detached element.
   */
  dispose(): void {
    this.#disposed = true;
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
