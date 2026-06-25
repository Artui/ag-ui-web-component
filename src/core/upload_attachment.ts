import type { AttachmentRef } from "./attachment.js";

/**
 * The composer's upload contract: take a `File`, report `0..1` progress, and
 * resolve to a durable {@link AttachmentRef}. The built-in handler is
 * {@link uploadAttachment} (multipart POST); a host swaps in its own — e.g. a
 * `tus-js-client` or direct-to-S3 adapter — via `AgUiChat.uploadHandler`,
 * **without** touching the tray, the chips, or the AG-UI wire (refs are
 * transport-agnostic).
 */
export type UploadHandler = (
  file: File,
  onProgress: (fraction: number) => void,
) => Promise<AttachmentRef>;

/** Options for {@link uploadAttachment}. */
export interface UploadOptions {
  /** The attachments endpoint (`data-attachments-url`). */
  readonly url: string;
  /** Extra HTTP headers (CSRF / auth), read fresh per upload. */
  readonly headers?: Record<string, string>;
  /** Progress callback, `0..1`, fired as the body uploads. */
  readonly onProgress?: (fraction: number) => void;
  /** Abort signal to cancel the in-flight upload. */
  readonly signal?: AbortSignal;
}

/**
 * Upload one file to the attachments endpoint and resolve to its durable
 * {@link AttachmentRef}.
 *
 * Uses `XMLHttpRequest` (not `fetch`) for real upload-progress events: the file
 * is sent as multipart under the `file` field, with the element's `headers` so
 * CSRF / auth ride along exactly like the skills/tools fetches. A non-2xx
 * response or a network/abort error rejects, so the tray can show an error chip.
 */
export function uploadAttachment(file: File, options: UploadOptions): Promise<AttachmentRef> {
  return new Promise<AttachmentRef>((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", options.url);
    for (const [key, value] of Object.entries(options.headers ?? {})) {
      xhr.setRequestHeader(key, value);
    }

    const onProgress = options.onProgress;
    if (onProgress !== undefined) {
      xhr.upload.addEventListener("progress", (event) => {
        if (event.lengthComputable) {
          onProgress(event.total === 0 ? 0 : event.loaded / event.total);
        }
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(parseRef(JSON.parse(xhr.responseText)));
        } catch {
          reject(new Error("upload returned an unreadable response"));
        }
      } else {
        reject(new Error(errorMessage(xhr)));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("upload failed")));
    xhr.addEventListener("abort", () => reject(new Error("upload cancelled")));

    const signal = options.signal;
    if (signal !== undefined) {
      signal.addEventListener("abort", () => xhr.abort());
    }

    xhr.send(form);
  });
}

/** Validate + narrow the server's `201` body into an {@link AttachmentRef}. */
function parseRef(body: unknown): AttachmentRef {
  if (typeof body !== "object" || body === null) {
    throw new Error("not an object");
  }
  const o = body as Record<string, unknown>;
  const id = o["id"];
  const name = o["name"];
  const mime = o["mime"];
  const size = o["size"];
  const url = o["url"];
  if (
    typeof id !== "string" ||
    typeof name !== "string" ||
    typeof mime !== "string" ||
    typeof size !== "number"
  ) {
    throw new Error("missing fields");
  }
  return typeof url === "string" ? { id, name, mime, size, url } : { id, name, mime, size };
}

/** A human-readable message from a non-2xx upload response. */
function errorMessage(xhr: XMLHttpRequest): string {
  try {
    const body = JSON.parse(xhr.responseText) as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  } catch {
    // Non-JSON error body — fall through to the status text.
  }
  return `upload failed (${xhr.status})`;
}
