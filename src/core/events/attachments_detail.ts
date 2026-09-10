import type { AttachmentRef } from "../attachment.js";

/** `detail` shape of the {@link ATTACHMENT_EVENT} CustomEvent. */
export interface AttachmentsDetail {
  /** Durable refs for every file that has finished uploading. */
  readonly attachments: readonly AttachmentRef[];
  /** How many files are still uploading; a send now would leave these behind. */
  readonly pending: number;
}
