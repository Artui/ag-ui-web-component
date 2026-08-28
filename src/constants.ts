// The package's single home for enums and constant-like values, and per
// CLAUDE.md the only file allowed to export multiple symbols.

/** The Custom Element tag name registered by {@link defineAgUiChat}. */
export const ELEMENT_TAG = "ag-ui-chat";

/** User submitted a message. `detail` is {@link SubmitDetail}. */
export const SUBMIT_EVENT = "ag-ui-submit";

/**
 * Collapsed state changed, via the built-in toggle or `setCollapsed`.
 * `detail` is {@link ToggleDetail}.
 */
export const TOGGLE_EVENT = "ag-ui-toggle";

/**
 * The count of answers that arrived while collapsed changed. `detail` is
 * {@link UnreadDetail}. The built-in launcher badge renders exactly this; a
 * host driving its own chrome sets `data-unread-badge="false"` and listens.
 */
export const UNREAD_EVENT = "ag-ui-unread";

/**
 * AG-UI shared state changed — a streamed `STATE_SNAPSHOT` / `STATE_DELTA`, or
 * a host assignment to `sharedState`. `detail` is {@link StateDetail}.
 *
 * The protocol's own state channel, distinct from `registerPageState`, which
 * exposes host state to the agent as ordinary tools.
 */
export const STATE_EVENT = "ag-ui-state";

/**
 * The attachment tray changed — a file queued, an upload finishing or failing,
 * a chip removed, the tray cleared after a send. `detail` is
 * {@link AttachmentsDetail}, carrying the refs that finished uploading and how
 * many are still in flight. A host driving its own composer uses this to know
 * whether a send would leave files behind.
 */
export const ATTACHMENT_EVENT = "ag-ui-attachments";

/**
 * An interaction has finished, whatever ended it. `detail` is
 * {@link RunFinishedDetail}, listing the tools that ran and which side ran them.
 *
 * For hosts that render data the agent can change. A server-side tool writes
 * without the page's knowledge — nothing else the element dispatches implies
 * "something may have moved underneath you", so a page showing that data has no
 * reason to refetch and quietly goes stale. Shared state
 * ({@link STATE_EVENT}) is the richer channel, but it needs the agent to emit
 * state; this needs nothing of the agent at all.
 *
 * Fires once per interaction rather than once per tool round, on completion,
 * error and cancellation alike, since a partial write is still a write.
 */
export const RUN_FINISHED_EVENT = "ag-ui-run-finished";

/**
 * The agent sent an AG-UI `CUSTOM` event. `detail` is {@link CustomAgentDetail}.
 *
 * `CUSTOM` is one of exactly two carriers whose payload name the protocol leaves
 * an open string, and it is the **imperative** one: something for the host page
 * to *do*, with no place in the transcript. Its sibling `ACTIVITY_SNAPSHOT`
 * carries transcript **content**, which is why that one is materialised into a
 * message, persisted, and replayed on restore while this one is not.
 *
 * That asymmetry is the rule for choosing between them. Content has a place in
 * the conversation and should replay; an imperative has no place and no meaning
 * once acted on, so replaying it on a thread load would be a bug. Anything that
 * must survive a reload belongs on the other carrier.
 *
 * The element takes no view of what a name means -- it forwards every one. A
 * host that does not recognise a name ignores the event, which is the graceful
 * outcome the open field exists for.
 */
export const CUSTOM_AGENT_EVENT = "ag-ui-custom";

/**
 * The agent named resources its write has moved. `detail` is
 * {@link InvalidateDetail}.
 *
 * A convention on top of {@link CUSTOM_AGENT_EVENT}, not a second channel: the
 * wire carries an ordinary AG-UI `CUSTOM` event whose `name` is
 * {@link INVALIDATE_CUSTOM_NAME}, and this is that one name routed to its own
 * DOM event so a host does not have to string-match. Every other name still
 * arrives as `ag-ui-custom`.
 *
 * Fires **as each announcement arrives**, during the run, which is what makes a
 * long multi-step run feel live: the list refreshes as the third of eight writes
 * lands rather than when everything finishes. {@link RUN_FINISHED_EVENT} carries
 * the same keys again at the end, de-duplicated, for a host that would rather
 * refetch once.
 */
export const INVALIDATE_EVENT = "ag-ui-invalidate";

/**
 * Fired when the user rates an assistant message from its action row.
 *
 * `detail` is a {@link FeedbackDetail}: the rated message's text and the
 * rating. **Nothing is stored** -- a rating belongs to whatever the host
 * already uses to hold product signals, and a write-only table inside a chat
 * widget is a schema nobody reads.
 */
export const FEEDBACK_EVENT = "ag-ui-feedback";

/**
 * The `activity_type` carrying server-pushed follow-up prompts.
 *
 * Matches django-ag-ui's `SUGGESTIONS_ACTIVITY_TYPE`. A convention inside the
 * protocol's open `activity_type` field, not an extension of it -- so a client
 * that has never heard of it ignores the event, and this one is not privileged.
 */
export const SUGGESTIONS_ACTIVITY_TYPE = "suggestions";

/**
 * The AG-UI `CUSTOM` event `name` that carries an invalidation.
 *
 * Matched exactly. Namespaced so it cannot collide with a host's own custom
 * events, which share the field.
 */
export const INVALIDATE_CUSTOM_NAME = "ag_ui.invalidate";

/** Roles a chat message can take. */
export const MESSAGE_ROLE = {
  USER: "user",
  ASSISTANT: "assistant",
} as const;

/**
 * Schema-root key marking a tool destructive: the element gates its execution
 * behind the confirmation card unless `autoConfirm` is set. All four `x-*` keys
 * below mirror the `django-ag-ui` server side.
 */
export const X_DESTRUCTIVE_KEY = "x-destructive";

/**
 * Schema-root key holding a confirmation prompt (e.g. `"Activate this
 * project?"`), shown instead of the generic `Run "<tool>"?`.
 */
export const X_CONFIRM_KEY = "x-confirm";

/**
 * Schema-root key holding a short label for a tool (e.g. `"Query orders"` for
 * `query_model`), shown on the card instead of the raw tool name.
 */
export const X_SUMMARY_KEY = "x-summary";

/**
 * Schema-root key marking a tool as navigating — its handler triggers a full
 * page reload. The element checkpoints the call before the reload and resumes
 * the run loop once the next page mounts.
 */
export const X_NAVIGATES_KEY = "x-navigates";

/**
 * The built-in tool that re-reads the current page, registered only when a
 * page-map provider is set. Named here because the stale-page guard must exempt
 * it: refusing the one call that would refresh the agent's view deadlocks.
 */
export const READ_PAGE_TOOL = "read_page";

/** Upper bound on frontend tool-call → re-run rounds within one send. */
export const MAX_TOOL_ROUNDS = 10;

/**
 * Lifecycle status of a rendered tool-call card. A card opens as `PENDING`
 * while the call runs, then settles to `DONE`, `ERROR`, or `DECLINED`.
 *
 * `DEFERRED` is the one non-terminal state that is not "running": a server-side
 * tool a `ToolGuard` gated never executed, the run finished on an interrupt, and
 * the call is waiting on a person. Without it such a card sat at `PENDING` and
 * read "running…" while the stream was over and the server idle — a status enum
 * missing a state does not omit that state, it renders it as whichever neighbour
 * is closest, and here the closest one claimed the opposite of the truth. A
 * *frontend* tool waiting on its own card (`ask_user`) stays `PENDING`, because
 * the browser really is running it.
 */
export const TOOL_CALL_STATUS = {
  PENDING: "pending",
  DEFERRED: "deferred",
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
 * `ATTACHMENT_MAX_BYTES`. Overridable via `data-attachment-max-bytes`; the
 * server stays authoritative.
 */
export const DEFAULT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * How much detail a tool-call card shows. Set via `data-tool-display`; the
 * default is `full`.
 *
 * - `inline` — one status row (icon + summary), no card chrome, result behind
 *   its own toggle. Reads as a line of the answer rather than a boxed card.
 * - `minimal` — tool name + status pill only. No args, no result body.
 * - `compact` — name + status, args and result behind one "Details" toggle.
 * - `full` — args inline, result behind its own toggle.
 */
export const TOOL_DISPLAY = {
  INLINE: "inline",
  MINIMAL: "minimal",
  COMPACT: "compact",
  FULL: "full",
} as const;

/**
 * `activityType` of the `ACTIVITY_SNAPSHOT` event django-ag-ui emits when a
 * compaction capability trimmed the history. `content` carries
 * `{ removed, before, after }`.
 */
export const COMPACTION_ACTIVITY_TYPE = "compaction";

/**
 * Pydantic-AI's built-in tool for loading a deferred capability, with `{ id }`
 * naming it. Agent skills are deferred capabilities keyed by skill name, so a
 * call to this tool is the only signal that the agent picked a skill.
 *
 * Distinct from the host-provided {@link Skill} catalog, which is a human
 * affordance launched from the slash palette.
 */
export const LOAD_CAPABILITY_TOOL = "load_capability";

/**
 * The chrome's glyphs, as inline SVG markup.
 *
 * Static author-written markup assigned as a `<slot>`'s fallback content, so it
 * never passes through the sanitiser — nothing here is user or server data, and
 * nothing user-supplied may be interpolated into it. Each icon is a 24x24
 * viewBox carrying the shared `glyph` class, which `STYLES` sizes and paints
 * from `currentColor`; `glyph--solid` fills instead of stroking. A host wanting
 * its own mark projects a matching `slot="icon-…"` child instead of editing
 * these.
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
 * The generic attachment-chip mark, for a file family with nothing more
 * specific to say. The chip marks share the contract of the chrome glyphs
 * above; `iconFor` selects one by MIME family, never interpolating the MIME
 * string into the markup.
 */
export const ICON_FILE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`;

/** An image attachment: a framed picture with a horizon and a sun. */
export const ICON_FILE_IMAGE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.5"/><path d="M4.5 17.5 9 13.5l3.5 3 3-2.5 4.5 4"/></svg>`;

/** A PDF: the generic page, banded to read as a labelled document. */
export const ICON_FILE_PDF = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><rect class="glyph--solid" x="7.5" y="13.5" width="9" height="4.5" rx="1"/></svg>`;

/** A text document: the generic page, ruled. */
export const ICON_FILE_TEXT = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M8.5 13.5h7M8.5 17h4.5"/></svg>`;

/**
 * ``activityType`` of the ``ACTIVITY_SNAPSHOT`` / ``ACTIVITY_DELTA`` events a
 * server sends to draw a chart.
 *
 * A convention inside an extension point the protocol already provides, not a
 * protocol extension: AG-UI defines the envelope and leaves ``activityType`` an
 * open string. Another vendor's client does not know this name and ignores the
 * event, which is the graceful outcome.
 */
export const CHART_ACTIVITY_TYPE = "chart";

/**
 * How long a screen-reader status stays in the announcer before it is emptied.
 *
 * Long enough for a reader to pick the change up, short enough that the region
 * is empty again before the next status lands. Emptying is what makes an
 * identical consecutive message announce at all -- a live region is read on
 * *change*, and setting the same string twice is not one.
 */
export const ANNOUNCE_CLEAR_MS = 150;
