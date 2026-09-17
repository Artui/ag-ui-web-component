import { type TranscribeHandler, transcribeAudio } from "../../core/transcribe_audio.js";
import type { UiStrings } from "../ui_strings.js";
import { VoiceInput } from "./voice_input.js";

/** What the composer's mic needs from the element that owns it. */
export interface ComposerVoiceHost {
  /** The custom element, whose `data-transcribe-url` names the built-in endpoint. */
  readonly element: HTMLElement;
  /** Where the mic button mounts, in the composer's tool row. */
  readonly slot: HTMLElement;
  /** The composer a transcript is written into. */
  readonly input: HTMLTextAreaElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** The host's `transcribeHandler`, read when the mic is wired. */
  readonly transcribeHandler: () => TranscribeHandler | null;
  /** The headers a request to `url` carries. */
  readonly headersFor: (url: string) => Record<string, string>;
  /** The cookie policy every request carries, when one is configured. */
  readonly credentialsOption: () => { credentials?: RequestCredentials };
  /** React to the composer's value changing, as typing does. */
  readonly onInput: () => void;
}

/**
 * The composer's mic: mounted when transcription is possible, and what a
 * transcript does to the composer.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ComposerVoice {
  readonly #host: ComposerVoiceHost;
  /** Voice-input control; created on connect when transcription is available. */
  #voice: VoiceInput | null = null;

  constructor(host: ComposerVoiceHost) {
    this.#host = host;
  }

  /**
   * Reveal the composer's 🎤 mic button when transcription is possible — either
   * a custom `transcribeHandler` is set or `data-transcribe-url` provides the
   * built-in POST endpoint. The control records via `MediaRecorder` and drops
   * the transcript into the composer; with neither configured the mic stays
   * hidden and the chat is text-only.
   *
   * Called on every connect, so it starts by taking down the mic the last
   * connection mounted, which was released when the element left.
   */
  wire(): void {
    this.#voice?.element.remove();
    this.#voice = null;
    const url = this.#host.element.getAttribute("data-transcribe-url");
    const transcribe = this.#host.transcribeHandler() ?? this.#defaultTranscribeHandler(url);
    if (transcribe === null) {
      return;
    }
    this.#voice = new VoiceInput({
      transcribe,
      onText: (text) => this.#insertText(text),
      strings: this.#host.strings(),
    });
    this.#host.slot.appendChild(this.#voice.element);
  }

  /** Release the mic, so the browser's recording indicator clears. */
  dispose(): void {
    this.#voice?.dispose();
  }

  /** The built-in transcription handler for `data-transcribe-url`, or `null`. */
  #defaultTranscribeHandler(url: string | null): TranscribeHandler | null {
    if (url === null) {
      return null;
    }
    return (audio) =>
      transcribeAudio(audio, {
        url,
        headers: this.#host.headersFor(url),
        ...this.#host.credentialsOption(),
      });
  }

  /** Drop a voice transcript into the composer (appended to any typed text). */
  #insertText(text: string): void {
    const input = this.#host.input;
    const current = input.value.trim();
    input.value = current === "" ? text : `${current} ${text}`;
    this.#host.onInput();
    input.focus();
  }
}
