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
 * Event dispatched by `<ag-ui-chat>` when the number of answers that arrived
 * while it was collapsed changes — one more finished, or expanding cleared them
 * all. `detail` carries `{ unread: number }`.
 *
 * The built-in badge on the launcher renders exactly this. A host driving its
 * own chrome can turn the badge off with `data-unread-badge="false"` and listen
 * here instead.
 */
export const UNREAD_EVENT = "ag-ui-unread";

/**
 * Event dispatched by `<ag-ui-chat>` when AG-UI **shared state** changes — the
 * server streamed a `STATE_SNAPSHOT` / `STATE_DELTA`, or the host assigned
 * {@link AgUiChat.sharedState}. `detail` carries `{ state }`.
 *
 * This is the protocol's own state channel, distinct from `registerPageState`,
 * which exposes host state to the agent as ordinary *tools*.
 */
export const STATE_EVENT = "ag-ui-state";

/**
 * Event dispatched by `<ag-ui-chat>` whenever the attachment tray changes — a
 * file queued, an upload finishing or failing, a chip removed, the tray
 * cleared after a send. `detail` carries `{ attachments, pending }`:
 * the durable refs of everything that has finished uploading, and how many are
 * still in flight.
 *
 * This is the seam for a host that drives its own composer: without it the tray
 * only ever spoke to the built-in Send button, so a custom send had no way to
 * know whether a file was ready or still uploading.
 */
export const ATTACHMENT_EVENT = "ag-ui-attachments";

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

/**
 * Name of the built-in tool that re-reads the current page.
 *
 * Registered only when a page-map provider is set. Named here because it is
 * also the documented recovery from a stale page, so the stale-page guard has
 * to exempt it — refusing the very call that would refresh the agent's view
 * would be a deadlock.
 */
export const READ_PAGE_TOOL = "read_page";

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

/**
 * The chrome's glyphs, as inline SVG markup.
 *
 * Static, author-written markup assigned to a `<slot>`'s fallback content, so
 * it never passes through the sanitiser — nothing here is user or server data.
 * Each icon is a 24x24 viewBox carrying the shared `glyph` class, which
 * `STYLES` sizes and paints from `currentColor`; `glyph--solid` fills instead
 * of stroking. A host that wants its own mark projects a matching
 * `slot="icon-…"` child rather than editing these.
 */
export const ICON_SEND = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19.5V5m-6.5 6.5L12 5l6.5 6.5"/></svg>`;

/** The Stop glyph the composer button wears while a run is in flight. */
export const ICON_STOP = `<svg class="glyph glyph--solid" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.5"/></svg>`;

/** The file-picker glyph (a paperclip). */
export const ICON_ATTACH = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M17 8.5V15a5 5 0 0 1-10 0V7a3 3 0 0 1 6 0v7.5a1 1 0 0 1-2 0V8.5"/></svg>`;

/** The voice-input glyph (a microphone on its stand). */
export const ICON_VOICE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V7a3 3 0 0 1 3-3z"/><path d="M5 11v1a7 7 0 0 0 14 0v-1"/><path d="M12 19v3"/></svg>`;

/** The default launcher mark (a speech bubble), shown when the host slots none. */
export const ICON_LAUNCHER = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4z"/></svg>`;

/**
 * The attachment-chip type marks, one per coarse file family. Same contract as
 * the chrome's glyphs above: static author-written markup on a 24x24 viewBox
 * carrying the shared `glyph` class. A chip picks one by MIME family through
 * `iconFor`; the MIME string selects a constant and is never interpolated into
 * one, so nothing user- or server-supplied reaches the markup.
 *
 * The generic mark, for a family with nothing more specific to say.
 */
export const ICON_FILE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;

/** An image attachment: a framed picture with a horizon and a sun. */
export const ICON_FILE_IMAGE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="M4.5 17.5 9 13.5l3.5 3 3-2.5 4.5 4"/></svg>`;

/** A PDF: the generic page, banded to read as a labelled document. */
export const ICON_FILE_PDF = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><rect class="glyph--solid" x="7.5" y="13.5" width="9" height="4.5" rx="1"/></svg>`;

/** A text document: the generic page, ruled. */
export const ICON_FILE_TEXT = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13.5h7M8.5 17h4.5"/></svg>`;
