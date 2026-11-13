import type { Context, Message, Tool } from "@ag-ui/core";
import {
  ATTACHMENT_EVENT,
  BAR_HEIGHT_EVENT,
  CHART_ACTIVITY_TYPE,
  COMPACTION_ACTIVITY_TYPE,
  CUSTOM_AGENT_EVENT,
  DOCK_WIDTH_EVENT,
  ICON_MOON,
  ICON_SUN,
  MESSAGE_ROLE,
  PAGE_MAP_CONTEXT,
  STATE_EVENT,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  THREAD_EVENT,
  THREAD_TITLE_EVENT,
  TOGGLE_EVENT,
  TOOL_DISPLAY,
  TOOL_GROUP_DISPLAY,
  type ToolGroupDisplayMode,
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
import { buildComposer } from "../ui/composer/build_composer.js";
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
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type Place } from "../ui/place/place.js";
import { PlaceChip } from "../ui/place/place_chip.js";
import { placeFromRoute } from "../ui/place/place_from_route.js";
import { PanelPlacement } from "../ui/placement/panel_placement.js";
import { type Surface, surfaceFor } from "../ui/placement/surface_for.js";
import { RunAnnouncer } from "../ui/progress/run_announcer.js";
import { renderRunNotice } from "../ui/progress/run_notice.js";
import { SubAgentProgress } from "../ui/progress/subagent_progress.js";
// biome-ignore lint/style/useImportType: the emitted declaration file copies this form
import { type ToolDisplayMode, type ToolPayloadFormatter } from "../ui/progress/tool_call_card.js";
import { adoptStyles } from "../ui/shell/adopt_styles.js";
import { buildHeader } from "../ui/shell/build_header.js";
import { buildLauncher } from "../ui/shell/build_launcher.js";
import { iconElement } from "../ui/shell/icon_element.js";
import { isUnreadBadgeEnabled } from "../ui/shell/is_unread_badge_enabled.js";
import { readLauncherIconUrl } from "../ui/shell/read_launcher_icon_url.js";
import { AnswerActions } from "../ui/transcript/answer_actions.js";
import { AnswerStream } from "../ui/transcript/answer_stream.js";
import { renderAttachmentChips } from "../ui/transcript/attachment_chips.js";
import { buildTranscript } from "../ui/transcript/build_transcript.js";
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
import { ChatRegistration } from "./chat_registry.js";
import type { ClientSeed } from "./client_seed.js";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  type ThreadMeta,
  threadTitleFrom,
  writeStoredItem,
} from "./conversation_store.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import type { BarHeightDetail } from "./events/bar_height_detail.js";
import type { DockWidthDetail } from "./events/dock_width_detail.js";
import type { StateDetail } from "./events/state_detail.js";
import type { SubmitDetail } from "./events/submit_detail.js";
import type { ThreadDetail } from "./events/thread_detail.js";
import type { ThreadTitleDetail } from "./events/thread_title_detail.js";
import type { ToggleDetail } from "./events/toggle_detail.js";
import type { UnreadDetail } from "./events/unread_detail.js";
import type { MessageRole } from "./message_role.js";
import { readFlag } from "./read_flag.js";
import { readJsonAttribute } from "./read_json_attribute.js";
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
 * `theme` / `collapsed` / `data-tool-group-display`.
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

const SERVER_PLACEHOLDER_TITLE = "New conversation";

/** What a server derives as a thread's title: the first user text, 60 code points at most. */
function serverTitleFrom(messages: readonly Message[]): string {
  for (const message of messages) {
    const text =
      typeof message.content === "string" ? message.content.split(/\s+/).join(" ").trim() : "";
    if (message.role === "user" && text !== "") {
      const points = Array.from(text);
      return points.length <= 60 ? text : `${points.slice(0, 59).join("").trimEnd()}\u2026`;
    }
  }
  return "";
}

/** Whether `value` is one of the three modes `fetch` understands. */
function isCredentialsMode(value: string): value is RequestCredentials {
  return CREDENTIALS_MODES.includes(value);
}

/** The `title-text` value that makes the header follow the thread on screen. */
const TITLE_TEXT_AUTO = "auto";

/** The anchored conversation list's widest, and its distance from its button and the window. */
const THREADS_POPOVER_WIDTH = 320;
const THREADS_POPOVER_GAP = 8;

/** Per-tab persistence key for the collapsed state (survives MPA reloads). */
const COLLAPSED_KEY = "ag-ui-chat:collapsed";

/**
 * Persistence key for the built-in theme toggle. It holds the user's scheme
 * word only: the theme name belongs to the host's markup, and one saved value
 * is restored on every page that shares the key.
 */
const THEME_KEY = "ag-ui-chat:theme";

/** The scheme words of the `theme` attribute; every other word names a theme. */
const SCHEME_WORDS: readonly string[] = ["light", "dark", "auto"];

/**
 * The last scheme word in a saved value, or `undefined` when it names none. A
 * value saved before only the scheme was kept (`"soft dark"`) still gives up
 * just its scheme.
 */
function savedScheme(saved: string): string | undefined {
  return saved
    .split(/\s+/)
    .filter((word) => SCHEME_WORDS.includes(word))
    .at(-1);
}

/** `theme`'s words with its scheme word, if any, replaced by `scheme`. */
function withScheme(theme: string, scheme: string): string {
  const names = theme.split(/\s+/).filter((word) => word !== "" && !SCHEME_WORDS.includes(word));
  return [...names, scheme].join(" ");
}

/**
 * The element a selector names, in the given root first and then the
 * document; null for no match, and for a selector that does not parse, which
 * is the same mistake from the host's side.
 */
function findAnchor(root: Node, selector: string): Element | null {
  try {
    const scope = root instanceof ShadowRoot ? root : document;
    return scope.querySelector(selector) ?? document.querySelector(selector);
  } catch {
    return null;
  }
}

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
   * A renderer that throws or rejects hands the question to the built-in card,
   * as a failing {@link approvalRenderer} does, unless Stop already fired.
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
   * While {@link getPlace} is unset, the route matching the current path also
   * stands in as the place: the chip names it and the place entry carries it.
   * No summary of the map itself is sent.
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
   * Where in the app the user is. The chip in the composer's tool row draws it,
   * and every tool round sends it as one `place` context entry from the same
   * read, after whatever {@link getContext} returns, so a host that replaces
   * that keeps it. Read before every round, on connect, on expand, when the
   * composer gains focus, on `popstate` and `hashchange`, when the conversation
   * changes, and on {@link refreshPlace}.
   *
   * When unset, the {@link routeMap} route matching `location.pathname` stands
   * in: its title (else its id) as the label, its group as the detail, the
   * path as the href. With neither, no chip is drawn and nothing is sent; a
   * host with a route map that wants no chip sets `() => null`.
   *
   * The chip's eye toggle withholds the place, and with it the page: a round
   * whose place is withheld sends no `page_map` entry, whatever
   * {@link getContext} returns, and offers no `read_page`. It holds for the
   * same place, lapses when a different place is read, and is not persisted.
   */
  getPlace: (() => Place | null) | null = null;

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
    // Late-bound: the history is built in the constructor, after this field.
    threadId: () => this.#history.threadId,
    follow: () => this.#transcript.follow(),
  });

  readonly #root: ShadowRoot;
  /** The built-in stylesheet once rendered, kept so `extraStyles` can re-adopt beside it. */
  #builtInSheet: CSSStyleSheet | null = null;
  /** The host's own sheets, adopted after the built-in one. */
  #extraStyles: readonly CSSStyleSheet[] = [];
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
  /** The launcher's unread badge; hidden at zero, while expanded, and when the host opts out. */
  readonly #badge: HTMLSpanElement;
  /** The rail's vertical caption. Rendered only by the sidebar's edge rail and the bottom bar. */
  readonly #railLabel: HTMLSpanElement = document.createElement("span");
  /**
   * The bottom bar under collapse-to="bar": the launcher drawn as a strip, and
   * the history button beside it. Outside the bar it draws no box of its own.
   */
  readonly #dockBar: HTMLDivElement = document.createElement("div");
  /** The bottom bar's history button, which opens the drawer as a popover. */
  readonly #barHistory: HTMLButtonElement = document.createElement("button");
  /**
   * The conversation list's home while collapsed under collapse-to="none": outside
   * the hidden panel, placed beside the host's button. No box of its own.
   */
  readonly #threadsPopover: HTMLDivElement = document.createElement("div");
  /** The button the popover was opened from, whose presses are not outside it. */
  #threadsAnchor: Element | null = null;
  /** The bar height last reported, so the event fires on a change only. */
  #barHeight = 0;
  /** The docked width and edge last reported, so the event fires on a change only. */
  #dockWidth = 0;
  #dockSide: DockWidthDetail["side"] = "right";
  /** The element the panel rises from under collapse-to="none", set as a property. */
  #anchor: Element | null = null;
  /** Whether a missing anchor has been reported; once per anchor given. */
  #anchorWarned = false;
  // Unseen answers per thread: finished while collapsed or off screen.
  #unreadByThread = new Map<string, number>();
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
   * What the walk last put in the composer, read back from it. A walk is live
   * only while the composer still holds exactly this, so a write from anywhere
   * else ends it. Stale while no walk is in progress, which is harmless: the
   * comparison can only ever end a walk, never start one.
   */
  #recalled = "";

  /**
   * Re-clamp the dragged launcher when the window changes size. Bound once as
   * a field so `removeEventListener` on disconnect gets the same reference.
   */
  readonly #onViewportResize = (): void => {
    if (this.#readyToPlace()) {
      this.#placement.restoreLauncherPosition();
    }
  };

  /**
   * The same for a change only the panel's own layout shows: a host's size, a
   * viewport inset token, a line typed in the composer. Not a moment to hand a
   * position back, so a panel under data-launcher-drag="false" stays put.
   */
  readonly #onLayoutChange = (): void => {
    if (this.#readyToPlace()) {
      this.#placement.settleLauncherPosition();
    }
  };

  /** Bring the viewport's readings up to date, and say whether placing may follow. */
  #readyToPlace(): boolean {
    this.#placement.publishVisualViewport();
    this.#syncDock();
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
    //
    // Nor while this element has no box, which is what hiding it reports to the
    // transcript's observer: placing measures a rect of nothing and writes an inset
    // from it. Showing it reports again, so nothing waits on this.
    return !this.#placement.dragging() && this.#hasBox();
  }

  /**
   * Whether this element generates a box at all. Hidden on itself or on any ancestor
   * it does not; a host collapsed to its launcher does, whatever its size, and that
   * launcher still has to be placed, which is why this is not a test of the size.
   */
  #hasBox(): boolean {
    return this.getClientRects().length > 0;
  }

  /** Restore for a moment that is not a viewport's, which showing this reports anyway. */
  #restoreIfBoxed(): void {
    if (this.#hasBox()) {
      this.#placement.restoreLauncherPosition();
    }
  }

  /** Mic button mount point (input row); the control mounts on connect when enabled. */
  readonly #voiceSlot: HTMLSpanElement;
  /** The composer's mic, mounted on connect when transcription is available. */
  readonly #voice: ComposerVoice;
  /** Whether the element is currently in the DOM; gates the connect-time warning. */
  #connected = false;
  /** A {@link newChat} asked for before the element connected, to start at connect. */
  #newChatOnConnect = false;
  /**
   * Aborted when the element leaves the document, and replaced when it comes
   * back.
   *
   * Every listener connecting adds to an element that outlives the connection
   * -- the composer, Send, the launcher, the shell -- is added under this
   * signal. Connecting runs again on every insertion, so a listener added
   * without it is a second listener the next time: one click on Stop stopped
   * the run three times, and one press of the built-in theme toggle flipped it
   * twice, back to where it started.
   */
  #connection = new AbortController();
  /**
   * Whether the element has connected before, which makes this connection a
   * re-insertion: there is a transcript on screen from last time, and the
   * history replay would draw the conversation a second time beneath it.
   */
  #connectedBefore = false;
  /**
   * The `user-key` whose state the element holds -- the transcript, the recall
   * history, the Always allow waivers and the shared state -- or `null` before
   * the first connect, when it holds nobody's.
   *
   * Not the same thing as the attribute. The attribute names the principal the
   * host says is here now, and it can change while the element is out of the
   * document, where nothing acts on it; this is who the state still belongs
   * to. Connecting compares the two, which is how a key changed while detached
   * still gets the handover a live change gets.
   */
  #principalKey: string | null = null;
  /**
   * The current principal's tenure: replaced on every handover from one
   * principal to another, and captured by each client as it is built, so that
   * a client can tell whether the principal it was built for is still the one
   * this element serves.
   *
   * A client outlives the handover that stops it. A stopped run saves what it
   * had once its request closes, a tool handler cannot be aborted and its
   * result is kept, and an event already read off the wire is still applied --
   * all of it after the store was purged and scoped to whoever arrived, so
   * each one wrote the previous principal's words into the next one's storage
   * or state. Writing into the previous principal's store instead would only
   * re-create what the purge just removed, so such a client writes nothing.
   *
   * An identity rather than the key itself, for two reasons. The key's first
   * arrival is an adoption, not a handover, and a run in flight across it is
   * the same person's and keeps saving. And a key that leaves and comes back
   * is a second tenure: the first one's stopped run must not re-create a
   * conversation the handover purged.
   */
  #tenure: object = {};
  /**
   * The conversation on screen: replaced every time the transcript is cleared
   * for another one -- New chat, a drawer switch, deleting the active thread,
   * `reload()`, re-insertion and a handover all pass through
   * {@link #resetConversation} -- and captured by each frontend tool call as it
   * is dispatched, so the call can tell whether the conversation it was drawn
   * in is still the one showing.
   *
   * A call outlives the reset that stops its run. A handler cannot be aborted,
   * and a card open at the time is declined, so the call resumes once the new
   * conversation is showing; drawing the run's pending indicator then put it
   * in a conversation with no run to take it down.
   *
   * Not {@link #tenure}, which only a handover replaces. A reset is not a
   * change of principal: the call still belongs to someone this element
   * serves, so it still settles its card, clears its checkpoint and returns
   * its result, and only the drawing is skipped. The tenure checks end the
   * call before any of that.
   */
  #conversation: object = {};
  /**
   * The remote store `data-threads-url` wrapped around the conversation store,
   * and the store inside it, so connecting again can wrap that store rather
   * than the wrapper.
   */
  #threadStore: { remote: RemoteConversationStore; inner: ClientConversationStore } | null = null;

  #client: AgUiClient | null = null;
  // Seed for the next client. Once one exists it owns the live value (the
  // agent applies STATE_SNAPSHOT / STATE_DELTA into it), so this is only the
  // starting point — `sharedState` reads through to the client when present,
  // and to a running checkpoint continuation before that. Every client mirrors
  // its changes here, which is what the client built after a continuation is
  // seeded from.
  #sharedState: Record<string, unknown> = {};
  // Whether an interaction is in flight (first onRunStart → onSettled). Drives
  // the Send⇄Stop button: `agent.isRunning` is false between frontend-tool
  // rounds, but the user must still be able to stop there.
  #running = false;
  /**
   * The send {@link sendMessage} has taken, or the retry {@link retryLastTurn}
   * has, whose run has not started yet; null otherwise.
   *
   * `running` turns on when the client starts the run, a microtask after it is
   * asked for one, and a send does two things before it asks: it draws the
   * turn, and it dispatches the submit event, whose listeners run in the middle
   * of the send. A send from one of them, or a second call in the same task,
   * passed every guard and started a second run on the same client -- two
   * requests, and the listener's turn drawn between the user's turn and its
   * answer. It is the gap a picked checkpoint closes by counting from the pick,
   * closed the same way for a send. A retry asks for its run the same way, so
   * it takes the same hold, and so does every restore, from before it asks the
   * store for the conversation, through the history host's `holdRun`: until
   * the store answers, the client can only be built from nothing.
   *
   * Let go of once the run starts, because `running` holds from then until the
   * run settles, and a send held past that would refuse a host's follow-up from
   * the run-finished event, which fires as the run settles. Let go of by the
   * send's, the retry's or the restore's end when its run never starts.
   *
   * An object rather than a flag, so a send or a retry ending releases only
   * what it took. By the time either ends, the turn queued behind it has
   * usually taken the field for itself, and a Stop lets go of it for the next
   * send to take; the earlier one ending must release neither. It is also how
   * {@link sendMessage} tells the one hold it waits on from all the others it
   * refuses behind: see {@link #restoreHold}.
   */
  #sending: object | null = null;
  /**
   * The hold the latest restore with no run to resume took, and what settles
   * once that restore has ended or been stopped; `null` when the latest
   * restore will resume a run. Only meaningful while `#sending` is that hold:
   * then a host's {@link sendMessage} waits for it rather than refusing.
   */
  #restoreHold: { readonly hold: object; readonly restored: Promise<void> } | null = null;
  /**
   * The thread the latest {@link THREAD_EVENT} reported, which the next one
   * names as the thread it replaced; `null` before the first.
   */
  #shownThread: string | null = null;
  /** The thread on screen's messages as last saved or restored, which name it. */
  #titleMessages: readonly Message[] = [];
  /** Titles renamed here or listed that its messages do not derive, by thread. */
  readonly #givenTitles = new Map<string, string>();
  /** The thread and title {@link threadTitle} last reported. */
  #titled = { threadId: "", title: "" };
  /** The decision a run is suspended on, which a Stop abandons. */
  readonly #decision = new PendingDecision();
  /** The place chip, kept across connections like the composer it sits in. */
  readonly #place = new PlaceChip();
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
    pageWithheld: () => this.#place.withheld,
    resolvePageTarget: (target) => this.resolvePageTarget(target),
    getTools: () => this.getTools(),
    askUser: () => this.askUser,
    askUserRenderer: () => this.askUserRenderer,
    decision: this.#decision,
    setAsking: (callId, asking) => this.#transcript.setAsking(callId, asking),
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
  // This chat's place among the connected ones, which a free highlight ring reads.
  readonly #chatRegistration = new ChatRegistration(this);
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
      toolDisplay: () => this.toolDisplay,
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
      navigate: () => this.navigate,
      approveWithEdits: () => this.approveWithEdits,
      approvalRenderer: () => this.approvalRenderer,
      getContext: () => this.#roundContext(),
      conversationStore: () => this.conversationStore,
      threadId: () => this.#history.threadId,
      // Read live and compared, the way each client compares the one it was
      // built with: see #tenure.
      tenure: () => this.#tenure,
      // The same, for the conversation on screen: see #conversation.
      conversation: () => this.#conversation,
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
      noteUnread: (threadId) => this.#noteUnread(threadId),
    });
    this.#placement = new PanelPlacement({
      element: this,
      launcher: this.#launcher,
      root: this.#root,
      connected: () => this.#connected,
      collapsed: () => this.collapsed,
      collapsible: () => this.#surface().collapseTo !== null,
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
      flag: (name) => readFlag(this, name),
      readJsonAttribute: (name) => readJsonAttribute(this, name),
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
        // switchThread rejects when the store cannot load the thread, and keeps
        // the old one on screen; a pick has nobody to tell, so it ends here.
        this.#history.switchThread(threadId).catch(() => undefined);
      },
      onNew: () => {
        this.newChat();
        void this.#history.refreshDrawer();
      },
      onRename: (threadId, title) => {
        this.#givenTitles.set(threadId, title);
        this.#retitle();
        this.#history.renameThread(threadId, title);
      },
      onDelete: (threadId) => {
        this.#history.deleteThread(threadId);
      },
    });
    this.#checkpoints = new CheckpointMenu((runId, verb) => {
      // Reported rather than dropped: the send fails when the host's store
      // refuses the first save, and `continueRun` has already let go of the
      // continuation by then, so the panel takes another pick.
      void this.#history.continueRun(runId, verb).catch((error: unknown) => {
        console.warn("<ag-ui-chat>: continuing a run failed", error);
      });
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
      // A continuation sends only what the composer holds. The tray is not
      // read, so nothing rides along to be drawn or announced.
      announceTurn: (content) => this.#announceTurn(content, []),
      recordTurn: (content) => this.#recordTurn(content),
      autoGrow: () => autoGrow(this.#input),
      continuationEnded: () => this.#flushQueued(),
      client: () => this.#client,
      ensureClient: () => this.#ensureClient(),
      buildClient: (seed) => this.#buildClient(seed),
      releaseClient: () => {
        this.#client = null;
      },
      // A held send or retry is as much in flight to a pick as a run is: it has
      // asked this element's client for a run that has not started, and a
      // continuation started beside it was a second run in one conversation.
      // So is a restore, which holds through the same field from before the
      // store answers.
      running: () => this.#running || this.#sending !== null,
      // The hold a send takes, taken for every restore, so what refuses a send
      // held short of its run holds one made while the store is still
      // answering: Send parks the turn, a Retry and a pick refuse, and
      // `sendMessage` refuses behind a restore that will resume a run and waits
      // for one that will not -- `restored` is what it waits on, given only for
      // that kind. The same field rather than a flag beside it, because what
      // lets go of a send's hold is right for this one too. The resumed run
      // starting lets go, in `#setRunning`, so there is no gap after the resume
      // is asked for, and a Stop does, in `#cancelRun`. A flag the restore
      // cleared itself would still be set when the resumed run settles and
      // sends the parked turn, so that send would be refused after the turn had
      // left the queue, and lost.
      //
      // Whether the restore was stopped is not read off this hold, because a
      // host's send that waited takes it over; the restore asks its own
      // generation.
      holdRun: (restored) => {
        const hold = {};
        this.#sending = hold;
        this.#restoreHold = restored === null ? null : { hold, restored };
        return {
          release: () => {
            if (this.#sending === hold) {
              this.#sending = null;
              this.#flushQueued();
            }
          },
        };
      },
      cancelRun: () => this.#cancelRun(),
      resetState: () => this.#resetState(),
      setRunning: (running) => this.#setRunning(running),
      threadChanged: (threadId, reason) => this.#dispatchThread(threadId, reason),
      threadsListed: (threads) => {
        this.#takeListedTitle(threads);
        this.#takeListedUnread(threads);
      },
      threadDeleted: (threadId) => this.#forgetUnread([threadId]),
    });
  }

  /** Attributes the element reacts to after it has been connected. */
  static get observedAttributes(): string[] {
    return [
      "title-text",
      "placement",
      "collapse-to",
      "anchor",
      "anchor-side",
      "data-side",
      "data-small-viewport",
      "data-threads-search",
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
    if (name === "data-threads-search") {
      const mode = this.getAttribute("data-threads-search");
      this.#drawer.setSearchMode(mode === "always" || mode === "never" ? mode : "auto");
      return;
    }
    if (name === "anchor") {
      this.#anchorWarned = false;
      this.#syncDock();
      return;
    }
    if (name === "anchor-side" || name === "data-side" || name === "data-small-viewport") {
      this.#syncDock();
      return;
    }
    // collapse-to changes the surface the way placement does -- a docked panel
    // has no launcher to drag, and keeps its own dragged spot apart from the
    // corner's, so the same handover applies -- and is live the same way.
    if (name === "placement" || name === "collapse-to") {
      // A placement owns the axes it fixes, so hand those back before anything
      // else: a size dragged under the previous placement would otherwise sit
      // inline and outrank the new one.
      this.#placement.releaseOwnedAxes();
      // A dragged size belongs to its placement; collapse-to keeps it.
      if (name === "placement") {
        this.#placement.switchPlacement(previous);
      }
      // Position is owned the same way a size is: a placement that places
      // itself takes back a launcher the user had dragged somewhere else.
      this.#placement.releaseLauncherPosition();
      // Switching into a placement with no collapsed state has to release it,
      // not just stop offering it: the control is gone from the header the
      // moment the attribute changes, so a panel collapsed under the previous
      // placement would have no way back.
      if (this.#surface().collapseTo === null && this.collapsed) {
        this.setCollapsed(false);
      }
      this.#stampCollapseTarget();
      if (name === "collapse-to") {
        // The strip's label and the popover's home both depend on the target,
        // and neither is re-derived by the dock sync.
        this.#syncLauncher();
        this.#homeDrawer(this.#surface().collapseTo === "bar" ? this.#dockBar : null);
      }
      this.#syncDock();
      // Placement also moves the panel, so the edges its layout holds still
      // change with it. Deferred a frame so the new rules have applied.
      requestAnimationFrame(() => this.#placement.syncResizeAnchor());
      return;
    }
    if (name === "title-text") {
      this.#paintTitle();
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
      // Acted on here only while connected. Before the first connect there is
      // nothing to move: connectedCallback resolves the namespace from the
      // attribute as it stands by then. Between a disconnect and the next
      // connect there is, and connecting hands it over -- see #principalKey
      // and connectedCallback for why it waits until then. An absent attribute
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
    return this.#liveClient()?.state ?? this.#sharedState;
  }

  set sharedState(state: Readonly<Record<string, unknown>>) {
    this.#sharedState = { ...state };
    // A client already exists for this conversation — push it through so the
    // next run sends it, rather than silently waiting for a new conversation.
    // A continuation in flight is that client while it runs: its next round
    // sends what it holds, and the getter reads it back from there.
    this.#liveClient()?.setState(this.#sharedState);
  }

  /**
   * The client holding the conversation's live shared state: a checkpoint
   * continuation while one runs, otherwise the conversation's own client, and
   * `null` before either exists.
   *
   * The continuation first, because the state it streams is applied to its own
   * agent. Reading the conversation's client alone returned what the state was
   * before the continuation began, for as long as that client lived.
   *
   * It now lives no longer than the continuation's first save, which hands the
   * conversation to the next client built, seeded from the mirror every client
   * writes -- so the next run sends what the continuation left. That release
   * alone makes the getter's fallback give the same answer, and no test can
   * tell the two apart; reading the continuation keeps the getter right
   * without depending on when the other client is let go. The setter has no
   * such fallback, and is held by "reads the shared state it changed while it
   * runs, not the conversation's" in `ag_ui_chat_checkpoints.test.ts`.
   */
  #liveClient(): AgUiClient | null {
    return this.#history.continuation ?? this.#client;
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
   * attribute (`grouped` / `minimal` / `inline` / `compact` / `full`).
   * Defaults to `grouped`, for an absent attribute and for a value the
   * element does not know; `full` is the per-call card default before
   * `grouped` existed.
   *
   * The four card modes are applied by the shadow CSS from the attribute
   * itself, so changing between them restyles every card already in the
   * transcript. Whether calls fold into a step group is decided as each card
   * is built: switching to `grouped` folds only the calls drawn afterwards,
   * and switching away flattens the existing groups, again by CSS.
   */
  get toolDisplay(): ToolDisplayMode {
    const attr = this.getAttribute("data-tool-display");
    if (
      attr === TOOL_DISPLAY.INLINE ||
      attr === TOOL_DISPLAY.MINIMAL ||
      attr === TOOL_DISPLAY.COMPACT ||
      attr === TOOL_DISPLAY.FULL
    ) {
      return attr;
    }
    return TOOL_DISPLAY.GROUPED;
  }

  set toolDisplay(value: ToolDisplayMode) {
    this.setAttribute("data-tool-display", value);
  }

  /**
   * How an opened step group draws its calls, from the
   * `data-tool-group-display` attribute (`full` / `compact` / `minimal` /
   * `inline`). Defaults to `full`, for an absent attribute and for a value the
   * element does not know, which is what a group drew before the attribute.
   *
   * Read only while `toolDisplay` is `grouped`: under a card mode the groups
   * are flattened into that mode's cards. Applied by the shadow CSS from the
   * attribute itself, so changing it restyles groups already on screen.
   */
  get toolGroupDisplay(): ToolGroupDisplayMode {
    const attr = this.getAttribute("data-tool-group-display");
    if (
      attr === TOOL_GROUP_DISPLAY.INLINE ||
      attr === TOOL_GROUP_DISPLAY.MINIMAL ||
      attr === TOOL_GROUP_DISPLAY.COMPACT
    ) {
      return attr;
    }
    return TOOL_GROUP_DISPLAY.FULL;
  }

  set toolGroupDisplay(value: ToolGroupDisplayMode) {
    this.setAttribute("data-tool-group-display", value);
  }

  /**
   * The host's own constructed stylesheets, adopted after the built-in one.
   *
   * The escape hatch for structure that neither the tokens nor the parts
   * reach. Per element, like the built-in sheet: two elements on one page can
   * carry different sheets. Constructed sheets are not subject to a
   * `style-src` policy, so this works under the same strict CSP the
   * built-in sheet does. Setting it re-adopts at once; the array is copied, so
   * mutating the one passed in changes nothing until it is set again.
   *
   * Unstable: reaches shadow class names, which may change in any minor.
   */
  get extraStyles(): readonly CSSStyleSheet[] {
    return this.#extraStyles;
  }

  set extraStyles(sheets: readonly CSSStyleSheet[]) {
    this.#extraStyles = [...sheets];
    if (this.#builtInSheet !== null) {
      this.#root.adoptedStyleSheets = [this.#builtInSheet, ...this.#extraStyles];
    }
  }

  connectedCallback(): void {
    // A fresh signal per connection: disconnecting aborted the last one, and
    // with it every listener the last connection added.
    this.#connection = new AbortController();
    // Coming back is a reload, not a merge, for the reason `reload()` is: the
    // run was cancelled on the way out, and the transcript is rebuilt below
    // from persisted history -- which could only be appended to what is still
    // showing. The composer's recall history is kept, because a move is not a
    // farewell, and the Stop on the way out dropped the queued messages because
    // recall already held them.
    if (this.#connectedBefore) {
      this.#resetConversation();
    }
    this.#connectedBefore = true;
    // Resolve the per-instance storage namespace before any key read/write, so
    // this instance doesn't share collapsed/theme/thread state with another on
    // the same origin.
    this.#storage.claim();
    this.#chatRegistration.join();
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
      this.#restoreIfBoxed();
      this.#placement.syncResizeAnchor();
    });
    // Resolve the string table before rendering any chrome (defaults are the
    // floor; `data-strings` then the `strings` property layer over them).
    this.#strings = mergeUiStrings({ ...this.#readStringOverrides(), ...this.strings });
    // Restore the scheme the built-in toggle persisted last visit onto the
    // markup's theme name (opt-in only, so it never overrides a host that
    // drives `theme` itself).
    if (this.getAttribute("data-theme-toggle") !== null) {
      const saved = this.#storage.readPreference(THEME_KEY);
      const scheme = saved === null ? undefined : savedScheme(saved);
      if (scheme !== undefined) {
        this.setAttribute("theme", withScheme(this.getAttribute("theme") ?? "", scheme));
      }
    }
    this.#render();
    this.#drawer.setStrings(this.#strings);
    this.#checkpoints.setStrings(this.#strings);
    // Gated on the placement, not just on the stored value: the key is
    // namespaced per instance but not per placement, so a tab that collapsed a
    // floating panel and later loaded the same instance as a page would restore
    // a state that placement has no way out of.
    if (this.#surface().collapseTo !== null && this.#startsCollapsed()) {
      this.setAttribute("collapsed", "");
    }
    this.#syncLauncher();
    this.#stampCollapseTarget();
    // The bar's height follows its content (the font, a long title), so it is
    // measured rather than known; the observer reports a change of size, and
    // the strip going from drawn to not drawn is one.
    const dockObserver = new ResizeObserver(() => this.#syncDock());
    dockObserver.observe(this.#dockBar);
    this.#connection.signal.addEventListener("abort", () => dockObserver.disconnect());
    // A host's own size arrives with no event: a token written or a class changed
    // moves nothing here until the next window resize or reopen, and a panel
    // re-placed under a size that has since gone stays held short of its spot. The
    // transcript is watched rather than this element, whose box it follows, because
    // a page publishing a token from an observer of its own, as the README's recipe
    // does, changes this box after that observer has run, and the browser reports
    // the answer to a target no deeper than that one as a loop on the window. One
    // of its own already watches the transcript, so this adds no report of its own.
    const layoutObserver = new ResizeObserver(this.#onLayoutChange);
    layoutObserver.observe(this.#messages);
    this.#connection.signal.addEventListener("abort", () => layoutObserver.disconnect());
    // The viewport insets arrive the same way, and a page's observer writes them after
    // the window's resize event, so that restore reads the bar as it was. The probe
    // carries them, and an observer on it would be a report on the window for the same
    // reason, so it takes them as a transition instead: heard the next frame, whichever
    // element wrote them and however late.
    this.#placement.probe.addEventListener("transitionrun", this.#onLayoutChange, {
      signal: this.#connection.signal,
    });
    // A resize drag is reported when it ends, and the last frame may change nothing
    // the observer sees.
    const endDrag = (): void => void requestAnimationFrame(() => this.#syncDock());
    window.addEventListener("pointerup", endDrag, { signal: this.#connection.signal });
    window.addEventListener("keyup", endDrag, { signal: this.#connection.signal });
    this.#syncDock();
    // Under collapse-to="none" the host draws the collapsed state itself, so
    // it has to learn the state the element mounted in -- restored from
    // storage or the placement's default -- without waiting for a change.
    // Dispatched directly rather than through setCollapsed, which would write
    // storage and report the unread count for a state nobody changed.
    if (this.#surface().collapseTo === "none") {
      this.dispatchEvent(
        new CustomEvent<ToggleDetail>(TOGGLE_EVENT, {
          detail: { collapsed: this.collapsed },
          bubbles: true,
          composed: true,
        }),
      );
    }
    this.#skills.init();
    // A `user-key` that changed while the element was out of the document gets
    // the handover a live change gets, here, because this is the first moment
    // the element can make it. A plain move with the same key skips this and
    // keeps the recall history, as above; a first connect skips it too, since
    // an element that has never connected holds nobody's state -- and treating
    // its first key as an arrival would adopt whatever key-less conversation
    // an earlier visitor left in the tab.
    //
    // Deferred to here rather than made the moment the attribute changes, for
    // three reasons. Out of the document, the arriving half -- replaying the
    // next principal's history, listing their threads -- is requests, and
    // nothing should go out for a node that has left (see #startup). Only where
    // the key ends up counts: one that goes away and comes back while detached
    // hands nothing over, because nobody else saw this panel in between. And
    // the namespace was claimed again just above, so the previous principal's
    // is resolved against the one this element holds now: a namespace another
    // element claimed while this one was out is never purged from under it.
    //
    // Before the store is scoped, which is the arriving half connecting does
    // anyway: an adoption has to move the conversation before the store is
    // asked which thread is active, or it mints a fresh one there first.
    const held = this.#principalKey;
    const changed = held !== null && held !== this.userKey;
    if (changed) {
      this.#changePrincipal(held, this.userKey);
    }
    this.#principalKey = this.userKey;
    // Namespace the built-in default store too (a host-injected store is used
    // verbatim). Must precede #wireThreadStore, which wraps the current store.
    this.conversationStore = this.#storage.scopeStore(this.#unwrappedStore(), this.userKey);
    window.addEventListener("resize", this.#onViewportResize);
    // The visual viewport changes without the window resizing -- a keyboard
    // opening, a pinch-zoom, the URL bar collapsing -- and `scroll` is what
    // fires when it is panned rather than resized.
    window.visualViewport?.addEventListener("resize", this.#onViewportResize);
    window.visualViewport?.addEventListener("scroll", this.#onViewportResize);
    this.#placement.publishVisualViewport();
    this.#wireThreadStore();
    this.#attachments.wire(this.#connection.signal);
    this.#voice.wire();
    this.#history.adoptActiveThread();
    // The catalog requests go out a microtask later, so a host configuring
    // through a framework ref still has a chance to be heard — see #startup.
    queueMicrotask(() => this.#startup());
    // A key changed while the element was away handed it over all the same,
    // and the restore is the arriving principal's: reported as the live change
    // is. An adoption is not a handover, and restores the same conversation.
    void this.#history.rehydrate(changed && held !== "" ? "rescope" : "restore");
    if (changed) {
      // The last of what a live change does: a drawer left open across the
      // move still lists the threads of the principal who left, titles and
      // all, until something reloads it. A plain move leaves it alone, since
      // the list it shows is still this principal's.
      void this.#history.refreshDrawer();
    }
    // Last: everything above reads (and some of it sets) attributes, and none
    // of that should trip the connect-time warning.
    this.#connected = true;
    if (this.#newChatOnConnect) {
      this.#newChatOnConnect = false;
      // After the restore above has started: starting the chat stops it, so
      // the one event is the new chat's and the conversation left stays kept.
      this.newChat();
    }
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
      this.#history.rehydrate("restore"),
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
    this.#connection.abort();
    window.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("scroll", this.#onViewportResize);
    this.#storage.release();
    this.#chatRegistration.leave();
    this.#cancelRun();
    this.#excerpts.detachPageOffer();
    this.#attachments.tray?.dispose();
    this.#voice.dispose();
    this.#transcript.disposeScroller();
    this.#announcer.dispose();
  }

  /** Parse the inline `data-strings` JSON overrides (empty when absent/malformed). */
  #readStringOverrides(): Partial<UiStrings> {
    const parsed = readJsonAttribute(this, "data-strings");
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
    this.#threadStore = null;
    const url = this.getAttribute("data-threads-url");
    if (url !== null) {
      const inner = this.conversationStore;
      const remote = new RemoteConversationStore(
        url,
        () => this.#headersFor(url),
        inner,
        () => this.#requestCredentials(),
        this.getAttribute("data-threads-cache") !== "false",
      );
      this.#threadStore = { remote, inner };
      this.conversationStore = remote;
    }
  }

  /**
   * The conversation store without the remote this element wrapped it in.
   *
   * An element removed and inserted again connects again, and wrapping the
   * wrapper stacked a second remote on the first, so every rename and delete
   * reached the server twice. Unwrapping first also lets a `data-threads-url`
   * removed while detached take the remote away. A store the host assigned
   * since is theirs, and comes back as it is.
   */
  #unwrappedStore(): ClientConversationStore {
    const wrapped = this.#threadStore;
    return wrapped !== null && this.conversationStore === wrapped.remote
      ? wrapped.inner
      : this.conversationStore;
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
   * Read {@link getPlace} (or the route map standing in) again and redraw the
   * chip. A single-page app calls this after its router moves, since a
   * `pushState` fires no event; history traversal and hash changes are caught
   * without it. Does nothing before the element connects.
   */
  refreshPlace(): void {
    if (!this.isConnected) {
      return;
    }
    this.#place.update(
      this.getPlace === null
        ? placeFromRoute(this.routeMap, window.location.pathname)
        : this.getPlace(),
    );
  }

  /**
   * A round's context: the host's, then the place. A withheld place withholds
   * the page map too, so it is filtered out of whatever the host returned.
   */
  #roundContext(): Context[] {
    const context = this.getContext();
    const kept = this.#place.withheld
      ? context.filter((entry) => entry.description !== PAGE_MAP_CONTEXT)
      : context;
    return [...kept, ...this.#place.context()];
  }

  /**
   * Set the collapsed state: reflect the `collapsed` attribute, persist it
   * per-tab, and emit a {@link TOGGLE_EVENT} so a host can mirror the state in
   * its own chrome.
   */
  setCollapsed(collapsed: boolean, options: { readonly announce?: boolean } = {}): void {
    if (collapsed && this.#surface().collapseTo === null) {
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
      this.refreshPlace();
      // Re-decide which way to open before opening: the viewport may have
      // changed since the launcher was dropped, and this corner is what the
      // panel grows from.
      this.#restoreIfBoxed();
    }
    if (collapsed) {
      this.setAttribute("collapsed", "");
    } else {
      // The history popover belongs to the bar only while the panel is away.
      // Opening the panel closes it and takes the drawer back, so the panel
      // lands on the conversation rather than on a list over it.
      this.#homeDrawer();
      this.removeAttribute("collapsed");
    }
    this.#syncDock();
    writeStoredItem(this.#storage.key(COLLAPSED_KEY), collapsed ? "1" : "0");
    // Expanding reads the thread on screen; other threads keep their marks.
    // Reported on every toggle, as before, with the threads it cleared.
    this.#unreadChanged(this.#markSeen());
    this.dispatchEvent(
      new CustomEvent<ToggleDetail>(TOGGLE_EVENT, {
        detail: { collapsed },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Answers the user has not seen, totalled across threads: each finished while
   * the panel was collapsed, and is read once its thread is on screen with the
   * panel expanded. The launcher's badge renders this; {@link UNREAD_EVENT}
   * announces every change and the threads it touched, so a host chrome can
   * render its own instead.
   */
  get unread(): number {
    let total = 0;
    for (const count of this.#unreadByThread.values()) {
      total += count;
    }
    return total;
  }

  /**
   * The thread on screen; `null` before the element first connects.
   *
   * Only reads. `conversationStore.threadId()` mints and stores a thread when
   * the store points at none, so a host asking which conversation is showing
   * could start one; this never does. {@link THREAD_EVENT} says when it changes.
   */
  get threadId(): string | null {
    const threadId = this.#history.threadId;
    return threadId === "" ? null : threadId;
  }

  /**
   * The title of the thread on screen; `""` while nothing has been sent in it,
   * and before the element connects.
   *
   * A title renamed here, or one the conversation list shows that the thread's
   * messages do not derive (a server's own), wins. Otherwise it is the first
   * user message, and a bare skill `/token` reads as the catalog's title for
   * that skill, else as the token in words. `title-text="auto"` draws it in the
   * header; {@link THREAD_TITLE_EVENT} says when it changes.
   */
  get threadTitle(): string {
    return this.#titled.title;
  }

  /**
   * Whether an interaction is in flight: the composer's own state, the one that
   * shows Stop. It spans every tool round, a retry and a checkpoint
   * continuation as well as a send, which {@link SUBMIT_EVENT} alone does not.
   * Reflected as `data-running` on the element, for a host's CSS.
   */
  get running(): boolean {
    return this.#running;
  }

  /**
   * The height of the bottom bar in CSS px, and 0 when none is drawn: under
   * any collapse-to but "bar", and on a phone while the panel is open, where
   * the panel is the screen. The bar is fixed over the page, so a host pads
   * its own page by this much; {@link BAR_HEIGHT_EVENT} says when it changes.
   */
  get barHeight(): number {
    return this.#barHeight;
  }

  /**
   * The width in CSS px a docked panel covers at rest, and 0 when it covers
   * none of the page: the rail while collapsed to it, the panel while open, 0
   * under every other placement, under collapse-to="none" or a launcher while
   * collapsed, on a phone while open (the panel is the screen) and under
   * --ag-ui-position: static, where the host's layout already makes room. The
   * panel is fixed over the page, so a host pads its own by this much;
   * {@link DOCK_WIDTH_EVENT} says when it changes, never per animation frame.
   */
  get dockWidth(): number {
    return this.#dockWidth;
  }

  /**
   * The element the panel rises from under collapse-to="none", right-aligned
   * to it: typically the host's own button in its own bar. Takes precedence
   * over the anchor attribute, which names one by selector. One that resolves
   * to nothing leaves the panel in its placement's own corner, with a console
   * warning.
   */
  get anchor(): Element | null {
    return this.#anchor;
  }

  set anchor(value: Element | null) {
    this.#anchor = value;
    this.#anchorWarned = false;
    this.#syncDock();
  }

  /** The surface the live placement and collapse-to attributes describe. */
  #surface(): Surface {
    return surfaceFor(this.getAttribute("placement"), this.getAttribute("collapse-to"));
  }

  /**
   * Stamp what the panel collapses to as data-collapsed-to, which is what the
   * stylesheet draws the bar and the hidden state from. Resolved here rather
   * than in CSS, because "bar" over a sidebar is its rail and "none" over a
   * page is no collapse at all, and the stylesheet would have to restate that
   * table.
   */
  #stampCollapseTarget(): void {
    const target = this.#surface().collapseTo;
    if (target === null) {
      this.removeAttribute("data-collapsed-to");
    } else {
      this.setAttribute("data-collapsed-to", target);
    }
  }

  /** What the panel covers of the page at rest, from state and the panel's own box. */
  #restingDockWidth(): number {
    const placement = this.getAttribute("placement");
    if (
      (placement !== "sidebar" && placement !== "side") ||
      !this.#hasBox() ||
      getComputedStyle(this).position === "static"
    ) {
      return 0;
    }
    if (this.collapsed) {
      return this.#surface().collapseTo === "rail" ? this.#launcher.offsetWidth : 0;
    }
    const phone =
      this.getAttribute("data-small-viewport") !== "off" &&
      window.matchMedia("(max-width: 600px)").matches;
    return phone ? 0 : this.#chat.offsetWidth;
  }

  /** Tell the host when the docked width, or the edge it docks against, changed. */
  #syncDockWidth(): void {
    // A drag-resize reports once, when it ends.
    if (this.#placement.dragging()) {
      return;
    }
    const width = this.#restingDockWidth();
    const side = this.getAttribute("data-side") === "left" ? "left" : "right";
    if (width === this.#dockWidth && (width === 0 || side === this.#dockSide)) {
      return;
    }
    this.#dockWidth = width;
    this.#dockSide = side;
    this.dispatchEvent(
      new CustomEvent<DockWidthDetail>(DOCK_WIDTH_EVENT, {
        detail: { width, side },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Re-measure the bar or the anchor, and tell the host when the bar's height changed. */
  #syncDock(): void {
    // isConnected rather than the connected flag, which connectedCallback
    // sets only at its end, after the first measurement here.
    if (!this.isConnected) {
      return;
    }
    // With no box there is no bar drawn, which the host still hears of, and nothing to
    // measure: syncing would place a dragged panel from a rect of nothing. Showing this
    // element resizes the bar or the transcript, and their observers sync it then.
    const height = this.#hasBox()
      ? this.#placement.syncDock(this.#dockBar, this.#resolveAnchor())
      : 0;
    this.#syncDockWidth();
    if (height === this.#barHeight) {
      return;
    }
    this.#barHeight = height;
    this.dispatchEvent(
      new CustomEvent<BarHeightDetail>(BAR_HEIGHT_EVENT, {
        detail: { height },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * The anchor in force under collapse-to="none": the property, else the
   * attribute's selector, looked up in the root this element lives in and
   * then the document, so a chat inside a framework's shadow root can name a
   * button beside it. Null under any other collapse-to, with nothing given,
   * or when what was given is not in the document -- reported once per anchor.
   */
  #resolveAnchor(): Element | null {
    if (this.#surface().collapseTo !== "none") {
      return null;
    }
    const selector = this.getAttribute("anchor") ?? "";
    if (this.#anchor === null && selector === "") {
      return null;
    }
    const found = this.#anchor ?? findAnchor(this.getRootNode(), selector);
    if (found?.isConnected === true) {
      return found;
    }
    if (!this.#anchorWarned) {
      this.#anchorWarned = true;
      console.warn(
        `<ag-ui-chat>: the anchor ${this.#anchor === null ? `"${selector}"` : "element"} ` +
          "is not in the document, so the panel opens from its placement's own corner.",
      );
    }
    return null;
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
    return this.#surface().startsCollapsed && !this.hasAttribute("data-start-open");
  }

  /**
   * Describe the panel to whoever is asking -- in practice the agent, through
   * the opt-in chat-surface tools.
   *
   * `movable` folds two separate reasons into the one answer a caller needs:
   * a placement that places itself owns its position, and a panel that fills
   * the screen has nowhere to go. Reporting them apart would make every caller
   * re-derive the same conjunction. A corner panel docked under
   * `collapse-to="bar"` or `"none"` is movable on a wide viewport, like the
   * corner panel it is.
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
   * can ask first. A docked panel moves too, within the room above its bar or
   * anchor, and remembers the spot as a header drag would.
   */
  moveTo(corner: ChatCorner, options: { readonly announce?: boolean } = {}): boolean {
    return this.#placement.moveTo(corner, options);
  }

  /**
   * Drop the size the user dragged in the current placement, and its stored
   * copy, so the placement's default and the host's `--ag-ui-width` /
   * `--ag-ui-height` apply again. Other placements keep theirs.
   * Under `collapse-to="bar"` or `"none"` it also returns a panel the user
   * dragged off its dock to the dock, and forgets the stored spot; a corner
   * panel keeps a dragged position.
   */
  resetSize(): void {
    this.#placement.resetSize();
    this.#syncDock();
  }

  /** Flip the collapsed state. Bound to the built-in header toggle. */
  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
  }

  /**
   * Flip the scheme word of the `theme` attribute between `light` and `dark`
   * and persist the choice per tab. Bound to the optional built-in header theme
   * toggle (`data-theme-toggle`). The theme name and any host words are kept:
   * `soft` becomes `soft dark`, and `soft dark` becomes `soft light`. With no
   * scheme word (`auto`, or a host rule setting `color-scheme` on the element),
   * it flips away from the scheme the panel is drawn in.
   */
  toggleTheme(): void {
    // Only the scheme word flips, so a named theme survives the toggle:
    // "soft" becomes "soft dark", and "soft dark" becomes "soft light". And
    // only the scheme word is saved: the name is the host's, and a name saved
    // on one page would replace another page's theme on restore.
    const theme = this.getAttribute("theme") ?? "";
    const scheme = this.#drawnScheme() === "dark" ? "light" : "dark";
    this.setAttribute("theme", withScheme(theme, scheme));
    this.#storage.writePreference(THEME_KEY, scheme);
    this.#syncThemeGlyph();
  }

  /**
   * Move the element's client state from one principal to another.
   *
   * The whole reason {@link userKey} is live: `sessionStorage` outlives a
   * logout, because a logout is a navigation (or, in a single-page app, not
   * even that) rather than a tab close. Nothing remounts, so the host naming
   * the new principal is the only signal the element will ever get.
   *
   * Two callers. A live change runs all of it. connectedCallback runs it for a
   * key that changed while the element was out of the document, and there it
   * runs before the store is scoped and before `#connected` is set -- which is
   * what `live` reads, since `isConnected` is already true by then. That call
   * does the half about what storage and the element still hold. The half
   * about the principal arriving -- the store scoped under the new key, its
   * active thread, the replay -- is what connecting goes on to do anyway, and
   * run here too it would read the old store before the new one exists,
   * minting a thread pointer in the namespace just purged and replaying the
   * history twice. Nor would it leave alone a store the host assigned while
   * the element was out.
   */
  #changePrincipal(previousKey: string, nextKey: string): void {
    this.#principalKey = nextKey;
    const live = this.#connected;
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
      if (live) {
        this.#rescopeStore(next);
      }
      return;
    }
    // First, ahead of the purge: from here on, nothing a client built for the
    // previous principal does is written anywhere. See #tenure.
    this.#tenure = {};
    SessionStorageStore.purge(previous);
    if (live) {
      this.#rescopeStore(next);
    }
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
    // Shared state too, and only here. New chat keeps it, because it is the
    // page's object and the same person is still editing it; but it is also
    // whatever the agent last wrote into it for the principal who left, and the
    // next client is seeded from it, so it went out as `RunAgentInput.state` on
    // the new principal's first run. A host that seeds state assigns it again
    // for the one who arrived.
    this.#sharedState = {};
    // And the turn being written, also only here. A turn typed and not sent is
    // the previous principal's words as much as the transcript is, and so is
    // everything else that reaches the box: a quotation and a skill's template
    // are both text in it. The tray went with the transcript above. New chat
    // keeps the text, because the same person is still typing, and an adoption
    // returned before any of this for the same reason. Through the input
    // handler rather than beside it, so the hint and the slash palette that
    // were answering that text come down with it.
    this.#input.value = "";
    this.#onInput();
    this.#setRunning(false);
    // The previous principal's marks go with their threads, unread: nobody saw them.
    this.#forgetUnread([...this.#unreadByThread.keys()], true);
    if (!live) {
      return;
    }
    // A recording in progress is theirs too, and once stopped it would be
    // transcribed into the next principal's composer. Taking the mic down ends
    // it untranscribed, and putting a fresh one up leaves the next principal
    // a working control -- the way leaving and connecting do it, which is also
    // why only a live change does it here: a detached one has been through
    // both already.
    this.#voice.dispose();
    this.#voice.wire();
    this.#history.adoptActiveThread();
    void this.#history.rehydrate("rescope");
    void this.#history.refreshDrawer();
  }

  /**
   * Rebuild the `sessionStorage` store under `namespace`, re-wrapping it for
   * `data-threads-url` exactly as connecting did.
   *
   * A store the host assigned is left alone, whether before connecting or
   * since: a store that holds its data somewhere the element cannot see has to
   * scope itself. The exception is a plain `SessionStorageStore` assigned
   * before connecting, which connecting cannot tell from the default and so
   * took for the element's own. Hence the unwrapped store in use is what the scope is asked
   * about, rather than what it remembered when connecting. The transcript on
   * screen is still cleared either way — the host swapped principals, and that
   * much is the element's to act on.
   */
  #rescopeStore(namespace: string): void {
    const store = this.#storage.rescopeStore(this.#unwrappedStore(), namespace);
    if (store === null) {
      return;
    }
    this.conversationStore = store;
    this.#wireThreadStore();
  }

  /**
   * The scheme the panel is drawn in, which the toggle flips and its glyph
   * offers the way out of. A scheme word decides it, since the scheme rules
   * hold against a host's. Without one the panel follows whatever sets its
   * color-scheme: a host rule on the element, auto's "light dark", or the
   * light default. Both schemes allowed means the system picks. Read before
   * the shadow styles apply too (the glyph is drawn first), when the computed
   * value carries only a host rule, so auto is answered from its word.
   */
  #drawnScheme(): "light" | "dark" {
    const words = (this.getAttribute("theme") ?? "").split(/\s+/);
    if (words.includes("dark")) {
      return "dark";
    }
    if (words.includes("light")) {
      return "light";
    }
    const declared = getComputedStyle(this).colorScheme.split(/\s+/);
    const dark = declared.includes("dark");
    if (dark !== declared.includes("light")) {
      return dark ? "dark" : "light";
    }
    if (dark || words.includes("auto")) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    return "light";
  }

  /** Reflect the current theme on the toggle: show the destination's glyph. */
  #syncThemeGlyph(): void {
    const dark = this.#drawnScheme() === "dark";
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
  openThreads(options: { readonly anchor?: Element } = {}): void {
    // Collapsed into the bar, the list opens as a popover over the bar rather
    // than expanding the panel: the same drawer, moved beside the bar, since
    // nothing inside the hidden panel can be drawn. Under the host's own bar it
    // opens beside the host's button, and a pick leaves the panel to the host.
    const target = this.#surface().collapseTo;
    const anchor = options.anchor ?? this.#resolveAnchor();
    // An embedded chat collapsed under none is not drawn at all, popover included.
    const drawn = this.getAttribute("placement") !== "embedded";
    if (this.collapsed && target === "bar") {
      this.#dockBar.append(this.#drawer.element);
    } else if (this.collapsed && target === "none" && anchor !== null && drawn) {
      this.#threadsAnchor = anchor;
      this.#threadsPopover.append(this.#drawer.element);
      this.#placeThreadsPopover();
    } else {
      if (this.collapsed && target === "none") {
        console.warn(
          drawn
            ? '<ag-ui-chat>: openThreads() under collapse-to="none" needs an anchor to open ' +
                "beside; pass openThreads({ anchor }) or set the anchor attribute."
            : '<ag-ui-chat>: openThreads() under placement="embedded" and collapse-to="none" ' +
                "has no popover: the collapsed chat is not drawn. Expand it first.",
        );
      }
      this.#homeDrawer();
    }
    this.#history.openThreads();
  }

  /**
   * Stand the popover on its button: below one in the top half of the viewport,
   * above one in the bottom half, right-aligned to it and held inside the window.
   */
  #placeThreadsPopover(): void {
    const anchor = this.#threadsAnchor;
    if (anchor === null || this.#drawer.element.parentNode !== this.#threadsPopover) {
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const height = document.documentElement.clientHeight;
    const below = rect.top + rect.height / 2 < height / 2;
    const list = Math.min(THREADS_POPOVER_WIDTH, width - 2 * THREADS_POPOVER_GAP);
    const right = Math.min(
      Math.max(THREADS_POPOVER_GAP, width - rect.right),
      width - THREADS_POPOVER_GAP - list,
    );
    const room = (below ? height - rect.bottom : rect.top) - 2 * THREADS_POPOVER_GAP;
    this.style.setProperty(
      "--_threads-top",
      below ? `${rect.bottom + THREADS_POPOVER_GAP}px` : "auto",
    );
    this.style.setProperty(
      "--_threads-bottom",
      below ? "auto" : `${height - rect.top + THREADS_POPOVER_GAP}px`,
    );
    this.style.setProperty("--_threads-right", `${Math.max(THREADS_POPOVER_GAP, right)}px`);
    this.style.setProperty("--_threads-room", `${Math.max(0, room)}px`);
  }

  /**
   * Put the drawer back in the panel, where every surface but the bar's
   * popover draws it. A popover still open is closed first: the list was
   * opened over the bar, and carried into the panel it would cover the
   * conversation the user asked to see.
   */
  #homeDrawer(keep: Node | null = null): void {
    const away = this.#drawer.element.parentNode;
    if (away !== keep && (away === this.#dockBar || away === this.#threadsPopover)) {
      this.#drawer.close();
      this.#chat.insertBefore(this.#drawer.element, this.#checkpoints.element);
      this.#threadsAnchor = null;
      for (const name of ["top", "bottom", "right", "room"]) {
        this.style.removeProperty(`--_threads-${name}`);
      }
    }
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
   * Put a stored thread on screen, as picking it in the conversation list does,
   * for a host that lists conversations in its own chrome.
   *
   * Resolves once the thread has been replayed, when {@link THREAD_EVENT} has
   * fired; a second call for the thread already loading settles with that load.
   * If the store rejects the load, the element stays on the thread it was on,
   * fires nothing, and the promise rejects with the store's error.
   * **A run in flight is cancelled**, as the list and {@link newChat} do;
   * a host that would rather wait reads {@link running} first. The thread
   * already on screen is left alone, and so is everything before the element
   * connects, since until then it has no store to read the thread from.
   */
  switchThread(threadId: string): Promise<void> {
    if (!this.#connected) {
      return Promise.resolve();
    }
    return this.#history.switchThread(threadId);
  }

  /**
   * Delete a stored thread, as the conversation list's delete does. Deleting the
   * thread on screen cancels its run and puts a fresh thread in its place, and
   * {@link THREAD_EVENT} reports it; deleting another leaves the screen alone.
   * Does nothing before the element connects.
   */
  deleteThread(threadId: string): void {
    if (!this.#connected) {
      return;
    }
    this.#history.deleteThread(threadId);
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
    // Before the element connects it has no store scoped to its namespace and
    // no thread to leave, and minting one would write to the unscoped store and
    // fire an event for a thread it does not yet show. Connecting starts it.
    if (!this.#connected) {
      this.#newChatOnConnect = true;
      return;
    }
    // Stop any in-flight run first — discarding the client mid-run would
    // leave the old agent streaming into a cleared transcript.
    this.#cancelRun();
    this.#history.reapUnsent();
    this.#resetState();
    this.#history.startThread();
    this.#setRunning(false);
    this.#dispatchThread(this.#history.threadId, "new");
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
    this.#resetConversation();
    // The composer's own history goes with the conversation it was typed
    // into. The path that makes this more than tidiness is the `user-key`
    // rescope, which purges storage and wipes the transcript precisely so the
    // previous principal's words are not visible to the next one -- and would
    // otherwise leave every one of them a single ArrowUp away.
    this.#sentDrafts.length = 0;
    this.#recallIndex = null;
  }

  /**
   * Drop the in-memory run and transcript, and nothing the user typed.
   *
   * Split from {@link #resetState} for re-insertion, which rebuilds the
   * conversation from history but is not a new one, so the composer's recall
   * history stays.
   */
  #resetConversation(): void {
    this.#client = null;
    // Every path here has just cancelled the run, but a cancelled run ends
    // later: once its request closes, or once a host tool's handler returns.
    // Whatever it says then is about the conversation being cleared, so it must
    // not draw into this one, put a new run's Stop back to Send, or report the
    // new conversation's tools as its own.
    this.#runHandlers.detach();
    // A frontend tool call of that run can resume later still, for the same
    // reason, and must not draw into this one either: see #conversation.
    this.#conversation = {};
    this.#clearTranscript();
    this.#history.forgetRestored();
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
   * last answer was wrong. Returns `false` when there is nothing to retry, or
   * while anything that holds a send is in flight: a run, a send or another
   * retry whose run has not started yet, a checkpoint continuation, or a
   * restore of the stored conversation that is still loading. It does not wait
   * for a restore as a send does: nothing is on screen to retry yet, and after
   * the load it would re-ask the previous visit's last question. Also `false`
   * when host code it
   * runs before its run starts -- the store's save, or an activity or tool
   * renderer the replay draws through -- has stopped it by starting a new chat
   * or changing `user-key`. A tool or context provider that stops it does so
   * inside the client's resume, past the last point this can see: nothing is
   * sent, and this resolves `true`, because both a run starting and a Stop let
   * go of the hold it checks. Rejects with the store's error when the store
   * refuses the save, and then the conversation is as it was.
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
    // Refused for whatever refuses a send, because it starts a run on the same
    // client. That includes a send held short of its run, which `running` does
    // not see yet, and a picked checkpoint, which runs on a client of its own
    // and leaves this one idle -- so a Retry beside it was a second run in the
    // one conversation, each saving over the other.
    if (this.#running || this.#sending !== null || this.#history.continuation !== null) {
      return false;
    }
    // Held from here as a send is, and for the same reason: the client starts
    // the run a microtask after it is asked, and nothing above sees it until
    // then. A send in that time went out as a second run on the same client,
    // the built-in Send sent rather than queued, and a pick started a
    // continuation beside it. Released once the run starts, by `#setRunning`,
    // and below when it never does.
    const hold = {};
    this.#sending = hold;
    try {
      const client = this.#ensureClient();
      const kept = client.truncateToLastUser();
      if (kept === null) {
        return false;
      }
      // The truncation saved through the host's store, so host code has run
      // with the Retry under way, and a store that started a new chat or
      // changed `user-key` from there has stopped it. Going on drew the
      // abandoned conversation into the one that replaced it and asked its
      // answer again on a client nothing holds.
      if (this.#sending !== hold) {
        return false;
      }
      // Re-render between the truncation and the run: the kept turns replay as
      // restored history (static, no entrance animation), and only the new
      // answer arrives live. Streaming into the old transcript would put the
      // new answer underneath the one it replaces.
      this.#clearTranscript();
      for (const message of kept) {
        this.#history.replay(message);
        // A replay draws through the host's activity and tool renderers, which
        // can stop the Retry as the store's save can. Checked after each one,
        // so the rest of the abandoned conversation is not drawn into the chat
        // that replaced it, and after the last, so its answer is not asked
        // again.
        if (this.#sending !== hold) {
          return false;
        }
      }
      await client.resume();
      return true;
    } finally {
      // Only its own hold, as a send's end releases only its own. A turn the
      // composer queued behind it is sent from here when its run never started,
      // because no run settles to send it.
      if (this.#sending === hold) {
        this.#sending = null;
        this.#flushQueued();
      }
    }
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

  /**
   * Build the chrome, from the attributes as they stand.
   *
   * Runs on every connect, not once, because removing and re-inserting the
   * element is the documented way to apply a connect-time attribute written
   * late. So it has to build the same element the second time as the first:
   * the elements made here are new each time, the long-lived ones it fills
   * are filled with `replaceChildren` rather than appended to, and every
   * listener on a long-lived one goes under the connection's signal. Appending
   * gave a re-inserted element two headers and two composers.
   */
  #render(): void {
    const { signal } = this.#connection;
    this.#chat.className = "chat";
    this.#chat.setAttribute("part", "panel");

    const titleText = this.#titleText();
    const themed = this.getAttribute("data-theme-toggle") !== null;
    const { header, checkpoints } = buildHeader({
      host: this,
      title: this.#title,
      titleText,
      iconUrl: this.getAttribute("data-icon-url"),
      strings: this.#strings,
      // Asks the history's run index rather than re-testing the attribute, so
      // "configured" means one thing everywhere (an empty value is unset, not a
      // relative URL to the current page).
      withCheckpoints: this.#history.runs() !== null,
      themeToggle: themed ? this.#themeToggle : null,
      signal,
      onHistory: () => this.openThreads(),
      onCheckpoints: () => this.toggleCheckpoints(),
      onNewChat: () => this.newChat(),
      onCollapse: () => this.toggleCollapsed(),
      onToggleTheme: () => this.toggleTheme(),
    });
    if (themed) {
      this.#syncThemeGlyph();
    }

    // A panel is a window and a header is its title bar.
    this.#placement.enablePanelDrag(header);

    buildTranscript({
      messages: this.#messages,
      jumpButton: this.#jumpButton,
      emptyWrap: this.#emptyWrap,
      greetingText: this.#greetingText,
      starters: renderStarterChips(this, this.#strings, (prompt) => {
        void this.sendMessage(prompt);
      }),
      strings: this.#strings,
    });
    this.#syncGreeting();

    // The quote offer, and the transcript's settled selections it listens for.
    this.#excerpts.mount(signal);

    // Built here rather than at field initialisation: the viewport has to exist
    // and the observer has to have something to observe.
    this.#transcript.mountScroller(this.#jumpButton, signal);

    this.#announcer.mount();

    this.#messages.append(this.#emptyWrap);
    // Stamped from the first frame, so a page that mounts empty is laid out as
    // empty rather than switching to it on the first change.
    this.#transcript.updateEmptyState();

    const inputRow = buildComposer({
      input: this.#input,
      send: this.#send,
      attachButton: this.#attachButton,
      fileInput: this.#fileInput,
      voiceSlot: this.#voiceSlot,
      place: this.#place.element,
      hint: this.#composerHint,
      queuedRow: this.#queuedRow,
      attachSlot: this.#attachSlot,
      strings: this.#strings,
      signal,
      onKeydown: (event) => this.#onKeydown(event),
      onInput: () => this.#onInput(),
      onSend: () => {
        // One button, two states: Send while idle, Stop while a run is in
        // flight (no layout change).
        if (this.#running) {
          this.#cancelRun();
          return;
        }
        void this.#submit();
      },
      onFilesPicked: () => this.#attachments.onFilesPicked(),
    });

    this.#place.mount(signal, this.#strings);
    this.#input.addEventListener("focus", () => this.refreshPlace(), { signal });
    window.addEventListener("popstate", () => this.refreshPlace(), { signal });
    window.addEventListener("hashchange", () => this.refreshPlace(), { signal });
    this.refreshPlace();

    // Host content against the input, after everything of the turn being
    // written. A bare slot, whose own box is none, so an empty one takes no
    // space and the greeting layout carries a filled one with the composer.
    const aboveComposer = document.createElement("slot");
    aboveComposer.name = "above-composer";

    // A coarse footer slot below the composer.
    const footer = document.createElement("slot");
    footer.name = "footer";

    this.#messagesWrap.className = "messages-wrap";
    // Sibling of the list inside a shared box, not a child of it: the
    // affordance offering to scroll must not scroll away with the content.
    this.#messagesWrap.replaceChildren(this.#messages, this.#jumpButton, this.#excerpts.button);

    // Composer surfaces sit just above the input: the skills palette (opens on
    // `/`), the chips, the hint saying what the composer still needs, the
    // queued messages and the pending-attachments tray, then the host's own
    // content directly over the input.
    this.#chat.replaceChildren(
      header,
      this.#messagesWrap,
      this.#skillsMenu.palette,
      this.#skillsMenu.chips,
      this.#composerHint,
      this.#queuedRow,
      this.#attachSlot,
      aboveComposer,
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
    this.#chat.addEventListener(
      "pointerdown",
      (event) => {
        if (!this.#checkpoints.open_) {
          return;
        }
        const path = event.composedPath();
        if (path.includes(this.#checkpoints.element) || path.includes(checkpoints)) {
          return;
        }
        this.#checkpoints.close();
      },
      { signal },
    );

    buildLauncher({
      launcher: this.#launcher,
      badge: this.#badge,
      railLabel: this.#railLabel,
      bar: this.#dockBar,
      barHistory: this.#barHistory,
      barPlace: this.#place.barElement,
      titleText,
      iconUrl: readLauncherIconUrl(this),
      strings: this.#strings,
      signal,
      // The bar stays on screen with the panel open, as the way to minimise
      // it, so its strip toggles; everywhere else the launcher is only drawn
      // while collapsed and only ever opens.
      onOpen: () => this.setCollapsed(this.#surface().collapseTo === "bar" && !this.collapsed),
      // The bar's history button toggles: the popover has no backdrop, and a
      // press on the bar is not a press outside it, so this is how the button
      // that opened the list closes it again. openThreads() stays open-only.
      onHistory: () => {
        if (this.#drawer.isOpen()) {
          this.#drawer.close();
        } else {
          this.openThreads();
        }
      },
    });
    // Neither popover has a backdrop to catch a click away, so a press outside
    // closes it, as Escape already does. The bar, or the list and the host's
    // button, are not outside: that button toggles the list itself.
    document.addEventListener(
      "pointerdown",
      (event) => {
        const away = this.#drawer.element.parentNode;
        if (!this.#drawer.isOpen() || (away !== this.#dockBar && away !== this.#threadsPopover)) {
          return;
        }
        const path = event.composedPath();
        const own: readonly (Node | null)[] =
          away === this.#dockBar ? [away] : [away, this.#threadsAnchor];
        if (!path.some((node) => own.includes(node as Node))) {
          this.#drawer.close();
        }
      },
      { signal },
    );
    window.addEventListener("resize", () => this.#placeThreadsPopover(), { signal });
    this.#placement.enableLauncherDrag(signal);

    this.#placement.mountResizeGrips(this.#chat);
    this.#builtInSheet = adoptStyles(this.#root, this.#extraStyles);
    const probe = this.#placement.probe;
    probe.className = "viewport-probe";
    probe.setAttribute("aria-hidden", "true");
    // A transition, so a token changing is an event. On the corners of a box with no
    // size, which draw nothing: a margin would push it out by the token again, and that
    // is scroll on a page or a card holding the chat. Not on the padding, which the
    // viewport is read from and has to stay instant.
    probe.style.borderRadius =
      "var(--_viewport-inset-top) var(--_viewport-inset-right) var(--_viewport-inset-bottom) var(--_viewport-inset-left)";
    probe.style.transition = "border-radius 1ms";
    this.#threadsPopover.className = "threads-popover";
    this.#root.replaceChildren(
      probe,
      this.#announcer.region,
      this.#chat,
      this.#dockBar,
      this.#threadsPopover,
    );
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
    const unread = this.unread;
    // Past 9 the exact number stops being information and starts being a
    // layout problem — the badge is a circle, not a field.
    this.#badge.textContent = unread > 9 ? "9+" : String(unread);
    // Only on the collapsed launcher: an open panel can now hold another
    // thread's unseen answers, and the launcher behind it is not where to say so.
    this.#badge.hidden = unread === 0 || !this.collapsed || !isUnreadBadgeEnabled(this);
    const label =
      !this.collapsed && this.#surface().collapseTo === "bar"
        ? this.#strings.collapse
        : this.#badge.hidden
          ? this.#strings.expand
          : fillUiString(this.#strings.expandUnread, { count: unread });
    this.#launcher.setAttribute("aria-label", label);
    this.#launcher.title = label;
  }

  /**
   * Repaint the badge and tell the host the total, naming `threadIds`, the
   * threads whose marks changed.
   *
   * The count is kept whether or not the badge renders it, so `unread` stays
   * truthful for a host chrome and switching the badge on mid-session doesn't
   * start from a number that was never counted.
   */
  #unreadChanged(threadIds: readonly string[]): void {
    this.#syncLauncher();
    this.dispatchEvent(
      new CustomEvent<UnreadDetail>(UNREAD_EVENT, {
        detail: { unread: this.unread, threadIds },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Note an answer that finished on `threadId`: read as it lands when that
   * thread is on screen in an expanded panel, otherwise one more unseen.
   */
  #noteUnread(threadId: string): void {
    if (this.#inView(threadId)) {
      this.conversationStore.markRead?.(threadId);
      return;
    }
    this.#unreadByThread.set(threadId, (this.#unreadByThread.get(threadId) ?? 0) + 1);
    this.#unreadChanged([threadId]);
  }

  /**
   * Whether `threadId` is in front of the user: drawn on screen, with no switch
   * away from it in flight, in an expanded panel. On screen while collapsed is
   * not read.
   */
  #inView(threadId: string): boolean {
    return !this.collapsed && threadId === this.#shownThread && threadId === this.#history.threadId;
  }

  /** Clear the marks of the thread in view, telling the store; the threads cleared. */
  #markSeen(): string[] {
    const threadId = this.#shownThread;
    if (threadId === null || !this.#inView(threadId) || !this.#unreadByThread.delete(threadId)) {
      return [];
    }
    this.conversationStore.markRead?.(threadId);
    return [threadId];
  }

  /**
   * Drop the marks of `threadIds` without reading them (a deleted thread, a
   * principal who left). Reported when any had marks, or always when `report`.
   */
  #forgetUnread(threadIds: readonly string[], report = false): void {
    const dropped = threadIds.filter((threadId) => this.#unreadByThread.delete(threadId));
    if (dropped.length > 0 || report) {
      this.#unreadChanged(dropped);
    }
  }

  /**
   * Take the threads a store lists as unread that this page has not counted:
   * one mark each, or read at once when the thread is in view.
   */
  #takeListedUnread(threads: readonly ThreadMeta[]): void {
    const marked: string[] = [];
    for (const { threadId, unread } of threads) {
      if (unread !== true || this.#unreadByThread.has(threadId)) {
        continue;
      }
      if (this.#inView(threadId)) {
        this.conversationStore.markRead?.(threadId);
      } else {
        this.#unreadByThread.set(threadId, 1);
        marked.push(threadId);
      }
    }
    if (marked.length > 0) {
      this.#unreadChanged(marked);
    }
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
    // history the user has since edited. Needed beside the walk's own check
    // below, which compares text: an edit typed and then deleted leaves the
    // turn there unchanged, and the user has still taken the box back.
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
   *
   * A walk ends with any write into the composer that is not its own, so that
   * whatever was written is never replaced by the next step.
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
    // The walk checks the composer rather than trusting every writer to end
    // it. Writers are spread across the element -- a quotation, a skill
    // prefill, dictation, the clears after a send -- and a walk used to end
    // only for those that also went through the input handler or
    // `#recordTurn`. A quotation and a prefill did neither, and the next
    // ArrowUp replaced them with a past turn.
    // A host page can write the composer too, which no hook of ours can see.
    // Comparing here is the one rule a writer added later cannot forget.
    if (this.#input.value !== this.#recalled) {
      this.#recallIndex = null;
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
    // Read back rather than taken from the draft, so a value the textarea
    // normalises on the way in -- its line endings -- still reads as the
    // walk's own on the next step instead of ending it.
    this.#recalled = this.#input.value;
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
    // Not sending it is not the same as destroying it, though, and nothing is
    // destroyed here: a queued turn entered the recall history the moment it
    // left the composer, so ArrowUp gets it back. This used to be where it
    // entered, which left it out of reach for as long as it waited, and once
    // it was recorded on the way in, moving it again put each one in twice.
    //
    // This path is also reached from `disconnectedCallback`, where a DOM move
    // and a framework re-render both look like a farewell and neither is one.
    this.#queued.length = 0;
    this.#renderQueued();
    this.#decision.abort();
    this.#client?.cancel();
    // A send whose run has not started is ended here too, because nothing else
    // can reach it: the cancel above lands on a client that has not been asked
    // for the run yet, and a client forgets a Stop when it is next asked for one.
    // This is how a submit listener that starts a new chat, switches thread or
    // moves the element stops the send it is hearing about.
    this.#sending = null;
    // A checkpoint continuation is as much the run in flight -- the composer
    // offers Stop for it -- but it runs on a client the element does not hold.
    this.#history.stopContinuation();
  }

  /**
   * Say the conversation on screen changed: {@link THREAD_EVENT}.
   *
   * The thread it replaced is the one last reported, rather than the one the
   * element last pointed at: a switch superseded before it replayed never drew
   * its thread, so naming it as the previous one left a host's own list
   * marking a thread that was never shown and still marking the one that was.
   */
  #dispatchThread(threadId: string, reason: ThreadDetail["reason"]): void {
    const detail: ThreadDetail = { threadId, previousThreadId: this.#shownThread, reason };
    this.#shownThread = threadId;
    const seen = this.#markSeen();
    if (seen.length > 0) {
      this.#unreadChanged(seen);
    }
    // The chip always names the live page, whichever conversation is on screen.
    this.refreshPlace();
    this.#titleMessages = this.#history.restored;
    // Settled before the thread event so its listeners read the new title,
    // and announced after it, as the change that follows from the switch.
    const retitled = this.#settleTitle();
    this.dispatchEvent(
      new CustomEvent<ThreadDetail>(THREAD_EVENT, { detail, bubbles: true, composed: true }),
    );
    if (retitled) {
      this.#announceTitle();
    }
    // A picked thread may carry a title its messages do not derive (renamed
    // elsewhere, or named by a server). On restore only from the element's own
    // sessionStorage store, where the read is local: a remote one is a GET per page load.
    if (
      reason === "switch" ||
      (reason === "restore" && this.conversationStore instanceof SessionStorageStore)
    ) {
      void this.#history.refreshDrawer();
    }
  }

  /** The header and rail text: the fixed `title-text`, or the thread's under `"auto"`. */
  #titleText(): string {
    // `#strings` is the resolved table once connected, the English defaults before then.
    const fixed = this.getAttribute("title-text");
    if (fixed !== TITLE_TEXT_AUTO) {
      return fixed ?? this.#strings.title;
    }
    return this.#titled.title === "" ? this.#strings.title : this.#titled.title;
  }

  #paintTitle(): void {
    this.#title.textContent = this.#titleText();
    this.#railLabel.textContent = this.#title.textContent;
  }

  /**
   * Recompute {@link threadTitle} and repaint; `true` when it changed. A new
   * thread counts as a change unless both titles are empty, so a switch
   * between two same-named threads is still reported.
   */
  #settleTitle(): boolean {
    const threadId = this.#history.threadId;
    const title =
      this.#givenTitles.get(threadId) ??
      threadTitleFrom(this.#titleMessages, (name) => this.#skills.title(name));
    const previous = this.#titled;
    if (title === previous.title && (threadId === previous.threadId || title === "")) {
      return false;
    }
    this.#titled = { threadId, title };
    this.#paintTitle();
    return true;
  }

  #announceTitle(): void {
    this.dispatchEvent(
      new CustomEvent<ThreadTitleDetail>(THREAD_TITLE_EVENT, {
        detail: { ...this.#titled },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** {@link #settleTitle}, announcing the change if there was one. */
  #retitle(): void {
    if (this.#settleTitle()) {
      this.#announceTitle();
    }
  }

  /**
   * Keep the list's title for the thread on screen when it is a rename or a title
   * the server chose. A server's own derivation of the first message (cut at 60
   * code points) or its placeholder is not one: the element's own title stays.
   */
  #takeListedTitle(threads: readonly ThreadMeta[]): void {
    const threadId = this.#history.threadId;
    const row = threads.find((thread) => thread.threadId === threadId);
    if (row === undefined || this.#titleMessages.length === 0) {
      return;
    }
    const derived = [
      threadTitleFrom(this.#titleMessages),
      serverTitleFrom(this.#titleMessages),
      SERVER_PLACEHOLDER_TITLE,
    ];
    if (derived.includes(row.title)) {
      return;
    }
    this.#givenTitles.set(threadId, row.title);
    this.#retitle();
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
    // The send that asked for this run is covered from here until it settles,
    // so its hold ends now. Held to the send's end instead, it was still held
    // when the run-finished event fired, and a host's follow-up from it was
    // refused.
    if (running) {
      this.#sending = null;
    }
    const label = running ? this.#strings.stop : this.#strings.send;
    this.#send.title = label;
    this.#send.setAttribute("aria-label", label);
    this.#send.dataset["state"] = running ? "running" : "idle";
    // For a host's CSS, as `data-empty` is: the same state, on the element.
    this.toggleAttribute("data-running", running);
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
    // Guarded here rather than at each caller, because this is what takes the
    // turn off the queue: a caller that ran while something was still in
    // flight would shift a turn off and lose it to the no-op in `sendMessage`.
    // A continuation settles its run before the element lets go of it, so the
    // settle below arrives while `continuation` is still set, and the release
    // that follows is what drains.
    if (this.#running || this.#history.continuation !== null) {
      return;
    }
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

  /**
   * Put a turn that has left the composer at the front of the recall history,
   * and start the next walk from it.
   *
   * Every turn the user typed and pressed a key to send comes through here:
   * sent at once, queued behind a run, or sent to continue a checkpoint. A
   * host's own `sendMessage` does not, because its text was never in the
   * composer, and the arrow keys walk back through what the user wrote there.
   */
  #recordTurn(content: string): void {
    // A repeat of the last one is not a second entry: the point is to reach
    // what was said, not how often. Nothing is recorded for an attachment sent
    // with no text, which has nothing for the composer to hold.
    if (content !== "" && this.#sentDrafts[0] !== content) {
      this.#sentDrafts.unshift(content);
    }
    // A press sends without an input event, which is what ends a walk
    // otherwise. Left where it was, the next ArrowUp stepped past the turn just
    // taken, or past whichever one now sits where it had walked to.
    this.#recallIndex = null;
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
    // A picked checkpoint counts as in flight from the pick, not from its
    // first event: `running` is a request behind it, and a turn sent in that
    // window ran against the conversation the continuation had already frozen
    // to save against, so one of the two saves dropped the other's turn.
    //
    // Queueing keeps the guard and gives the key something to do. Text only:
    // an attachment is settled state the tray is holding and the composer has
    // no second copy of, so parking it here would mean deciding what happens
    // when the user then removes the chip.
    //
    // A send counts from the moment it is taken, for the same reason a pick
    // does. A second Send in the same task as the first -- a host clicking it
    // from code -- reaches here before the first's run has started, and
    // `sendMessage` refuses it then, so without this the box would be cleared
    // of a turn that went nowhere.
    //
    // Recorded for recall before it is queued or sent, because it leaves the
    // box either way. A turn queued here is the newest thing the user typed,
    // and it is still the newest while it waits; the queue later sends it
    // through `sendMessage`, which records nothing, so this is the only point
    // that sees it as the composer's.
    this.#recordTurn(content);
    if (this.#running || this.#sending !== null || this.#history.continuation !== null) {
      if (content !== "") {
        this.#queued.push(content);
        this.#renderQueued();
        this.#input.value = "";
        autoGrow(this.#input);
      }
      return;
    }
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
   * Resolves `true` once the turn has been handed to the client for its run,
   * which is when the interaction settles, frontend-tool rounds included; a
   * run a tool or context provider then stops still counts, as it does for
   * {@link retryLastTurn}. Resolves `false` when nothing was sent.
   *
   * Nothing is sent for an empty message, nor while a run or a picked
   * checkpoint's continuation is in flight, since a second concurrent run
   * would orphan the first. A send is in flight from the moment it is taken
   * rather than from its run's start, so nothing is sent from a
   * {@link SUBMIT_EVENT} listener or for a second call in the same task
   * either. Nor with no `endpoint`, which says so in the transcript. Nor
   * behind a reload's restore that will resume a run a navigating tool
   * interrupted, since that restore ends by starting the run.
   *
   * **While the element restores a stored conversation with no run to resume
   * -- on connect, {@link reload}, a thread picked from the drawer, a change
   * from one `user-key` to another -- it waits, then sends.** The turn has to follow the
   * conversation it is part of: sent at once, it went out without it, the
   * conversation was then drawn under it, and its save replaced the stored
   * one. So the bubble, the {@link SUBMIT_EVENT} and the request all come after
   * the replay, by the length of the store's load. A New chat, a thread
   * switch, a change from one `user-key` to another, a reload or the element
   * leaving the page while it waits drops it, resolving `false`: the
   * conversation it was addressed to is no longer on screen. Leaving the page
   * resolves it only once the load answers or the element is back, since
   * that is when the restore learns it was stopped. A first `user-key` on an
   * anonymous conversation adopts it rather than replacing it, and stops
   * nothing. A second call while one waits is
   * refused, as a second call in the same task is.
   *
   * Unlike the built-in Send it does not queue: it returns, and the caller
   * keeps what it tried to send. Nor does it consult the tray -- what you pass
   * is what is sent.
   */
  async sendMessage(content: string, attachments: readonly AttachmentRef[] = []): Promise<boolean> {
    if (content === "" && attachments.length === 0) {
      return false;
    }
    const restore = this.#restoreHold;
    if (restore !== null && this.#sending === restore.hold) {
      // Taken over from the restore, so a second host call is refused, the
      // built-in Send parks behind this one rather than going first, and the
      // restore's own release when it ends lets go of nothing -- this send's
      // run settling, or its end, is what sends the parked turn.
      const waiting = {};
      this.#sending = waiting;
      await restore.restored;
      // Anything that stopped the restore let go of this too, by the Stop
      // that New chat, a thread switch, a principal handover, a reload and the
      // element leaving all reach. Otherwise let go of here and the guards
      // asked again from the top, as for a call made now.
      //
      // Removing this check fails "drops the waiting send and the queued turn
      // when New chat is pressed", among the other drop tests.
      if (this.#sending !== waiting) {
        return false;
      }
      this.#sending = null;
      return this.sendMessage(content, attachments);
    }
    if (this.#running || this.#sending !== null || this.#history.continuation !== null) {
      return false;
    }
    const send = {};
    this.#sending = send;
    try {
      // Only a send travels. Every other way out of the empty state -- a
      // restored transcript, a thread picked from the drawer, a resumed
      // checkpoint -- is a change of context rather than a continuation of what
      // the user was doing, and snaps. Armed before the bubble lands so both
      // writes reach the same style recalculation, which is what makes the
      // change a transition rather than a jump.
      if (this.#transcript.isEmpty()) {
        this.setAttribute("data-composer-settling", "");
      }
      // Taken before the announcement, because its listeners run here: a host's
      // own send from one is refused as overlapping this one, as it would be
      // from any later moment of it.
      this.#announceTurn(content, attachments);
      // A listener can also have stopped it -- New chat, a thread switch, a
      // change of principal, moving the element. All of them reach the Stop,
      // which let go of this send, and the turn would otherwise go out into the
      // conversation that replaced it, or from an element nothing can stop.
      if (this.#sending !== send) {
        return false;
      }
      // Read where the request is made, which says why nothing was sent when
      // there is no endpoint to send to.
      const connected = this.endpoint !== "";
      await this.#client_send(content, attachments);
      return connected;
    } finally {
      // Still held here only if its run never started: no endpoint, or a
      // client or store that threw before asking for one. No run settles
      // then, so this is what sends a turn queued behind it. Not released if
      // it is no longer this send's: the run starting let go of it, or a Stop
      // did, and the field may hold the next send by now.
      if (this.#sending === send) {
        this.#sending = null;
        this.#flushQueued();
      }
    }
  }

  /**
   * Put a turn the user sent on screen, and tell the host it was sent.
   *
   * The half of a send that does not depend on where it goes, so both senders
   * take it from here: {@link sendMessage}, and a checkpoint continuation, which
   * posts to the resume or fork endpoint on a client of its own. The
   * continuation used to call that client directly, so the turn went out and
   * its answer streamed in under no question -- while the save it made held the
   * turn, and a reload showed what the live transcript never had.
   *
   * Arming the composer's travel stays with {@link sendMessage}: continuing a
   * run is a change of context, and docks at once.
   */
  #announceTurn(content: string, attachments: readonly AttachmentRef[]): void {
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
        // Its history is the whole conversation, so nothing goes ahead of it.
        follows: [],
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
    // Fixed for the same reason, and checked by every write below: see #tenure.
    // The thread id alone cannot do it, because the store is still read live --
    // it has to be, since an adoption rescopes it under a run that keeps going.
    const tenure = this.#tenure;
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
      handlers: this.#runHandlers.forClient(threadId),
      // The place is read here because the client asks for the tools first,
      // so the round's tools and context answer from the same read.
      getTools: () => {
        this.refreshPlace();
        return this.#tools.advertise();
      },
      getContext: () => this.#dispatch.buildContext(),
      executeTool: (call) => this.#dispatch.execute(call),
      resolveInterrupts: (interrupts) => this.#dispatch.resolveInterrupts(interrupts),
      // Every client saves the whole conversation, because a store keeps one
      // list per thread. For the conversation's own client that is its
      // history; a continuation holds only what it adds, and writes the
      // conversation it continues ahead of that.
      //
      // Every message list a client saves reaches the store through here -- a
      // send, a round's end, a tool's result, the answers it writes for calls
      // left open or declined by a Stop, a Stop's last save -- and so does a
      // `data-threads-url` store's local copy, which is the only thing that
      // wrapper does on a save. So this is the one gate for them. `onSaved` is
      // behind it as well: it hands the saved conversation on as the seed of
      // the next client, which would be the next principal's.
      onPersist: (messages) => {
        if (tenure !== this.#tenure) {
          return;
        }
        const conversation = [...seed.follows, ...messages];
        this.conversationStore.saveMessages(threadId, conversation);
        if (threadId === this.#history.threadId) {
          this.#titleMessages = conversation;
          this.#retitle();
        }
        seed.onSaved?.(conversation);
      },
      // Shared state is the next principal's first `RunAgentInput.state`, and
      // the handover has just emptied it. A snapshot already read off the wire
      // is applied after the Stop, and would put it back.
      onStateChanged: (state) => {
        if (tenure === this.#tenure) {
          this.#onSharedStateChanged(state);
        }
      },
      connectionLostMessage: this.#strings.connectionLost,
      unfinishedMessage: this.#strings.callNotFinished,
      declinedMessage: this.#strings.declinedAction,
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
