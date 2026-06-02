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

/**
 * Event dispatched by `<ag-ui-chat>` when its collapsed state changes (via the
 * built-in toggle or {@link setCollapsed}). `detail` carries
 * `{ collapsed: boolean }`. A host can listen to drive its own chrome, or hide
 * the built-in toggle and drive the `collapsed` attribute itself.
 */
export const TOGGLE_EVENT = "ag-ui-toggle";

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

/**
 * JSON-Schema extension key carrying a human-readable confirmation prompt for a
 * destructive tool (e.g. `"Activate this project?"`). Mirrors the `django-ag-ui`
 * server side. When present, the inline confirmation card shows this instead of
 * the generic `Run "<tool>"?`.
 */
export const X_CONFIRM_KEY = "x-confirm";

/**
 * JSON-Schema extension key carrying a short human-readable label for a tool
 * (e.g. `"Query orders"` for `query_model`). Mirrors the `django-ag-ui` server
 * side; the tool-call card shows it instead of the raw tool name when present.
 */
export const X_SUMMARY_KEY = "x-summary";

/**
 * JSON-Schema extension key marking a tool as navigating — its handler triggers
 * a full page reload (an MPA navigation). When a tool's `parameters` carries
 * `{ "x-navigates": true }`, the element checkpoints the call before the reload
 * and resumes the run loop once the next page mounts. Mirrors `x-destructive`.
 */
export const X_NAVIGATES_KEY = "x-navigates";

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

/**
 * How much detail a tool-call card shows. Set via the `data-tool-display`
 * attribute on `<ag-ui-chat>`; defaults to `full` (back-compatible).
 *
 * - `minimal` — just the tool name + status pill. No args, no result body.
 * - `compact` — name + status, with args *and* result tucked behind a single
 *   collapsed "Details" toggle. The light default for dense UIs.
 * - `full` — args shown inline, result behind its own toggle (the original).
 */
export const TOOL_DISPLAY = {
  MINIMAL: "minimal",
  COMPACT: "compact",
  FULL: "full",
} as const;
