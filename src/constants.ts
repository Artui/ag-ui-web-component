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

/**
 * JSON-Schema extension key marking a tool as destructive. Mirrors the
 * `django-ag-ui` server side. When a tool's `parameters` carries
 * `{ "x-destructive": true }`, the element gates its execution behind the
 * confirmation modal (unless `autoConfirm` is set).
 */
export const X_DESTRUCTIVE_KEY = "x-destructive";

/** Upper bound on frontend tool-call → re-run rounds within one send. */
export const MAX_TOOL_ROUNDS = 10;

/**
 * Lifecycle status of a rendered tool-call card. A card opens as `PENDING`
 * while the call runs, then settles to `DONE`, `ERROR`, or `DECLINED`.
 */
export const TOOL_CALL_STATUS = {
  PENDING: "pending",
  DONE: "done",
  ERROR: "error",
  DECLINED: "declined",
} as const;
