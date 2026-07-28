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

/**
 * Event dispatched by `<ag-ui-chat>` when AG-UI **shared state** changes — the
 * server streamed a `STATE_SNAPSHOT` / `STATE_DELTA`, or the host assigned
 * {@link AgUiChat.sharedState}. `detail` carries `{ state }`.
 *
 * This is the protocol's own state channel, distinct from `registerPageState`,
 * which exposes host state to the agent as ordinary *tools*.
 */
export const STATE_EVENT = "ag-ui-state";

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
 * Lifecycle status of a pending-attachment chip in the composer tray. A chip
 * opens as `UPLOADING` (with a progress bar), then settles to `READY` (a durable
 * ref) or `ERROR` (with a retry control).
 */
export const ATTACHMENT_STATUS = {
  UPLOADING: "uploading",
  READY: "ready",
  ERROR: "error",
} as const;

/**
 * Default client-side upload size cap (10 MiB), matching django-ag-ui's
 * `ATTACHMENT_MAX_BYTES` default. Overridable per element via
 * `data-attachment-max-bytes`; the server stays authoritative.
 */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * How much detail a tool-call card shows. Set via the `data-tool-display`
 * attribute on `<ag-ui-chat>`; defaults to `full` (back-compatible).
 *
 * - `inline` — the lightest mode: a single status row (icon + summary) with no
 *   surrounding card chrome, the result tucked behind its own toggle. Reads as
 *   one line of the answer rather than a boxed card — pairs with the answer
 *   well (page mode).
 * - `minimal` — just the tool name + status pill. No args, no result body.
 * - `compact` — name + status, with args *and* result tucked behind a single
 *   collapsed "Details" toggle. The light default for dense UIs.
 * - `full` — args shown inline, result behind its own toggle (the original).
 */
export const TOOL_DISPLAY = {
  INLINE: "inline",
  MINIMAL: "minimal",
  COMPACT: "compact",
  FULL: "full",
} as const;

/**
 * `activityType` of the AG-UI `ACTIVITY_SNAPSHOT` event `django-ag-ui` emits
 * when a compaction capability trimmed the message history. Its `content`
 * carries `{ removed, before, after }`.
 */
export const COMPACTION_ACTIVITY_TYPE = "compaction";

/**
 * Pydantic-AI's built-in tool the model calls to load a *deferred* capability,
 * with `{ id }` naming it. Agent skills are deferred capabilities whose id is
 * the skill name, so a call to this tool is how "the agent picked skill X"
 * reaches the client — there is no separate event for it.
 *
 * Not to be confused with the host-provided {@link Skill} catalog, which is a
 * *human* affordance (a prompt the user launches from the `/`-palette).
 */
export const LOAD_CAPABILITY_TOOL = "load_capability";
