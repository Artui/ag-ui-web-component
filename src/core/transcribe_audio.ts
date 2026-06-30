/**
 * The composer's voice-transcription contract: take a recorded audio `Blob` and
 * resolve to the transcript text. The built-in handler is {@link transcribeAudio}
 * (multipart POST to `data-transcribe-url`); a host swaps in its own — e.g. a
 * browser Web Speech adapter or a direct-to-provider call — via
 * `AgUiChat.transcribeHandler`, without touching the mic button.
 */
export type TranscribeHandler = (audio: Blob) => Promise<string>;

/** Options for {@link transcribeAudio}. */
export interface TranscribeOptions {
  /** The transcription endpoint (`data-transcribe-url`). */
  readonly url: string;
  /** Extra HTTP headers (CSRF / auth), read fresh per request. */
  readonly headers?: Record<string, string>;
}

/**
 * POST a recorded clip to the transcription endpoint and resolve to its text.
 *
 * The clip is sent as multipart under the `audio` field with the element's
 * `headers`, mirroring {@link uploadAttachment}; the server replies
 * `{ "text": "<transcript>" }`. A non-2xx response or a network error rejects so
 * the mic button can surface the failure.
 */
export async function transcribeAudio(audio: Blob, options: TranscribeOptions): Promise<string> {
  const form = new FormData();
  // A filename hints the server/codec; the extension is cosmetic (the server
  // reads the blob's content type).
  form.append("audio", audio, "recording.webm");

  const response = await fetch(options.url, {
    method: "POST",
    headers: { ...(options.headers ?? {}) },
    body: form,
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  const body: unknown = await response.json();
  if (
    typeof body === "object" &&
    body !== null &&
    typeof (body as { text?: unknown }).text === "string"
  ) {
    return (body as { text: string }).text;
  }
  throw new Error("transcription returned an unreadable response");
}

/** A human-readable message from a non-2xx transcription response. */
async function errorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Non-JSON error body — fall through to the status code.
  }
  return `transcription failed (${response.status})`;
}
