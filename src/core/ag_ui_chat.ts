import { randomUUID } from "@ag-ui/client";
import type { Context, Interrupt, Message, Tool } from "@ag-ui/core";
import {
  ANNOUNCE_CLEAR_MS,
  ATTACHMENT_EVENT,
  CHART_ACTIVITY_TYPE,
  COMPACTION_ACTIVITY_TYPE,
  CUSTOM_AGENT_EVENT,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  FEEDBACK_EVENT,
  ICON_ATTACH,
  ICON_LAUNCHER,
  ICON_SEND,
  ICON_STOP,
  INVALIDATE_CUSTOM_NAME,
  INVALIDATE_EVENT,
  LOAD_CAPABILITY_TOOL,
  MESSAGE_ROLE,
  READ_PAGE_TOOL,
  RUN_FINISHED_EVENT,
  STATE_EVENT,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  UNREAD_EVENT,
  X_CONFIRM_KEY,
  X_SUMMARY_KEY,
} from "../constants.js";
import { fillTemplate } from "../skills/fill_template.js";
import { parseSkills } from "../skills/parse_skills.js";
import type { Skill } from "../skills/skill.js";
import type { ChartRenderer } from "../tools/client_tool_registry.js";
import { type ClientTool, ClientToolRegistry } from "../tools/client_tool_registry.js";
import { isDestructive } from "../tools/is_destructive.js";
import { isNavigates } from "../tools/is_navigates.js";
import { createPageActionTools, type ResolvePageTarget } from "../tools/page_action_tools.js";
import { createPageMapContext, type PageMap } from "../tools/page_map.js";
import { createPageStateTools, type PageState } from "../tools/page_state.js";
import { parseToolCatalog, type ToolCatalogEntry } from "../tools/parse_tool_catalog.js";
import { createRouteTools, type RouteMap } from "../tools/route_map.js";
import {
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "../ui/approval_card.js";
import { attachCopyButtons } from "../ui/attach_copy_buttons.js";
import { renderAttachmentChips } from "../ui/attachment_chips.js";
import { AttachmentTray } from "../ui/attachment_tray.js";
import { renderChart } from "../ui/chart_block.js";
import { chartSpecFrom } from "../ui/chart_spec_from.js";
import { CHART_TOOL_NAME, createChartTool } from "../ui/chart_tool.js";
import { CheckpointMenu, type CheckpointVerb } from "../ui/checkpoint_menu.js";
import { type ConfirmationRequest, requestConfirmation } from "../ui/confirmation_card.js";
import {
  attachMessageActions,
  messageActionBar,
  messageActionButton,
} from "../ui/message_actions.js";
import { prettifyToolName } from "../ui/prettify_tool_name.js";
import {
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "../ui/question_card.js";
import type { RelativeTimeFormatter } from "../ui/relative_time.js";
import { renderMarkdown } from "../ui/render_markdown.js";
import {
  createResizeHandle,
  type ResizeAnchor,
  type ResizeAxis,
  type ResizeSize,
} from "../ui/resize_handle.js";
import { wrapWords } from "../ui/reveal_words.js";
import { renderRunNotice } from "../ui/run_notice.js";
import { SkillsMenu } from "../ui/skills_menu.js";
import { createStickToBottom, type StickToBottom } from "../ui/stick_to_bottom.js";
import { STYLES } from "../ui/styles.js";
import { renderSuggestionChips } from "../ui/suggestion_chips.js";
import { ThoughtsBlock } from "../ui/thoughts_block.js";
import { ThreadDrawer } from "../ui/thread_drawer.js";
import { ToolCallCard, type ToolDisplayMode } from "../ui/tool_call_card.js";
import { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "../ui/ui_strings.js";
import { VoiceInput } from "../ui/voice_input.js";
import {
  AgUiClient,
  type AgUiClientHandlers,
  type AgUiToolCall,
  type InterruptResponse,
  type ToolExecution,
} from "./agui_client.js";
import { type AttachmentRef, messageAttachments } from "./attachment.js";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  writeStoredItem,
} from "./conversation_store.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import { RemoteConversationStore } from "./remote_conversation_store.js";
import { RunIndex } from "./run_index.js";
import { type TranscribeHandler, transcribeAudio } from "./transcribe_audio.js";
import { type UploadHandler, uploadAttachment } from "./upload_attachment.js";
import { mintThread, warnOnCrossOriginCredentials, withCredentials } from "./utils.js";

/** The role a rendered chat message takes. */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/** `detail` shape of the {@link SUBMIT_EVENT} CustomEvent. */
export interface SubmitDetail {
  readonly content: string;
  /** Durable refs for the files attached to this message (empty when none). */
  readonly attachments: readonly AttachmentRef[];
}

/** `detail` shape of the {@link ATTACHMENT_EVENT} CustomEvent. */
export interface AttachmentsDetail {
  /** Durable refs for every file that has finished uploading. */
  readonly attachments: readonly AttachmentRef[];
  /** How many files are still uploading; a send now would leave these behind. */
  readonly pending: number;
}

/** `detail` shape of the {@link STATE_EVENT} CustomEvent. */
/** {@link FEEDBACK_EVENT} detail: what was rated, and how. */
export interface FeedbackDetail {
  /** The rated message's text, as rendered. */
  readonly content: string;
  readonly rating: "up" | "down";
}

export interface StateDetail {
  readonly state: Readonly<Record<string, unknown>>;
}

/** One tool that ran during an interaction, as {@link RunFinishedDetail} lists it. */
export interface ToolRun {
  readonly name: string;
  /**
   * Where it executed. `"server"` is the one a data-rendering host cares about:
   * a `"client"` tool ran in the host's own handler, so the host already knows
   * whatever it did.
   */
  readonly side: "server" | "client";
}

/** `detail` shape of the {@link RUN_FINISHED_EVENT} CustomEvent. */
export interface RunFinishedDetail {
  /** In settle order. Empty when the interaction called no tools. */
  readonly tools: readonly ToolRun[];
  /**
   * Every key announced during the interaction, de-duplicated, first-seen order.
   *
   * **This is the field that makes adoption one line** for a host already
   * listening here, and the `else` is the whole compatibility story:
   *
   * ```js
   * if (detail.invalidated.length > 0) refetchOnly(detail.invalidated);
   * else if (detail.tools.some((t) => t.side === "server")) refetchEverything();
   * ```
   *
   * Empty against a server that announces nothing, so an old server and a new
   * client fall through to the coarse refetch that shipped before either.
   */
  readonly invalidated: readonly string[];
}

/**
 * Draw one activity, from its content alone.
 *
 * The contract is {@link ClientTool.render}'s, and for the same reason rather
 * than by analogy. An activity is materialised into a `role: "activity"`
 * message, persisted with the transcript, and re-fired on every restore -- so a
 * renderer that writes to the page instead of returning DOM fires again on
 * every thread load, which is exactly the bug the tool registry's purity rule
 * was written to make unmakeable.
 *
 * - a pure function of `content` -- no host state, no network, no clock;
 * - deterministic, so a reload reproduces what was there before;
 * - free of effects outside the node it returns, which the component places.
 *
 * Return `null` for content that says nothing worth drawing. Anything already
 * drawn under that message id is then removed: live and reload should agree,
 * and the stored content is the version that could not be drawn.
 */
export type ActivityRenderer = (content: unknown) => Node | null;

/** One `activity_type` a host can draw. See {@link AgUiChat.registerActivityRenderer}. */
export interface ActivityRegistration {
  /**
   * The AG-UI `activity_type` this draws, matched exactly.
   *
   * An open string the protocol does not enumerate -- which is the whole reason
   * this is a registry rather than a branch.
   */
  readonly type: string;
  readonly render: ActivityRenderer;
  /**
   * Shown in the transcript when something already drawn under this type stops
   * being renderable. Omit for an activity whose disappearance needs no
   * explanation.
   */
  readonly removedNotice?: string;
}

/** `detail` shape of the {@link CUSTOM_AGENT_EVENT} CustomEvent. */
export interface CustomAgentDetail {
  /** The `CUSTOM` event's `name`, verbatim. An open string; never interpreted here. */
  readonly name: string;
  /** Its `value`, verbatim and unparsed. `unknown` because the protocol says nothing about it. */
  readonly value: unknown;
}

/** `detail` shape of the {@link INVALIDATE_EVENT} CustomEvent. */
export interface InvalidateDetail {
  /**
   * The resources that moved, as the server named them.
   *
   * **Opaque strings, and matching is exact.** `orders/42` does not imply
   * `orders` -- a prefix rule would be this component guessing at a scheme it
   * does not own, and `orders/1` would match `orders/11`. A server that wants
   * the collection refreshed names it. Your own matching may be hierarchical,
   * because in your vocabulary the scheme is known.
   */
  readonly keys: readonly string[];
  /** What caused the write -- usually the tool's name. `null` when unstated. */
  readonly reason: string | null;
}

/** `detail` shape of the {@link TOGGLE_EVENT} CustomEvent. */
export interface ToggleDetail {
  readonly collapsed: boolean;
}

/** `detail` shape of the {@link UNREAD_EVENT} CustomEvent. */
export interface UnreadDetail {
  readonly unread: number;
}

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

/** Per-tab persistence key for a dragged panel size. */
const SIZE_KEY = "ag-ui-chat:size";

/** Per-tab persistence key for the built-in theme toggle. */
const THEME_KEY = "ag-ui-chat:theme";

/**
 * Storage namespaces already spoken for in this document.
 *
 * Per document rather than per origin, and released on disconnect, because the
 * question it answers is "is another element on this page using these keys right
 * now" — not "has anything ever used them". A registry that never released would
 * turn every remount, and every framework re-render that moves the node, into a
 * false collision that costs the element its own conversation.
 */
const CLAIMED_NAMESPACES = new Set<string>();

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
  getTools: () => Tool[] = () => [
    ...this.#builtinTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    ...this.#toolRegistry.tools(),
  ];

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
   * `data-page-actions` attribute (`"scroll"` / `"drag"`).
   */
  resolvePageTarget: ResolvePageTarget = (target) => document.querySelector<HTMLElement>(target);

  /**
   * The server tool catalog fetched from `data-tools-url`, keyed by tool
   * name. Cards label themselves from each entry's `summary`, the base
   * layer behind {@link toolSummaries}: an explicit entry in `toolSummaries`
   * wins, this fills the rest. Held as whole entries rather than labels so a
   * field the server sent is not lost on the way in. Populated once on connect.
   */
  #toolCatalog: Record<string, ToolCatalogEntry> = {};

  /**
   * Foreign origins already reported, so the notice is once per origin per
   * element rather than once per request. Per-element rather than module-level,
   * because two elements on one page are two separate configurations.
   */
  #warnedOrigins = new Set<string>();
  /** The resolved string table (defaults ← `data-strings` ← `strings`). */
  #strings: UiStrings = DEFAULT_UI_STRINGS;

  /**
   * The tool names the current round handed the agent, captured as the catalog
   * went out.
   *
   * The registry is mount-wide but {@link getTools} is per-run, so a host is
   * free to scope what a given page offers — and a call naming a tool this run
   * withheld must not reach the handler that is merely still registered.
   * Snapshotted rather than re-asked at dispatch: a provider is a function, and
   * calling it again asks a question the run already answered, which is exactly
   * the window a scoped catalog exists to close.
   *
   * Empty until the first round advertises, which cannot precede a call: the
   * client builds `RunAgentInput.tools` at the top of every round, before the
   * calls that round produces are executed.
   */
  #advertisedTools: ReadonlySet<string> = new Set();

  readonly #toolRegistry = new ClientToolRegistry();
  /** Tool-call cards awaiting execution, keyed by call id. */
  readonly #toolCards = new Map<string, ToolCallCard>();
  /**
   * Call ids whose card was already settled from a streamed server-side result
   * (`TOOL_CALL_RESULT`), so the post-run executeTool sweep doesn't overwrite
   * the real output with the generic "executed on the server" fallback.
   */
  /** Whether a server-pushed chart activity is drawn. Off unless asked for. */
  /**
   * Which `activity_type`s this element can draw, by name.
   *
   * A registry rather than a branch because `activity_type` is an open string
   * the protocol does not enumerate. The two built-ins go through it like any
   * host registration, which is the test that the seam is real.
   */
  readonly #activityRenderers = new Map<string, ActivityRegistration>();
  /** Types that arrived with nobody registered to draw them. See {@link unhandledActivityTypes}. */
  readonly #unhandledActivityTypes = new Set<string>();

  /** Card elements by call id, so a rendering handler can find its own card. */
  readonly #cardElements = new Map<string, HTMLElement>();

  /** Chart blocks by activity message id, so an update redraws in place. */
  readonly #activityBlocks = new Map<string, HTMLElement>();

  readonly #serverSettled = new Set<string>();
  /**
   * Tool calls made during the current interaction, in the order they started,
   * so {@link RUN_FINISHED_EVENT} can report them once the whole thing settles.
   * Spans tool rounds and an approval interrupt; cleared when the event fires.
   */
  #runTools: { readonly id: string; readonly name: string }[] = [];
  /**
   * Keys announced during this interaction, de-duplicated in first-seen order.
   *
   * Per element, never module-level: a second mounted chat is a second run, and
   * sharing this would tell one page to refetch on the other's writes. Reset by
   * {@link AgUiChat.#dispatchRunFinished}, which is the one place that has read
   * it.
   */
  /**
   * Tool names the user waived confirmation for, for the life of this element.
   *
   * Per instance and never persisted: a session decision that outlived the tab
   * would be a permanent grant made by one click, which is the thing
   * `autoConfirm` already exists to say deliberately. Cleared with the element.
   */
  readonly #sessionApproved = new Set<string>();

  /**
   * The one action row currently carrying Retry, if any.
   *
   * Retry belongs to the **last** turn only: re-running an older one is
   * branching, and for a page-driving agent editing a past turn is not neutral
   * -- those turns clicked buttons, and re-running turn 3 does not un-save what
   * turn 5 saved. Holding a single owner is what keeps exactly one offer on
   * screen without per-bubble bookkeeping.
   */
  #retryOwner: HTMLElement | null = null;

  #runInvalidated = new Set<string>();
  readonly #root: ShadowRoot;
  /** Screen-reader-only status region -- see {@link AgUiChat.#announce}. */
  readonly #announcer = document.createElement("div");
  /** Return-to-foot affordance, shown only once something has been missed. */
  readonly #jumpButton = document.createElement("button");
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
  /** Follows the foot of the transcript, and stops when the reader scrolls away. */
  #scroller!: StickToBottom;
  /** Pending clear of {@link AgUiChat.#announcer}; see why it is cleared at all. */
  #announceTimer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Whether this turn already announced how it ended.
   *
   * `onSettled` is the terminal guarantee and fires however the run ended, so
   * it is the only place that can promise the user hears *something*. But a
   * stopped or failed run has already said the truer thing from `onCancelled`
   * or `onError`, and "assistant answered" after "response stopped" is worse
   * than silence.
   */
  #announcedOutcome = false;
  readonly #chat: HTMLDivElement;
  readonly #messages: HTMLDivElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #title: HTMLSpanElement;
  readonly #skillsMenu: SkillsMenu;
  readonly #drawer: ThreadDrawer;
  /** Checkpoint panel; rows load only when `data-runs-url` is set. */
  readonly #checkpoints: CheckpointMenu;
  /** Built lazily from `data-runs-url`; `null` when the host didn't opt in. */
  #runIndex: RunIndex | null = null;
  readonly #skillHint: HTMLDivElement;
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
  // Answers that finished while the widget was collapsed. Expanding clears it.
  #unread = 0;
  /** Empty-state region at the top of the message list; hidden once anything renders. */
  readonly #emptyWrap: HTMLDivElement;
  /** Upload tray; created on connect only when `data-attachments-url` is set. */
  #attachTray: AttachmentTray | null = null;
  /** Mic button mount point (input row); the control mounts on connect when enabled. */
  readonly #voiceSlot: HTMLSpanElement;
  /** Voice-input control; created on connect when transcription is available. */
  #voice: VoiceInput | null = null;
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
  // The page the current round's context describes, captured when that context
  // was built. `null` until the first round. Compared in `#executeTool` to
  // catch a page that moved under a round still in flight.
  #contextHref: string | null = null;
  // Aborting this dismisses (declines) an open confirmation card when the run
  // is cancelled while the card awaits a decision. One controller per card.
  #confirmAbort: AbortController | null = null;
  #streamingBubble: HTMLDivElement | null = null;
  // Text deltas applied to the current streaming bubble. >1 ⇒ the message
  // revealed progressively as it streamed, so the word reveal must not re-animate
  // it; ≤1 ⇒ it arrived at once and the word reveal is appropriate.
  #streamDeltas = 0;
  // The accumulated answer the next render will draw. Deltas overwrite it
  // (each one carries the whole answer), so a frame always draws the latest.
  #streamBuffer = "";
  // The frame that render is queued on, or `null` when nothing is queued —
  // also the flag saying a delta is still undrawn.
  #streamFrame: number | null = null;
  #pending: HTMLDivElement | null = null;
  // The current assistant turn's grouping container. One `.answer`
  // wraps everything a single answer produces — streamed text, tool cards, the
  // pending indicator — so it can be boxed as one "well" by CSS. Opened on the
  // turn's first run start, closed at settle, so it spans the whole multi-round
  // frontend-tool loop (which is several AG-UI runs), not one run. `null`
  // between turns; user bubbles never enter it.
  #currentGroup: HTMLDivElement | null = null;
  // The current turn's streamed-reasoning region, shown at the top of
  // the answer group while a reasoning model thinks and collapsed once the
  // answer's first text token arrives. `null` outside a reasoning turn.
  #thoughts: ThoughtsBlock | null = null;
  #threadId = "";
  // Per-instance suffix for the origin-scoped storage keys (collapsed / theme /
  // size), so two instances on one origin don't clobber each other. Empty ⇒ the
  // pre-namespacing global keys (back-compat). Resolved on connect; the
  // conversation adds `user-key` on top of it, see #conversationNs.
  #storageNs = "";
  // The entry this element put in CLAIMED_NAMESPACES, to take back out on
  // disconnect. `null` when it claimed nothing (no id, no endpoint, or it lost
  // the claim to an element that mounted first).
  #claimedNs: string | null = null;
  // The fallback namespace minted when the preferred one was already claimed,
  // with the preferred value it was minted for — so the element keeps it across
  // remounts, but re-resolves if the host answers the warning with an `id`.
  #generatedNs = "";
  #generatedFor = "";
  // The `sessionStorage`-backed store, which the element may therefore re-scope
  // on a principal change. `null` when the host injected a store of its own
  // kind, whose keying the element does not know and must not guess at.
  #builtinStore: SessionStorageStore | null = null;
  // Bumped on every #rehydrate; a replay whose generation is stale (a newer
  // thread switch started while it awaited a slow store) drops its result.
  #rehydrateGeneration = 0;
  #initialMessages: readonly Message[] = [];
  // Skill catalog by source; merged backend → embed → client (later wins).
  #backendSkills: readonly Skill[] = [];
  #embedSkills: readonly Skill[] = [];
  #clientSkills: readonly Skill[] = [];

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#chat = document.createElement("div");
    this.#messages = document.createElement("div");
    this.#input = document.createElement("textarea");
    this.#send = document.createElement("button");
    this.#title = document.createElement("span");
    this.#skillHint = document.createElement("div");
    this.#attachButton = document.createElement("button");
    this.#fileInput = document.createElement("input");
    this.#attachSlot = document.createElement("div");
    this.#voiceSlot = document.createElement("span");
    this.#themeToggle = document.createElement("button");
    this.#launcher = document.createElement("button");
    this.#badge = document.createElement("span");
    this.#emptyWrap = document.createElement("div");
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
              this.#strings.historyCompacted.replace("{count}", String(removed)),
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
    this.#skillsMenu = new SkillsMenu((skill) => this.#applySkill(skill));
    this.#drawer = new ThreadDrawer({
      onSelect: (threadId) => {
        void this.#switchThread(threadId);
      },
      onNew: () => {
        this.newChat();
        void this.#refreshDrawer();
      },
      onRename: (threadId, title) => {
        this.conversationStore.renameThread(threadId, title);
        void this.#refreshDrawer();
      },
      onDelete: (threadId) => {
        this.#deleteThread(threadId);
      },
    });
    this.#checkpoints = new CheckpointMenu((runId, verb) => {
      void this.#continueRun(runId, verb);
    });
  }

  /** The run index, built once from `data-runs-url`; `null` when unset. */
  #runs(): RunIndex | null {
    const url = this.getAttribute("data-runs-url");
    if (url === null || url === "") {
      return null;
    }
    if (this.#runIndex === null) {
      this.#runIndex = new RunIndex(
        url,
        () => this.#headersFor(url),
        () => this.#requestCredentials(),
      );
    }
    return this.#runIndex;
  }

  /**
   * Continue `runId` as a **new** run, seeded server-side from its snapshot.
   *
   * Uses a short-lived agent pointed at the resume / fork endpoint and seeded
   * with no history, because those endpoints supply the prior turns from the
   * snapshot and re-sending them would duplicate. A separate agent makes that
   * structural — the main agent keeps its own history — and mints the fresh
   * `run_id` the endpoints also require.
   *
   * Handlers are the element's own, so the continuation streams into the same
   * transcript the user is looking at.
   */
  async #continueRun(runId: string, verb: CheckpointVerb): Promise<void> {
    const index = this.#runs();
    if (index === null) {
      return;
    }
    const content = this.#input.value.trim();
    if (content === "") {
      return;
    }
    this.#input.value = "";
    this.#autoGrow();
    const endpoint = verb === "resume" ? index.resumeUrl(runId) : index.forkUrl(runId);
    const agent = this.agentFactory({
      endpoint,
      headers: this.#requestHeaders(),
      getHeaders: () => this.#requestHeaders(),
      trustedOrigins: this.trustedOrigins,
      ...this.#credentialsOption(),
      threadId: this.#threadId,
      // The seed the endpoints assume: nothing. The snapshot is the history.
      initialMessages: [],
    });
    const client = new AgUiClient({
      agent,
      handlers: this.#handlers(),
      getTools: () => this.#advertiseTools(),
      getContext: () => this.#buildContext(),
      executeTool: (call) => this.#executeTool(call),
      resolveInterrupts: (interrupts) => this.#resolveInterrupts(interrupts),
      connectionLostMessage: this.#strings.connectionLost,
    });
    await client.send(content);
  }

  /** Load the checkpoint panel with the runs that can actually be continued. */
  async #refreshCheckpoints(): Promise<void> {
    const index = this.#runs();
    // Pushed at render rather than at connect: `formatRelativeTime` is a
    // property, so a host may set it long after the element mounted.
    this.#checkpoints.setRelativeTimeFormatter(this.formatRelativeTime);
    this.#checkpoints.setRuns(index === null ? [] : await index.continuable());
  }

  /** Attributes the element reacts to after it has been connected. */
  static get observedAttributes(): string[] {
    return ["title-text", "placement", "credentials", "user-key", ...CONNECT_TIME_ATTRIBUTES];
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
      this.#releaseOwnedAxes();
      // Placement also moves the panel, so the edges its layout holds still
      // change with it. Deferred a frame so the new rules have applied.
      requestAnimationFrame(() => this.#syncResizeAnchor());
      return;
    }
    if (name === "title-text") {
      // `#strings` is the resolved table once connected, the English defaults
      // before then.
      this.#title.textContent = value ?? this.#strings.title;
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
    this.#toolRegistry.register(tool);
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
    for (const tool of createPageStateTools(binding)) {
      this.#toolRegistry.register(tool);
    }
  }

  /**
   * @deprecated Renamed to {@link registerPageState} — the old name read as
   * AG-UI shared-state sync. Behaviour is unchanged; the alias will be removed
   * in a future major.
   */
  registerStateHook(binding: PageState): void {
    this.registerPageState(binding);
  }

  /** The built-in `route.*` tools, present only when a route map is set. */
  #routeTools(): ClientTool[] {
    if (this.routeMap.length === 0) {
      return [];
    }
    return createRouteTools(
      () => this.routeMap,
      () => this.navigate,
    );
  }

  /**
   * The built-in `read_page` tool, present only when a {@link getPageMap}
   * provider is set. A *pull* the agent can call mid-turn to see the page after
   * it has acted (the auto-injected context is a send-time snapshot).
   */
  #pageTools(): ClientTool[] {
    const getPageMap = this.getPageMap;
    if (getPageMap === null) {
      return [];
    }
    return [
      {
        name: READ_PAGE_TOOL,
        description:
          "Read the current page's structure (fields, buttons, route). Call after " +
          "acting to observe the result within the same turn.",
        parameters: {
          type: "object",
          properties: {},
          required: [],
          [X_SUMMARY_KEY]: "Read the page",
        },
        handler: () => getPageMap(),
      },
    ];
  }

  /**
   * Opt-in page-action tools (`scroll_to` / `drag_and_drop`), enabled per token
   * via the `data-page-actions` attribute (e.g. `"scroll,drag"`). Targets resolve
   * through {@link resolvePageTarget} so a host controls the agent's interaction
   * surface; absent attribute ⇒ no tools registered.
   */
  #pageActionTools(): ClientTool[] {
    const attr = this.getAttribute("data-page-actions");
    if (attr === null) {
      return [];
    }
    const enabled = new Set(
      attr
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token !== ""),
    );
    return createPageActionTools(enabled, (target) => this.resolvePageTarget(target));
  }

  /** All built-in (route + page + page-action + ask_user) frontend tools. */
  #builtinTools(): ClientTool[] {
    return [
      ...this.#routeTools(),
      ...this.#pageTools(),
      ...this.#pageActionTools(),
      ...this.#askUserTool(),
    ];
  }

  /**
   * The built-in `ask_user` frontend tool, or `[]` when {@link askUser} is off.
   *
   * The agent calls it, the client executes it locally through the normal
   * frontend-tool path by rendering a {@link requestQuestion} card, and the
   * answer flows back as the tool result. No new protocol.
   */
  #askUserTool(): ClientTool[] {
    if (!this.askUser) {
      return [];
    }
    return [
      {
        name: "ask_user",
        description:
          "Ask the user a question and wait for their answer. Provide `options` for a " +
          "multiple-choice prompt; set `allow_custom` to also accept a free-text answer.",
        parameters: {
          type: "object",
          properties: {
            question: { type: "string", description: "The question to ask the user." },
            options: {
              type: "array",
              items: { type: "string" },
              description: "Preset choices offered as radio buttons.",
            },
            allow_custom: {
              type: "boolean",
              description: "Allow a free-text answer in addition to any options.",
            },
          },
          required: ["question"],
        },
        handler: (args) => this.#askUser(args),
      },
    ];
  }

  /** Render the `ask_user` question card and resolve with the user's answer. */
  async #askUser(args: Record<string, unknown>): Promise<string> {
    const question = typeof args["question"] === "string" ? args["question"] : "";
    const request: QuestionRequest = { question };
    const rawOptions = args["options"];
    if (Array.isArray(rawOptions)) {
      request.options = rawOptions.filter((option): option is string => typeof option === "string");
    }
    if (args["allow_custom"] === true) {
      request.allowCustom = true;
    }
    // The run is suspended on the card; a Stop aborts the controller, resolving
    // it with an empty answer (the run is then cancelled).
    this.#confirmAbort = new AbortController();
    const signal = this.#confirmAbort.signal;
    this.#hidePending();
    // A host-supplied renderer takes full control of the UI; otherwise the
    // built-in inline card renders into the current answer group.
    const answer =
      this.askUserRenderer !== null
        ? await this.askUserRenderer(request, { signal })
        : await requestQuestion(this.#ensureGroup(), request, {
            signal,
            strings: this.#strings,
          });
    this.#confirmAbort = null;
    this.#updateEmptyState();
    this.#scroller.follow();
    return answer;
  }

  /**
   * The catalog for the round about to start, remembering what it offered.
   *
   * Every path to a frontend tool goes through here first — the client asks
   * for `RunAgentInput.tools` at the top of each round — so this is the one
   * place that can know what the agent was actually told about.
   */
  #advertiseTools(): Tool[] {
    const tools = this.getTools();
    this.#advertisedTools = new Set(tools.map((tool) => tool.name));
    return tools;
  }

  /** Resolve a tool by name: built-in tools first, then the registry. */
  #resolveTool(name: string): ClientTool | null {
    const builtin = this.#builtinTools().find((t) => t.name === name);
    if (builtin !== undefined) {
      return builtin;
    }
    return this.#toolRegistry.has(name) ? this.#toolRegistry.get(name) : null;
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
    this.#storageNs = this.#claimNamespace();
    // Restore a dragged size before the panel paints, so it does not snap from
    // the placement default to the user's width on the first frame.
    this.#applySize(this.#readSize());
    // Position the grip at the corner this layout grows toward. Deferred to a
    // frame so the host's own stylesheet has applied; re-measured on every drag
    // anyway, so a wrong first guess costs a grip in the wrong corner and never
    // a wrong resize.
    requestAnimationFrame(() => this.#syncResizeAnchor());
    // Resolve the string table before rendering any chrome (defaults are the
    // floor; `data-strings` then the `strings` property layer over them).
    this.#strings = mergeUiStrings({ ...this.#readStringOverrides(), ...this.strings });
    // Restore a theme the built-in toggle persisted last visit (opt-in only, so
    // it never overrides a host that drives `theme` itself).
    if (this.getAttribute("data-theme-toggle") !== null) {
      const saved = this.#readScopedItem(THEME_KEY);
      if (saved !== null) {
        this.setAttribute("theme", saved);
      }
    }
    this.#render();
    this.#drawer.setStrings(this.#strings);
    this.#checkpoints.setStrings(this.#strings);
    if (this.#readScopedItem(COLLAPSED_KEY) === "1") {
      this.setAttribute("collapsed", "");
    }
    this.#syncLauncher();
    this.#initSkills();
    // Namespace the built-in default store too (a host-injected store is used
    // verbatim). Must precede #wireThreadStore, which wraps the current store.
    if (this.conversationStore instanceof SessionStorageStore) {
      const namespace = this.#conversationNs();
      // Remembered either way: this is the element's own store, so a later
      // `user-key` change may move it to another namespace.
      this.#builtinStore =
        namespace === "" ? this.conversationStore : new SessionStorageStore(namespace);
      this.conversationStore = this.#builtinStore;
    }
    this.#wireThreadStore();
    this.#wireAttachments();
    this.#wireVoice();
    this.#threadId = this.conversationStore.threadId();
    // The catalog requests go out a microtask later, so a host configuring
    // through a framework ref still has a chance to be heard — see #startup.
    queueMicrotask(() => this.#startup());
    void this.#rehydrate();
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
    void this.#fetchToolCatalog();
    void this.#fetchSkills();
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
    await Promise.all([this.#fetchToolCatalog(), this.#fetchSkills(), this.#rehydrate()]);
  }

  /**
   * Tear down live resources when the element leaves the DOM: cancel the
   * in-flight run so its stream closes, abort in-flight uploads so they do not
   * orphan server-side files, and release the mic so the browser's recording
   * indicator clears. Without this a removed element leaks all three.
   */
  disconnectedCallback(): void {
    this.#connected = false;
    // Give the namespace back. A disconnect is not necessarily a farewell — a
    // DOM move and a framework re-render both look like one — and an element
    // that could not reclaim its own namespace on the way back in would lose
    // its conversation to a false collision.
    if (this.#claimedNs !== null) {
      CLAIMED_NAMESPACES.delete(this.#claimedNs);
      this.#claimedNs = null;
    }
    this.#cancelRun();
    this.#attachTray?.dispose();
    this.#voice?.dispose();
    this.#scroller.dispose();
    if (this.#announceTimer !== null) {
      clearTimeout(this.#announceTimer);
      this.#announceTimer = null;
    }
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

  /** Parse the inline `data-strings` JSON overrides (empty when absent/malformed). */
  #readStringOverrides(): Partial<UiStrings> {
    const raw = this.getAttribute("data-strings");
    if (raw === null) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Partial<UiStrings>;
      }
    } catch {
      // Malformed JSON — fall back to the defaults rather than failing to mount.
    }
    return {};
  }

  /**
   * Enable the composer's file-upload tray when uploads are possible — either a
   * custom {@link uploadHandler} is set or `data-attachments-url` provides the
   * built-in multipart endpoint: reveal the 📎 button, wire the hidden file
   * input + drag-and-drop, and mount the tray. With neither, the affordance
   * stays hidden and the chat degrades to text-only.
   */
  #wireAttachments(): void {
    const url = this.getAttribute("data-attachments-url");
    const upload = this.uploadHandler ?? this.#defaultUploadHandler(url);
    if (upload === null) {
      return;
    }
    const accept = this.getAttribute("data-attachment-accept") ?? "";
    // Bound to the local rather than the field: the hook can only fire from a
    // tray that exists, so passing it removes a null check no caller can reach.
    const tray: AttachmentTray = new AttachmentTray({
      upload,
      maxBytes: this.#attachmentMaxBytes(),
      accept,
      strings: this.#strings,
      // The tray's change hook, surfaced to the host as an event. A host
      // driving its own composer could otherwise not tell a settled upload from
      // one still in flight, which is the state sendMessage() has to be called
      // with knowledge of.
      onChange: () => this.#dispatchAttachments(tray),
    });
    this.#attachTray = tray;
    this.#attachSlot.appendChild(this.#attachTray.element);
    this.#fileInput.accept = accept;
    this.#attachButton.hidden = false;
    this.#enableDragAndDrop();
  }

  /** The built-in multipart upload handler for `data-attachments-url`, or `null`. */
  #defaultUploadHandler(url: string | null): UploadHandler | null {
    if (url === null) {
      return null;
    }
    // Forward the tray's abort signal so removing a chip (or tearing the
    // element down) cancels the XHR.
    return (file, onProgress, signal) =>
      uploadAttachment(file, {
        url,
        headers: this.#headersFor(url),
        ...this.#credentialsOption(),
        onProgress,
        signal,
      });
  }

  /**
   * Reveal the composer's 🎤 mic button when transcription is possible — either
   * a custom {@link transcribeHandler} is set or `data-transcribe-url` provides
   * the built-in POST endpoint. The control records via `MediaRecorder` and
   * drops the transcript into the composer; with neither configured the mic
   * stays hidden and the chat is text-only.
   */
  #wireVoice(): void {
    const url = this.getAttribute("data-transcribe-url");
    const transcribe = this.transcribeHandler ?? this.#defaultTranscribeHandler(url);
    if (transcribe === null) {
      return;
    }
    this.#voice = new VoiceInput({
      transcribe,
      onText: (text) => this.#insertVoiceText(text),
      strings: this.#strings,
    });
    this.#voiceSlot.appendChild(this.#voice.element);
  }

  /** The built-in transcription handler for `data-transcribe-url`, or `null`. */
  #defaultTranscribeHandler(url: string | null): TranscribeHandler | null {
    if (url === null) {
      return null;
    }
    return (audio) =>
      transcribeAudio(audio, {
        url,
        headers: this.#headersFor(url),
        ...this.#credentialsOption(),
      });
  }

  /** Drop a voice transcript into the composer (appended to any typed text). */
  #insertVoiceText(text: string): void {
    const current = this.#input.value.trim();
    this.#input.value = current === "" ? text : `${current} ${text}`;
    this.#onInput();
    this.#input.focus();
  }

  /** The client-side upload size cap from `data-attachment-max-bytes`. */
  #attachmentMaxBytes(): number {
    const attr = this.getAttribute("data-attachment-max-bytes");
    if (attr === null) {
      return DEFAULT_ATTACHMENT_MAX_BYTES;
    }
    const parsed = Number.parseInt(attr, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ATTACHMENT_MAX_BYTES;
  }

  /** Queue every file from the picker into the tray, then reset the input. */
  #onFilesPicked(): void {
    const files = this.#fileInput.files;
    if (files !== null) {
      for (const file of Array.from(files)) {
        this.#attachTray?.add(file);
      }
    }
    // Reset so re-picking the same file fires `change` again.
    this.#fileInput.value = "";
  }

  /** Accept files dropped anywhere on the chat shell into the tray. */
  #enableDragAndDrop(): void {
    this.#chat.addEventListener("dragover", (event) => {
      event.preventDefault();
      this.#chat.classList.add("chat--dragover");
    });
    this.#chat.addEventListener("dragleave", () => {
      this.#chat.classList.remove("chat--dragover");
    });
    this.#chat.addEventListener("drop", (event) => {
      event.preventDefault();
      this.#chat.classList.remove("chat--dragover");
      const files = event.dataTransfer?.files;
      if (files !== undefined) {
        for (const file of Array.from(files)) {
          this.#attachTray?.add(file);
        }
      }
    });
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

  /** Fetch the server tool-label catalog from `data-tools-url`, if set. */
  async #fetchToolCatalog(): Promise<void> {
    const url = this.getAttribute("data-tools-url");
    if (url === null) {
      return;
    }
    try {
      const response = await fetch(url, this.#fetchInit(url));
      this.#toolCatalog = parseToolCatalog(await response.json());
    } catch {
      // Network/parse failure: cards fall back to toolSummaries / raw names.
    }
  }

  /**
   * Replace the host-supplied (client) skill catalog. Merged after the embedded
   * and fetched skills (so a client skill overrides a same-named server one).
   */
  setSkills(skills: readonly Skill[]): void {
    this.#clientSkills = skills;
    this.#recomputeSkills();
  }

  /**
   * Wire the skill surfaces: opt-in flags and the embedded catalog. The backend
   * catalog is fetched from `#startup`, a microtask later, so it carries the
   * host's transport configuration.
   */
  #initSkills(): void {
    this.#skillsMenu.enableChips(this.#flag("data-prompt-chips"));
    this.#skillsMenu.enableSlash(this.#flag("data-slash-commands"));
    this.#embedSkills = this.#readEmbeddedSkills();
    this.#recomputeSkills();
  }

  /** Parse the inline `data-skills` JSON catalog (empty when absent/malformed). */
  #readEmbeddedSkills(): readonly Skill[] {
    const raw = this.getAttribute("data-skills");
    if (raw === null) {
      return [];
    }
    try {
      return parseSkills(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  /** Fetch the backend skills catalog from `data-skills-url`, if set. */
  async #fetchSkills(): Promise<void> {
    const url = this.getAttribute("data-skills-url");
    if (url === null) {
      return;
    }
    try {
      const response = await fetch(url, this.#fetchInit(url));
      this.#backendSkills = parseSkills(await response.json());
      this.#recomputeSkills();
    } catch {
      // Network/parse failure: skills just stay as the embedded/client set.
    }
  }

  /** Merge the three sources (backend → embed → client; later wins by name). */
  #recomputeSkills(): void {
    const merged = new Map<string, Skill>();
    for (const skill of [...this.#backendSkills, ...this.#embedSkills, ...this.#clientSkills]) {
      merged.set(skill.name, skill);
    }
    this.#skillsMenu.setSkills([...merged.values()]);
  }

  /**
   * Act on a picked skill.
   *
   * A skill with no `prompt` is server-resolved: picking it sends the bare
   * `/name` token for the agent to expand, so the wording never reaches the
   * browser. Prefer that shape — a skill often states a project's internal
   * workflow most plainly, and a catalog endpoint is a plain GET.
   *
   * A skill carrying a `prompt` has the client fill its `{placeholder}`s from
   * the page instead, which is right for placeholders only the page can supply.
   *
   * Either way a pick sends; `sendImmediately: false` opts into pre-filling the
   * composer instead.
   */
  #applySkill(skill: Skill): void {
    if (skill.prompt === undefined) {
      this.#skillHint.hidden = true;
      void this.sendMessage(`/${skill.name}`);
      return;
    }
    const { text, missing } = fillTemplate(skill.prompt, this.skillContext());
    if (missing.length > 0) {
      // Hand the user something to work with rather than only a refusal. The
      // partially-filled template goes into the composer with its unresolved
      // `{placeholder}`s intact and the first one selected, so the next
      // keystroke replaces it. Blocking with a hint alone left whatever the
      // user had typed to open the palette — a lone "/" — sitting there, which
      // says nothing about what the skill wanted or how to give it.
      this.#skillHint.textContent = this.#strings.skillNeeds
        .replace("{title}", skill.title)
        .replace("{fields}", missing.join(", "));
      this.#skillHint.hidden = false;
      this.#input.value = text;
      this.#autoGrow();
      this.#input.focus();
      this.#selectFirstPlaceholder(text);
      return;
    }
    this.#skillHint.hidden = true;
    this.#input.value = text;
    this.#autoGrow();
    if (skill.sendImmediately === false) {
      this.#input.focus();
      return;
    }
    void this.#submit();
  }

  /**
   * Put the caret on the first unresolved placeholder, selected.
   *
   * Typing then replaces it, which is the shortest path from "this skill needs
   * a topic" to a sendable prompt.
   */
  #selectFirstPlaceholder(text: string): void {
    // The first surviving brace *is* the first unresolved placeholder — a
    // resolved one was substituted away — so this needs no search through the
    // missing keys and no not-found branch to defend.
    const start = text.indexOf("{");
    this.#input.setSelectionRange(start, text.indexOf("}", start) + 1);
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
  setCollapsed(collapsed: boolean): void {
    if (collapsed) {
      this.setAttribute("collapsed", "");
    } else {
      this.removeAttribute("collapsed");
    }
    writeStoredItem(this.#storageKey(COLLAPSED_KEY), collapsed ? "1" : "0");
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
    writeStoredItem(this.#storageKey(THEME_KEY), next);
    this.#syncThemeGlyph();
  }

  /**
   * Which axes the current placement allows.
   *
   * A full-bleed layout is `100vw`/`100vh` by definition and cannot be resized
   * at all; a docked panel owns its height, leaving only its inner edge. Read
   * per interaction, because `placement` is a live attribute.
   */
  #resizeAxis(): ResizeAxis {
    switch (this.getAttribute("placement")) {
      case "full":
      case "page":
        return "none";
      case "sidebar":
      case "side":
        return "width";
      default:
        return "both";
    }
  }

  /**
   * Which edges the layout is holding still, by measuring rather than guessing:
   * nudge the size by a pixel, see which edges stayed put, and undo. One forced
   * reflow per drag.
   *
   * `placement` cannot answer this — an embedded panel goes wherever the page's
   * CSS puts it — and see {@link createResizeHandle} for why guessing produces
   * a visibly broken control.
   */
  #measureAnchor(): ResizeAnchor {
    const before = this.getBoundingClientRect();
    const width = this.style.getPropertyValue("--ag-ui-width");
    const height = this.style.getPropertyValue("--ag-ui-height");
    this.#applySize({ width: before.width + 1, height: before.height + 1 });
    const after = this.getBoundingClientRect();
    // Restore exactly what was there, including "nothing" — leaving a probe
    // value behind would pin a panel that had been sizing itself.
    this.#restoreProperty("--ag-ui-width", width);
    this.#restoreProperty("--ag-ui-height", height);
    return {
      x: Math.abs(after.left - before.left) < 0.5 ? "left" : "right",
      y: Math.abs(after.top - before.top) < 0.5 ? "top" : "bottom",
    };
  }

  /** Stamp the measured anchor so the shadow CSS can place the grip. */
  #syncResizeAnchor(): void {
    if (!this.#connected) {
      return;
    }
    const anchor = this.#measureAnchor();
    this.setAttribute("data-resize-anchor", `${anchor.y}-${anchor.x}`);
  }

  /** Put a custom property back to a previous value, or remove it if there was none. */
  #restoreProperty(name: string, value: string): void {
    if (value === "") {
      this.style.removeProperty(name);
      return;
    }
    this.style.setProperty(name, value);
  }

  /**
   * Write a dragged size onto the host, on the axes this placement leaves free.
   *
   * Writing the custom property rather than inline `width` / `height` does not
   * by itself leave placement in charge: an inline custom property still
   * outranks a `:host([placement=…])` rule setting the same property, so a
   * height dragged while floating would cap a docked sidebar asking for
   * `100vh`. The cascade cannot arbitrate this, so the axis check must — a
   * placement owns the axes it fixes, and a persisted size is applied only to
   * the ones it leaves free.
   */
  #applySize(size: ResizeSize): void {
    const axis = this.#resizeAxis();
    if (axis === "none") {
      return;
    }
    if (size.width !== undefined) {
      this.style.setProperty("--ag-ui-width", `${size.width}px`);
    }
    if (size.height !== undefined && axis === "both") {
      this.style.setProperty("--ag-ui-height", `${size.height}px`);
    }
  }

  /**
   * Drop any dragged size the new placement has taken ownership of.
   *
   * Without this a size survives the switch as an inline property and silently
   * overrides the placement it moved to — the panel keeps a floating height
   * while docked, and reads as a component that cannot do full height.
   */
  #releaseOwnedAxes(): void {
    const axis = this.#resizeAxis();
    if (axis !== "both") {
      this.style.removeProperty("--ag-ui-height");
    }
    if (axis === "none") {
      this.style.removeProperty("--ag-ui-width");
    }
  }

  /** Persist a dragged size per tab, alongside the collapsed/theme preferences. */
  #persistSize(size: ResizeSize): void {
    const stored = { ...this.#readSize(), ...size };
    writeStoredItem(this.#storageKey(SIZE_KEY), JSON.stringify(stored));
  }

  /** The persisted size for this instance, or an empty record. */
  #readSize(): ResizeSize {
    const raw = this.#readScopedItem(SIZE_KEY);
    if (raw === null) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as ResizeSize) : {};
    } catch {
      // A corrupt entry is not worth failing a mount over; fall back to the
      // placement's own size.
      return {};
    }
  }

  /**
   * Claim this element's storage namespace: its `id`, else its `endpoint`.
   *
   * The endpoint fallback exists so a lone widget restores its conversation
   * across reloads with nothing asked of the page author. It stops working the
   * moment there are two of them — a docked support panel and an inline page
   * assistant against one agent mount, neither carrying an `id`, which nothing
   * requires — because both resolve to the same string and then share a thread
   * pointer, a drawer index and every message key. Whichever mounts second
   * adopts the first's active thread and rehydrates its transcript into its own
   * panel: one conversation's content inside another, on the same page.
   *
   * So the namespace is claimed by the first element to mount under it, and a
   * second is given one of its own plus a warning naming the fix. The first
   * element keeps the endpoint namespace, which is what leaves the ordinary
   * single-element case exactly as it was.
   *
   * The generated namespace is random rather than derived from mount order.
   * That costs the second element its history across reloads — the warning says
   * so, and an `id` fixes it — which is the honest trade against an order-based
   * name that would silently hand a stored conversation to whichever element
   * happened to mount second on the next load.
   */
  #claimNamespace(): string {
    const preferred = this.id !== "" ? this.id : this.endpoint;
    // Nothing to key on. The pre-namespacing global keys, as before: an element
    // with neither an id nor an endpoint cannot send anything, so what it would
    // be claiming is an empty conversation.
    if (preferred === "") {
      return "";
    }
    // Already lost this claim once. Keep the fallback rather than drifting back
    // onto a namespace the other element may since have released, which would
    // swap this panel's conversation for that one's.
    if (this.#generatedFor === preferred) {
      return this.#generatedNs;
    }
    if (!CLAIMED_NAMESPACES.has(preferred)) {
      CLAIMED_NAMESPACES.add(preferred);
      this.#claimedNs = preferred;
      return preferred;
    }
    this.#generatedFor = preferred;
    this.#generatedNs = `${preferred}~${randomUUID()}`;
    console.warn(
      `<ag-ui-chat>: another element on this page already stores its ` +
        `conversation under "${preferred}", so this one has been given a ` +
        "throwaway namespace of its own — the two would otherwise share a " +
        "thread pointer, a history drawer and every message. Give each " +
        "<ag-ui-chat> its own id to keep them apart and let this one restore " +
        "its conversation across reloads.",
    );
    return this.#generatedNs;
  }

  /**
   * The conversation store's namespace: this element's, scoped to the principal
   * {@link userKey} names.
   *
   * Only the conversation is principal-scoped. The panel's own collapsed / size
   * / theme preferences stay on `#storageNs`, because they are this element's
   * UI state rather than anyone's data — they carry no word of what was said —
   * and because they are read once while connecting, so re-scoping them under a
   * live element would rearrange the panel around a user who had only just
   * signed in.
   */
  #conversationNs(key: string = this.userKey): string {
    return key === "" ? this.#storageNs : `${this.#storageNs}#${key}`;
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
    const previous = this.#conversationNs(previousKey);
    const next = this.#conversationNs(nextKey);
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
    // The transcript on screen, the run in flight and the replayed history all
    // belong to the principal who just left. Purging storage without clearing
    // these would leave the previous user's conversation visible to the new one.
    this.#cancelRun();
    this.#resetState();
    this.#setRunning(false);
    this.#setUnread(0);
    this.#threadId = this.conversationStore.threadId();
    void this.#rehydrate();
    void this.#refreshDrawer();
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
    if (this.#builtinStore === null) {
      return;
    }
    this.#builtinStore = new SessionStorageStore(namespace);
    this.conversationStore = this.#builtinStore;
    this.#wireThreadStore();
  }

  /** This instance's namespaced form of an origin-scoped storage key. */
  #storageKey(base: string): string {
    return this.#storageNs === "" ? base : `${base}:${this.#storageNs}`;
  }

  /**
   * Read a namespaced origin-scoped value, falling back once to the legacy
   * pre-namespacing global key (left in place) so an existing collapsed/theme
   * preference survives the upgrade.
   */
  #readScopedItem(base: string): string | null {
    const scoped = sessionStorage.getItem(this.#storageKey(base));
    if (scoped !== null || this.#storageNs === "") {
      return scoped;
    }
    return sessionStorage.getItem(base);
  }

  /** Reflect the current theme on the toggle: show the destination's glyph. */
  #syncThemeGlyph(): void {
    const dark = this.getAttribute("theme") === "dark";
    this.#themeToggle.textContent = dark ? "☀️" : "🌙";
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
    // Two overlapping surfaces, so opening one dismisses the other. Clicking away
    // already covers the built-in buttons, but a host driving its own chrome
    // through these methods raises no pointer event — and the drawer would then
    // open *underneath* a popover still floating over it.
    this.#checkpoints.close();
    void this.#refreshDrawer();
    this.#drawer.open();
  }

  /**
   * Open the checkpoints panel (the `::part(checkpoints-button)` route).
   *
   * It lists the runs the `data-runs-url` server reports as continuable;
   * without that attribute the built-in button is never rendered and this opens
   * an empty panel.
   */
  openCheckpoints(): void {
    // The other half of the pair — see `openThreads`.
    this.#drawer.close();
    void this.#refreshCheckpoints();
    this.#checkpoints.open();
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
   */
  newChat(): void {
    // Stop any in-flight run first — discarding the client mid-run would
    // leave the old agent streaming into a cleared transcript.
    this.#cancelRun();
    // A thread nothing was ever sent in has nothing to come back to, and the
    // drawer never listed it — so reap it here rather than strand one record
    // per press of a button whose whole use is being pressed again.
    if (this.conversationStore.isUnsent?.(this.#threadId) === true) {
      this.conversationStore.clear(this.#threadId);
    }
    this.#resetState();
    this.#threadId = mintThread(this.conversationStore);
    this.#setRunning(false);
    this.#setUnread(0);
  }

  /** Drop the in-memory run + transcript, leaving the thread id untouched. */
  #resetState(): void {
    this.#client = null;
    this.#clearTranscript();
    this.#initialMessages = [];
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
    this.#endStream();
    this.#currentGroup = null;
    this.#thoughts = null;
    this.#hidePending();
    this.#toolCards.clear();
    this.#serverSettled.clear();
    this.#cardElements.clear();
    this.#activityBlocks.clear();
    this.#retryOwner = null;
    this.#attachTray?.clear();
    // Keep the empty-state region; everything else clears.
    this.#messages.replaceChildren(this.#emptyWrap);
    this.#updateEmptyState();
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
      this.#renderHistoricMessage(message);
    }
    await client.resume();
    return true;
  }

  /** Switch the active conversation to an existing thread and replay it. */
  async #switchThread(threadId: string): Promise<void> {
    if (threadId === this.#threadId) {
      return;
    }
    this.#cancelRun();
    this.#resetState();
    this.conversationStore.setActiveThread(threadId);
    this.#threadId = threadId;
    this.#setRunning(false);
    await this.#rehydrate();
  }

  /** Delete a thread; if it was the active one, fall back to a fresh chat. */
  #deleteThread(threadId: string): void {
    const wasActive = threadId === this.#threadId;
    if (wasActive) {
      this.#cancelRun();
    }
    this.conversationStore.clear(threadId);
    if (wasActive) {
      this.#resetState();
      this.#threadId = this.conversationStore.threadId();
      this.#setRunning(false);
    }
    void this.#refreshDrawer();
  }

  /** Reload the drawer's thread list, marking the active thread. */
  async #refreshDrawer(): Promise<void> {
    this.#drawer.setRelativeTimeFormatter(this.formatRelativeTime);
    this.#drawer.setThreads(await this.conversationStore.listThreads(), this.#threadId);
  }

  /**
   * Restore the conversation from the store on mount, then — if a navigating
   * tool reloaded the page mid-run — resume the loop by supplying that tool's
   * result from the page we landed on.
   */
  async #rehydrate(): Promise<void> {
    // Guard against a thread-switch race: with a slow remote store, picking
    // thread B then C would interleave both replays into one transcript. Each
    // rehydrate claims a generation before awaiting and bails if a newer one
    // started meanwhile (its `#resetState` already cleared the transcript).
    this.#rehydrateGeneration += 1;
    const generation = this.#rehydrateGeneration;
    const messages = await this.conversationStore.loadMessages(this.#threadId);
    if (generation !== this.#rehydrateGeneration) {
      return;
    }
    if (messages !== null) {
      this.#initialMessages = messages;
      for (const message of messages) {
        this.#renderHistoricMessage(message);
      }
    }
    const checkpoint = this.conversationStore.loadCheckpoint(this.#threadId);
    if (checkpoint !== null) {
      await this.#resumeFrom(checkpoint);
      return;
    }
    this.#noticeIfRunUnfinished(messages);
  }

  /**
   * Notice a previous run that never produced a response.
   *
   * {@link AgUiClient.send} persists the user's message before starting the
   * run, so a transcript ending on that user message means nothing came back.
   * The transcript's shape alone detects it, needing no store method and no
   * `pagehide` listener — neither of which fires on a crash or force-quit.
   *
   * An agent-initiated reload is not this case: a navigating tool leaves a
   * checkpoint and resumes, so the caller returns early on one.
   *
   * Deliberately a notice, never a resume. AG-UI has no resume-an-aborted-run
   * primitive, and re-sending the accumulated messages is semantically a new
   * run, so any server-side tool already executed would run a second time.
   */
  /**
   * Build a round's context, recording which page it describes.
   *
   * The AG-UI client re-invokes this at the top of **every** tool round, not
   * once per `send()`, so the page map the agent sees is already refreshed
   * between rounds and the href captured here is the page it was shown for
   * *this* round. {@link #executeTool} compares against it to catch a page that
   * moved under a round still in flight.
   */
  #buildContext(): Context[] {
    this.#contextHref = window.location.href;
    return this.getContext();
  }

  /**
   * Whether the page moved since the current round's context was built.
   *
   * `null` means no round has built context yet (nothing to compare), which is
   * not a move.
   */
  #pageMoved(): boolean {
    return this.#contextHref !== null && this.#contextHref !== window.location.href;
  }

  #noticeIfRunUnfinished(messages: readonly Message[] | null): void {
    const last = messages?.at(-1);
    if (last === undefined || last.role !== MESSAGE_ROLE.USER) {
      return;
    }
    this.#appendNotice("⚠", this.#strings.runInterrupted, "interrupted");
  }

  /**
   * Replay a restored message: text bubbles *and* tool activity. An assistant
   * turn may carry `toolCalls` (rendered as cards) and/or text; a `tool` turn
   * carries a result that settles the matching card. So a refreshed page shows
   * the full transcript — tool calls and their results — not just the prose.
   */
  #renderHistoricMessage(message: Message): void {
    const text = typeof message.content === "string" ? message.content : "";
    if (message.role === MESSAGE_ROLE.USER) {
      const attachments = messageAttachments(message);
      if (text !== "" || attachments.length > 0) {
        const bubble = this.appendMessage(MESSAGE_ROLE.USER, text);
        if (attachments.length > 0) {
          bubble.appendChild(renderAttachmentChips(attachments));
        }
      }
      return;
    }
    if (message.role === MESSAGE_ROLE.ASSISTANT) {
      if (text !== "") {
        // Restored history must appear statically — entrance animations
        // (fade / word) are for freshly-arriving messages. On reload the whole
        // transcript mounts at once, so animating every bubble's text in
        // parallel looks wrong. Mark it so the fade CSS skips it, and don't
        // wrap words.
        const restoredBubble = this.appendMessage(MESSAGE_ROLE.ASSISTANT, text);
        restoredBubble.classList.add("message--restored");
        this.#attachActions(restoredBubble);
      }
      // Narrowed rather than trusted, for the same reason `messageAttachments`
      // narrows the neighbouring field: anything that throws in this loop aborts
      // the replay at this message, and every later turn silently disappears from
      // the transcript. See `restoredToolCalls`.
      for (const call of restoredToolCalls(message.toolCalls)) {
        const restored = {
          id: call.id,
          name: call.function.name,
          args: this.#parseArgs(call.function.arguments),
        };
        // Restored history goes through the same interception as the live
        // stream — otherwise a reload resurrects the raw `load_capability`
        // card the live path deliberately replaced.
        if (this.#noticeIfSkillLoad(restored)) {
          continue;
        }
        this.#cardElements.set(restored.id, this.#cardFor(restored).element);
        // Only `render` is replayed, never `handler`. A restored transcript
        // redraws what the call drew; it must not re-run what the call *did*.
        // Only the renderer is handed over, never the tool. The guarantee that
        // a reload cannot re-run a tool's *effect* is worth more than a comment
        // saying so: this signature cannot reach `handler`, so a later
        // maintainer adding a "no render? fall back to the handler" convenience
        // here has to change the type first, which is exactly the moment the
        // question should be asked.
        const render = this.#resolveTool(restored.name)?.render;
        if (render !== undefined) {
          this.#renderToolOutput(render, restored);
        }
      }
      return;
    }
    if (message.role === "activity") {
      // The client materialises a pushed activity as a message of its own, so a
      // chart's data is in the transcript already and survives a reload. Only
      // the drawing had to be put back.
      const activity = message as unknown as { activityType?: unknown; content?: unknown };
      if (typeof activity.activityType === "string") {
        this.#drawActivity(message.id, activity.activityType, activity.content);
      }
      return;
    }
    if (message.role === "tool") {
      const card = this.#toolCards.get(message.toolCallId);
      if (card !== undefined) {
        card.settle(TOOL_CALL_STATUS.DONE, message.content);
      }
    }
  }

  /** Parse a tool call's JSON `arguments` from history into an object. */
  #parseArgs(raw: unknown): Record<string, unknown> {
    if (typeof raw !== "string") {
      // A restored call whose `arguments` are missing or not a string still has
      // a name worth showing, so this renders an empty-args card rather than
      // dropping the card.
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed history — fall back to empty args rather than failing replay.
    }
    return {};
  }

  /**
   * Word-by-word reveal for the `word` text-animation mode, applied to a
   * completed assistant bubble. `fade` is pure CSS (no JS); `none` is a no-op.
   */
  #revealWords(bubble: HTMLDivElement): void {
    if (this.getAttribute("data-text-animation") === "word") {
      wrapWords(bubble);
    }
  }

  /** Complete the checkpointed navigating tool call and continue the run. */
  async #resumeFrom(checkpoint: NavigationCheckpoint): Promise<void> {
    this.conversationStore.saveCheckpoint(this.#threadId, null);
    const client = this.#ensureClient();
    client.addToolResult(checkpoint.toolCallId, JSON.stringify(this.navigationResult(checkpoint)));
    await client.resume();
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
    const bubble = document.createElement("div");
    bubble.className = `message message--${role}`;
    bubble.setAttribute("part", `message message-${role}`);
    if (role === MESSAGE_ROLE.ASSISTANT) {
      bubble.innerHTML = renderMarkdown(content, { allowImages: this.allowImages });
      // A finished bubble: rehydrated history, or a whole message appended at
      // once. The streaming bubble gets its buttons in onTextEnd instead.
      attachCopyButtons(bubble, this.#strings);
      this.#ensureGroup().appendChild(bubble);
    } else {
      this.#currentGroup = null;
      bubble.textContent = content;
      this.#messages.appendChild(bubble);
    }
    this.#updateEmptyState();
    // A user bubble means someone just pressed Send, which is as deliberate as
    // pressing the jump button -- so it goes to the bottom even if they had
    // scrolled away to re-read something before typing.
    if (role === MESSAGE_ROLE.USER) {
      this.#scroller.jump();
    } else {
      this.#scroller.follow();
    }
    return bubble;
  }

  /**
   * The open answer group, creating and appending it on first use. Everything a
   * single assistant turn renders (text, tool cards, the pending indicator)
   * goes inside it, so the opt-in `data-answer-well` styling can box the whole
   * turn. Idempotent across the turn's runs — it persists until {@link #handlers}'
   * `onSettled` nulls it.
   */
  #ensureGroup(): HTMLDivElement {
    if (this.#currentGroup === null) {
      const group = document.createElement("div");
      group.className = "answer";
      group.setAttribute("part", "answer");
      this.#currentGroup = group;
      this.#messages.appendChild(group);
      this.#updateEmptyState();
    }
    return this.#currentGroup;
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
      header.append(this.#iconElement("icon", "icon", null));
    }

    // A coarse slot for host-provided header actions, between title and controls.
    const headerActions = document.createElement("slot");
    headerActions.name = "header-actions";

    const controls = document.createElement("div");
    controls.className = "header-controls";
    controls.setAttribute("part", "header-controls");

    // Both controls delegate to the public methods, so a host chrome driving
    // them imperatively takes exactly the path the built-in button takes.
    const history = this.#headerButton("history", this.#strings.chatHistory, "☰");
    history.addEventListener("click", () => this.openThreads());

    // ↺ rather than ⭯: the same idea in a glyph that has a font behind it in
    // every browser. The obscure one rendered as an unreadable mark at 14px, and a
    // header control nobody can name is one nobody presses.
    const checkpoints = this.#headerButton("checkpoints", this.#strings.checkpoints, "↺");
    checkpoints.addEventListener("click", () => this.toggleCheckpoints());

    const newChat = this.#headerButton("new", this.#strings.newChat, "✚");
    newChat.addEventListener("click", () => this.newChat());

    const collapse = this.#headerButton("collapse", this.#strings.collapse, "—");
    collapse.addEventListener("click", () => this.toggleCollapsed());

    // Only offered when the server actually indexes runs — without
    // `data-runs-url` there is nothing to continue and the button would open
    // a permanently empty panel. Asks `#runs()` rather than re-testing the
    // attribute, so "configured" means one thing everywhere (an empty value
    // is unset, not a relative URL to the current page).
    if (this.#runs() !== null) {
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
    this.#jumpButton.addEventListener("click", () => {
      this.#scroller.jump();
    });

    // Built here rather than at field initialisation: the viewport has to exist
    // and the observer has to have something to observe.
    this.#scroller = createStickToBottom({
      viewport: this.#messages,
      onMissedContent: (missed) => {
        this.#jumpButton.dataset["missed"] = String(missed);
      },
    });

    this.#announcer.className = "sr-only";
    this.#announcer.setAttribute("role", "status");
    this.#announcer.setAttribute("aria-live", "polite");
    // Atomic: each announcement replaces the last and is read whole. Without
    // it a reader may announce only the changed words between two statuses.
    this.#announcer.setAttribute("aria-atomic", "true");

    // Empty-state region: a host slot at the top of the list, hidden as soon as
    // anything renders.
    this.#emptyWrap.className = "empty";
    this.#emptyWrap.setAttribute("part", "empty");
    const emptySlot = document.createElement("slot");
    emptySlot.name = "empty";
    this.#emptyWrap.append(emptySlot);
    this.#messages.append(this.#emptyWrap);

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
      this.#glyphSlot("icon-send", "send-send", ICON_SEND),
      this.#glyphSlot("icon-stop", "send-stop", ICON_STOP),
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

    this.#skillHint.className = "skill-hint";
    this.#skillHint.setAttribute("part", "skill-hint");
    this.#skillHint.hidden = true;

    // File-upload affordance: a paperclip button (hidden until
    // `data-attachments-url` is wired) opening a hidden multi-file input.
    // Drag-and-drop covers the whole shell (wired in #enableDragAndDrop).
    this.#attachButton.className = "attach-btn";
    this.#attachButton.type = "button";
    this.#attachButton.setAttribute("part", "attach-button");
    this.#attachButton.append(this.#glyphSlot("icon-attach", "attach-glyph", ICON_ATTACH));
    this.#attachButton.title = this.#strings.attachFiles;
    this.#attachButton.setAttribute("aria-label", this.#strings.attachFiles);
    this.#attachButton.hidden = true;
    this.#attachButton.addEventListener("click", () => this.#fileInput.click());

    this.#fileInput.className = "attach-input";
    this.#fileInput.type = "file";
    this.#fileInput.multiple = true;
    this.#fileInput.hidden = true;
    this.#fileInput.addEventListener("change", () => this.#onFilesPicked());

    this.#attachSlot.className = "attachment-slot";

    // Mic button mount point (kept empty until #wireVoice mounts the control).
    this.#voiceSlot.className = "voice-slot";

    // A coarse footer slot below the composer.
    const footer = document.createElement("slot");
    footer.name = "footer";

    tools.append(this.#attachButton, this.#voiceSlot, this.#send);
    composer.append(this.#input, tools);
    inputRow.append(composer, this.#fileInput);
    // Skill surfaces sit just above the input: palette (opens on `/`), chips,
    // the missing-placeholder hint, and the pending-attachments tray.
    this.#messagesWrap.className = "messages-wrap";
    // Sibling of the list inside a shared box, not a child of it: the
    // affordance offering to scroll must not scroll away with the content.
    this.#messagesWrap.append(this.#messages, this.#jumpButton);

    this.#chat.append(
      header,
      this.#messagesWrap,
      this.#skillsMenu.palette,
      this.#skillsMenu.chips,
      this.#skillHint,
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
    this.#launcher.append(
      this.#iconElement("launcher", "launcher-icon", ICON_LAUNCHER, this.#launcherIconUrl()),
      this.#badge,
    );
    this.#launcher.addEventListener("click", () => this.setCollapsed(false));

    this.#chat.append(
      createResizeHandle({
        axis: () => this.#resizeAxis(),
        anchor: () => this.#measureAnchor(),
        rect: () => this.getBoundingClientRect(),
        apply: (size) => this.#applySize(size),
        commit: (size) => {
          this.#persistSize(size);
          // Re-stamp after the drag: a host whose layout changed underneath us
          // would otherwise keep the grip in the old corner, which reads as the
          // control being in the wrong place even though the drag was right.
          this.#syncResizeAnchor();
        },
        label: this.#strings.resizePanel,
      }),
    );
    this.#adoptStyles();
    this.#root.append(this.#announcer, this.#chat, this.#launcher);
  }

  /**
   * Attach the stylesheet without an inline `<style>` element.
   *
   * A host with a strict `style-src` and no `'unsafe-inline'` drops an injected
   * `<style>` silently: the component mounts, functions, and renders completely
   * unstyled, with nothing in the console to point at. `adoptedStyleSheets`
   * carries no inline-style origin, so it is unaffected by that policy.
   *
   * The sheet is constructed **per instance** rather than shared at module
   * scope. A shared sheet would additionally avoid re-parsing the stylesheet
   * once per mounted element, which is what `adoptedStyleSheets` is usually
   * reached for -- but a module-level singleton is exactly what this package
   * forbids, and the CSP defect is fixed either way. Per instance is no worse
   * than the `<style>` element it replaces, which also parsed once per mount.
   *
   * No fallback: constructible `CSSStyleSheet` is Chrome 73, Firefox 101 and
   * Safari 16.4, all below this package's declared Safari 17 runtime target. A
   * guard here would be code no supported browser can reach, and the only way
   * to keep it would be to exempt it from the coverage gate.
   */
  /**
   * Say one short thing to a screen reader, without touching the transcript.
   *
   * The transcript cannot do this job. It is rewritten on every animation
   * frame while an answer streams, so as a live region it re-announced the
   * whole answer tens of times per turn -- not merely unhelpful but actively
   * hostile. The published fix for this exact bug (Microsoft's Bot Framework
   * WebChat #3236) is architectural rather than a matter of tuning attributes:
   * demote the visible transcript out of live-region duty and put one
   * synthesised status per event into a separate invisible region. MDN and
   * Scott O'Hara prescribe the same empty-region-then-inject shape.
   *
   * Roughly four calls land per turn -- responding, answered, a card is waiting,
   * stopped or failed -- so the user is told what happened and reads the answer
   * itself by navigating the log, at their own pace, rather than having it
   * shouted at them a token at a time.
   *
   * **The clear is load-bearing, twice.** A reader announces a live region when
   * its content *changes*, so setting the same string twice running -- two turns
   * in a row both starting -- is not a change and is silently not announced.
   * Emptying first makes the next set a change again. It also stops a stale
   * status being read out when a reader later lands on the region.
   */
  #announce(message: string): void {
    if (this.#announceTimer !== null) {
      clearTimeout(this.#announceTimer);
    }
    this.#announcer.textContent = message;
    this.#announceTimer = setTimeout(() => {
      this.#announceTimer = null;
      this.#announcer.textContent = "";
    }, ANNOUNCE_CLEAR_MS);
  }

  #adoptStyles(): void {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(STYLES);
    this.#root.adoptedStyleSheets = [sheet];
  }

  /**
   * Build a header control button: a named slot a host can project markup into,
   * with the built-in glyph as the slot's fallback.
   *
   * The slot is what lets a host replace the mark with its own `<img>` or
   * `<svg>` rather than only restyle it through the `part`; the same
   * slot-with-fallback idiom the header icon uses.
   */
  #headerButton(modifier: string, label: string, glyph: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `header-btn header-btn--${modifier}`;
    button.setAttribute("part", `header-button ${modifier}-button`);
    button.title = label;
    button.setAttribute("aria-label", label);
    const slot = document.createElement("slot");
    slot.name = `icon-${modifier}`;
    slot.append(document.createTextNode(glyph));
    button.append(slot);
    return button;
  }

  /**
   * A `<slot>` a host can project its own mark into, falling back to one of the
   * built-in glyphs. The markup is an author-written constant, never user or
   * server data, so it is assigned directly rather than sanitised.
   */
  #glyphSlot(slotName: string, className: string, markup: string): HTMLSlotElement {
    const slot = document.createElement("slot");
    slot.name = slotName;
    slot.className = className;
    slot.innerHTML = markup;
    return slot;
  }

  /**
   * The launcher's own image URL. `data-launcher-icon-url` lets the collapsed
   * button carry a different mark from the header's — a product logo reads at
   * 22px in a header bar but rarely at 26px in a circle — and falls back to the
   * header icon so a single `data-icon-url` still feeds both.
   */
  #launcherIconUrl(): string | null {
    return this.getAttribute("data-launcher-icon-url") ?? this.getAttribute("data-icon-url");
  }

  /**
   * An icon holder wrapping a `<slot>` so a host can project custom markup;
   * with an `<img>` as the slot's fallback when an icon URL is configured, or
   * the given glyph markup when it is not.
   */
  #iconElement(
    slotName: string,
    part: string,
    fallbackGlyph: string | null,
    iconUrl: string | null = this.getAttribute("data-icon-url"),
  ): HTMLSpanElement {
    const holder = document.createElement("span");
    holder.className = "icon-holder";
    holder.setAttribute("part", part);
    const slot = document.createElement("slot");
    slot.name = slotName;
    if (iconUrl !== null) {
      const img = document.createElement("img");
      img.className = "icon-img";
      img.src = iconUrl;
      img.alt = "";
      slot.append(img);
    } else if (fallbackGlyph !== null) {
      slot.innerHTML = fallbackGlyph;
    }
    holder.append(slot);
    return holder;
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
    this.#badge.hidden = unread === 0 || !this.#badgeEnabled();
    const label = this.#badge.hidden
      ? this.#strings.expand
      : this.#strings.expandUnread.replace("{count}", String(unread));
    this.#launcher.setAttribute("aria-label", label);
    this.#launcher.title = label;
  }

  /**
   * The unread badge, unlike every other affordance here, is on by default:
   * a collapsed widget is the one state where an answer can arrive with nothing
   * on screen to say so. `data-unread-badge="false"` turns it off for a host
   * that drives its own chrome from the `ag-ui-unread` event.
   */
  #badgeEnabled(): boolean {
    return this.getAttribute("data-unread-badge") !== "false";
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

  /** Hide the empty-state region once the message list holds anything else. */
  #updateEmptyState(): void {
    this.#emptyWrap.hidden = this.#messages.childElementCount > 1;
  }

  /** Forward input changes to the skills palette and clear any stale hint. */
  #onInput(): void {
    this.#skillsMenu.onInput(this.#input.value);
    this.#skillHint.hidden = true;
    this.#autoGrow();
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
    }
  }

  /**
   * Stop the in-flight run: decline any confirmation card awaiting a decision
   * (the loop is suspended on it), then cancel the client run — the abort
   * closes the streaming request, which is AG-UI's cancel (the server
   * observes the disconnect).
   */
  #cancelRun(): void {
    this.#confirmAbort?.abort();
    this.#client?.cancel();
  }

  /**
   * Swap the composer button between Send (idle) and Stop (running).
   *
   * The glyph is swapped by CSS from `data-state` — both are mounted — so this
   * only has to move the accessible name, which is the button's whole label now
   * that it carries no text.
   */
  #setRunning(running: boolean): void {
    this.#running = running;
    const label = running ? this.#strings.stop : this.#strings.send;
    this.#send.title = label;
    this.#send.setAttribute("aria-label", label);
    this.#send.dataset["state"] = running ? "running" : "idle";
  }

  /**
   * Size the field to its content: one row when empty, growing with what is
   * typed until the CSS ceiling takes over and it scrolls.
   *
   * Resetting to `auto` first is what makes it shrink again — `scrollHeight`
   * never reports less than the current height, so measuring without the reset
   * would ratchet the composer taller and never back down.
   */
  #autoGrow(): void {
    this.#input.style.height = "auto";
    this.#input.style.height = `${this.#input.scrollHeight}px`;
  }

  async #submit(): Promise<void> {
    // Ignore a submit while a run is in flight — the single choke point for
    // both Enter and the Send button. The button already turns into Stop, but
    // Enter has no such guard; without this it would start a second concurrent
    // SSE run that orphans the first (unabortable) and lets the second run's
    // settle sweep corrupt the first's still-pending tool cards.
    if (this.#running) {
      return;
    }
    const content = this.#input.value.trim();
    const attachments = this.#attachTray?.readyRefs() ?? [];
    // Allow an attachments-only message (no typed text), but nothing empty.
    if (content === "" && attachments.length === 0) {
      return;
    }
    this.#input.value = "";
    this.#autoGrow();
    // A file still uploading does not ride along — `readyRefs()` returns only
    // settled ones, and `clearReady()` deliberately keeps the rest for a
    // follow-up. Nothing said so, which is the whole defect: attachments are
    // frequently the entire point of the message, and the user had no way to
    // tell theirs had been left behind. Say it before dropping the chips,
    // while `hasPending()` still describes this send.
    if (this.#attachTray?.hasPending() === true) {
      this.#appendNotice(
        "\u{1F4CE}",
        this.#strings.attachmentsStillUploading.replace(
          "{n}",
          String(this.#attachTray.pendingCount()),
        ),
        "attachment-pending",
      );
    }
    // The refs ride the message from here; drop the settled chips, keep any
    // still uploading for a follow-up message.
    this.#attachTray?.clearReady();
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
    if (this.#attachTray === null) {
      return false;
    }
    this.#attachTray.add(file);
    return true;
  }

  /** Tell the host what the tray now holds — see {@link ATTACHMENT_EVENT}. */
  #dispatchAttachments(tray: AttachmentTray): void {
    this.dispatchEvent(
      new CustomEvent<AttachmentsDetail>(ATTACHMENT_EVENT, {
        detail: { attachments: tray.readyRefs(), pending: tray.pendingCount() },
        bubbles: true,
        composed: true,
      }),
    );
  }

  async #client_send(content: string, attachments: readonly AttachmentRef[]): Promise<void> {
    if (this.endpoint === "") {
      return;
    }
    await this.#ensureClient().send(content, attachments);
  }

  #ensureClient(): AgUiClient {
    if (this.#client === null) {
      const agent = this.agentFactory({
        endpoint: this.endpoint,
        headers: this.#requestHeaders(),
        // Live getter: the client is built once and cached, but a rotated
        // token must still reach every request — the factory's fetch wrapper
        // re-reads this on each call.
        getHeaders: () => this.#requestHeaders(),
        trustedOrigins: this.trustedOrigins,
        ...this.#credentialsOption(),
        threadId: this.#threadId,
        initialMessages: this.#initialMessages,
        initialState: this.#sharedState,
      });
      this.#client = new AgUiClient({
        agent,
        handlers: this.#handlers(),
        getTools: () => this.#advertiseTools(),
        getContext: () => this.#buildContext(),
        executeTool: (call) => this.#executeTool(call),
        resolveInterrupts: (interrupts) => this.#resolveInterrupts(interrupts),
        onPersist: (messages) => this.conversationStore.saveMessages(this.#threadId, messages),
        onStateChanged: (state) => this.#onSharedStateChanged(state),
        connectionLostMessage: this.#strings.connectionLost,
      });
    }
    return this.#client;
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
   * Give a finished assistant bubble its action row, and hand it Retry.
   *
   * Every finished bubble gets copy and feedback -- both are safe on a message
   * of any age. Retry moves to the newest, because it is the only one where
   * re-running answers the same question rather than rewriting history.
   */
  #attachActions(bubble: HTMLDivElement, options: { rateable?: boolean } = {}): void {
    attachMessageActions(bubble, {
      strings: this.#strings,
      // Read at click time, not captured: a bubble rendered from markdown holds
      // its text in the DOM, and that is what the user sees and means to copy.
      text: () => bubble.textContent as string,
      // A failed run is copyable -- error text is what people paste into a bug
      // report -- but not rateable: a rating is a statement about an *answer*,
      // and mixing "the connection dropped" into that signal makes the host's
      // feedback data say less than it did before.
      ...(options.rateable === false
        ? {}
        : {
            onFeedback: (rating: "up" | "down") => {
              this.dispatchEvent(
                new CustomEvent<FeedbackDetail>(FEEDBACK_EVENT, {
                  detail: { content: bubble.textContent as string, rating },
                  bubbles: true,
                  composed: true,
                }),
              );
            },
          }),
    });
    this.#moveRetryTo(messageActionBar(bubble, this.#strings));
  }

  /** Move the Retry button onto `bar`, taking it off whoever held it. */
  #moveRetryTo(bar: HTMLElement): void {
    this.#retryOwner?.querySelector(".message-action--retry")?.remove();
    const retry = messageActionButton("retry", this.#strings.retryMessage, "\u21BB");
    retry.addEventListener("click", () => {
      void this.retryLastTurn();
    });
    // First in the row: it is the action a reader reaches for when the answer
    // was wrong, which is when they are least inclined to hunt for a control.
    bar.prepend(retry);
    this.#retryOwner = bar;
  }

  /**
   * Which rule gates `call`, or `null` when it runs straight through.
   *
   * The rule, rather than a bare boolean, because it decides whether the user
   * may *waive* the prompt for the rest of the session. Only the default
   * `x-destructive` gate is waivable: `confirmPredicate` is documented as
   * authoritative, so letting one click retire it would silently defeat a host
   * policy — and the session allowlist is consulted on the same path it can
   * be added from, so the button is never offered where honouring it would be
   * refused.
   */
  async #confirmationRule(call: AgUiToolCall, tool: ClientTool): Promise<ConfirmationRule | null> {
    if (this.autoConfirm) {
      return null;
    }
    if (this.confirmPredicate !== null) {
      return (await this.confirmPredicate(call.name, call.args)) === true ? "predicate" : null;
    }
    if (this.#sessionApproved.has(call.name)) {
      return null;
    }
    return isDestructive(tool.parameters) ? "destructive" : null;
  }

  async #executeTool(call: AgUiToolCall): Promise<ToolExecution | null> {
    // A skill load already rendered as a notice on the stream; it is never a
    // client tool and its result is pydantic-ai's business, so it must not
    // acquire a card here on the way to the no-result fallback below.
    if (skillNameFrom(call) !== null) {
      return null;
    }
    const card = this.#cardFor(call);
    this.#toolCards.delete(call.id);
    // Kept after the card leaves `#toolCards`: a tool that renders into the
    // transcript places itself against its own card, and by the time it runs the
    // card is no longer reachable by id.
    this.#cardElements.set(call.id, card.element);
    // Scoped out of this round's catalog ⇒ not a frontend tool of ours, for
    // this round. A host that offers `delete_record` only on the page where
    // deleting makes sense has said something about *this* run, and a call
    // arriving anyway (a hallucinated name, or one steered by text the model
    // just read) must not find the handler that happens to be registered
    // mount-wide. Treated exactly as an unknown name rather than as a refusal:
    // withholding a tool and never registering it are the same statement, and
    // the branch below already says the honest thing for both.
    const tool = this.#advertisedTools.has(call.name) ? this.#resolveTool(call.name) : null;
    if (tool === null) {
      // Not a client tool. A server-side tool's real output arrives via
      // `onToolResult` (TOOL_CALL_RESULT) and already settled the card — only
      // fall back when it didn't. When no result ever arrived, the call wasn't
      // executed by either side (no handler, no server result), so say so
      // honestly rather than claiming server execution. We do NOT show the
      // pending indicator: nothing here triggers another client round, so it
      // would hang after the run ended.
      if (!this.#serverSettled.has(call.id)) {
        card.settle(TOOL_CALL_STATUS.DONE, this.#strings.noResult);
      }
      return null;
    }
    // The page moved under this round. Acting now would target whatever
    // matches on the new page, and the case worth preventing is a same-named
    // control matching silently — the only way the agent acts on the wrong page
    // without either side noticing.
    //
    // Must precede the confirmation prompt, so the user is never asked to
    // approve an action about to be refused. Navigating tools are exempt, since
    // moving the page is their job, as is read_page, the documented recovery.
    // Gated on a page-map provider: without one there is no read_page to
    // recommend and the host's tools are not page-scoped anyway.
    if (
      this.getPageMap !== null &&
      call.name !== READ_PAGE_TOOL &&
      !isNavigates(tool.parameters) &&
      this.#pageMoved()
    ) {
      const message = this.#strings.pageMoved;
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      this.#showPending();
      return { content: `Error: ${message}`, error: message };
    }
    const rule = await this.#confirmationRule(call, tool);
    if (rule !== null) {
      const request: ConfirmationRequest = { toolName: call.name, args: call.args };
      const confirmText = tool.parameters[X_CONFIRM_KEY];
      if (typeof confirmText === "string") {
        request.message = confirmText;
      }
      // The run loop is suspended on this card; a Stop while it's open aborts
      // the controller, resolving the decision as declined.
      this.#confirmAbort = new AbortController();
      // Into the turn's answer group, like every other inline card. Appending
      // to the message list made it a sibling *after* the group, so anything
      // that streamed afterwards rendered above it and the prompt drifted to
      // the foot of the turn no matter when it was asked.
      const decision = requestConfirmation(this.#ensureGroup(), request, {
        signal: this.#confirmAbort.signal,
        strings: this.#strings,
        // Offered only where it can be honoured -- see `#confirmationRule`.
        ...(rule === "destructive"
          ? { onAlwaysAllow: () => this.#sessionApproved.add(call.name) }
          : {}),
      });
      this.#updateEmptyState();
      this.#scroller.follow();
      const accepted = await decision;
      this.#confirmAbort = null;
      card.recordDecision(accepted ? "approved" : "declined");
      if (!accepted) {
        const message = this.#strings.declinedAction;
        card.settle(TOOL_CALL_STATUS.DECLINED, message);
        this.#showPending();
        return { content: message };
      }
    }
    // A navigating tool reloads only without a client-side router; with a
    // host `navigate()` (SPA) it routes in-page and the loop just continues.
    const navigates = isNavigates(tool.parameters) && this.navigate === null;
    if (navigates) {
      // Checkpoint before the handler reloads the page; the history (incl.
      // this tool call) was already persisted when the run that produced it
      // settled. The result is supplied on the next mount via the resume path.
      this.conversationStore.saveCheckpoint(this.#threadId, { toolCallId: call.id });
    }
    try {
      // The call id lets a handler that renders into the transcript find its
      // own card; handlers that only act on the page ignore it.
      const result = await tool.handler(call.args, call.id);
      // Drawn from the arguments rather than the result, so the live path and
      // the replay path render the same thing from the same input.
      if (tool.render !== undefined) {
        this.#renderToolOutput(tool.render, call);
      }
      if (navigates) {
        card.settle(TOOL_CALL_STATUS.DONE, this.#strings.navigating);
        return { content: "", halt: true };
      }
      const content = JSON.stringify(result ?? null);
      card.settle(TOOL_CALL_STATUS.DONE, content);
      this.#showPending();
      return { content };
    } catch (error) {
      if (navigates) {
        // The navigation never happened; drop the dangling checkpoint.
        this.conversationStore.saveCheckpoint(this.#threadId, null);
      }
      // The handler's own message, verbatim, in two places at once: the card,
      // which the user sees, and the tool result, which goes to the endpoint,
      // is persisted there and is replayed to the model on every later round.
      // Kept verbatim because a real reason is what lets the agent recover —
      // and said out loud on `registerTool`, because the second destination is
      // invisible from the host's side and is not one it can take back.
      const message = error instanceof Error ? error.message : String(error);
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      this.#showPending();
      return { content: `Error: ${message}`, error: message };
    }
  }

  /**
   * Render an approval card per server-side-tool interrupt and collect the
   * user's decisions (approve → run it, deny → decline it).
   *
   * **One card per gated call, in that call's own tool card, all at once.** A run
   * can defer several calls, and the wire answers each independently — so the UI
   * has to let a person answer each independently, which means saying which is
   * which. The prompt cannot: it comes from the tool's `x-confirm` and is
   * identical for every call of that tool. The tool card can, by position, and it
   * is already showing the arguments. Asking them serially was the other half of
   * the problem: the second question only appeared once the first was answered,
   * so a person could neither compare them nor tell that more were coming.
   *
   * Each gated card is marked `deferred` for the wait. That is not cosmetic — at
   * `pending` it read "running…" while the stream was over and the server idle.
   *
   * The run is suspended on these cards. A Stop while any is open aborts the
   * shared {@link #confirmAbort} controller, resolving every still-open card as
   * denied. An approved tool runs on the follow-up resume run and streams its
   * result into the same card (returned to `pending`, since it now really is
   * running); a denied one settles here, as no result will ever arrive.
   */
  async #resolveInterrupts(
    interrupts: readonly Interrupt[],
  ): Promise<Record<string, InterruptResponse>> {
    // One controller covers the whole batch: a single Stop denies all of them.
    this.#confirmAbort = new AbortController();
    // The run has stopped and is waiting on a person. Nothing else on screen
    // says so to a screen reader: the cards appear inside the transcript, which
    // is deliberately not a live region, so without this the run simply goes
    // quiet and the user has no reason to go looking.
    this.#announce(
      this.#strings.announceAwaitingDecision.replace("{count}", String(interrupts.length)),
    );
    this.#hidePending();
    const signal = this.#confirmAbort.signal;
    const answered = await Promise.all(
      interrupts.map(async (interrupt) => {
        const card =
          interrupt.toolCallId !== undefined
            ? this.#toolCards.get(interrupt.toolCallId)
            : undefined;
        const request: ApprovalRequest = {};
        const phrase = confirmPhrase(interrupt) ?? interrupt.message;
        if (phrase !== undefined) {
          request.message = phrase;
        }
        const toolName = card?.element.getAttribute("data-tool-name");
        if (toolName !== null && toolName !== undefined) {
          request.toolName = toolName;
        }
        // Offered only where it can be honoured: the host has said its agent
        // accepts `editedArgs`, and this interrupt named a call whose arguments
        // we still hold.
        let editedArgs: Record<string, unknown> | undefined;
        const editable = this.approveWithEdits && card !== undefined;
        if (editable) {
          request.args = card.args;
        }
        card?.mark(TOOL_CALL_STATUS.DEFERRED);
        // A host-supplied renderer takes full control of the approval UI. The
        // built-in card renders into the gated call's own card, falling back to
        // the answer group when the interrupt names no call we hold one for.
        const approved =
          this.approvalRenderer !== null
            ? await this.approvalRenderer(request, { signal })
            : await requestApproval(card?.approvalSlot ?? this.#ensureGroup(), request, {
                signal,
                strings: this.#strings,
                ...(editable
                  ? {
                      onEdit: (args: Record<string, unknown>) => {
                        editedArgs = args;
                      },
                    }
                  : {}),
              });
        // Same annotation as the client-side confirmation gate. Without it the
        // two gates read differently for the same act: a locally-confirmed call
        // said who let it through and a server-gated one said nothing, which is
        // backwards, since the server-side gate is the one guarding the tools
        // that actually run on the backend.
        card?.recordDecision(approved ? "approved" : "declined");
        if (approved) {
          card?.mark(TOOL_CALL_STATUS.PENDING);
        } else {
          // No TOOL_CALL_RESULT will stream for a denied tool — settle its card
          // now rather than leaving it hanging until the onSettled sweep.
          card?.settle(TOOL_CALL_STATUS.DECLINED, this.#strings.declinedAction);
        }
        return { id: interrupt.id, approved, editedArgs };
      }),
    );
    this.#updateEmptyState();
    this.#scroller.follow();
    this.#confirmAbort = null;
    const responses: Record<string, InterruptResponse> = {};
    for (const { id, approved, editedArgs } of answered) {
      // `editedArgs` rides only when the user actually changed something, so a
      // server can tell "approved as proposed" from "approved, but like this".
      responses[id] = approved
        ? {
            status: "resolved",
            payload: editedArgs === undefined ? { approved: true } : { approved: true, editedArgs },
          }
        : { status: "cancelled" };
    }
    return responses;
  }

  #handlers(): AgUiClientHandlers {
    return {
      onRunStart: () => {
        // Per *round*, so guard on the turn: a run that calls three tools fires
        // this three times and the user needs telling once.
        if (!this.#running) {
          this.#announcedOutcome = false;
          this.#announce(this.#strings.announceResponding);
        }
        this.#setRunning(true);
        // Open the answer group on the turn's first run so the pending
        // indicator (and everything after) lands inside the well. Idempotent:
        // later rounds of the same turn reuse it.
        this.#ensureGroup();
        this.#showPending();
      },
      onReasoningStart: () => {
        // The model is thinking: swap the pending dots for a live thoughts
        // region at the top of the turn's answer group.
        this.#hidePending();
        this.#showThoughts();
      },
      onReasoningDelta: (buffer) => {
        this.#showThoughts().stream(buffer);
      },
      onReasoningEnd: () => {
        // Leave the region expanded until the answer text starts — it collapses
        // on the first text delta (onTextDelta).
      },
      onTextDelta: (buffer) => {
        this.#hidePending();
        // The answer has begun — fold the thoughts away so they don't crowd it.
        this.#thoughts?.collapse();
        this.#queueStream(buffer);
        // Counted per delta received, not per render: the word reveal asks
        // whether the answer *arrived* progressively, which coalescing renders
        // must not change the answer to.
        this.#streamDeltas += 1;
      },
      onTextEnd: (buffer) => {
        const bubble = this.#streamInto(buffer);
        // Only reveal word-by-word when the message arrived at once. If it
        // streamed across multiple deltas it already revealed progressively, so
        // wrapping it now would re-animate the whole message — the awkward
        // "finished response replays one word at a time" bug.
        if (this.#streamDeltas <= 1) {
          this.#revealWords(bubble);
        }
        attachCopyButtons(bubble, this.#strings);
        this.#attachActions(bubble);
        this.#endStream();
        this.#noteUnread();
      },
      onToolCall: (call) => {
        this.#hidePending();
        // A skill activation is an ordinary `load_capability` tool call — the
        // deferred-capability mechanism pydantic-ai already uses — so it arrives
        // here rather than on a channel of its own. Render it as a notice and
        // *return*: falling through would show a raw tool card beside the chip,
        // which is worse than the card alone.
        if (this.#noticeIfSkillLoad(call)) {
          return;
        }
        // Recorded after the skill-load return: a capability load is the agent
        // arranging itself, not work a host's data could have moved under.
        this.#runTools.push({ id: call.id, name: call.name });
        this.#cardFor(call);
      },
      onActivity: (activityType, content, messageId) => {
        this.#drawActivity(messageId, activityType, content);
      },
      onCustomEvent: (name, value) => {
        if (name === INVALIDATE_CUSTOM_NAME) {
          this.#dispatchInvalidation(value);
          return;
        }
        // Straight out to the host page, uninterpreted. This is the imperative
        // carrier: whatever it means, it means it to the page, not to the
        // transcript -- so it is dispatched and deliberately not rendered,
        // persisted or replayed. A host that does not know the name simply has
        // no listener, which is the graceful outcome the open field is for.
        this.dispatchEvent(
          new CustomEvent<CustomAgentDetail>(CUSTOM_AGENT_EVENT, {
            detail: { name, value },
            bubbles: true,
            composed: true,
          }),
        );
      },
      onMessagesSnapshot: () => {
        // Honoured for persistence and announced, not re-rendered.
        //
        // The store follows the server, because the server is authoritative
        // about what the conversation *is* -- and it would follow it anyway:
        // `@ag-ui/client` replaces `agent.messages` before any subscriber runs,
        // and the run loop persists `agent.messages`. What was wrong was that
        // it happened in silence, so the screen and the store disagreed and
        // nobody found out until a reload served a transcript they had never
        // seen. That is not reportable as a bug; it is reportable as "the chat
        // lost my messages".
        //
        // Re-rendering from the snapshot was the other candidate and is
        // declined: a snapshot can land mid-run, and rebuilding the transcript
        // then would destroy the in-flight run's own UI state -- the streaming
        // bubble, the open answer group, and every tool card keyed by call id,
        // some of which are still waiting on results. Telling the reader costs
        // none of that, and this is the same answer the same question already
        // got for compaction, one handler up.
        this.#appendNotice("\u{1F504}", this.#strings.historyReplaced, "history-replaced");
      },
      onToolResult: (toolCallId, content) => {
        const card = this.#toolCards.get(toolCallId);
        if (card === undefined) {
          return;
        }
        card.settle(TOOL_CALL_STATUS.DONE, content);
        this.#serverSettled.add(toolCallId);
        // The card stops being the live thing the moment it settles, and the
        // server goes straight back to the model with the result -- a wait with
        // nothing on screen to own it, and the longest one in a run when the
        // result is a large inlined attachment being re-sent with every request.
        // The dots go back where ``onToolCall`` took them from, after the card,
        // and whatever comes next clears them: reasoning, the first text delta,
        // the round ending, or ``onSettled``'s terminal guarantee.
        //
        // Not the same case as the one ``#executeTool`` refuses to show them
        // for. That runs after the run has ended, so there is nothing left to
        // clear them and they would hang -- which is what happened before 0.2.1
        // and is why they were removed from here too. The terminal guarantee
        // that shipped in the same release is what makes showing them safe now.
        this.#showPending();
      },
      onActivityChanged: (messageId, activityType, content) => {
        this.#drawActivity(messageId, activityType, content);
      },
      onRunEnd: () => {
        // Per-round end; the button stays on Stop until the whole interaction
        // settles — the user must be able to cancel between tool rounds.
        this.#hidePending();
        this.#endStream();
      },
      onError: (message) => {
        this.#announcedOutcome = true;
        this.#announce(this.#strings.announceFailed);
        this.#hidePending();
        const bubble = this.appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
        bubble.classList.add("message--failed");
        // A failure is the one message whose action row is only worth having
        // for Retry: there is nothing here worth copying and nothing to rate.
        // A dropped connection with no way back was the whole of the gap --
        // uploads had a retry and runs did not.
        //
        // Not a `run-notice`: that element's contract is that it "never
        // settles, takes no action, and carries no controls", and is explicitly
        // "distinct from an error, which is a failure". This is a failure, so
        // it stays an error and gains the control instead.
        this.#attachActions(bubble, { rateable: false });
        this.#revealWords(bubble);
        this.#endStream();
      },
      onCancelled: () => {
        // Deliberate stop, not a failure: keep whatever partial text already
        // streamed and add a muted note instead of an error bubble.
        this.#announcedOutcome = true;
        this.#announce(this.#strings.announceStopped);
        this.#hidePending();
        this.#appendStoppedNote();
        this.#endStream();
      },
      onSettled: () => {
        // Terminal guarantee: whatever path ended the run, return to rest.
        if (!this.#announcedOutcome) {
          this.#announce(this.#strings.announceAnswerReady);
        }
        this.#hidePending();
        this.#setRunning(false);
        this.#endStream();
        // Belt-and-suspenders: a tool card still pending at settle (e.g. a
        // server tool whose result never streamed because the connection
        // dropped) would hang forever — settle it to the no-result fallback.
        for (const card of this.#toolCards.values()) {
          if (!card.settled) {
            card.settle(TOOL_CALL_STATUS.DONE, this.#strings.noResult);
          }
        }
        // Close the turn's answer group. Drop it if the turn rendered nothing
        // (e.g. a server-only round that streamed no text/card) so an opted-in
        // well leaves no empty box behind.
        if (this.#currentGroup !== null && this.#currentGroup.childElementCount === 0) {
          this.#currentGroup.remove();
          this.#updateEmptyState();
        }
        this.#currentGroup = null;
        this.#thoughts = null;
        this.#dispatchRunFinished();
      },
    };
  }

  /**
   * Tell the host the interaction is over and what ran in it.
   *
   * Last thing in `onSettled`, so a listener that refetches sees a transcript
   * that has already stopped changing. `side` is read from the streamed-result
   * bookkeeping rather than from the tool list: whether a call executed on the
   * server is a fact about the run, and a name can appear on both sides across a
   * conversation.
   */
  #dispatchRunFinished(): void {
    const tools: ToolRun[] = this.#runTools.map(({ id, name }) => ({
      name,
      side: this.#serverSettled.has(id) ? "server" : "client",
    }));
    this.#runTools = [];
    const invalidated = [...this.#runInvalidated];
    this.#runInvalidated = new Set<string>();
    this.dispatchEvent(
      new CustomEvent<RunFinishedDetail>(RUN_FINISHED_EVENT, {
        detail: { tools, invalidated },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Route one invalidation to the host, and remember it for the run summary.
   *
   * Dispatched immediately rather than only at the end, because that is what
   * makes a long multi-step run feel live -- the list refreshes as the third of
   * eight writes lands. The accumulated set rides
   * {@link RUN_FINISHED_EVENT} as well, so a host that would rather refetch once
   * upgrades by reading one extra field instead of adding a listener.
   *
   * Nothing is rendered, persisted or replayed. An invalidation is an
   * imperative: it has no place in the transcript and no meaning once acted on,
   * and replaying one on every thread load would be a refetch storm. That is the
   * whole reason the server sends it as `CUSTOM` rather than as an activity.
   */
  #dispatchInvalidation(value: unknown): void {
    const payload = (value ?? {}) as { keys?: unknown; reason?: unknown };
    // Defensive about the payload, not about the name: `value` is typed
    // `unknown` by the protocol, so a server can put anything there, and a
    // malformed announcement must not take the run down with it.
    const keys = Array.isArray(payload.keys)
      ? payload.keys.filter((key): key is string => typeof key === "string")
      : [];
    if (keys.length === 0) {
      return;
    }
    for (const key of keys) {
      this.#runInvalidated.add(key);
    }
    this.dispatchEvent(
      new CustomEvent<InvalidateDetail>(INVALIDATE_EVENT, {
        detail: { keys, reason: typeof payload.reason === "string" ? payload.reason : null },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** A muted "⏹ Stopped" line in the transcript (distinct from the ⚠️ error bubble). */
  #appendStoppedNote(): void {
    const note = document.createElement("div");
    note.className = "stopped-note";
    note.setAttribute("part", "stopped");
    note.setAttribute("role", "status");
    note.textContent = this.#strings.stopped;
    this.#ensureGroup().appendChild(note);
    this.#updateEmptyState();
    this.#scroller.follow();
  }

  /**
   * Show a "thinking" indicator while the agent is being awaited — both the
   * silent stretch before the first token and the gap after a tool result
   * while the next round is requested. Idempotent.
   */
  #showPending(): void {
    if (this.#pending !== null) {
      return;
    }
    const pending = document.createElement("div");
    pending.className = "pending";
    pending.setAttribute("part", "pending");
    pending.setAttribute("role", "status");
    pending.setAttribute("aria-label", this.#strings.thinking);
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "pending-dot";
      pending.appendChild(dot);
    }
    this.#pending = pending;
    this.#ensureGroup().appendChild(pending);
    this.#updateEmptyState();
    this.#scroller.follow();
  }

  /** Remove the pending indicator if shown. */
  #hidePending(): void {
    this.#pending?.remove();
    this.#pending = null;
  }

  /**
   * The current turn's thoughts region, creating it (at the top of the answer
   * group, above any streamed text or tool cards) on first sight. Idempotent
   * across a turn's reasoning tokens.
   */
  #showThoughts(): ThoughtsBlock {
    if (this.#thoughts === null) {
      this.#thoughts = new ThoughtsBlock(this.#strings);
      const group = this.#ensureGroup();
      group.insertBefore(this.#thoughts.element, group.firstChild);
      this.#updateEmptyState();
      this.#scroller.follow();
    }
    return this.#thoughts;
  }

  /**
   * The bubble the current answer streams into, opening it on first sight.
   *
   * Opened the moment a token arrives rather than on the frame that draws it,
   * so the answer's container replaces the pending dots straight away and the
   * turn never shows a gap while the first render waits for a frame.
   */
  #openStream(): HTMLDivElement {
    if (this.#streamingBubble === null) {
      this.#streamingBubble = this.appendMessage(MESSAGE_ROLE.ASSISTANT, "");
      this.#streamDeltas = 0;
    }
    return this.#streamingBubble;
  }

  /**
   * Queue a render of the answer so far, at most one per frame.
   *
   * Each `TEXT_MESSAGE_CONTENT` event carries the *whole* accumulated answer,
   * and drawing it means marked + DOMPurify over the entire document and a
   * wholesale replacement of the bubble's subtree. Once per token that is
   * quadratic in the answer's length — a long answer is agent-controlled, so
   * an ordinary run becomes a progressively stalling tab — and every rebuild
   * takes any selection or focus inside the bubble with it.
   *
   * A frame is the right grain: it is the fastest anything on screen can
   * change anyway, so a burst of tokens costs one parse and the text still
   * appears to flow rather than in visible chunks.
   */
  #queueStream(buffer: string): void {
    this.#streamBuffer = buffer;
    this.#openStream();
    if (this.#streamFrame !== null) {
      return;
    }
    this.#streamFrame = requestAnimationFrame(() => {
      this.#streamFrame = null;
      this.#streamInto(this.#streamBuffer);
    });
  }

  /** Render `buffer` into the streaming bubble now, dropping any queued frame. */
  #streamInto(buffer: string): HTMLDivElement {
    // A frame still queued would otherwise fire after this and repaint the
    // bubble with whatever the last delta held — behind the buffer just drawn.
    if (this.#streamFrame !== null) {
      cancelAnimationFrame(this.#streamFrame);
      this.#streamFrame = null;
    }
    this.#streamBuffer = buffer;
    const bubble = this.#openStream();
    bubble.innerHTML = renderMarkdown(buffer, { allowImages: this.allowImages });
    this.#scroller.follow();
    return bubble;
  }

  /**
   * Close the current answer's streaming bubble.
   *
   * Draws a queued render first. A run that ends without a text end — a
   * cancel, an error, a round boundary — leaves the last delta sitting in the
   * queue, and simply dropping the bubble here would strand it: the partial
   * answer the user stopped mid-sentence would lose its final tokens, or be an
   * empty bubble above the stopped note.
   */
  #endStream(): void {
    if (this.#streamFrame !== null) {
      this.#streamInto(this.#streamBuffer);
    }
    this.#streamingBubble = null;
  }

  /**
   * The card for ``call``, creating and appending it on first sight.
   *
   * {@link AgUiClientHandlers.onToolCall} creates the card (pending) during the
   * run; {@link #executeTool} later retrieves the same card to settle it.
   */
  /**
   * Append an ambient run notice to the current group.
   *
   * Goes through {@link #ensureGroup} like a tool card so it lands *inside* the
   * assistant turn it annotates rather than floating between turns, and shares
   * the same pending-hide / scroll behaviour.
   */
  /**
   * Render a skill notice for a `load_capability` call; ``true`` when handled.
   *
   * Shared by the live stream and history replay so the transcript looks the
   * same before and after a reload.
   */
  #noticeIfSkillLoad(call: AgUiToolCall): boolean {
    const skill = skillNameFrom(call);
    if (skill === null) {
      return false;
    }
    this.#appendNotice("✨", this.#strings.usingSkill.replace("{name}", skill), "skill");
    return true;
  }

  #appendNotice(icon: string, text: string, kind: string): void {
    this.#ensureGroup().appendChild(renderRunNotice(icon, text, kind));
    this.#updateEmptyState();
    this.#scroller.follow();
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
    const first =
      !this.#activityRenderers.has(CHART_ACTIVITY_TYPE) && !this.#toolRegistry.has(CHART_TOOL_NAME);
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
   * Place a tool's rendered node against its own card.
   *
   * Anchored rather than appended because a client tool's handler does not run
   * until the round is over: appending would put the node after everything the
   * model said next, visibly detached from the call that produced it, and in a
   * different order than the same transcript takes on reload. The card was
   * created inline, in the right place, so anchoring makes *when* the handler
   * runs stop mattering.
   */
  #renderToolOutput(render: ChartRenderer, call: AgUiToolCall): void {
    let node: Node | null;
    try {
      node = render(call.args);
    } catch (error) {
      // `render` is consumer code and this runs inside the history replay, where
      // a throw abandons the loop and takes every later turn of the transcript
      // with it -- silently, and again on every reload. A chart that fails to
      // draw is worth losing; the rest of the conversation is not. Reported so
      // the failure is findable rather than merely survived.
      console.warn(`ag-ui-chat: render failed for tool ${call.name}`, error);
      return;
    }
    if (node === null) {
      return;
    }
    // `after` rather than an insert-or-append branch: both callers set the card
    // element immediately before calling, and a parentless anchor makes `after`
    // a no-op, so the alternative would be a branch nothing can reach.
    this.#cardElements.get(call.id)?.after(node);
    this.#afterTranscriptGrew();
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
    this.#activityRenderers.set(registration.type, registration);
    this.#unhandledActivityTypes.delete(registration.type);
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
    return [...this.#unhandledActivityTypes];
  }

  /**
   * Draw, replace or remove one activity, whatever kind it is.
   *
   * The single path for all three routes an activity arrives by -- pushed
   * (`onActivity`), patched (`onActivityChanged`) and replayed from history --
   * which is why the renderer contract has to be pure: the same content is
   * drawn again on every thread load.
   *
   * An unregistered type draws nothing and says nothing. That is the protocol's
   * own answer -- a client that does not know a name ignores the event -- and a
   * warning here would fire on every well-behaved forward-compatible server,
   * while a placeholder would put the protocol's growth in the user's face.
   * {@link unhandledActivityTypes} is the way to find out what arrived.
   */
  #drawActivity(messageId: string, activityType: string, content: unknown): void {
    const registration = this.#activityRenderers.get(activityType);
    if (registration === undefined) {
      this.#unhandledActivityTypes.add(activityType);
      return;
    }
    let node: Node | null;
    try {
      node = registration.render(content);
    } catch (error) {
      // `render` is consumer code and this runs inside the history replay,
      // where a throw abandons the loop and takes every later turn of the
      // transcript with it -- silently, and again on every reload. One activity
      // that fails to draw is worth losing; the rest of the conversation is not.
      console.warn(`ag-ui-chat: render failed for activity ${activityType}`, error);
      node = null;
    }
    if (node === null) {
      this.#removeActivity(messageId, activityType, registration.removedNotice, content);
      return;
    }
    const existing = this.#activityBlocks.get(messageId);
    if (existing === undefined) {
      this.#ensureGroup().appendChild(node as HTMLElement);
    } else {
      // Replaced rather than appended: a server redrawing under the same id
      // means *this one changed*, and a second copy below the first would read
      // as two measurements instead of one that moved.
      existing.replaceWith(node);
    }
    this.#activityBlocks.set(messageId, node as HTMLElement);
    this.#afterTranscriptGrew();
  }

  /**
   * Take away an activity whose content stopped being drawable.
   *
   * Leaving the old one up is the worst available answer: it shows values that
   * have been retracted, reading as current, and a reload drops it anyway
   * because the *stored* content is the version that could not be drawn. Live
   * and reload should agree, and both should say "gone".
   *
   * Removing is right; doing it in silence was not. A chart that had been drawn
   * simply disappeared, with no `console` call anywhere on the path -- which
   * nobody reports as a bug, they report as "the charts are flaky".
   */
  #removeActivity(
    messageId: string,
    activityType: string,
    notice: string | undefined,
    content: unknown,
  ): void {
    const had = this.#activityBlocks.has(messageId);
    this.#activityBlocks.get(messageId)?.remove();
    this.#activityBlocks.delete(messageId);
    console.warn(
      `ag-ui-chat: activity ${messageId} (${activityType}) was not drawable and has been ` +
        "removed. A chart's points must each be a finite JSON number; a numeric column " +
        "serialised as a string (a Decimal, typically) is rejected rather than coerced.",
      content,
    );
    // Only when something was on screen: content that never drew has no
    // disappearance to explain, and a notice for every rejected push is noise.
    if (had && notice !== undefined) {
      this.#appendNotice("\u{1F4C9}", notice, "chart-undrawable");
    }
  }

  #afterTranscriptGrew(): void {
    this.#updateEmptyState();
    this.#scroller.follow();
  }

  #cardFor(call: AgUiToolCall): ToolCallCard {
    const existing = this.#toolCards.get(call.id);
    if (existing !== undefined) {
      return existing;
    }
    // Prefer the tool's own `x-summary`; then an explicit `toolSummaries`
    // entry; then the fetched server catalog (`data-tools-url`). All cover
    // server-side tools whose schema never reached the browser.
    const labelled = this.#resolveTool(call.name)?.parameters[X_SUMMARY_KEY];
    const summary =
      typeof labelled === "string"
        ? labelled
        : (this.toolSummaries[call.name] ??
          this.#toolCatalog[call.name]?.summary ??
          prettifyToolName(call.name));
    const card = new ToolCallCard(call.name, call.args, summary, this.#strings);
    this.#toolCards.set(call.id, card);
    this.#ensureGroup().appendChild(card.element);
    this.#updateEmptyState();
    this.#scroller.follow();
    return card;
  }
}

/**
 * A server-authored question for a gated call, read off the interrupt's metadata.
 *
 * The question an AG-UI interrupt carries by default is the call itself, spelled
 * out: `Approve create_event({"title": "Design sync", …})?`. Accurate, and not
 * something to put in front of a person. A client-side confirmation has
 * `x-confirm` on the tool's schema for exactly this, so the same key is read here
 * — whichever end gates a call, the phrase comes from one place, and a server
 * that supplies none keeps the generated text.
 *
 * Narrowed rather than trusted: `metadata` is `Record<string, any>` on the wire,
 * so anything at all can arrive under that key, and a non-string would render as
 * "[object Object]" in the one place a person is being asked to allow a write.
 */
function confirmPhrase(interrupt: Interrupt): string | undefined {
  const phrase = interrupt.metadata?.[X_CONFIRM_KEY];
  return typeof phrase === "string" && phrase.trim() !== "" ? phrase : undefined;
}

/** One tool call as a restored assistant message carries it. */
/**
 * Why a client tool call is gated behind the confirmation card.
 *
 * Only `"destructive"` -- the default `x-destructive` gate -- may be waived for
 * the session. `confirmPredicate` is documented as authoritative, so a call it
 * gates keeps asking.
 */
type ConfirmationRule = "destructive" | "predicate";

interface RestoredToolCall {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments?: unknown };
}

/**
 * The tool calls a restored assistant turn carries, with anything shapeless dropped.
 *
 * Narrowing here rather than trusting the declared type, for three reasons that
 * point the same way.
 *
 * **`null` is a value this field really takes.** `@ag-ui/core` types `toolCalls`
 * as optional (`z.ZodOptional`), so TypeScript offers only `undefined` — but the
 * protocol's Python models declare `tool_calls: list[ToolCall] | None`, and a
 * server dumping them without `exclude_none` sends `null`. The two SDKs disagree
 * about the wire, and a client cannot afford to take either one's word for it.
 *
 * **A throw here costs the rest of the transcript.** This runs inside the replay
 * of stored history, one message at a time; an exception aborts the whole replay,
 * so a single bad entry silently truncates the conversation from that point on —
 * with no error state and nothing on screen to explain the gap.
 *
 * **Storage is untrusted anyway** — hand-edited, truncated, written by an older
 * version, or supplied by a host's own store. `messageAttachments` already takes
 * exactly this stance for the neighbouring field on the same message.
 */
function restoredToolCalls(value: unknown): readonly RestoredToolCall[] {
  return Array.isArray(value) ? value.filter(isRestoredToolCall) : [];
}

/** Whether an unknown history entry has enough shape to render a tool card. */
function isRestoredToolCall(value: unknown): value is RestoredToolCall {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const call = value as { id?: unknown; function?: { name?: unknown } };
  return typeof call.id === "string" && typeof call.function?.name === "string";
}

/**
 * The skill name a `load_capability` call activated, or `null` when the call is
 * something else.
 *
 * Every deferred capability loads through this one tool, so the id is a skill
 * name only when the project wired agent skills; another project's capability
 * id surfaces here too. Acceptable for a muted notice, and better than a
 * parallel signal — the id is exactly what the model selected.
 */
function skillNameFrom(call: AgUiToolCall): string | null {
  if (call.name !== LOAD_CAPABILITY_TOOL) {
    return null;
  }
  const id = (call.args as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id !== "" ? id : null;
}

/** The `removed` count from a compaction activity payload, or `null` if absent. */
function compactionRemoved(content: unknown): number | null {
  const removed = (content as { removed?: unknown } | null | undefined)?.removed;
  return typeof removed === "number" ? removed : null;
}
