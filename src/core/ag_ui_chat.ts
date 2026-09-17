import type { Context, Message, Tool } from "@ag-ui/core";
import {
  ATTACHMENT_EVENT,
  CHART_ACTIVITY_TYPE,
  COMPACTION_ACTIVITY_TYPE,
  CUSTOM_AGENT_EVENT,
  ICON_ATTACH,
  ICON_LAUNCHER,
  ICON_MOON,
  ICON_SEND,
  ICON_STOP,
  ICON_SUN,
  MESSAGE_ROLE,
  STATE_EVENT,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  TOGGLE_EVENT,
  TOOL_DISPLAY,
  UNREAD_EVENT,
} from "../constants.js";
import type { Skill } from "../skills/skill.js";
import { SkillCatalog } from "../skills/skill_catalog.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ChatCorner, type ChatSurfaceReport } from "../tools/chat_surface_tools.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ClientTool } from "../tools/client_tool_registry.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ResolvePageTarget } from "../tools/page_action_tools.js";
import { createPageMapContext, type PageMap } from "../tools/page_map.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type PageState } from "../tools/page_state.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type RouteMap } from "../tools/route_map.js";
import { ToolCatalog } from "../tools/tool_catalog.js";
import { ToolDispatch } from "../tools/tool_dispatch.js";
import { renderChart } from "../ui/charts/chart_block.js";
import { chartSpecFrom } from "../ui/charts/chart_spec_from.js";
import { CHART_TOOL_NAME, createChartTool } from "../ui/charts/chart_tool.js";
import { autoGrow } from "../ui/composer/auto_grow.js";
import { ComposerAttachments } from "../ui/composer/composer_attachments.js";
import { ComposerVoice } from "../ui/composer/composer_voice.js";
import { SkillsMenu } from "../ui/composer/skills_menu.js";
import { TranscriptQuoteOffer } from "../ui/excerpts/transcript_quote_offer.js";
import { fillUiString } from "../ui/fill_ui_string.js";
import { CheckpointMenu } from "../ui/history/checkpoint_menu.js";
import { ConversationHistory } from "../ui/history/conversation_history.js";
import type { RelativeTimeFormatter } from "../ui/history/relative_time.js";
import { ThreadDrawer } from "../ui/history/thread_drawer.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ApprovalRenderer } from "../ui/interrupts/approval_card.js";
import { PendingDecision } from "../ui/interrupts/pending_decision.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type QuestionRenderer } from "../ui/interrupts/question_card.js";
import { isCollapsiblePlacement } from "../ui/placement/is_collapsible_placement.js";
import { isDraggablePlacement } from "../ui/placement/is_draggable_placement.js";
import { PanelPlacement } from "../ui/placement/panel_placement.js";
import { RunAnnouncer } from "../ui/progress/run_announcer.js";
import { renderRunNotice } from "../ui/progress/run_notice.js";
import { SubAgentProgress } from "../ui/progress/subagent_progress.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ToolDisplayMode, type ToolPayloadFormatter } from "../ui/progress/tool_call_card.js";
import { adoptStyles } from "../ui/shell/adopt_styles.js";
import { glyphSlot } from "../ui/shell/glyph_slot.js";
import { headerButton } from "../ui/shell/header_button.js";
import { iconElement } from "../ui/shell/icon_element.js";
import { isUnreadBadgeEnabled } from "../ui/shell/is_unread_badge_enabled.js";
import { readLauncherIconUrl } from "../ui/shell/read_launcher_icon_url.js";
import { AnswerActions } from "../ui/transcript/answer_actions.js";
import { AnswerStream } from "../ui/transcript/answer_stream.js";
import { renderAttachmentChips } from "../ui/transcript/attachment_chips.js";
import { renderStarterChips } from "../ui/transcript/starter_chips.js";
import { renderSuggestionChips } from "../ui/transcript/suggestion_chips.js";
import { Transcript } from "../ui/transcript/transcript.js";
import { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "../ui/ui_strings.js";
import type { ActivityRegistration } from "./activity_registration.js";
import { ActivityRegistry } from "./activity_registry.js";
import type { ActivityRenderer } from "./activity_renderer.js";
import { AgUiClient } from "./agui_client.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type AttachmentRef } from "./attachment.js";
import type { ClientSeed } from "./client_seed.js";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  writeStoredItem,
} from "./conversation_store.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import type { StateDetail } from "./events/state_detail.js";
import type { SubmitDetail } from "./events/submit_detail.js";
import type { ToggleDetail } from "./events/toggle_detail.js";
import type { UnreadDetail } from "./events/unread_detail.js";
import type { MessageRole } from "./message_role.js";
import { readMaxToolRounds } from "./read_max_tool_rounds.js";
import { RemoteConversationStore } from "./remote_conversation_store.js";
import { RunHandlers } from "./run_handlers.js";
import { StorageScope } from "./storage_scope.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type TranscribeHandler } from "./transcribe_audio.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type UploadHandler } from "./upload_attachment.js";
import { warnOnCrossOriginCredentials, withCredentials } from "./utils.js";

/**
 * Attributes read once while connecting, to decide what chrome exists at all.
 *
 * Changing one afterwards is silently ignored: the tray, the mic, the skills
 * menu and the header icon are built during connect and no later read revisits
 * the decision. Observed only so `attributeChangedCallback` can warn.
 *
 * Excludes the attributes that are re-read per use, where a late change works
 * and a warning would be wrong: `data-runs-url`, `data-page-actions`,
 * `data-text-animation`, `data-tool-display`, `endpoint`, and the CSS-reactive
 * `theme` / `collapsed`.
 */
const CONNECT_TIME_ATTRIBUTES = [
  "data-attachments-url",
  "data-attachment-accept",
  "data-attachment-max-bytes",
  "data-transcribe-url",
  "data-threads-url",
  "data-threads-cache",
  "data-tools-url",
  "data-skills-url",
  "data-skills",
  "data-prompt-chips",
  "data-slash-commands",
  "data-theme-toggle",
  "data-strings",
  "data-icon-url",
] as const;

/**
 * The cookie policies `fetch` accepts. Anything else is a configuration
 * mistake, and one that would otherwise surface as an unexplained 401 from a
 * request the browser silently sent anonymously.
 */
const CREDENTIALS_MODES: readonly string[] = ["omit", "same-origin", "include"];

/** Whether `value` is one of the three modes `fetch` understands. */
function isCredentialsMode(value: string): value is RequestCredentials {
  return CREDENTIALS_MODES.includes(value);
}

/** Per-tab persistence key for the collapsed state (survives MPA reloads). */
const COLLAPSED_KEY = "ag-ui-chat:collapsed";

/** Per-tab persistence key for the built-in theme toggle. */
const THEME_KEY = "ag-ui-chat:theme";

/**
 * `<ag-ui-chat>` — a framework-free chat sidebar Web Component over AG-UI.
 *
 * Owns the Shadow DOM shell (header, scrolling message list, input row),
 * builds an {@link AgUiClient} on first send via the overridable
 * {@link agentFactory}, and renders streaming assistant text plus tool-call
 * activity. Emits a {@link SUBMIT_EVENT} for host visibility.
 *
 * The per-run frontend tool catalog and context come from {@link getTools} and
 * {@link getContext}.
 */
export class AgUiChat extends HTMLElement {
  /** Agent factory; override to inject a custom or fake agent (tests). */
  agentFactory: AgentFactory = createHttpAgent;

  /**
   * Static extra HTTP headers, sent with every request this element makes: the
   * agent run, the thread index and its messages, the tool and skill catalogs,
   * the run index, uploads and transcription.
   *
   * For values fixed for the element's lifetime. A rotating credential belongs
   * in {@link getHeaders} instead — only a re-assignment updates this, so a
   * token captured here is pinned until the host assigns again.
   */
  headers: Record<string, string> = {};

  /**
   * Live header source, called afresh immediately before every request — the
   * way to supply rotating credentials, with nothing to re-assign or keep in
   * sync.
   *
   * Composes with {@link headers} rather than replacing it: merged per key with
   * `getHeaders()` winning, so a static `X-Client` and a rotating
   * `Authorization` are configured independently and neither drops the other.
   */
  getHeaders: (() => Record<string, string>) | null = null;

  /**
   * Origins, besides the page's own, that this element may send {@link headers}
   * and {@link getHeaders} credentials to without saying so on the console.
   *
   * Seven attributes name a URL, and every one of them carries these headers.
   * They are plain HTML, so a page that builds one from a query parameter or
   * from tenant-authored configuration has handed an attacker the destination,
   * and the token leaves on the element's first request. Naming the origins you
   * expect turns that from silent into either confirmed or reported.
   *
   * A notice rather than a refusal: a cross-origin agent is a documented
   * deployment, so refusing would break working installations to defend against
   * a page that is already interpolating untrusted data into its own markup.
   * Leaving this empty costs nothing but one console line per foreign origin.
   */
  trustedOrigins: readonly string[] = [];

  /**
   * Permit `<img>` in rendered assistant markdown. **Off by default**: a
   * model-controlled image URL is fetched with no user interaction, which
   * makes it a zero-click exfiltration channel for prompt-injected page
   * data. Enable only when the content source is trusted.
   */
  allowImages = false;

  /**
   * Replace the relative timestamps in the thread drawer and the checkpoint
   * panel -- `"5m ago"`, `"2d ago"` -- with the host's own formatting.
   *
   * The built-in is locale-neutral on purpose: there is no `Intl` anywhere in
   * this component, so it never disagrees with the page it is embedded in by
   * guessing a locale. That is a good default and a bad requirement, which is
   * what this is for.
   *
   * ```js
   * const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
   * chat.formatRelativeTime = (ts) =>
   *   rtf.format(Math.round((ts - Date.now()) / 60000), "minute");
   * ```
   */
  formatRelativeTime: RelativeTimeFormatter | null = null;

  /** When true, destructive tools execute without a confirmation modal. */
  autoConfirm = false;

  /**
   * When true, the built-in `ask_user` frontend tool is offered to the agent:
   * calling it renders an inline question card and returns the user's answer.
   * Off by default, like the other built-in tool groups, so the advertised
   * catalog does not change until a host asks for it.
   */
  askUser = false;

  /**
   * Optional full replacement for the `ask_user` question UI, resolving with
   * the answer; the same seam as {@link approvalRenderer}, styled via `strings`
   * and the `question*` `::part()`s when left unset. Requires {@link askUser}.
   */
  askUserRenderer: QuestionRenderer | null = null;

  /**
   * Optional full replacement for the server-side-tool approval UI: an approval
   * interrupt invokes this instead of the built-in {@link requestApproval}
   * card, resolving `true` to approve or `false` to deny. Style the built-in
   * card via `strings` and the `approval*` `::part()`s instead. The gate itself
   * is enabled server-side; this only changes how the decision is collected.
   */
  approvalRenderer: ApprovalRenderer | null = null;

  /**
   * Let the user edit a gated call's arguments before approving it.
   *
   * Off by default and **an assertion about your server**, not a negotiation:
   * AG-UI carries `editedArgs` in the resume payload and gates it on the
   * agent's own `approveWithEdits` capability, which this component never sees
   * -- capabilities are not on the wire it reads. So the host says whether its
   * agent honours them. Turned on against a server that does not, the user
   * would edit arguments it silently discards, which is worse than not
   * offering.
   *
   * Only affects calls whose arguments are known here: an interrupt names a
   * `toolCallId`, and the tool card for that call is where the arguments still
   * are. An interrupt naming no card gets the plain approve/deny.
   */
  approveWithEdits = false;

  /**
   * Optional per-call confirmation predicate. When set it is authoritative,
   * deciding from the tool name and args whether this particular call needs
   * confirmation — so one tool can be instant for some args and confirmed for
   * others, which a static `x-destructive` flag cannot express. When unset the
   * `x-destructive` flag decides. `autoConfirm` short-circuits both.
   */
  confirmPredicate:
    | ((toolName: string, args: Record<string, unknown>) => boolean | Promise<boolean>)
    | null = null;

  /**
   * Per-run frontend tool catalog provider. Defaults to the built-in
   * `route.*` tools (when a {@link routeMap} is set) plus the tools registered
   * via {@link registerTool} / {@link registerPageState}; override to supply a
   * fully custom catalog.
   */
  getTools: () => Tool[] = () => this.#tools.defaultTools();

  /**
   * Per-run context provider. Defaults to the compact page map, when a
   * {@link getPageMap} provider is set and {@link autoInjectPageMap} is on.
   *
   * Attachments are deliberately not restated here: the server derives its own
   * manifest from the refs riding the messages.
   */
  getContext: () => Context[] = () => [
    ...createPageMapContext(this.getPageMap, this.autoInjectPageMap),
  ];

  /**
   * Navigable routes the agent can jump to via the built-in `route.*` tools.
   * A compact summary also rides in each run's context.
   */
  routeMap: RouteMap = [];

  /**
   * Optional client-side router. When set (an SPA), `navigate_to_route` routes
   * in-page and the run loop continues; when unset (an MPA like the admin), it
   * falls back to `window.location` and the resumable-loop machinery applies.
   */
  navigate: ((path: string) => void) | null = null;

  /** Provider for the per-run page map; see {@link getContext}. */
  getPageMap: (() => PageMap) | null = null;

  /** Whether to auto-inject the page map into context each run. */
  autoInjectPageMap = true;

  /**
   * Persistence for the conversation + navigation checkpoint. Defaults to
   * per-tab `sessionStorage` so the chat survives full page reloads; inject a
   * server-backed store for cross-tab/device durability.
   */
  conversationStore: ClientConversationStore = new SessionStorageStore();

  /**
   * How attached files are uploaded. `null` (default) uses the built-in
   * multipart `POST` to `data-attachments-url`; a custom {@link UploadHandler}
   * swaps the transport without changing the tray, the chips, or the AG-UI
   * wire. When set, the 📎 affordance appears even with no
   * `data-attachments-url`, and the handler owns its own endpoint and headers.
   */
  uploadHandler: UploadHandler | null = null;

  /**
   * How recorded voice clips are transcribed. `null` (default) POSTs the clip
   * to `data-transcribe-url`; a custom {@link TranscribeHandler} swaps the
   * transport without touching the mic button. When set, the 🎤 affordance
   * appears even with no `data-transcribe-url`.
   */
  transcribeHandler: TranscribeHandler | null = null;

  /**
   * Builds the tool result a navigating tool resumes with after the page
   * reloads. Defaults to the landed URL; a host (e.g. the admin package) can
   * override to include a page snapshot or post-reload validation errors.
   */
  navigationResult: (checkpoint: NavigationCheckpoint) => unknown = () => ({
    navigated: true,
    url: window.location.href,
  });

  /**
   * Named values used to fill a skill prompt's `{placeholder}`s before send
   * (e.g. `{ model: "Order", selected_ids: "1,2" }`). A host (the admin) sets
   * this from the current page; a missing placeholder blocks the send.
   */
  skillContext: () => Record<string, unknown> = () => ({});

  /**
   * Friendly display labels for tool-call cards, keyed by tool name. The
   * fallback when a tool has no `x-summary` in its own schema, which chiefly
   * means server-side tools: AG-UI streams only the tool-call name, so their
   * schema never reaches the browser. Client tools should prefer `x-summary`.
   */
  toolSummaries: Record<string, string> = {};

  /**
   * Optional presentation hook for the two payload regions of a tool-call card
   * -- the arguments and the result. Unset (the default) leaves both
   * pretty-printed as JSON.
   *
   * The seam exists because a wide result has no good rendering as JSON: a
   * thirty-field row is a wall of text where the host wanted a table, or a
   * sentence. `ClientTool.render` cannot answer it -- it is handed the
   * *arguments* only, and a server-side tool has no `ClientTool` at all, so the
   * result region was the one part of the transcript a host could not reach.
   *
   * **Presentation, not translation.** The card and the model already read
   * separate copies of a tool result: the model's is maintained by
   * `@ag-ui/client` from the same event and persisted with the history, and the
   * card has always shown that string reformatted. So a formatter changes what
   * the person reads and nothing the agent reads -- which makes restyling safe
   * and *rewording* a way to make the card disagree with the prose beside it.
   * Rename a value on the server, where it reaches both.
   *
   * Read at render time rather than captured, so a host that sets it from a
   * framework effect after the first card still formats the results that settle
   * afterwards. See {@link ToolPayloadFormatter}.
   */
  formatToolPayload: ToolPayloadFormatter | null = null;

  /**
   * Localizable UI strings — a partial override merged over the English
   * {@link DEFAULT_UI_STRINGS}. Resolved once on connect (so set it before the
   * element is appended); the `data-strings` JSON attribute is the markup
   * equivalent, and this property wins key-by-key over it.
   */
  strings: Partial<UiStrings> = {};

  /**
   * Resolve a `scroll_to` / `drag_and_drop` target string to a host-page
   * element (or `null`). Defaults to a CSS-selector lookup; override to map
   * page-map element ids. The page-action tools are opt-in via the
   * `data-page-actions` attribute (`"scroll"` / `"drag"` / `"chat"`).
   */
  resolvePageTarget: ResolvePageTarget = (target) => document.querySelector<HTMLElement>(target);

  /**
   * Foreign origins already reported, so the notice is once per origin per
   * element rather than once per request. Per-element rather than module-level,
   * because two elements on one page are two separate configurations.
   */
  #warnedOrigins = new Set<string>();
  /** The resolved string table (defaults ← `data-strings` ← `strings`). */
  #strings: UiStrings = DEFAULT_UI_STRINGS;

  /** A delegated sub-agent's progress, hung off the card that delegated. */
  readonly #subagents = new SubAgentProgress({
    card: (callId) => this.#transcript.card(callId),
    strings: () => this.#strings,
    follow: () => this.#transcript.follow(),
  });
  /**
   * The AG-UI activities this element can draw, and the blocks it drew. A field
   * rather than built in the constructor, because the constructor registers the
   * built-in renderers through it.
   */
  readonly #activities = new ActivityRegistry({
    ensureGroup: () => this.#transcript.ensureGroup(),
    afterTranscriptGrew: () => this.#transcript.afterGrew(),
    appendNotice: (icon, text, kind) => this.#transcript.appendNotice(icon, text, kind),
  });

  /** The action row under each finished answer, and the one row holding Retry. */
  readonly #actions = new AnswerActions({
    element: this,
    strings: () => this.#strings,
    retry: () => {
      void this.retryLastTurn();
    },
  });

  readonly #root: ShadowRoot;
  /** The screen-reader-only status region the run and its tool calls report into. */
  readonly #announcer = new RunAnnouncer();
  /** Return-to-foot affordance, shown only once something has been missed. */
  readonly #jumpButton = document.createElement("button");
  /**
   * Quoting a selection into the composer: the offer beside a transcript
   * selection, the same offer over the host page, and the quotation itself.
   * Built in the constructor, once the composer it writes into exists.
   */
  readonly #excerpts: TranscriptQuoteOffer;
  /**
   * Positioning context for {@link AgUiChat.#jumpButton}.
   *
   * The button cannot live in the scrolling list -- it would scroll away with
   * the content it is offering to scroll to -- and it cannot be positioned
   * against the panel either: the panel's foot is below the composer, the skill
   * chips and the footer, so `bottom` measured from there lands the button on
   * top of the composer rather than over the transcript. This wrapper is the
   * only box whose foot *is* the transcript's foot.
   */
  readonly #messagesWrap = document.createElement("div");
  readonly #chat: HTMLDivElement;
  readonly #messages: HTMLDivElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #title: HTMLSpanElement;
  readonly #skillsMenu: SkillsMenu;
  readonly #drawer: ThreadDrawer;
  /** Checkpoint panel; rows load only when `data-runs-url` is set. */
  readonly #checkpoints: CheckpointMenu;
  /**
   * Which conversation is on screen and how one gets there: the active thread,
   * the restore from the store, the conversation list's verbs and the
   * checkpoint continuation. Built in the constructor, after the drawer, the
   * checkpoint panel and the run it continues exist.
   */
  readonly #history: ConversationHistory;
  /**
   * The one-line hint above the composer, cleared by the next keystroke.
   *
   * Two things write it -- a skill whose template is short of a field, and a
   * run continuation picked with nothing typed -- and both say the same kind of
   * thing: what the composer still needs before this can go. Its `part` stays
   * `skill-hint`, which the skills feature named and the README documents;
   * renaming a part is breaking, and a second hint element in the same slot
   * would be worse than one whose name is a release older than its job.
   */
  readonly #composerHint: HTMLDivElement;
  /** File-picker button + hidden input + tray slot; the tray mounts on connect. */
  readonly #attachButton: HTMLButtonElement;
  readonly #fileInput: HTMLInputElement;
  readonly #attachSlot: HTMLDivElement;
  /** Optional built-in header theme toggle; shown only with `data-theme-toggle`. */
  readonly #themeToggle: HTMLButtonElement;
  /** What the collapsed widget shrinks to: the floating launcher, or the sidebar rail. */
  readonly #launcher: HTMLButtonElement;
  /** The launcher's unread badge; hidden at zero, and when the host opts out. */
  readonly #badge: HTMLSpanElement;
  /** The rail's vertical caption. Rendered only by the sidebar's edge rail. */
  readonly #railLabel: HTMLSpanElement = document.createElement("span");
  // Answers that finished while the widget was collapsed. Expanding clears it.
  #unread = 0;
  /** Empty-state region at the top of the message list; hidden once anything renders. */
  readonly #emptyWrap: HTMLDivElement;
  /**
   * The transcript: bubbles, the open answer group, the pending dots, the
   * reasoning region, the tool cards and the scroller. Built in the
   * constructor, once the list and its empty-state region exist.
   */
  readonly #transcript: Transcript;
  /**
   * Running the tool calls a round produced and answering the server's
   * interrupts. Built in the constructor, after the transcript it draws in.
   */
  readonly #dispatch: ToolDispatch;
  /**
   * The AG-UI event handlers every client this element builds is given, and
   * what one interaction accumulates for the host until it settles. Built in
   * the constructor, after the transcript it draws in.
   */
  readonly #runHandlers: RunHandlers;
  /**
   * The greeting's own text, the fallback content of the `greeting` slot.
   * Rendered under every placement and shown by the stylesheet only where the
   * greeting layout is on, so a placement switch needs nothing from script.
   */
  readonly #greetingText: HTMLSpanElement = document.createElement("span");
  /**
   * Files handed to the composer: the upload tray and the picker, drop and
   * paste routes into it. Built in the constructor; the tray itself only once
   * uploads are wired on connect.
   */
  readonly #attachments: ComposerAttachments;

  /**
   * Where the panel and launcher sit and how big the panel is: the drags, the
   * resize grips, and the persisted record of them. Built in the constructor,
   * once the launcher and the shadow root it reaches into exist.
   */
  readonly #placement: PanelPlacement;
  /** What the user has sent this session, newest first, for arrow-key recall. */
  readonly #sentDrafts: string[] = [];
  /** Typed while a run was in flight, oldest first; sent when it settles. */
  readonly #queued: string[] = [];
  /** The row those show up in, above the composer. */
  readonly #queuedRow: HTMLDivElement = document.createElement("div");
  /** How far back the composer has been walked; null while the user is typing. */
  #recallIndex: number | null = null;

  /**
   * Re-clamp the dragged launcher when the window changes size. Bound once as
   * a field so `removeEventListener` on disconnect gets the same reference.
   */
  readonly #onViewportResize = (): void => {
    this.#placement.publishVisualViewport();
    // Not while a gesture owns the position. Restoring re-applies the *stored*
    // position, and mid-drag that value is the one from before the drag began
    // -- so it puts the widget back where it was, the next pointer move puts it
    // where the finger is, and the two fight for as long as the viewport keeps
    // changing.
    //
    // Which on a phone can be most of the drag: the visual viewport resizes and
    // scrolls whenever the browser's own chrome collapses, and that is driven
    // by the gesture in progress. This was not the cause of the jumping that
    // sent me looking -- that was an inset measured from the wrong box -- so it
    // is a guard against a fight that had not been observed rather than a fix
    // for one that had.
    if (this.#placement.dragging()) {
      return;
    }
    this.#placement.restoreLauncherPosition();
  };

  /** Mic button mount point (input row); the control mounts on connect when enabled. */
  readonly #voiceSlot: HTMLSpanElement;
  /** The composer's mic, mounted on connect when transcription is available. */
  readonly #voice: ComposerVoice;
  /** Whether the element is currently in the DOM; gates the connect-time warning. */
  #connected = false;

  #client: AgUiClient | null = null;
  // Seed for the next client. Once one exists it owns the live value (the
  // agent applies STATE_SNAPSHOT / STATE_DELTA into it), so this is only the
  // starting point — `sharedState` reads through to the client when present.
  #sharedState: Record<string, unknown> = {};
  // Whether an interaction is in flight (first onRunStart → onSettled). Drives
  // the Send⇄Stop button: `agent.isRunning` is false between frontend-tool
  // rounds, but the user must still be able to stop there.
  #running = false;
  /** The decision a run is suspended on, which a Stop abandons. */
  readonly #decision = new PendingDecision();
  /**
   * The frontend tools the agent is offered, what the current round advertised,
   * and the server's labels for its own tools. A field, because the tool
   * registry it holds is reachable from the moment the element exists.
   */
  readonly #tools = new ToolCatalog({
    element: this,
    routeMap: () => this.routeMap,
    navigate: () => this.navigate,
    getPageMap: () => this.getPageMap,
    resolvePageTarget: (target) => this.resolvePageTarget(target),
    getTools: () => this.getTools(),
    askUser: () => this.askUser,
    askUserRenderer: () => this.askUserRenderer,
    decision: this.#decision,
    ensureGroup: () => this.#transcript.ensureGroup(),
    strings: () => this.#strings,
    hidePending: () => this.#transcript.hidePending(),
    updateEmptyState: () => this.#transcript.updateEmptyState(),
    follow: () => this.#transcript.follow(),
    fetchInit: (url) => this.#fetchInit(url),
  });
  /** The assistant answer currently streaming into the transcript. */
  readonly #stream = new AnswerStream({
    openBubble: () => this.appendMessage(MESSAGE_ROLE.ASSISTANT, ""),
    allowImages: () => this.allowImages,
    follow: () => this.#transcript.follow(),
  });
  /**
   * Which storage keys are this element's: the namespace it claims, the keys
   * its layout preferences live under, and the built-in store scoped to them.
   */
  readonly #storage = new StorageScope({
    id: () => this.id,
    endpoint: () => this.endpoint,
  });
  /**
   * The skill catalog: its three sources merged into the menu, and what a pick
   * does to the composer. Built in the constructor, after the menu it fills.
   */
  readonly #skills: SkillCatalog;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#chat = document.createElement("div");
    this.#messages = document.createElement("div");
    this.#input = document.createElement("textarea");
    this.#send = document.createElement("button");
    this.#title = document.createElement("span");
    this.#composerHint = document.createElement("div");
    this.#attachButton = document.createElement("button");
    this.#fileInput = document.createElement("input");
    this.#attachSlot = document.createElement("div");
    this.#voiceSlot = document.createElement("span");
    this.#themeToggle = document.createElement("button");
    this.#launcher = document.createElement("button");
    this.#badge = document.createElement("span");
    this.#emptyWrap = document.createElement("div");
    this.#transcript = new Transcript({
      element: this,
      messages: this.#messages,
      emptyWrap: this.#emptyWrap,
      strings: () => this.#strings,
      allowImages: () => this.allowImages,
      resolveTool: (name) => this.#tools.resolve(name),
      toolSummaries: () => this.toolSummaries,
      serverSummary: (name) => this.#tools.summary(name),
      // A thunk over the live property, not the property itself: the card keeps
      // this for the life of the call, and the result region is filled when the
      // tool settles -- which can be long after a host set the hook.
      formatToolPayload: (payload) => this.formatToolPayload?.(payload) ?? null,
    });
    this.#dispatch = new ToolDispatch({
      element: this,
      transcript: this.#transcript,
      tools: this.#tools,
      decision: this.#decision,
      strings: () => this.#strings,
      announce: (message) => this.#announcer.announce(message),
      autoConfirm: () => this.autoConfirm,
      confirmPredicate: () => this.confirmPredicate,
      getPageMap: () => this.getPageMap,
      navigate: () => this.navigate,
      approveWithEdits: () => this.approveWithEdits,
      approvalRenderer: () => this.approvalRenderer,
      getContext: () => this.getContext(),
      conversationStore: () => this.conversationStore,
      threadId: () => this.#history.threadId,
    });
    this.#runHandlers = new RunHandlers({
      element: this,
      transcript: this.#transcript,
      stream: this.#stream,
      actions: this.#actions,
      activities: this.#activities,
      subagents: this.#subagents,
      announcer: this.#announcer,
      strings: () => this.#strings,
      running: () => this.#running,
      setRunning: (running) => this.#setRunning(running),
      appendMessage: (role, content) => this.appendMessage(role, content),
      noteUnread: () => this.#noteUnread(),
    });
    this.#placement = new PanelPlacement({
      element: this,
      launcher: this.#launcher,
      root: this.#root,
      connected: () => this.#connected,
      collapsed: () => this.collapsed,
      collapsible: () => isCollapsiblePlacement(this.getAttribute("placement")),
      strings: () => this.#strings,
      readPreference: (base) => this.#storage.readPreference(base),
      writePreference: (base, value) => this.#storage.writePreference(base, value),
      clearPreference: (base) => this.#storage.clearPreference(base),
      announceSurfaceChange: (text, undo) => this.#announceSurfaceChange(text, undo),
    });
    this.#excerpts = new TranscriptQuoteOffer({
      element: this,
      root: this.#root,
      messages: this.#messages,
      messagesWrap: this.#messagesWrap,
      input: this.#input,
      strings: () => this.#strings,
      autoGrow: () => autoGrow(this.#input),
      quote: (text) => this.quote(text),
    });
    this.#attachments = new ComposerAttachments({
      element: this,
      chat: this.#chat,
      slot: this.#attachSlot,
      fileInput: this.#fileInput,
      button: this.#attachButton,
      strings: () => this.#strings,
      uploadHandler: () => this.uploadHandler,
      headersFor: (url) => this.#headersFor(url),
      credentialsOption: () => this.#credentialsOption(),
    });
    this.#voice = new ComposerVoice({
      element: this,
      slot: this.#voiceSlot,
      input: this.#input,
      strings: () => this.#strings,
      transcribeHandler: () => this.transcribeHandler,
      headersFor: (url) => this.#headersFor(url),
      credentialsOption: () => this.#credentialsOption(),
      onInput: () => this.#onInput(),
    });
    // The compaction notice is a registration, not a branch -- and going through
    // the seam earns it two things it did not have: a reload puts it back (it is
    // content, and content replays), and a server redrawing under the same id
    // replaces it rather than adding a second notice for one event.
    this.registerActivityRenderer({
      type: COMPACTION_ACTIVITY_TYPE,
      render: (content) => {
        const removed = compactionRemoved(content);
        return removed === null
          ? null
          : renderRunNotice(
              "\u{1F5DC}",
              fillUiString(this.#strings.historyCompacted, { count: removed }),
              "compaction",
            );
      },
    });
    // Follow-up chips, registered through the same seam for the same reasons:
    // a reload puts them back, and a server pushing a new set under a new id
    // supersedes the old one rather than leaving two offers on screen.
    this.registerActivityRenderer({
      type: SUGGESTIONS_ACTIVITY_TYPE,
      render: (content) =>
        renderSuggestionChips(content, this.#strings, (prompt) => {
          void this.sendMessage(prompt);
        }),
    });
    this.#skillsMenu = new SkillsMenu((skill) => this.#skills.apply(skill));
    this.#skills = new SkillCatalog({
      element: this,
      menu: this.#skillsMenu,
      input: this.#input,
      hint: this.#composerHint,
      strings: () => this.#strings,
      context: () => this.skillContext(),
      flag: (name) => this.#flag(name),
      readJsonAttribute: (name) => this.#readJsonAttribute(name),
      fetchInit: (url) => this.#fetchInit(url),
      send: (content) => {
        void this.sendMessage(content);
      },
      submit: () => {
        void this.#submit();
      },
      autoGrow: () => autoGrow(this.#input),
    });
    this.#drawer = new ThreadDrawer({
      onSelect: (threadId) => {
        void this.#history.switchThread(threadId);
      },
      onNew: () => {
        this.newChat();
        void this.#history.refreshDrawer();
      },
      onRename: (threadId, title) => {
        this.#history.renameThread(threadId, title);
      },
      onDelete: (threadId) => {
        this.#history.deleteThread(threadId);
      },
    });
    this.#checkpoints = new CheckpointMenu((runId, verb) => {
      void this.#history.continueRun(runId, verb);
    });
    this.#history = new ConversationHistory({
      element: this,
      drawer: this.#drawer,
      checkpoints: this.#checkpoints,
      transcript: this.#transcript,
      actions: this.#actions,
      activities: this.#activities,
      tools: this.#tools,
      input: this.#input,
      hint: this.#composerHint,
      strings: () => this.#strings,
      conversationStore: () => this.conversationStore,
      formatRelativeTime: () => this.formatRelativeTime,
      navigationResult: () => this.navigationResult,
      headersFor: (url) => this.#headersFor(url),
      requestCredentials: () => this.#requestCredentials(),
      appendMessage: (role, content) => this.appendMessage(role, content),
      autoGrow: () => autoGrow(this.#input),
      ensureClient: () => this.#ensureClient(),
      buildClient: (seed) => this.#buildClient(seed),
      cancelRun: () => this.#cancelRun(),
      resetState: () => this.#resetState(),
      setRunning: (running) => this.#setRunning(running),
    });
  }

  /** Attributes the element reacts to after it has been connected. */
  static get observedAttributes(): string[] {
    return [
      "title-text",
      "placement",
      "credentials",
      "user-key",
      "user-name",
      ...CONNECT_TIME_ATTRIBUTES,
    ];
  }

  attributeChangedCallback(name: string, previous: string | null, value: string | null): void {
    if (name === "credentials") {
      // Reported the moment the attribute is written — before connect, and
      // whether it came from markup or the property setter. An unrecognised
      // mode is otherwise inert, and the request it was meant to authorise
      // goes out anonymously with nothing to show for it.
      if (value !== null && !isCredentialsMode(value)) {
        console.error(
          `<ag-ui-chat>: credentials="${value}" is not a fetch credentials mode ` +
            `(${CREDENTIALS_MODES.join(" / ")}) — it is being ignored, so requests use ` +
            "the browser default and cross-origin cookies will not be sent.",
        );
      }
      return;
    }
    if (name === "placement") {
      // A placement owns the axes it fixes, so hand those back before anything
      // else: a size dragged under the previous placement would otherwise sit
      // inline and outrank the new one.
      this.#placement.releaseOwnedAxes();
      // Position is owned the same way a size is: a placement that places
      // itself takes back a launcher the user had dragged somewhere else.
      this.#placement.releaseLauncherPosition();
      // Switching into a placement with no collapsed state has to release it,
      // not just stop offering it: the control is gone from the header the
      // moment the attribute changes, so a panel collapsed under the previous
      // placement would have no way back.
      if (!isCollapsiblePlacement(this.getAttribute("placement")) && this.collapsed) {
        this.setCollapsed(false);
      }
      // Placement also moves the panel, so the edges its layout holds still
      // change with it. Deferred a frame so the new rules have applied.
      requestAnimationFrame(() => this.#placement.syncResizeAnchor());
      return;
    }
    if (name === "title-text") {
      // `#strings` is the resolved table once connected, the English defaults
      // before then.
      this.#title.textContent = value ?? this.#strings.title;
      this.#railLabel.textContent = this.#title.textContent;
      return;
    }
    if (name === "user-name") {
      // Display only, and live: an auth handshake that resolves after mount
      // names the user on screen the moment it does. Before connect the string
      // table is still the defaults, and rendering fills it again from the
      // resolved one.
      this.#syncGreeting();
      return;
    }
    if (name === "user-key") {
      // Before connect there is nothing to move: connectedCallback resolves the
      // namespace from the attribute as it stands by then. An absent attribute
      // and an empty one name the same (unnamed) principal, so neither is a
      // change worth acting on.
      if (this.#connected && (previous ?? "") !== (value ?? "")) {
        this.#changePrincipal(previous ?? "", value ?? "");
      }
      return;
    }
    // Everything else here is read once, in connectedCallback, to build chrome
    // that then exists or does not. A later change is silently ignored and the
    // symptom is an affordance that never appears, which reads as a broken
    // component rather than a mis-timed assignment — the common React/Vue shape,
    // where the element mounts on one render pass and attributes are patched in
    // on the next. Observed purely so this can be said out loud.
    if (previous === value || !this.#connected) {
      return;
    }
    console.warn(
      `<ag-ui-chat>: "${name}" was changed after the element connected, and is ` +
        "read only while connecting — this assignment has no effect. Set it " +
        "before the element enters the DOM (in the markup, or on the element " +
        "before appending it); frameworks that patch attributes after mount " +
        "should bind it at creation. To apply a new value now, remove and " +
        "re-insert the element.",
    );
  }

  /**
   * Declare a frontend tool the agent may call.
   *
   * **A handler's thrown message leaves the browser.** When a handler rejects,
   * its `Error.message` is posted back as that call's tool result — into the
   * conversation, on to the AG-UI endpoint, persisted server-side, and
   * forwarded to the model provider on every later round. That is deliberate,
   * since it is what lets the agent recover from a failure it caused; but it
   * means an internal hostname, a signed URL or a stack-derived path in a
   * rethrown error is disclosed to parties the host never chose. Throw the
   * message you would be content for the model to read, and log the detail.
   */
  registerTool(tool: ClientTool): void {
    this.#tools.register(tool);
  }

  /**
   * AG-UI **shared state** for this conversation — the protocol's own state
   * channel, sent as `RunAgentInput.state` on every run and replaced in place
   * when the server streams `STATE_SNAPSHOT` / `STATE_DELTA`. Assigning seeds
   * the next run; reading returns whatever the agent last applied.
   *
   * Listen for {@link STATE_EVENT} to react to server-driven changes. Distinct
   * from {@link registerPageState}, which exposes host state as ordinary tools.
   */
  get sharedState(): Readonly<Record<string, unknown>> {
    return this.#client?.state ?? this.#sharedState;
  }

  set sharedState(state: Readonly<Record<string, unknown>>) {
    this.#sharedState = { ...state };
    // A client already exists for this conversation — push it through so the
    // next run sends it, rather than silently waiting for a new conversation.
    this.#client?.setState(this.#sharedState);
  }

  /** Bind a piece of host page state to `read_<name>` / `set_<name>` tools. */
  registerPageState(binding: PageState): void {
    this.#tools.registerPageState(binding);
  }

  /**
   * @deprecated Renamed to {@link registerPageState} — the old name read as
   * AG-UI shared-state sync. Behaviour is unchanged; the alias will be removed
   * in a future major.
   */
  registerStateHook(binding: PageState): void {
    this.registerPageState(binding);
  }

  /** The AG-UI endpoint URL, read from the `endpoint` attribute. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  // Reflecting setter so frameworks (e.g. React 19) that assign matching
  // props as element *properties* don't hit a read-only property. Read at
  // use-time, so a runtime change applies to the next run.
  set endpoint(value: string) {
    this.setAttribute("endpoint", value);
  }

  /**
   * Who the stored conversation belongs to, from the `user-key` attribute.
   *
   * Set it to whatever identifies the signed-in principal — a user id, an
   * account id, a hash of one. The value joins the storage namespace, so two
   * principals in the same tab cannot read each other's transcript, and
   * **changing it purges what the previous one left behind**.
   *
   * That purge is the reason this is a live attribute rather than a
   * connect-time one. `sessionStorage` survives same-tab navigation, so it
   * survives a logout; and a single-page app signs out through its own router
   * without remounting anything, so there is no other moment at which the
   * element could find out. The host naming the new principal — or dropping the
   * attribute — is the signal.
   *
   * Absent means exactly today's behaviour, which is why nothing breaks by
   * leaving it off: the conversation is scoped to the element and to nobody in
   * particular, and on a shared workstation it carries into whoever signs in
   * next in the same tab.
   *
   * The first value to arrive is treated as a host naming the user who was
   * already there, not as a handover: the conversation in progress moves into
   * the principal's namespace rather than being destroyed, so an element
   * configured by an async auth handshake keeps what is on screen.
   */
  get userKey(): string {
    return this.getAttribute("user-key") ?? "";
  }

  set userKey(value: string) {
    this.setAttribute("user-key", value);
  }

  /**
   * The signed-in user's display name, from the `user-name` attribute, for the
   * greeting an empty conversation shows under `placement="page"`.
   *
   * Presentation only. Unlike {@link userKey} it scopes nothing and is never
   * sent to the server. Absent or blank means the nameless greeting. Live: a
   * name that arrives after the element connected replaces the greeting on
   * screen.
   */
  get userName(): string {
    return this.getAttribute("user-name") ?? "";
  }

  set userName(value: string) {
    this.setAttribute("user-name", value);
  }

  /** Fill the greeting from the resolved string table and the current name. */
  #syncGreeting(): void {
    const name = this.userName.trim();
    this.#greetingText.textContent =
      name === "" ? this.#strings.greetingNoName : fillUiString(this.#strings.greeting, { name });
  }

  /**
   * Cookie policy for **every** request this element makes, as `fetch`'s own
   * `credentials` mode (`"omit"` / `"same-origin"` / `"include"`). Mirrored to
   * the `credentials` attribute, so markup embeds can set it without script.
   *
   * `null` (the default) leaves the browser's `same-origin` default in place,
   * which sends no cookies at all to an endpoint on a different origin — and
   * the request goes out anonymously rather than failing, so the symptom is a
   * 401 from a server that looks correctly configured. A cookie-authenticated
   * cross-origin deployment wants `"include"`, plus
   * `Access-Control-Allow-Credentials: true` and a concrete, non-wildcard
   * `Access-Control-Allow-Origin` on the server.
   *
   * Read per request, so a late assignment applies to everything after it.
   * `"omit"` cannot be honoured by the built-in upload transport, an
   * `XMLHttpRequest` with only a two-state cookie switch; every other endpoint
   * honours all three modes.
   */
  get credentials(): RequestCredentials | null {
    const attr = this.getAttribute("credentials");
    return attr !== null && isCredentialsMode(attr) ? attr : null;
  }

  set credentials(value: RequestCredentials | null) {
    if (value === null) {
      this.removeAttribute("credentials");
      return;
    }
    // Thrown, not warned: an unrecognised mode is inert at request time, and
    // the whole failure this option exists to fix is a request that goes out
    // wrong without saying so. Fail where the mistake was made instead.
    if (!isCredentialsMode(value)) {
      throw new TypeError(
        `<ag-ui-chat>: credentials must be one of ${CREDENTIALS_MODES.map((mode) => `"${mode}"`).join(", ")} ` +
          `(got ${JSON.stringify(value)}).`,
      );
    }
    this.setAttribute("credentials", value);
  }

  /**
   * The headers for the request about to go out: the static {@link headers}
   * with {@link getHeaders}'s live values overlaid, per key.
   *
   * Every request site goes through here, so "how this element authenticates"
   * is one answer rather than one per endpoint.
   */
  #requestHeaders(): Record<string, string> {
    return { ...this.headers, ...this.getHeaders?.() };
  }

  /**
   * The request headers, having first reported the destination if it is foreign.
   *
   * Every caller that sends these headers knows its URL, and `#requestHeaders`
   * does not -- so the check lives here, on the path that has both, rather than
   * being repeated at each call site with a chance to be forgotten at the next
   * one added.
   */
  #headersFor(url: string): Record<string, string> {
    const headers = this.#requestHeaders();
    warnOnCrossOriginCredentials(
      url,
      Object.keys(headers),
      this.trustedOrigins,
      this.#warnedOrigins,
    );
    return headers;
  }

  /** The configured cookie policy as `fetch` spells it; `undefined` when unset. */
  #requestCredentials(): RequestCredentials | undefined {
    return this.credentials ?? undefined;
  }

  /**
   * The `credentials` entry for an {@link AgentFactory} call, or nothing at all.
   *
   * Spread rather than assigned: `exactOptionalPropertyTypes` rejects an
   * explicit `credentials: undefined`, and a factory should see the field
   * absent — not present-and-empty — when no policy is configured. The agent
   * reads it when it is built (first send, thread switch, continuation), by
   * which time any host configuration has landed.
   */
  #credentialsOption(): { credentials?: RequestCredentials } {
    const credentials = this.#requestCredentials();
    return credentials === undefined ? {} : { credentials };
  }

  /** The `fetch` init for the element's own plain GETs (catalogs). */
  #fetchInit(url: string): RequestInit | undefined {
    return withCredentials({ headers: this.#headersFor(url) }, this.#requestCredentials());
  }

  /**
   * How much detail tool-call cards show, from the `data-tool-display`
   * attribute (`minimal` / `inline` / `compact` / `full`). Defaults to `full`.
   *
   * Applied by the shadow CSS from the attribute itself, so changing it
   * restyles every card already in the transcript rather than only the ones
   * built afterwards.
   */
  get toolDisplay(): ToolDisplayMode {
    const attr = this.getAttribute("data-tool-display");
    if (
      attr === TOOL_DISPLAY.INLINE ||
      attr === TOOL_DISPLAY.MINIMAL ||
      attr === TOOL_DISPLAY.COMPACT
    ) {
      return attr;
    }
    return TOOL_DISPLAY.FULL;
  }

  set toolDisplay(value: ToolDisplayMode) {
    this.setAttribute("data-tool-display", value);
  }

  connectedCallback(): void {
    // Resolve the per-instance storage namespace before any key read/write, so
    // this instance doesn't share collapsed/theme/thread state with another on
    // the same origin.
    this.#storage.claim();
    // Restore a dragged size before the panel paints, so it does not snap from
    // the placement default to the user's width on the first frame.
    this.#placement.restoreSize();
    // Position the grip at the corner this layout grows toward. Deferred to a
    // frame so the host's own stylesheet has applied; re-measured on every drag
    // anyway, so a wrong first guess costs a grip in the wrong corner and never
    // a wrong resize.
    requestAnimationFrame(() => {
      // Before the anchor, which the placement stamps itself once a dragged
      // position exists.
      this.#placement.restoreLauncherPosition();
      this.#placement.syncResizeAnchor();
    });
    // Resolve the string table before rendering any chrome (defaults are the
    // floor; `data-strings` then the `strings` property layer over them).
    this.#strings = mergeUiStrings({ ...this.#readStringOverrides(), ...this.strings });
    // Restore a theme the built-in toggle persisted last visit (opt-in only, so
    // it never overrides a host that drives `theme` itself).
    if (this.getAttribute("data-theme-toggle") !== null) {
      const saved = this.#storage.readPreference(THEME_KEY);
      if (saved !== null) {
        this.setAttribute("theme", saved);
      }
    }
    this.#render();
    this.#drawer.setStrings(this.#strings);
    this.#checkpoints.setStrings(this.#strings);
    // Gated on the placement, not just on the stored value: the key is
    // namespaced per instance but not per placement, so a tab that collapsed a
    // floating panel and later loaded the same instance as a page would restore
    // a state that placement has no way out of.
    if (isCollapsiblePlacement(this.getAttribute("placement")) && this.#startsCollapsed()) {
      this.setAttribute("collapsed", "");
    }
    this.#syncLauncher();
    this.#skills.init();
    // Namespace the built-in default store too (a host-injected store is used
    // verbatim). Must precede #wireThreadStore, which wraps the current store.
    this.conversationStore = this.#storage.scopeStore(this.conversationStore, this.userKey);
    window.addEventListener("resize", this.#onViewportResize);
    // The visual viewport changes without the window resizing -- a keyboard
    // opening, a pinch-zoom, the URL bar collapsing -- and `scroll` is what
    // fires when it is panned rather than resized.
    window.visualViewport?.addEventListener("resize", this.#onViewportResize);
    window.visualViewport?.addEventListener("scroll", this.#onViewportResize);
    this.#placement.publishVisualViewport();
    this.#wireThreadStore();
    this.#attachments.wire();
    this.#voice.wire();
    this.#history.adoptActiveThread();
    // The catalog requests go out a microtask later, so a host configuring
    // through a framework ref still has a chance to be heard — see #startup.
    queueMicrotask(() => this.#startup());
    void this.#history.rehydrate();
    // Last: everything above reads (and some of it sets) attributes, and none
    // of that should trip the connect-time warning.
    this.#connected = true;
  }

  /**
   * The catalog requests the element issues on startup: the tool labels
   * (`data-tools-url`) and the backend skills (`data-skills-url`).
   *
   * Deliberately one microtask behind `connectedCallback`. A framework ref is
   * attached after the node is inserted but within the same commit, so a
   * request issued from `connectedCallback` itself goes out before `headers`,
   * {@link getHeaders} or {@link credentials} exist and 401s in a way that
   * reads as a server fault. A microtask lands after that commit, still before
   * paint.
   *
   * It is not a fix for configuration arriving later than the commit (a passive
   * effect, an awaited token fetch): configure before insertion, or call
   * {@link reload}, since a longer timer would hide that race rather than close
   * it.
   *
   * The history replay stays in `connectedCallback` on purpose. It renders into
   * the transcript, so deferring it would let a `sendMessage()` in the same
   * task land first and be duplicated by the replay.
   */
  #startup(): void {
    // An element can be inserted and removed inside one task (a discarded
    // render, a double-mount); nothing should go out for a node that has
    // already left the document.
    if (!this.#connected) {
      return;
    }
    void this.#tools.fetchCatalog();
    void this.#skills.fetch();
  }

  /**
   * Re-run everything the element loads on startup — the tool-label catalog,
   * the backend skill catalog and the thread's history — with the transport
   * configuration as it stands now.
   *
   * For a host that can only configure the element after the fact (a token
   * fetched in a passive effect, an async auth handshake), this re-issues the
   * startup requests authenticated, without removing and re-inserting the node.
   *
   * A reload, not a merge: the in-flight run is cancelled and the transcript is
   * rebuilt from persisted history, so anything streamed since is dropped. Call
   * it once, when configuration lands, not between turns.
   */
  async reload(): Promise<void> {
    this.#cancelRun();
    this.#resetState();
    this.#setRunning(false);
    await Promise.all([
      this.#tools.fetchCatalog(),
      this.#skills.fetch(),
      this.#history.rehydrate(),
    ]);
  }

  /**
   * Tear down live resources when the element leaves the DOM: cancel the
   * in-flight run so its stream closes, abort in-flight uploads so they do not
   * orphan server-side files, and release the mic so the browser's recording
   * indicator clears. Without this a removed element leaks all three.
   */
  disconnectedCallback(): void {
    this.#connected = false;
    window.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("scroll", this.#onViewportResize);
    this.#storage.release();
    this.#cancelRun();
    this.#excerpts.detachPageOffer();
    this.#attachments.tray?.dispose();
    this.#voice.dispose();
    this.#transcript.disposeScroller();
    this.#announcer.dispose();
  }

  /**
   * Read an opt-in flag attribute the way HTML reads a boolean attribute.
   *
   * Present means on: bare (`data-prompt-chips`), empty (`=""`), or any value
   * except the literal `"false"`. Comparing against `"true"` instead would make
   * the bare spelling every native boolean attribute uses silently disable the
   * feature it names. `="false"` still turns it off.
   */
  #flag(name: string): boolean {
    const value = this.getAttribute(name);
    return value !== null && value !== "false";
  }

  /**
   * Parse a JSON-valued attribute, saying so when it will not parse.
   *
   * `null` for an absent attribute, and `null` again for one that is not JSON --
   * but not quietly the second time. Quoting JSON inside an HTML attribute is
   * fiddly, and the result of getting it wrong is indistinguishable from the
   * feature being switched off: no chips appear, or the strings stay English,
   * with nothing anywhere saying why. That is the same failure `data-paste-attach`
   * already reports for a value it cannot read.
   *
   * Console only. A page author's typo is not the reader's business, nothing the
   * reader did was refused, and the degraded widget is still perfectly usable.
   */
  #readJsonAttribute(name: string): unknown {
    const raw = this.getAttribute(name);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw);
    } catch {
      console.warn(
        `<ag-ui-chat>: ${name} is not valid JSON, so it was ignored entirely and ` +
          "the built-in default is being used. Check the quoting -- JSON inside " +
          "an HTML attribute needs single quotes around the attribute value, or " +
          "its own double quotes escaped.",
      );
      return null;
    }
  }

  /** Parse the inline `data-strings` JSON overrides (empty when absent/malformed). */
  #readStringOverrides(): Partial<UiStrings> {
    const parsed = this.#readJsonAttribute("data-strings");
    // A JSON number or string parses fine and overrides nothing. Not warned
    // about separately: it is the same "this attribute did not take effect"
    // as a parse failure, and the warning above already covers the spelling
    // that produces it by accident.
    return typeof parsed === "object" && parsed !== null ? (parsed as Partial<UiStrings>) : {};
  }

  /**
   * Put `text` into the composer as a markdown quotation, and focus it.
   *
   * Deliberately **not** a send. Quoting is how a question narrows to one part
   * of an answer, so the quotation is the preamble and the question is what
   * comes next -- the caret is left after it, on its own line.
   *
   * This is also the seam for the half of this feature the component cannot
   * build: selection in the **host page**. A widget mounted beside a table can
   * be asked about a row, and nothing in a chat's own transcript can offer
   * that. A host reads its own selection, however it likes, and calls this.
   *
   * No-ops on text that is empty or only whitespace.
   */
  quote(text: string): void {
    this.#excerpts.insert(text);
  }

  /**
   * Offer to quote what the user selects in the **host page**, not just in the
   * transcript. Returns a function that stops offering.
   *
   * The same select-then-offer gesture, over a table, a diff, a report -- the
   * surface the user actually works in, which is the half of quoting no hosted
   * chat can reach. Opt-in, because it listens on the host's document and that
   * is theirs to grant.
   *
   * Deliberately **not** a four-line recipe, which is how this shipped first
   * and was wrong: a page listener that quotes every settled selection appends
   * to the composer on every drag made to read, to copy or to fix a typo -- and
   * it cannot tell a selection in the page's prose from one inside the user's
   * own half-typed `<input>`, because Chrome reports a field's internal
   * selection as an ordinary range over the field's *wrapper*. See
   * {@link attachQuoteOffer} for the guards.
   *
   * Detached automatically when the element leaves the document; a host that
   * re-mounts it calls this again.
   */
  offerQuoteInPage(within: HTMLElement = document.body): () => void {
    return this.#excerpts.offerInPage(within);
  }

  /**
   * When `data-threads-url` is set, route thread enumeration / load / rename /
   * delete through that server endpoint (wrapping the current store as the
   * client-only fallback), so the history drawer shows durable, cross-device
   * threads. Without it, the client store's per-tab threads are used.
   *
   * `data-threads-cache="false"` drops the local copy of the message bodies —
   * for the deployment that pointed history at a server precisely so that
   * transcripts do not sit in the browser. The client-only concerns (the active
   * thread id, the navigation checkpoint) keep their local store either way.
   */
  #wireThreadStore(): void {
    const url = this.getAttribute("data-threads-url");
    if (url !== null) {
      this.conversationStore = new RemoteConversationStore(
        url,
        () => this.#headersFor(url),
        this.conversationStore,
        () => this.#requestCredentials(),
        this.getAttribute("data-threads-cache") !== "false",
      );
    }
  }

  /**
   * Replace the host-supplied (client) skill catalog. Merged after the embedded
   * and fetched skills (so a client skill overrides a same-named server one).
   */
  setSkills(skills: readonly Skill[]): void {
    this.#skills.setClientSkills(skills);
  }

  /** Whether the widget is collapsed (reflected as the `collapsed` attribute). */
  get collapsed(): boolean {
    return this.hasAttribute("collapsed");
  }

  // Property setter (framework interop) — delegates to setCollapsed so a
  // `collapsed` prop assignment persists + emits the toggle event.
  set collapsed(value: boolean) {
    this.setCollapsed(value);
  }

  /**
   * Set the collapsed state: reflect the `collapsed` attribute, persist it
   * per-tab, and emit a {@link TOGGLE_EVENT} so a host can mirror the state in
   * its own chrome.
   */
  setCollapsed(collapsed: boolean, options: { readonly announce?: boolean } = {}): void {
    if (collapsed && !isCollapsiblePlacement(this.getAttribute("placement"))) {
      return;
    }
    // Announced before the state changes, so the notice is written into a
    // transcript the user can still see -- and only when the agent did it,
    // rather than when the user pressed the control themselves.
    //
    // Collapsing only. Expanding announces nothing because the panel arriving
    // is the announcement, and a notice about something visibly happening is
    // noise; there is also nothing to undo that the collapse control does not
    // already do.
    if (options.announce === true && collapsed && !this.collapsed) {
      // No undo beside this one. The notice is written into the transcript and
      // the transcript is then hidden by the very collapse it describes, so
      // the only way to read it is to expand the panel -- which is what the
      // undo would have done. By the time the button can be seen it has
      // nothing left to do, and a control that is always a no-op is worse than
      // no control. Same reasoning as the expand case just below.
      this.#announceSurfaceChange(this.#strings.chatMinimised, null);
    }
    if (!collapsed) {
      // Re-decide which way to open before opening: the viewport may have
      // changed since the launcher was dropped, and this corner is what the
      // panel grows from.
      this.#placement.restoreLauncherPosition();
    }
    if (collapsed) {
      this.setAttribute("collapsed", "");
    } else {
      this.removeAttribute("collapsed");
    }
    writeStoredItem(this.#storage.key(COLLAPSED_KEY), collapsed ? "1" : "0");
    // Expanding is what marks the waiting answers read; collapsing starts a
    // fresh count. Either way the badge is cleared and the host told.
    this.#setUnread(0);
    this.dispatchEvent(
      new CustomEvent<ToggleDetail>(TOGGLE_EVENT, {
        detail: { collapsed },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Answers that finished while the widget was collapsed, and that the user has
   * therefore not seen. Expanding (or {@link newChat}) clears it. The launcher's
   * badge renders this; {@link UNREAD_EVENT} announces every change, so a host
   * chrome can render its own instead.
   */
  get unread(): number {
    return this.#unread;
  }

  /**
   * Whether to mount collapsed.
   *
   * A stored choice always wins -- in either direction, so a user who opened
   * the panel finds it open. With nothing stored, the corner placements start
   * collapsed: they are the two that have a launcher, and a launcher is the
   * resting state of every corner chat in the field. Mounting open put a
   * 380x560 panel over the host page's own bottom-right corner on a visitor's
   * first load, uninvited.
   *
   * The placements that place themselves are unchanged. A host that docks a
   * sidebar has already decided the widget belongs on screen, and one that
   * embeds it in its own layout has given it a box to fill.
   *
   * `data-start-open` restores the previous behaviour for a host that wants
   * the panel up immediately.
   */
  #startsCollapsed(): boolean {
    const stored = this.#storage.readScopedItem(COLLAPSED_KEY);
    if (stored !== null) {
      return stored === "1";
    }
    return (
      isDraggablePlacement(this.getAttribute("placement")) && !this.hasAttribute("data-start-open")
    );
  }

  /**
   * Describe the panel to whoever is asking -- in practice the agent, through
   * the opt-in chat-surface tools.
   *
   * `movable` folds two separate reasons into the one answer a caller needs:
   * a placement that places itself owns its position, and a panel that fills
   * the screen has nowhere to go. Reporting them apart would make every caller
   * re-derive the same conjunction.
   */
  describeSurface(): ChatSurfaceReport {
    return this.#placement.describeSurface();
  }

  /**
   * Send the panel to a corner, and report whether it went.
   *
   * A third claimant on the axes a placement and a user drag already share, and
   * it takes them the same way the drag does rather than inventing a second
   * mechanism: the same commit path, so the launcher travels with the panel,
   * the corner it opens from is re-picked, and switching placement hands
   * everything back. What it must not do is claim a move it did not make --
   * hence the boolean, and hence {@link describeSurface} existing so a caller
   * can ask first.
   */
  moveTo(corner: ChatCorner, options: { readonly announce?: boolean } = {}): boolean {
    return this.#placement.moveTo(corner, options);
  }

  /** Flip the collapsed state. Bound to the built-in header toggle. */
  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  /**
   * Flip the `theme` attribute between `light` and `dark` and persist the choice
   * per tab. Bound to the optional built-in header theme toggle
   * (`data-theme-toggle`); any non-dark theme (incl. `auto` / `code`) flips to
   * `dark` first.
   */
  toggleTheme(): void {
    const next = this.getAttribute("theme") === "dark" ? "light" : "dark";
    this.setAttribute("theme", next);
    this.#storage.writePreference(THEME_KEY, next);
    this.#syncThemeGlyph();
  }

  /**
   * Move the element's client state from one principal to another.
   *
   * The whole reason {@link userKey} is live: `sessionStorage` outlives a
   * logout, because a logout is a navigation (or, in a single-page app, not
   * even that) rather than a tab close. Nothing remounts, so the host naming
   * the new principal is the only signal the element will ever get.
   */
  #changePrincipal(previousKey: string, nextKey: string): void {
    const previous = this.#storage.conversationNamespace(previousKey);
    const next = this.#storage.conversationNamespace(nextKey);
    if (previousKey === "") {
      // Absent to present is not a handover. It is the documented late
      // configuration shape — the element mounts, an auth handshake resolves,
      // and only then is the user known — so the conversation already on screen
      // belongs to this principal and moves with them. Moving rather than
      // copying also matters: a copy left behind under the unscoped namespace
      // is a transcript the next key-less mount would happily adopt.
      SessionStorageStore.adopt(previous, next);
      this.#rescopeStore(next);
      return;
    }
    SessionStorageStore.purge(previous);
    this.#rescopeStore(next);
    // An Always allow is the previous principal's decision too, and it lives in
    // memory rather than in the store just purged, so it has to be forgotten
    // here or it outlives them. The adoption above keeps it, for the same
    // reason it keeps the conversation: the same person is still there.
    this.#dispatch.forgetWaivers();
    // The transcript on screen, the run in flight and the replayed history all
    // belong to the principal who just left. Purging storage without clearing
    // these would leave the previous user's conversation visible to the new one.
    this.#cancelRun();
    this.#resetState();
    this.#setRunning(false);
    this.#setUnread(0);
    this.#history.adoptActiveThread();
    void this.#history.rehydrate();
    void this.#history.refreshDrawer();
  }

  /**
   * Rebuild the `sessionStorage` store under `namespace`, re-wrapping it for
   * `data-threads-url` exactly as connecting did.
   *
   * A store of the host's own kind is left alone: a store that holds its data
   * somewhere the element cannot see has to scope itself. The transcript on
   * screen is still cleared either way — the host swapped principals, and that
   * much is the element's to act on.
   */
  #rescopeStore(namespace: string): void {
    const store = this.#storage.rescopeStore(namespace);
    if (store === null) {
      return;
    }
    this.conversationStore = store;
    this.#wireThreadStore();
  }

  /** Reflect the current theme on the toggle: show the destination's glyph. */
  #syncThemeGlyph(): void {
    const dark = this.getAttribute("theme") === "dark";
    // Replaced wholesale rather than toggling a class: the two marks are
    // different paths, not one path in two states, and the slot has to keep
    // working so a host can still supply its own.
    this.#themeToggle.replaceChildren(
      iconElement("theme", "theme-icon", dark ? ICON_SUN : ICON_MOON, null),
    );
  }

  /**
   * Open the thread-history drawer: the imperative route to the control that
   * renders as `::part(history-button)`.
   *
   * A host that hides `::part(header)` for its own title bar hides the history,
   * new-chat and collapse buttons with it. Each has a method so that chrome can
   * be rebuilt: this one, {@link openCheckpoints}, {@link newChat},
   * {@link toggleCollapsed} and {@link toggleTheme}.
   */
  openThreads(): void {
    this.#history.openThreads();
  }

  /**
   * Open the checkpoints panel (the `::part(checkpoints-button)` route).
   *
   * It lists the runs the `data-runs-url` server reports as continuable;
   * without that attribute the built-in button is never rendered and this opens
   * an empty panel.
   */
  openCheckpoints(): void {
    this.#history.openCheckpoints();
  }

  /** Close the conversation list, if it is open. */
  closeThreads(): void {
    this.#drawer.close();
  }

  /** Close the checkpoints panel, if it is open. */
  closeCheckpoints(): void {
    this.#checkpoints.close();
  }

  /**
   * Open the checkpoints panel, or close it if it is already open — what the
   * built-in ⭯ button does, because a control that opens a panel is read as the
   * control that also dismisses it. {@link openCheckpoints} stays open-only for a
   * host that means exactly that.
   */
  toggleCheckpoints(): void {
    if (this.#checkpoints.open_) {
      this.#checkpoints.close();
      return;
    }
    this.openCheckpoints();
  }

  /**
   * Start a fresh conversation: drop the in-memory run state, clear the
   * transcript, and mint a new thread id.
   *
   * The conversation being left is kept, and stays in the history drawer to
   * return to. Deleting one is the drawer row's own action; a button that
   * starts something new must not be the button that destroys what was there.
   *
   * Focus moves to the composer, unless the widget is collapsed and the
   * composer is not on screen: starting a conversation is a request to type
   * one. The page is not scrolled to bring the composer into view.
   */
  newChat(): void {
    // Stop any in-flight run first — discarding the client mid-run would
    // leave the old agent streaming into a cleared transcript.
    this.#cancelRun();
    this.#history.reapUnsent();
    this.#resetState();
    this.#history.startThread();
    this.#setRunning(false);
    this.#setUnread(0);
    // Whichever control started it: the header's, the history list's (which
    // hands focus back to its opener as it closes, before this runs), or a
    // host's own. A keyboard user otherwise had to find their way back to the
    // field that had just been emptied.
    //
    // Without scrolling. Both of the element's own buttons sit in the panel, so
    // the composer is already on screen when they run; a host calling this from
    // its own code may be resetting a chat further down the page, and moving
    // the page to it (and opening a phone's keyboard over what the user was
    // reading) is not what a reset asked for.
    if (!this.collapsed) {
      this.#input.focus({ preventScroll: true });
    }
  }

  /** Drop the in-memory run + transcript, leaving the thread id untouched. */
  #resetState(): void {
    this.#client = null;
    // Every path here has just cancelled the run, but a cancelled run ends
    // later: once its request closes, or once a host tool's handler returns.
    // Whatever it says then is about the conversation being cleared, so it must
    // not draw into this one, put a new run's Stop back to Send, or report the
    // new conversation's tools as its own.
    this.#runHandlers.detach();
    this.#clearTranscript();
    this.#history.forgetRestored();
    // The composer's own history goes with the conversation it was typed
    // into. The path that makes this more than tidiness is the `user-key`
    // rescope, which purges storage and wipes the transcript precisely so the
    // previous principal's words are not visible to the next one -- and would
    // otherwise leave every one of them a single ArrowUp away.
    this.#sentDrafts.length = 0;
    this.#recallIndex = null;
  }

  /**
   * Wipe the rendered transcript and everything that indexes into it.
   *
   * Split from {@link #resetState} because a retry re-renders the transcript
   * while keeping the *client*: dropping the client there would take the
   * agent's message list with it, which is the thing being truncated.
   */
  #clearTranscript(): void {
    // Before the transcript goes: a render still queued would otherwise fire
    // against the wiped list and open a fresh bubble holding the discarded
    // conversation's last tokens.
    this.#stream.end();
    this.#transcript.releaseTurn();
    // The panels go with the cards they hung off.
    this.#subagents.clear();
    this.#transcript.forgetCards();
    this.#activities.clearBlocks();
    this.#actions.forget();
    this.#attachments.tray?.clear();
    // Returning to an empty conversation snaps back to the centre: only the send
    // that left it travels. And whatever restore was holding the layout back is
    // no longer this transcript's, so a new chat started mid-restore greets the
    // user rather than waiting on a load it has abandoned.
    this.removeAttribute("data-composer-settling");
    this.removeAttribute("data-restoring");
    // Keep the empty-state region; everything else clears.
    this.#transcript.empty();
  }

  /**
   * Ask the same question again and replace the answer.
   *
   * History is truncated to the most recent user message inclusive and the run
   * repeats, so the agent answers what it was asked rather than being told its
   * last answer was wrong. Returns `false` when there is nothing to retry or a
   * run is already in flight.
   *
   * Public because a host with its own message UI wants the same button, and
   * because the failed-run notice reaches it from outside the action row.
   *
   * **A retried turn re-runs its tools**, which for a page-driving agent is not
   * neutral: the previous attempt already clicked what it clicked, and this
   * does not undo it. Confirmation still applies, so a destructive tool asks
   * again -- unless the user waived it for this session.
   */
  async retryLastTurn(): Promise<boolean> {
    if (this.#running) {
      return false;
    }
    const client = this.#ensureClient();
    const kept = client.truncateToLastUser();
    if (kept === null) {
      return false;
    }
    // Re-render between the truncation and the run: the kept turns replay as
    // restored history (static, no entrance animation), and only the new answer
    // arrives live. Streaming into the old transcript would put the new answer
    // underneath the one it replaces.
    this.#clearTranscript();
    for (const message of kept) {
      this.#history.replay(message);
    }
    await client.resume();
    return true;
  }

  /**
   * Append a message bubble and return it.
   *
   * Assistant content renders as sanitised markdown/HTML; user content stays
   * literal text, which also avoids rendering user-authored markup.
   *
   * Assistant bubbles land in the current answer group, opening one if needed;
   * a user bubble closes the prior group and sits directly in the list, the
   * well wrapping only the assistant turn.
   */
  appendMessage(role: MessageRole, content: string): HTMLDivElement {
    return this.#transcript.append(role, content);
  }

  #render(): void {
    this.#chat.className = "chat";
    this.#chat.setAttribute("part", "panel");

    const header = document.createElement("div");
    header.className = "header";
    header.setAttribute("part", "header");

    const title = this.#title;
    title.className = "header-title";
    title.setAttribute("part", "title");
    title.textContent = this.getAttribute("title-text") ?? this.#strings.title;

    // Optional header icon: a slot (any markup) with a `data-icon-url` <img>
    // fallback. Rendered only when one of the two is provided, so the header has
    // no phantom gap otherwise.
    if (
      this.querySelector('[slot="icon"]') !== null ||
      this.getAttribute("data-icon-url") !== null
    ) {
      header.append(iconElement("icon", "icon", null, this.getAttribute("data-icon-url")));
    }

    // A coarse slot for host-provided header actions, between title and controls.
    const headerActions = document.createElement("slot");
    headerActions.name = "header-actions";

    const controls = document.createElement("div");
    controls.className = "header-controls";
    controls.setAttribute("part", "header-controls");

    // Both controls delegate to the public methods, so a host chrome driving
    // them imperatively takes exactly the path the built-in button takes.
    const history = headerButton("history", this.#strings.chatHistory, "☰");
    history.addEventListener("click", () => this.openThreads());

    // ↺ rather than ⭯: the same idea in a glyph that has a font behind it in
    // every browser. The obscure one rendered as an unreadable mark at 14px, and a
    // header control nobody can name is one nobody presses.
    const checkpoints = headerButton("checkpoints", this.#strings.checkpoints, "↺");
    checkpoints.addEventListener("click", () => this.toggleCheckpoints());

    const newChat = headerButton("new", this.#strings.newChat, "✚");
    newChat.addEventListener("click", () => this.newChat());

    const collapse = headerButton("collapse", this.#strings.collapse, "—");
    collapse.addEventListener("click", () => this.toggleCollapsed());

    // Only offered when the server actually indexes runs — without
    // `data-runs-url` there is nothing to continue and the button would open
    // a permanently empty panel. Asks the history's run index rather than
    // re-testing the attribute, so "configured" means one thing everywhere (an
    // empty value is unset, not a relative URL to the current page).
    if (this.#history.runs() !== null) {
      controls.append(history, checkpoints, newChat);
    } else {
      controls.append(history, newChat);
    }
    // Optional built-in theme toggle: off unless the host opts in, so
    // it never competes with a host-supplied switch in `slot="header-actions"`.
    if (this.getAttribute("data-theme-toggle") !== null) {
      this.#themeToggle.type = "button";
      this.#themeToggle.className = "header-btn header-btn--theme";
      this.#themeToggle.setAttribute("part", "header-button theme-toggle");
      this.#themeToggle.title = this.#strings.toggleTheme;
      this.#themeToggle.setAttribute("aria-label", this.#strings.toggleTheme);
      this.#themeToggle.addEventListener("click", () => this.toggleTheme());
      this.#syncThemeGlyph();
      controls.append(this.#themeToggle);
    }
    controls.append(collapse);
    header.append(title, headerActions, controls);

    // A panel is a window and a header is its title bar.
    this.#placement.enablePanelDrag(header);

    this.#messages.className = "messages";
    this.#messages.setAttribute("part", "messages");
    this.#messages.setAttribute("role", "log");
    // NOT a live region. The streaming bubble's innerHTML is replaced inside
    // this element on every animation frame, and `role="log"` already implies
    // polite announcement whose default `aria-relevant` includes text
    // additions -- so a screen reader was asked to re-announce the whole answer
    // tens of times as it streamed. `aria-live="off"` is an explicit override
    // of the role's implicit value, which is why the role can stay: the log
    // semantics are what let the transcript be navigated as one, and only the
    // announcing is the defect. Status goes to #announcer instead.
    this.#messages.setAttribute("aria-live", "off");
    this.#messages.setAttribute("aria-label", this.#strings.conversation);

    this.#jumpButton.className = "jump-latest";
    this.#jumpButton.type = "button";
    this.#jumpButton.setAttribute("part", "jump-latest");
    this.#jumpButton.textContent = this.#strings.jumpToLatest;

    // The quote offer, and the transcript's settled selections it listens for.
    this.#excerpts.mount();

    // Built here rather than at field initialisation: the viewport has to exist
    // and the observer has to have something to observe.
    this.#transcript.mountScroller(this.#jumpButton);

    this.#announcer.mount();

    // Empty-state region: a host slot at the top of the list, hidden as soon as
    // anything renders.
    this.#emptyWrap.className = "empty";
    this.#emptyWrap.setAttribute("part", "empty");
    // The greeting heads the empty state, in a slot of its own: a host that
    // replaces the starters keeps the greeting, and a host that replaces the
    // greeting keeps the starters. A div rather than a heading, because this
    // sits inside somebody else's page, which owns the document outline.
    const greeting = document.createElement("div");
    greeting.className = "greeting";
    greeting.setAttribute("part", "greeting");
    const greetingSlot = document.createElement("slot");
    greetingSlot.name = "greeting";
    greetingSlot.append(this.#greetingText);
    greeting.append(greetingSlot);
    this.#syncGreeting();
    this.#emptyWrap.append(greeting);
    const emptySlot = document.createElement("slot");
    emptySlot.name = "empty";
    // Fallback content, so a host that slots its own gets exactly that and
    // nothing of ours: the starters live *inside* the slot rather than beside
    // it, which is the difference between an offer and an imposition.
    const starters = renderStarterChips(this, this.#strings, (prompt) => {
      void this.sendMessage(prompt);
    });
    if (starters !== null) {
      emptySlot.append(starters);
    }
    this.#emptyWrap.append(emptySlot);
    this.#queuedRow.className = "queued";
    this.#queuedRow.setAttribute("part", "queued");
    this.#queuedRow.setAttribute("role", "group");
    this.#queuedRow.setAttribute("aria-label", this.#strings.queued);
    this.#queuedRow.hidden = true;
    this.#messages.append(this.#emptyWrap);
    // Stamped from the first frame, so a page that mounts empty is laid out as
    // empty rather than switching to it on the first change.
    this.#transcript.updateEmptyState();

    const inputRow = document.createElement("div");
    inputRow.className = "input-row";
    inputRow.setAttribute("part", "composer");

    // One bordered surface holds the field and the tool row under it, so the
    // icon buttons stop competing with the field for weight.
    const composer = document.createElement("div");
    composer.className = "composer";
    composer.setAttribute("part", "composer-surface");

    const tools = document.createElement("div");
    tools.className = "composer-tools";
    tools.setAttribute("part", "composer-tools");

    this.#input.className = "input";
    this.#input.setAttribute("part", "input");
    this.#input.setAttribute("aria-label", this.#strings.message);
    this.#input.rows = 1;
    this.#input.placeholder = this.#strings.inputPlaceholder;
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.#input.addEventListener("input", () => this.#onInput());

    // Icon-only, with both glyphs mounted at once and CSS showing the one the
    // state calls for — swapping a single glyph would leave a host that slotted
    // its own Send mark holding a stop icon mid-run.
    this.#send.className = "send";
    this.#send.type = "button";
    this.#send.setAttribute("part", "send");
    this.#send.append(
      glyphSlot("icon-send", "send-send", ICON_SEND),
      glyphSlot("icon-stop", "send-stop", ICON_STOP),
    );
    this.#send.title = this.#strings.send;
    this.#send.setAttribute("aria-label", this.#strings.send);
    this.#send.dataset["state"] = "idle";
    this.#send.addEventListener("click", () => {
      // One button, two states: Send while idle, Stop while a run is in
      // flight (no layout change).
      if (this.#running) {
        this.#cancelRun();
        return;
      }
      void this.#submit();
    });

    this.#composerHint.className = "skill-hint";
    this.#composerHint.setAttribute("part", "skill-hint");
    this.#composerHint.hidden = true;

    // File-upload affordance: a paperclip button (hidden until
    // `data-attachments-url` is wired) opening a hidden multi-file input.
    // Drag-and-drop covers the whole shell (wired by ComposerAttachments).
    this.#attachButton.className = "attach-btn";
    this.#attachButton.type = "button";
    this.#attachButton.setAttribute("part", "attach-button");
    this.#attachButton.append(glyphSlot("icon-attach", "attach-glyph", ICON_ATTACH));
    this.#attachButton.title = this.#strings.attachFiles;
    this.#attachButton.setAttribute("aria-label", this.#strings.attachFiles);
    this.#attachButton.hidden = true;
    this.#attachButton.addEventListener("click", () => this.#fileInput.click());

    this.#fileInput.className = "attach-input";
    this.#fileInput.type = "file";
    this.#fileInput.multiple = true;
    this.#fileInput.hidden = true;
    this.#fileInput.addEventListener("change", () => this.#attachments.onFilesPicked());

    this.#attachSlot.className = "attachment-slot";

    // Mic button mount point (kept empty until ComposerVoice mounts the control).
    this.#voiceSlot.className = "voice-slot";

    // A coarse footer slot below the composer.
    const footer = document.createElement("slot");
    footer.name = "footer";

    tools.append(this.#attachButton, this.#voiceSlot, this.#send);
    composer.append(this.#input, tools);
    inputRow.append(composer, this.#fileInput);
    // Composer surfaces sit just above the input: the skills palette (opens on
    // `/`), the chips, the hint saying what the composer still needs, and the
    // pending-attachments tray.
    this.#messagesWrap.className = "messages-wrap";
    // Sibling of the list inside a shared box, not a child of it: the
    // affordance offering to scroll must not scroll away with the content.
    this.#messagesWrap.append(this.#messages, this.#jumpButton, this.#excerpts.button);

    this.#chat.append(
      header,
      this.#messagesWrap,
      this.#skillsMenu.palette,
      this.#skillsMenu.chips,
      this.#composerHint,
      this.#queuedRow,
      this.#attachSlot,
      inputRow,
      footer,
      this.#drawer.element,
      this.#checkpoints.element,
    );

    // Clicking away dismisses the checkpoints popover. Escape already did, and the
    // drawer has a backdrop that swallows the click — this popover has neither, so
    // it could only be closed by answering it.
    //
    // `pointerdown`, and the header button excluded: pointerdown runs *before* the
    // button's own click, so closing here and toggling there would land back open.
    // Composed path rather than `target`, because the event is retargeted at the
    // shadow boundary and every one of these nodes is inside it.
    this.#chat.addEventListener("pointerdown", (event) => {
      if (!this.#checkpoints.open_) {
        return;
      }
      const path = event.composedPath();
      if (path.includes(this.#checkpoints.element) || path.includes(checkpoints)) {
        return;
      }
      this.#checkpoints.close();
    });

    // What a collapsed widget shrinks to: a round floating button, or the slim
    // edge rail under `placement="sidebar"` — one element, shaped by CSS.
    // A sibling of the panel, so it survives the panel being hidden.
    this.#launcher.className = "launcher";
    this.#launcher.type = "button";
    this.#launcher.setAttribute("part", "launcher");
    this.#launcher.setAttribute("aria-label", this.#strings.expand);
    this.#badge.className = "launcher-badge";
    this.#badge.setAttribute("part", "launcher-badge");
    // The count is announced through the launcher's own label, so the badge is
    // decoration to a screen reader rather than a second, context-free number.
    this.#badge.setAttribute("aria-hidden", "true");
    this.#badge.hidden = true;
    // Only the edge rail shows this. A full-height column carrying one small
    // icon reads as a coloured stripe rather than a way back into a
    // conversation -- it is the widest collapsed state there is and the one
    // that says least about itself. Written here and hidden in CSS everywhere
    // else, because the launcher is one element shaped by placement.
    this.#railLabel.className = "rail-label";
    this.#railLabel.setAttribute("part", "rail-label");
    this.#railLabel.setAttribute("aria-hidden", "true");
    this.#railLabel.textContent = this.getAttribute("title-text") ?? this.#strings.title;
    this.#launcher.append(
      iconElement("launcher", "launcher-icon", ICON_LAUNCHER, readLauncherIconUrl(this)),
      this.#railLabel,
      this.#badge,
    );
    this.#launcher.addEventListener("click", () => this.setCollapsed(false));
    this.#placement.enableLauncherDrag();

    this.#placement.mountResizeGrips(this.#chat);
    adoptStyles(this.#root);
    const probe = this.#placement.probe;
    probe.className = "viewport-probe";
    probe.setAttribute("aria-hidden", "true");
    this.#root.append(probe, this.#announcer.region, this.#chat, this.#launcher);
  }

  /**
   * Reflect the collapsed state and the unread count on the launcher.
   *
   * The count is also the launcher's accessible name: a badge that only exists
   * as a coloured dot says nothing to a screen reader, and "Expand" alone would
   * be a lie once answers are waiting behind it.
   */
  #syncLauncher(): void {
    this.#launcher.setAttribute("aria-expanded", String(!this.collapsed));
    const unread = this.#unread;
    // Past 9 the exact number stops being information and starts being a
    // layout problem — the badge is a circle, not a field.
    this.#badge.textContent = unread > 9 ? "9+" : String(unread);
    this.#badge.hidden = unread === 0 || !isUnreadBadgeEnabled(this);
    const label = this.#badge.hidden
      ? this.#strings.expand
      : fillUiString(this.#strings.expandUnread, { count: unread });
    this.#launcher.setAttribute("aria-label", label);
    this.#launcher.title = label;
  }

  /**
   * Set the unread count, repaint the badge, and tell the host.
   *
   * The count is kept whether or not the badge renders it, so `unread` stays
   * truthful for a host chrome and switching the badge on mid-session doesn't
   * start from a number that was never counted.
   */
  #setUnread(count: number): void {
    this.#unread = count;
    this.#syncLauncher();
    this.dispatchEvent(
      new CustomEvent<UnreadDetail>(UNREAD_EVENT, {
        detail: { unread: count },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Count an answer the user cannot have seen: one that finished while the
   * widget was collapsed. Expanding is what marks them read.
   */
  #noteUnread(): void {
    if (!this.collapsed) {
      return;
    }
    this.#setUnread(this.#unread + 1);
  }

  /**
   * Forward input changes to the skills palette and clear any stale hint.
   *
   * Typing is the answer to every hint that surface carries -- a skill short of
   * a field, a continuation short of its next turn -- so the keystroke that
   * starts answering it is the right moment to take it down.
   */
  #onInput(): void {
    this.#skillsMenu.onInput(this.#input.value);
    this.#composerHint.hidden = true;
    autoGrow(this.#input);
    // Typing puts the composer back in the user's hands: the next ArrowUp
    // starts from the newest turn again rather than continuing a walk through
    // history the user has since edited.
    this.#recallIndex = null;
  }

  #onKeydown(event: KeyboardEvent): void {
    // The skills palette consumes arrows/enter/escape while open.
    if (this.#skillsMenu.onKeydown(event)) {
      event.preventDefault();
      return;
    }
    // Escape-to-cancel — only reachable when the palette is closed (it
    // consumed the key above otherwise), so the two Escapes don't clash.
    if (event.key === "Escape" && this.#running) {
      event.preventDefault();
      this.#cancelRun();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void this.#submit();
      return;
    }
    this.#recallHistory(event);
  }

  /**
   * Walk back through what the user has already sent, on the arrow keys.
   *
   * Only from an empty composer, and only with the palette closed -- which the
   * caller has already established, since the palette consumes arrows while it
   * is open. Both conditions matter: arrows inside text are how you move the
   * caret, and taking them would break editing to add a shortcut.
   *
   * The drafts are the user's own turns in this conversation, newest first,
   * which is what every shell and every coding agent means by this. Arrowing
   * forward past the newest empties the composer again rather than sticking on
   * it, so the way out is the same key that got you in.
   */
  #recallHistory(event: KeyboardEvent): void {
    const back = event.key === "ArrowUp";
    if ((!back && event.key !== "ArrowDown") || this.#skillsMenu.isOpen()) {
      return;
    }
    const drafts = this.#sentDrafts;
    if (drafts.length === 0) {
      return;
    }
    // An empty composer is the only safe entry: anything typed is the user's,
    // and replacing it with a past turn would lose it without asking.
    if (this.#recallIndex === null && (!back || this.#input.value !== "")) {
      return;
    }
    const next = this.#recallIndex === null ? 0 : this.#recallIndex + (back ? 1 : -1);
    if (next >= drafts.length) {
      return;
    }
    event.preventDefault();
    this.#recallIndex = next < 0 ? null : next;
    // Asserted rather than defaulted: `next` was bounded on both sides two
    // lines up, so a fallback here would be a branch no test can reach
    // honestly -- and an unreachable default is worse than an assertion,
    // because it looks like a case somebody thought about.
    this.#input.value = next < 0 ? "" : (drafts[next] as string);
    this.#input.setSelectionRange(this.#input.value.length, this.#input.value.length);
    autoGrow(this.#input);
  }

  /**
   * Stop the in-flight run: decline any confirmation card awaiting a decision
   * (the loop is suspended on it), then cancel the client run — the abort
   * closes the streaming request, which is AG-UI's cancel (the server
   * observes the disconnect).
   */
  #cancelRun(): void {
    // Stopping discards what was waiting. Sending messages into a conversation
    // the user has just stopped is the opposite of what stopping meant, and it
    // would arrive after they had already turned away.
    //
    // Not sending it is not the same as destroying it, though. A queued
    // message left the composer the moment it was queued, so dropping it here
    // would take a paragraph the user typed and leave it nowhere -- not on
    // screen, not in the composer, not recallable. It goes to the front of the
    // recall history instead, so ArrowUp gets it back. In queue order, which
    // puts the one typed last first.
    //
    // This path is also reached from `disconnectedCallback`, where a DOM move
    // and a framework re-render both look like a farewell and neither is one.
    for (const text of this.#queued) {
      if (this.#sentDrafts[0] !== text) {
        this.#sentDrafts.unshift(text);
      }
    }
    this.#queued.length = 0;
    this.#renderQueued();
    this.#decision.abort();
    this.#client?.cancel();
    // A checkpoint continuation is as much the run in flight -- the composer
    // offers Stop for it -- but it runs on a client the element does not hold.
    this.#history.stopContinuation();
  }

  /**
   * Swap the composer button between Send (idle) and Stop (running).
   *
   * The glyph is swapped by CSS from `data-state` — both are mounted — so this
   * only has to move the accessible name, which is the button's whole label now
   * that it carries no text.
   */
  #setRunning(running: boolean): void {
    const settled = this.#running && !running;
    this.#running = running;
    const label = running ? this.#strings.stop : this.#strings.send;
    this.#send.title = label;
    this.#send.setAttribute("aria-label", label);
    this.#send.dataset["state"] = running ? "running" : "idle";
    if (settled) {
      this.#flushQueued();
    }
  }

  /**
   * Send the next message that was typed while the run was going.
   *
   * One at a time, through the same path as anything else: each queued turn
   * starts a run of its own, and the next is sent when *that* one settles. Any
   * other shape would be a second sender racing the guard above.
   */
  #flushQueued(): void {
    const next = this.#queued.shift();
    this.#renderQueued();
    if (next !== undefined) {
      void this.sendMessage(next);
    }
  }

  /**
   * Draw what is waiting, as chips that can be taken back.
   *
   * Visible and removable, because a message the user typed and cannot see is
   * a message they will type again -- and one they changed their mind about
   * has to be retractable before it is sent on their behalf.
   */
  #renderQueued(): void {
    this.#queuedRow.replaceChildren();
    this.#queuedRow.hidden = this.#queued.length === 0;
    for (const [index, text] of this.#queued.entries()) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "queued-chip";
      chip.setAttribute("part", "queued-chip");
      chip.textContent = text;
      chip.title = fillUiString(this.#strings.removeQueued, { text });
      chip.setAttribute("aria-label", chip.title);
      chip.addEventListener("click", () => {
        this.#queued.splice(index, 1);
        this.#renderQueued();
      });
      this.#queuedRow.appendChild(chip);
    }
  }

  async #submit(): Promise<void> {
    // Ignore a submit while a run is in flight — the single choke point for
    // both Enter and the Send button. The button already turns into Stop, but
    // Enter has no such guard; without this it would start a second concurrent
    // SSE run that orphans the first (unabortable) and lets the second run's
    // settle sweep corrupt the first's still-pending tool cards.
    const content = this.#input.value.trim();
    const attachments = this.#attachments.tray?.readyRefs() ?? [];
    // Allow an attachments-only message (no typed text), but nothing empty.
    if (content === "" && attachments.length === 0) {
      return;
    }
    // A second run cannot start while one is in flight: it would orphan the
    // first, which is unabortable, and the second's settle sweep would corrupt
    // the first's still-pending tool cards. That is why this was a dead key --
    // Enter during a run did nothing at all, silently.
    //
    // Queueing keeps the guard and gives the key something to do. Text only:
    // an attachment is settled state the tray is holding and the composer has
    // no second copy of, so parking it here would mean deciding what happens
    // when the user then removes the chip.
    if (this.#running) {
      if (content !== "") {
        this.#queued.push(content);
        this.#renderQueued();
        this.#input.value = "";
        autoGrow(this.#input);
      }
      return;
    }
    // Recorded before the box is cleared, newest first, so the arrow keys walk
    // back through it. A repeat of the last one is not a second entry: the
    // point is to reach what was said, not how often.
    if (content !== "" && this.#sentDrafts[0] !== content) {
      this.#sentDrafts.unshift(content);
    }
    this.#recallIndex = null;
    this.#input.value = "";
    autoGrow(this.#input);
    // A file still uploading does not ride along — `readyRefs()` returns only
    // settled ones, and `clearReady()` deliberately keeps the rest for a
    // follow-up. Nothing said so, which is the whole defect: attachments are
    // frequently the entire point of the message, and the user had no way to
    // tell theirs had been left behind. Say it before dropping the chips,
    // while `hasPending()` still describes this send.
    if (this.#attachments.tray?.hasPending() === true) {
      this.#transcript.appendNotice(
        "\u{1F4CE}",
        fillUiString(this.#strings.attachmentsStillUploading, {
          n: this.#attachments.tray.pendingCount(),
        }),
        "attachment-pending",
      );
    }
    // The refs ride the message from here; drop the settled chips, keep any
    // still uploading for a follow-up message.
    this.#attachments.tray?.clearReady();
    await this.sendMessage(content, attachments);
  }

  /**
   * Send a message as if the user had typed it — renders the user bubble,
   * dispatches {@link SUBMIT_EVENT}, and starts the run.
   *
   * The programmatic half of the composer, for a host driving its own input.
   * Everything the built-in Send does happens here; Send reads the composer,
   * clears it, and calls this.
   *
   * `attachments` are durable {@link AttachmentRef}s — what {@link attachFile}
   * resolves to and what {@link ATTACHMENT_EVENT} reports.
   *
   * No-ops on an empty message, and while a run is in flight, since a second
   * concurrent run would orphan the first. Unlike the built-in Send it does not
   * consult the tray: what you pass is what is sent.
   */
  async sendMessage(content: string, attachments: readonly AttachmentRef[] = []): Promise<void> {
    if (this.#running || (content === "" && attachments.length === 0)) {
      return;
    }
    // Only a send travels. Every other way out of the empty state -- a restored
    // transcript, a thread picked from the drawer, a resumed checkpoint -- is a
    // change of context rather than a continuation of what the user was doing,
    // and snaps. Armed before the bubble lands so both writes reach the same
    // style recalculation, which is what makes the change a transition rather
    // than a jump.
    if (this.#transcript.isEmpty()) {
      this.setAttribute("data-composer-settling", "");
    }
    const bubble = this.appendMessage(MESSAGE_ROLE.USER, content);
    if (attachments.length > 0) {
      bubble.appendChild(renderAttachmentChips(attachments));
    }
    this.dispatchEvent(
      new CustomEvent<SubmitDetail>(SUBMIT_EVENT, {
        detail: { content, attachments },
        bubbles: true,
        composed: true,
      }),
    );
    await this.#client_send(content, attachments);
  }

  /**
   * Queue a file for upload into the attachment tray, exactly as the file
   * picker and drag-and-drop do — validation, progress chip, and all.
   *
   * Returns `false` when uploads are not configured (no `data-attachments-url`
   * and no {@link uploadHandler}) — the only signal a host gets, since the tray
   * does not exist to report anything then.
   *
   * Uploading is asynchronous: watch {@link ATTACHMENT_EVENT} for the resulting
   * {@link AttachmentRef} and pass it to {@link sendMessage} once `pending`
   * reaches zero.
   */
  attachFile(file: File): boolean {
    return this.#attachments.attach(file);
  }

  /**
   * Hand the message to the client, or say why it is going nowhere.
   *
   * With no `endpoint` there is nothing to send to, and this used to return
   * here in silence. That is the worst shape the failure can take, because the
   * two halves of a send that *did* work have already happened by now: the
   * user's bubble is on screen and {@link SUBMIT_EVENT} has been dispatched. So
   * the message looks sent, the composer is empty, the Send button never turns
   * into Stop, and no request is ever made -- an unanswered question rather
   * than a broken widget. Nothing reached the console either, so the developer
   * had no thread to pull and the user had no reason to think anything was
   * wrong with the page.
   *
   * Both audiences are told, because they need different things. The console
   * carries the developer's version -- the attribute is missing, here is what
   * to set -- since a missing attribute is a page's mistake and not the
   * reader's. The transcript carries the reader's, because they are looking at
   * their own message waiting for a reply that cannot come, and the honest
   * alternative to one muted line is an indefinite wait.
   *
   * Said on every attempt rather than once. Each send is a separate thing the
   * user asked for and did not get, and a once-only report is silence for every
   * attempt after the first -- which is the defect again, just later.
   */
  async #client_send(content: string, attachments: readonly AttachmentRef[]): Promise<void> {
    if (this.endpoint === "") {
      console.error(
        "<ag-ui-chat>: no endpoint is set, so this message was not sent and no " +
          "request was made. Point the element at your AG-UI mount with the " +
          'endpoint attribute (endpoint="/agent/"), or assign chat.endpoint ' +
          "before sending.",
      );
      this.#transcript.appendNotice("⚠", this.#strings.notConnected, "not-connected");
      return;
    }
    await this.#ensureClient().send(content, attachments);
  }

  #ensureClient(): AgUiClient {
    if (this.#client === null) {
      this.#client = this.#buildClient({
        endpoint: this.endpoint,
        initialMessages: this.#history.restored,
        persist: true,
      });
    }
    return this.#client;
  }

  /**
   * Build a client for the conversation on screen: the one construction shared
   * by the conversation's own client and every checkpoint continuation.
   *
   * One rather than two, because two drifted. Shared state and the tool-round
   * bound both arrived after continuations did, and both were wired into the
   * conversation's client alone -- so a resumed run sent an empty state, never
   * told the host it changed one, and stopped at the built-in bound on a page
   * that had raised it. What genuinely differs is the seed.
   */
  #buildClient(seed: ClientSeed): AgUiClient {
    // Fixed when the client is built rather than read at each save. A run
    // outlives a reset -- a stopped run makes its last save once its request
    // closes -- and read live, that save landed after New chat had moved the
    // active thread on, filing the conversation being left under the new one.
    const threadId = this.#history.threadId;
    const agent = this.agentFactory({
      endpoint: seed.endpoint,
      headers: this.#requestHeaders(),
      // Live getter: the client is built once and cached, but a rotated
      // token must still reach every request — the factory's fetch wrapper
      // re-reads this on each call.
      getHeaders: () => this.#requestHeaders(),
      trustedOrigins: this.trustedOrigins,
      ...this.#credentialsOption(),
      threadId,
      initialMessages: seed.initialMessages,
      initialState: this.#sharedState,
    });
    return new AgUiClient({
      agent,
      handlers: this.#runHandlers.forClient(),
      getTools: () => this.#tools.advertise(),
      getContext: () => this.#dispatch.buildContext(),
      executeTool: (call) => this.#dispatch.execute(call),
      resolveInterrupts: (interrupts) => this.#dispatch.resolveInterrupts(interrupts),
      ...(seed.persist
        ? {
            onPersist: (messages: readonly Message[]) =>
              this.conversationStore.saveMessages(threadId, messages),
          }
        : {}),
      onStateChanged: (state) => this.#onSharedStateChanged(state),
      connectionLostMessage: this.#strings.connectionLost,
      maxToolRounds: readMaxToolRounds(this),
    });
  }

  /** Mirror the agent's applied state and tell the host it moved. */
  #onSharedStateChanged(state: Readonly<Record<string, unknown>>): void {
    this.#sharedState = { ...state };
    this.dispatchEvent(
      new CustomEvent<StateDetail>(STATE_EVENT, {
        detail: { state: this.#sharedState },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Say that the agent rearranged the user's window, and offer the way back.
   *
   * Only on the agent's path. A host calling {@link moveTo} is arranging its
   * own page and does not need telling what it just did; an agent doing it
   * mid-conversation is the case where a panel appears to move on its own.
   */
  #announceSurfaceChange(text: string, undo: (() => void) | null): void {
    this.#transcript.appendNotice(
      "⤢",
      text,
      "surface",
      undo === null ? undefined : { label: this.#strings.undo, onActivate: undo },
    );
  }

  /**
   * Turn on chart rendering, by whichever route this consumer wants.
   *
   * Both routes converge on one renderer deliberately. Built apart they become
   * two chart implementations with two sets of bugs, and the choice between them
   * is about *where the data lives* rather than how a bar should look:
   *
   * - `"tool"` registers the built-in `render_chart`. The agent decides a chart
   *   helps and calls it, so the numbers are in its context and it can discuss
   *   them afterwards. Costs one model round, and works over any transport.
   * - `"activity"` draws a server-pushed `ACTIVITY_SNAPSHOT` of type `chart`.
   *   No round trip, and the data never enters the model's context at all —
   *   which is what makes it the one for a large or sensitive dataset. Only this
   *   route can update a chart in place as the server computes.
   *
   * Off unless asked for, both of them: a component that renders whatever
   * arrives is not something to switch on for everybody.
   */
  enableCharts(routes: readonly ("tool" | "activity")[] = ["tool", "activity"]): void {
    const first = !this.#activities.has(CHART_ACTIVITY_TYPE) && !this.#tools.has(CHART_TOOL_NAME);
    if (routes.includes("activity")) {
      // The chart is a registration like any host's, not a privileged branch.
      // If the built-in cannot be expressed through the seam, the seam is not
      // one -- so this is the test as much as the feature.
      this.registerActivityRenderer({
        type: CHART_ACTIVITY_TYPE,
        render: (content) => {
          const spec = chartSpecFrom(content);
          return spec === null ? null : renderChart(spec);
        },
        removedNotice: this.#strings.chartUndrawable,
      });
    }
    if (routes.includes("tool")) {
      this.registerTool(createChartTool());
    }
    // Called after the element is connected, the history has already replayed
    // and every chart in it was skipped -- charts were off at the time. That is
    // the ordinary way to call this (you have to query the element to call
    // anything on it), so redrawing rather than documenting an ordering rule is
    // the only answer that does not make the obvious usage wrong.
    if (first && this.isConnected) {
      this.reload();
    }
  }

  /**
   * Teach this element to draw one kind of AG-UI activity.
   *
   * `activity_type` is one of exactly two fields the protocol leaves an open
   * string, and it is the **content** one: an activity is materialised into a
   * message, persisted with the thread, and replayed on every restore. Its
   * sibling `CUSTOM` carries an imperative and is dispatched to the page
   * instead ({@link CUSTOM_AGENT_EVENT}).
   *
   * That asymmetry decides which carrier a server should use. Content has a
   * place in the conversation and should come back; an imperative has no place
   * and no meaning once acted on.
   *
   * ```js
   * chat.registerActivityRenderer({
   *   type: "build_status",
   *   render: (content) => {
   *     const el = document.createElement("div");
   *     el.textContent = `Build ${content.status}`;
   *     return el;
   *   },
   * });
   * ```
   *
   * Registering a type twice replaces the earlier renderer, so a host can
   * override a built-in -- `chart` and `compaction` are registrations like any
   * other, not privileged branches.
   *
   * ⚠ `render` runs again on every thread load. See {@link ActivityRenderer}
   * for what that requires of it.
   */
  registerActivityRenderer(registration: ActivityRegistration): void {
    this.#activities.register(registration);
  }

  /**
   * Activity types that arrived with nobody registered to draw them.
   *
   * Deliberately the only trace an unhandled activity leaves. Ignoring an
   * unknown name is the protocol's own answer and the whole point of an open
   * field, so warning would fire on every forward-compatible server -- but
   * "nothing happened and nothing was said" is impossible to debug, so the set
   * is readable. Accumulates for the element's lifetime, across threads.
   */
  get unhandledActivityTypes(): readonly string[] {
    return this.#activities.unhandledTypes();
  }
}

/** The `removed` count from a compaction activity payload, or `null` if absent. */
function compactionRemoved(content: unknown): number | null {
  const removed = (content as { removed?: unknown } | null | undefined)?.removed;
  return typeof removed === "number" ? removed : null;
}
