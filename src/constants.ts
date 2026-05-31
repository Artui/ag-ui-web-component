// The package's single home for enums and constant-like values. Per
// CLAUDE.md this is the only file allowed to export multiple symbols.

/** The Custom Element tag name registered by {@link defineAgUiChat}. */
export const ELEMENT_TAG = "ag-ui-chat";

/**
 * Event dispatched by `<ag-ui-chat>` when the user submits a message.
 * `detail` carries `{ content: string }`. Later phases wire this to the
 * AG-UI client; for now it is the public seam for host integration.
 */
export const SUBMIT_EVENT = "ag-ui-submit";

/** Roles a chat message can take. */
export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;
