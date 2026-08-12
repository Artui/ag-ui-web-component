import type { Message } from "@ag-ui/core";

/**
 * A durable, lightweight reference to one uploaded file — what an upload
 * returns and what rides on a sent message, never the bytes.
 *
 * Mirrors django-ag-ui's `AttachmentRef`: the file uploads out-of-band to the
 * attachments endpoint, the server hands back this ref, and the agent reads the
 * content server-side via the `read_attachment` tool.
 */
export interface AttachmentRef {
  /** Opaque, owner-scoped handle the server resolves back to bytes. */
  readonly id: string;
  /** Original filename, for display on the chip. */
  readonly name: string;
  /** Declared content type (a hint — the server is authoritative). */
  readonly mime: string;
  /** Size in bytes. */
  readonly size: number;
  /** Optional direct fetch URL (the owner-checked download endpoint). */
  readonly url?: string;
}

/**
 * The attachment refs a user message carries.
 *
 * Refs ride on the message as a non-standard `attachments` field, which the
 * default store round-trips and `@ag-ui/client` preserves through `addMessage`
 * / `structuredClone`, so a restored conversation re-renders its chips. The
 * server's strict `RunAgentInput` validation ignores the unknown field.
 *
 * Storage is untrusted — hand-edited, truncated, or corrupted — so malformed
 * entries are dropped here; a shapeless one would throw in `iconFor` and abort
 * the whole history replay.
 */
export function messageAttachments(message: Message): readonly AttachmentRef[] {
  const refs = (message as { attachments?: unknown }).attachments;
  return Array.isArray(refs) ? refs.filter(isAttachmentRef) : [];
}

/** Whether an unknown value is a structurally valid {@link AttachmentRef}. */
function isAttachmentRef(value: unknown): value is AttachmentRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Record<string, unknown>;
  return (
    typeof ref["id"] === "string" &&
    typeof ref["name"] === "string" &&
    typeof ref["mime"] === "string" &&
    typeof ref["size"] === "number" &&
    (ref["url"] === undefined || typeof ref["url"] === "string")
  );
}
