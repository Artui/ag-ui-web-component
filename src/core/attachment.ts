import type { Message } from "@ag-ui/core";

/**
 * A durable, lightweight reference to one uploaded file — what an upload
 * returns and what rides on a sent message, never the bytes.
 *
 * Mirrors django-ag-ui's `AttachmentRef`: a file uploads out-of-band to the
 * attachments endpoint, the server hands back this ref, and the agent reads the
 * actual content server-side via the `read_attachment` tool. Keeping the AG-UI
 * message stream free of base64 mirrors how the tool catalog keeps schemas off
 * the wire.
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
 * Refs are stored on the user message as a non-standard `attachments` field: a
 * web-component augmentation that the default client store round-trips and
 * `@ag-ui/client` preserves through `addMessage` / `structuredClone`, so a
 * restored conversation re-renders its attachment chips. The server's strict
 * `RunAgentInput` validation ignores the unknown field — the model learns the
 * ids from the run context manifest instead.
 */
export function messageAttachments(message: Message): readonly AttachmentRef[] {
  const refs = (message as { attachments?: unknown }).attachments;
  return Array.isArray(refs) ? (refs as readonly AttachmentRef[]) : [];
}
