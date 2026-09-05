import { randomUUID } from "@ag-ui/client";
import type { Context, Interrupt, Message, Tool } from "@ag-ui/core";
import {
  ANNOUNCE_CLEAR_MS,
  ATTACHMENT_EVENT,
  CHART_ACTIVITY_TYPE,
  COMPACTION_ACTIVITY_TYPE,
  CUSTOM_AGENT_EVENT,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  EDGE_MARGIN,
  FEEDBACK_EVENT,
  ICON_ATTACH,
  ICON_LAUNCHER,
  ICON_MOON,
  ICON_RETRY,
  ICON_SEND,
  ICON_STOP,
  ICON_SUN,
  INVALIDATE_CUSTOM_NAME,
  INVALIDATE_EVENT,
  LOAD_CAPABILITY_TOOL,
  MAX_TOOL_ROUNDS,
  MESSAGE_ACTIONS,
  MESSAGE_ROLE,
  PASTE_ATTACH_CHARS,
  READ_PAGE_TOOL,
  RUN_FINISHED_EVENT,
  SCREEN_EDGE_MARGIN,
  STATE_EVENT,
  SUBAGENT_CUSTOM_NAME,
  SUBAGENT_PHASE,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  THREADS_DOCK_MIN_WIDTH,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  TOOL_OUTCOME,
  UNREAD_EVENT,
  X_CONFIRM_KEY,
  X_SUMMARY_KEY,
} from "../constants.js";
import { fillTemplate } from "../skills/fill_template.js";
import { parseSkills } from "../skills/parse_skills.js";
import type { Skill } from "../skills/skill.js";
import {
  type ChatCorner,
  type ChatSurfaceReport,
  createChatSurfaceTools,
} from "../tools/chat_surface_tools.js";
import type { ChartRenderer } from "../tools/client_tool_registry.js";
import { type ClientTool, ClientToolRegistry } from "../tools/client_tool_registry.js";
import { isDestructive } from "../tools/is_destructive.js";
import { isNavigates } from "../tools/is_navigates.js";
import {
  createPageActionTools,
  PAGE_ACTIONS,
  type ResolvePageTarget,
} from "../tools/page_action_tools.js";
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
import { clampLauncher } from "../ui/clamp_launcher.js";
import { clampPanel } from "../ui/clamp_panel.js";
import { type ConfirmationRequest, requestConfirmation } from "../ui/confirmation_card.js";
import { copyPayload } from "../ui/copy_payload.js";
import { enableLauncherDrag } from "../ui/launcher_drag.js";
import {
  type ExpandCorner,
  type Extent,
  type LauncherBox,
  launcherPlacement,
  type ViewportBox,
} from "../ui/launcher_placement.js";
import {
  attachMessageActions,
  messageActionBar,
  messageActionButton,
} from "../ui/message_actions.js";
import { attachQuoteOffer, type PageQuoteOffer } from "../ui/page_quote_offer.js";
import { enablePanelDrag } from "../ui/panel_drag.js";
import { placeWidget } from "../ui/place_widget.js";
import { prettifyToolName } from "../ui/prettify_tool_name.js";
import {
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "../ui/question_card.js";
import { asQuote, quotableSelection } from "../ui/quote_selection.js";
import type { RelativeTimeFormatter } from "../ui/relative_time.js";
import { renderMarkdown } from "../ui/render_markdown.js";
import {
  createResizeHandle,
  gripName,
  type PanelRect,
  type ResizeAnchor,
  type ResizeAxis,
  type ResizeGrip,
  type ResizeSize,
} from "../ui/resize_handle.js";
import { wrapWords } from "../ui/reveal_words.js";
import { renderRunNotice } from "../ui/run_notice.js";
import { SkillsMenu } from "../ui/skills_menu.js";
import { createStickToBottom, type StickToBottom } from "../ui/stick_to_bottom.js";
import { STYLES } from "../ui/styles.js";
import { SubAgentPanel, type SubAgentPhase, type SubAgentUpdate } from "../ui/subagent_panel.js";
import { subAgentUpdate } from "../ui/subagent_update.js";
import { renderSuggestionChips } from "../ui/suggestion_chips.js";
import { ThoughtsBlock } from "../ui/thoughts_block.js";
import { ThreadDrawer } from "../ui/thread_drawer.js";
import {
  ToolCallCard,
  type ToolDisplayMode,
  type ToolPayloadFormatter,
} from "../ui/tool_call_card.js";
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
import { toolStatusFromOutcome } from "./tool_outcome.js";
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

/** Per-tab persistence key for a dragged launcher position. */
const LAUNCHER_KEY = "ag-ui-chat:launcher";

/** A stored `{ left, top }` pair, or null for anything that is not one. */
function asPoint(value: unknown): { readonly left: number; readonly top: number } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { left, top } = value as { left?: unknown; top?: unknown };
  return typeof left === "number" && typeof top === "number" ? { left, top } : null;
}

/**
 * Placements whose launcher can be dragged. The rest have nowhere to put it:
 * a sidebar collapses to a full-height edge rail, "embedded" and "page" hide
 * the launcher entirely and keep their header bar, and a full-bleed panel
 * covers the screen it would be opening into.
 */
const DRAGGABLE_PLACEMENTS = new Set([null, "", "floating", "bottom-left"]);

/**
 * Every edge and corner the panel can be dragged by. Corners last, so they sit
 * above the edge strips they overlap and win the pointer at the corners.
 */
const RESIZE_GRIPS: readonly ResizeGrip[] = [
  { y: "top" },
  { y: "bottom" },
  { x: "left" },
  { x: "right" },
  { x: "left", y: "top" },
  { x: "right", y: "top" },
  { x: "left", y: "bottom" },
  { x: "right", y: "bottom" },
];

/** Pixels between a selection and the offer to quote it. */
const QUOTE_GAP = 6;

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
   * The live delegation panels, keyed by the **parent's** `delegate_task` call
   * id — which is what the wire keys a sub-agent's progress on, so this map and
   * {@link #toolCards} answer to the same key.
   *
   * Kept beside the cards rather than on them, so a card stays a card: the tool
   * card holds the slot and this holds what went into it, the same division the
   * approval prompt already uses.
   */
  readonly #subagentPanels = new Map<string, SubAgentPanel>();
  /**
   * Which delegation each live `subagentRunId` belongs to.
   *
   * The protocol's closing events -- `SUBAGENT_FINISHED` and `SUBAGENT_ERROR`
   * -- carry the child's run id and nothing else, while everything drawn here
   * is keyed on the parent's `delegate_task` call id. `SUBAGENT_STARTED` is the
   * one event carrying both, so the pairing is recorded there and read back on
   * the close. A close naming a run this never saw open is dropped, which is
   * the same refusal a step for an undrawn card gets.
   */
  readonly #subagentRunDelegations = new Map<string, string>();
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
  /**
   * A zero-sized box carrying the host's viewport insets as padding, so they
   * can be read back as used pixel lengths. See the `.viewport-probe` rule for
   * why a custom property cannot be read directly.
   */
  readonly #viewportProbe = document.createElement("div");
  /** Return-to-foot affordance, shown only once something has been missed. */
  readonly #jumpButton = document.createElement("button");
  /**
   * Offer to quote the current selection, floated beside it.
   *
   * Shares {@link AgUiChat.#messagesWrap} with the jump button for the same
   * reason: it is positioned against the transcript, and must not scroll away
   * with the words it is pointing at.
   */
  readonly #quoteButton = document.createElement("button");
  /** What {@link AgUiChat.#quoteButton} would quote, while it is showing. */
  #quoting = "";
  /** The host-page offer, while one is attached; see {@link AgUiChat.offerQuoteInPage}. */
  #pageQuote: PageQuoteOffer | null = null;
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
  /** The rail's vertical caption. Rendered only by the sidebar's edge rail. */
  readonly #railLabel: HTMLSpanElement = document.createElement("span");
  // Answers that finished while the widget was collapsed. Expanding clears it.
  #unread = 0;
  /** Empty-state region at the top of the message list; hidden once anything renders. */
  readonly #emptyWrap: HTMLDivElement;
  /** Upload tray; created on connect only when `data-attachments-url` is set. */
  #attachTray: AttachmentTray | null = null;

  /**
   * Where the user dragged the launcher, in viewport coordinates, or null
   * while the host's own CSS still places it. Set means this element owns its
   * position -- see #applyLauncherPlacement for what that costs the host.
   */
  #launcherPos: { readonly left: number; readonly top: number } | null = null;
  /** What the user has sent this session, newest first, for arrow-key recall. */
  readonly #sentDrafts: string[] = [];
  /** Typed while a run was in flight, oldest first; sent when it settles. */
  readonly #queued: string[] = [];
  /** The row those show up in, above the composer. */
  readonly #queuedRow: HTMLDivElement = document.createElement("div");
  /** How far back the composer has been walked; null while the user is typing. */
  #recallIndex: number | null = null;

  /**
   * Where the user dragged the *panel*, in viewport coordinates, or null while
   * its position is still derived from the launcher's.
   *
   * The two gestures state different things and are restored differently. A
   * launcher drag says where the bubble goes and leaves the panel to open into
   * whatever space the viewport has, so it is re-derived every time -- which is
   * what lets a widget re-decide its direction when the window changes under
   * it. A header drag states the panel's own position, and re-deriving that
   * from the launcher would move the panel the user just placed.
   */
  #panelPos: { readonly left: number; readonly top: number } | null = null;

  /**
   * The corner the panel opens away from, once this element is placing itself.
   * Null means the host's layout still decides, and the anchor is measured.
   */
  #expandCorner: ExpandCorner | null = null;

  /**
   * The edges the layout is holding still, as last measured. Cached because a
   * resize reads it per pointer move and measuring forces a reflow -- thirty a
   * second while the panel is already being laid out on every one of them.
   */
  #anchor: ResizeAnchor = { x: "right", y: "bottom" };

  /** The eight grips, by name, so the keyboard-reachable one can be moved. */
  readonly #resizeHandles = new Map<string, HTMLDivElement>();

  /**
   * Re-clamp the dragged launcher when the window changes size. Bound once as
   * a field so `removeEventListener` on disconnect gets the same reference.
   */
  readonly #onViewportResize = (): void => {
    this.#publishVisualViewport();
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
    if (this.#dragging()) {
      return;
    }
    this.#restoreLauncherPosition();
    // Docking is decided by width, so a resize can cross the threshold with
    // the drawer already open. Without this the rail keeps a narrow
    // transcript's width, the focus trap stays off, and the backdrop that
    // would dismiss it is still display:none. Only while it is open: the two
    // are re-decided on the way in, and a closed drawer has no layout to fix.
    if (this.#drawer.isOpen()) {
      this.#drawer.setModal(!this.#threadsDock());
      this.#syncThreadsState();
    }
  };

  /**
   * Hold a resized box inside the part of the screen the host left free.
   *
   * Each edge on its own, unlike the drag's clamp: a drag moves a box of fixed
   * size, so pushing it back in is right, while a resize is anchored on the
   * opposite edge and pushing it back would move the edge the user is not
   * touching. Bounding each edge instead leaves the grip stopped at the limit
   * -- the gesture keeps going and the panel simply stops growing, which is
   * what dragging already does.
   *
   * The minimum size is the grip's own concern and is applied before this, so
   * a panel that cannot fit the space is left at its minimum and overflowing
   * rather than collapsed to nothing.
   */
  #withinViewport(box: PanelRect): PanelRect {
    const viewport = this.#viewport();
    // The same bound a drag stops at, so a grip pulled to the edge and a panel
    // dragged to it come to rest on the same line. The inner Math.max/min pair
    // keeps an already-inverted box from turning inside out.
    const left = viewport.left + SCREEN_EDGE_MARGIN;
    const top = viewport.top + SCREEN_EDGE_MARGIN;
    const right = viewport.left + viewport.width - SCREEN_EDGE_MARGIN;
    const bottom = viewport.top + viewport.height - SCREEN_EDGE_MARGIN;
    return {
      left: Math.min(Math.max(box.left, left), box.right),
      top: Math.min(Math.max(box.top, top), box.bottom),
      right: Math.max(Math.min(box.right, right), box.left),
      bottom: Math.max(Math.min(box.bottom, bottom), box.top),
    };
  }

  /**
   * Whether a pointer or key gesture is currently placing the widget.
   *
   * Read from the stamp the drag helpers already set, rather than tracked
   * separately: one source of truth, and it clears on `pointercancel` as well
   * as `pointerup`, which is the end a touch gesture usually gets.
   */
  #dragging(): boolean {
    return (
      this.#launcher.hasAttribute("data-dragging") ||
      this.#root.querySelector(".header[data-dragging]") !== null
    );
  }
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
      onVisibility: () => {
        this.#syncThreadsState();
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
      // Position is owned the same way a size is: a placement that places
      // itself takes back a launcher the user had dragged somewhere else.
      this.#releaseLauncherPosition();
      // Switching into a placement with no collapsed state has to release it,
      // not just stop offering it: the control is gone from the header the
      // moment the attribute changes, so a panel collapsed under the previous
      // placement would have no way back.
      if (!this.#collapsible() && this.collapsed) {
        this.setCollapsed(false);
      }
      // Placement also moves the panel, so the edges its layout holds still
      // change with it. Deferred a frame so the new rules have applied.
      requestAnimationFrame(() => this.#syncResizeAnchor());
      return;
    }
    if (name === "title-text") {
      // `#strings` is the resolved table once connected, the English defaults
      // before then.
      this.#title.textContent = value ?? this.#strings.title;
      this.#railLabel.textContent = this.#title.textContent;
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
    return [
      ...createPageActionTools(enabled, (target) => this.resolvePageTarget(target)),
      ...(enabled.has(PAGE_ACTIONS.CHAT) ? createChatSurfaceTools(this) : []),
    ];
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
    requestAnimationFrame(() => {
      // Before the anchor, which #applyLauncherPlacement stamps itself once a
      // dragged position exists.
      this.#restoreLauncherPosition();
      this.#syncResizeAnchor();
    });
    // Resolve the string table before rendering any chrome (defaults are the
    // floor; `data-strings` then the `strings` property layer over them).
    this.#strings = mergeUiStrings({ ...this.#readStringOverrides(), ...this.strings });
    // Restore a theme the built-in toggle persisted last visit (opt-in only, so
    // it never overrides a host that drives `theme` itself).
    if (this.getAttribute("data-theme-toggle") !== null) {
      const saved = this.#readPreference(THEME_KEY);
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
    if (this.#collapsible() && this.#startsCollapsed()) {
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
    window.addEventListener("resize", this.#onViewportResize);
    // The visual viewport changes without the window resizing -- a keyboard
    // opening, a pinch-zoom, the URL bar collapsing -- and `scroll` is what
    // fires when it is panned rather than resized.
    window.visualViewport?.addEventListener("resize", this.#onViewportResize);
    window.visualViewport?.addEventListener("scroll", this.#onViewportResize);
    this.#publishVisualViewport();
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
    window.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("resize", this.#onViewportResize);
    window.visualViewport?.removeEventListener("scroll", this.#onViewportResize);
    // Give the namespace back. A disconnect is not necessarily a farewell — a
    // DOM move and a framework re-render both look like one — and an element
    // that could not reclaim its own namespace on the way back in would lose
    // its conversation to a false collision.
    if (this.#claimedNs !== null) {
      CLAIMED_NAMESPACES.delete(this.#claimedNs);
      this.#claimedNs = null;
    }
    this.#cancelRun();
    // The page offer listens on the host's document, not on anything of ours,
    // so nothing else would ever take it down.
    this.#pageQuote?.detach();
    this.#pageQuote = null;
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
    this.#enablePaste(tray);
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
    const quoted = asQuote(text);
    if (quoted === "") {
      return;
    }
    // Appended after whatever is already typed, on a fresh paragraph: a second
    // quotation is a second thing being asked about, not a replacement for the
    // first. Trailing blank lines are dropped so repeated quoting does not
    // accumulate gaps.
    const current = this.#input.value.replace(/\s+$/, "");
    this.#input.value = current === "" ? quoted : `${current}\n\n${quoted}`;
    this.#autoGrow();
    this.#input.focus();
    const end = this.#input.value.length;
    this.#input.setSelectionRange(end, end);
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
    this.#pageQuote?.detach();
    const offer = attachQuoteOffer({
      within,
      label: this.#strings.quoteSelection,
      exclude: this,
      onQuote: (text) => this.quote(text),
    });
    this.#pageQuote = offer;
    return () => {
      offer.detach();
      if (this.#pageQuote === offer) {
        this.#pageQuote = null;
      }
    };
  }

  /** Whether the transcript offers to quote what the user selects. */
  #quoteEnabled(): boolean {
    return this.getAttribute("data-quote-selection") !== "false";
  }

  /**
   * Offer to quote the settled selection, or retire the offer.
   *
   * `event` is passed for its coordinates and only those: they say which line
   * of a selection spanning several messages the offer should hang from. A
   * keyboard selection has none, and the first line is used instead.
   */
  #onSelectionSettled(event?: MouseEvent): void {
    if (!this.#quoteEnabled()) {
      return;
    }
    const near = event === undefined ? undefined : { x: event.clientX, y: event.clientY };
    const selected = quotableSelection(this.#messages, [this.#root], near);
    if (selected === null) {
      this.#hideQuote();
      return;
    }
    this.#quoting = selected.text;
    this.#placeQuote(selected.rect);
  }

  /** Float the offer beside `rect`, kept inside the transcript's own box. */
  #placeQuote(rect: DOMRect): void {
    // Unhidden first: a hidden element measures zero, and its own size is what
    // decides whether it fits above the selection and how far to pull it left.
    this.#quoteButton.hidden = false;
    const wrap = this.#messagesWrap.getBoundingClientRect();
    const top = rect.top - wrap.top;
    // Above the selection by default, below it when there is no room --
    // selecting the first line of the transcript is the ordinary case, not an
    // edge one, and an offer clipped by the header is an offer nobody takes.
    const below = top < QUOTE_GAP + this.#quoteButton.offsetHeight;
    this.#quoteButton.dataset["below"] = String(below);
    this.#quoteButton.style.top = `${below ? rect.bottom - wrap.top + QUOTE_GAP : top - QUOTE_GAP}px`;
    // Centred on the selection, then pulled back by its own half-width so a
    // selection at either margin does not push the offer out of the panel.
    const half = this.#quoteButton.offsetWidth / 2;
    const centre = rect.left + rect.width / 2 - wrap.left;
    this.#quoteButton.style.left = `${Math.min(Math.max(centre, half), wrap.width - half)}px`;
  }

  /** Retire the offer, and forget what it was pointing at. */
  #hideQuote(): void {
    this.#quoteButton.hidden = true;
    this.#quoting = "";
  }

  /**
   * The tool-round budget from `data-max-tool-rounds`, for one send.
   *
   * Anything unparseable becomes `NaN`, which {@link AgUiClient} rejects along
   * with a bound below one -- so the two ways of setting this are validated in
   * one place rather than agreeing by coincidence.
   */
  #maxToolRounds(): number {
    const attr = this.getAttribute("data-max-tool-rounds");
    return attr === null ? MAX_TOOL_ROUNDS : Number.parseInt(attr, 10);
  }

  /**
   * Which message actions a finished bubble offers, from
   * `data-message-actions`.
   *
   * **Absent means copy and retry, not all three.** Those two work with nothing
   * wired: copy reads the DOM, retry drives this element. The rating pair does
   * not -- it fires `ag-ui-feedback` and stores nothing by design, because a
   * rating belongs to whatever the host already uses for product signal. With no
   * listener the buttons still latch `aria-pressed`, so a reader is told their
   * rating was taken and a screen reader announces it, while nothing recorded
   * anything. This README has always said two buttons that lead nowhere are
   * worse than none; shipping them by default was that sentence being false.
   *
   * A host with a listener asks for them: `data-message-actions="copy,retry,feedback"`.
   * A value names the survivors, which makes `data-message-actions="false"` --
   * the spelling its sibling `data-quote-selection` uses -- an empty set by
   * falling out of the same rule rather than by a case of its own.
   */
  #messageActions(): ReadonlySet<string> {
    const attr = this.getAttribute("data-message-actions");
    if (attr === null) {
      return new Set([MESSAGE_ACTIONS.COPY, MESSAGE_ACTIONS.RETRY]);
    }
    return new Set(
      attr
        .split(",")
        .map((token) => token.trim())
        .filter((token) => token !== ""),
    );
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
   * Turn a very long text paste into an attachment instead of a wall of text.
   *
   * A composer capped at `40vh` is not where forty thousand characters go: the
   * user cannot read what they pasted, cannot edit around it, and sends one
   * enormous turn. As a file it stays whole, the model still receives it, and
   * the box is left for the question about it.
   *
   * Only where the host has configured uploads -- and structurally so, rather
   * than by a check here: the paste listener is wired inside the attachment
   * setup, so with no tray there is no listener at all and an ordinary paste is
   * untouched. Quietly dropping a paste for being long would be far worse than
   * an awkward composer. The tray is passed rather than read off the field for
   * the same reason its `onChange` hook is: it can only be called from one that
   * exists, so taking it as an argument removes a null check no caller can
   * reach.
   *
   * Nothing is lost by removing the chip: the text is still on the clipboard,
   * so pasting again brings it back. That is why this needs no undo of its own.
   */
  #pasteLongTextAsFile(event: ClipboardEvent, clipboard: DataTransfer, tray: AttachmentTray): void {
    const threshold = this.#pasteAttachThreshold();
    const text = clipboard.getData("text/plain");
    if (threshold === null || text.length < threshold) {
      return;
    }
    event.preventDefault();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    tray.add(new File([text], `pasted-${stamp}.txt`, { type: "text/plain" }));
  }

  /**
   * How long a pasted string has to be before it becomes a file, or `null` to
   * leave every paste in the composer.
   *
   * One attribute with three answers rather than three attributes: absent is
   * the default, `off` refuses, and a number states the threshold. A value that
   * is neither says so, because a typo silently meaning "off" is the failure
   * this whole release keeps finding.
   */
  #pasteAttachThreshold(): number | null {
    const raw = this.getAttribute("data-paste-attach");
    if (raw === null) {
      return PASTE_ATTACH_CHARS;
    }
    if (raw === "off") {
      return null;
    }
    const stated = Number.parseInt(raw, 10);
    if (Number.isNaN(stated) || stated <= 0) {
      console.warn(
        `<ag-ui-chat>: data-paste-attach="${raw}" is neither "off" nor a positive ` +
          `number of characters, so the default of ${PASTE_ATTACH_CHARS} is used.`,
      );
      return PASTE_ATTACH_CHARS;
    }
    return stated;
  }

  /**
   * Accept files pasted into the composer.
   *
   * The whole tray already exists behind this: a paste is one more way to hand
   * it a `File`, alongside the picker and a drop.
   *
   * Two rules keep it from stealing a paste that was never about files.
   * `clipboardData.files` is empty for text, so ordinary pasting is untouched.
   * And the default is only prevented when the clipboard carries **no text**:
   * copying a rich selection that happens to contain an image puts both on the
   * clipboard, and swallowing the words someone meant to paste in order to
   * attach a picture they did not is the worse of the two failures.
   */
  #enablePaste(tray: AttachmentTray): void {
    this.#chat.addEventListener("paste", (event: ClipboardEvent) => {
      // Nullish rather than a null check: the property is typed as nullable,
      // and an engine that fires a plain Event for a paste leaves it absent
      // instead, which is not the same value and is the same situation.
      const clipboard = event.clipboardData ?? null;
      if (clipboard === null) {
        return;
      }
      const files = Array.from(clipboard.files);
      if (files.length === 0) {
        this.#pasteLongTextAsFile(event, clipboard, tray);
        return;
      }
      if (clipboard.getData("text/plain") === "") {
        event.preventDefault();
      }
      for (const file of files) {
        this.#attachTray?.add(named(file));
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
  setCollapsed(collapsed: boolean, options: { readonly announce?: boolean } = {}): void {
    if (collapsed && !this.#collapsible()) {
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
      this.#restoreLauncherPosition();
    }
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
    const stored = this.#readScopedItem(COLLAPSED_KEY);
    if (stored !== null) {
      return stored === "1";
    }
    return (
      DRAGGABLE_PLACEMENTS.has(this.getAttribute("placement")) &&
      !this.hasAttribute("data-start-open")
    );
  }

  /**
   * Whether this placement has a collapsed state at all.
   *
   * `page` does not. It is a dedicated route rather than a panel sitting on
   * someone else's page, so there is no "away" for it to go to: collapsing it
   * left a strip of application chrome fixed over a route that no longer had an
   * owner. It is also the placement that hides the launcher, so the usual way
   * back does not exist here.
   *
   * The header hides its collapse control under this placement, but a control
   * removed from the UI is not a state removed from the model -- the property,
   * the attribute and a value restored from storage all still reach it. This is
   * what the reachable paths are gated on; the stylesheet covers the one path
   * that never passes through here, an attribute written straight onto the
   * element.
   */
  #collapsible(): boolean {
    return this.getAttribute("placement") !== "page";
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
    const box = this.getBoundingClientRect();
    const viewport = this.#viewport();
    const fullBleed = box.width >= viewport.width - 1 && box.height >= viewport.height - 1;
    return {
      placement: this.getAttribute("placement"),
      collapsed: this.collapsed,
      collapsible: this.#collapsible(),
      movable: this.#launcherDraggable() && !fullBleed,
      draggable: this.#launcherDraggable(),
      fullBleed,
      box: {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      viewport: {
        left: Math.round(viewport.left),
        top: Math.round(viewport.top),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      },
    };
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
    if (!this.#launcherDraggable()) {
      return false;
    }
    const restore = options.announce === true ? this.#captureGeometry() : null;
    const viewport = this.#viewport();
    const box = this.getBoundingClientRect();
    if (box.width >= viewport.width - 1 && box.height >= viewport.height - 1) {
      return false;
    }
    const [edgeY, edgeX] = corner.split("-");
    // Every term is an absolute screen coordinate, because that is what the
    // clamps and the insets both speak. The usable box carries an origin, so
    // its near edge is `viewport.left`, not zero, and its far edge is
    // `viewport.left + viewport.width` -- a margin applied to the extents
    // alone would send the agent's own move under the chrome the host
    // reserved, which is the failure the usable box exists to prevent.
    const nearX = viewport.left + EDGE_MARGIN;
    const nearY = viewport.top + EDGE_MARGIN;
    const left =
      edgeX === "left"
        ? nearX
        : Math.max(nearX, viewport.left + viewport.width - EDGE_MARGIN - box.width);
    const top =
      edgeY === "top"
        ? nearY
        : Math.max(nearY, viewport.top + viewport.height - EDGE_MARGIN - box.height);
    const host = { left, top, right: left + box.width, bottom: top + box.height };
    // Both axes measured, rather than one read twice: a host can restyle the
    // launcher as a pill, and squaring it here would put it off the corner.
    const launcherWidth = this.#launcher.offsetWidth;
    const launcherHeight = this.#launcher.offsetHeight;
    this.#placePanelAndLauncher(host, {
      left: edgeX === "left" ? host.left : host.right - launcherWidth,
      top: edgeY === "top" ? host.top : host.bottom - launcherHeight,
      width: launcherWidth,
      height: launcherHeight,
    });
    this.#storeLauncherPosition();
    if (restore !== null) {
      this.#announceSurfaceChange(this.#strings.chatMoved, restore);
    }
    return true;
  }

  /**
   * Snapshot the panel's stated position, and return a function that puts it
   * back.
   *
   * Both insets and the expand corner, because they are one decision: the
   * corner is what the panel grows from, so restoring a position without it
   * puts the box back and animates it out of the wrong side. Absent values are
   * captured as absent and removed on the way back, rather than written as
   * empty strings that would outrank the placement.
   */
  #captureGeometry(): () => void {
    const inset = this.style.getPropertyValue("--ag-ui-inset");
    const launcherInset = this.style.getPropertyValue("--ag-ui-launcher-inset");
    const corner = this.getAttribute("data-expand-corner");
    const launcherPos = this.#launcherPos;
    const panelPos = this.#panelPos;
    const expandCorner = this.#expandCorner;
    return () => {
      const put = (name: string, value: string): void => {
        if (value === "") {
          this.style.removeProperty(name);
        } else {
          this.style.setProperty(name, value);
        }
      };
      put("--ag-ui-inset", inset);
      put("--ag-ui-launcher-inset", launcherInset);
      if (corner === null) {
        this.removeAttribute("data-expand-corner");
      } else {
        this.setAttribute("data-expand-corner", corner);
      }
      this.#launcherPos = launcherPos;
      this.#panelPos = panelPos;
      this.#expandCorner = expandCorner;
      // Erased rather than rewritten when there was nothing to go back to.
      // #storeLauncherPosition returns early for a null position, which would
      // leave the move this is undoing sitting in storage -- and since that
      // store outlives the tab, the next resize or reload would quietly put
      // the panel back in the corner the user had just rejected.
      if (launcherPos === null) {
        this.#clearPreference(LAUNCHER_KEY);
      } else {
        this.#storeLauncherPosition();
      }
      this.#syncResizeAnchor();
    };
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
    this.#writePreference(THEME_KEY, next);
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
    // Shrink first. Growing is the obvious probe and cannot answer the question
    // at a size already resting against max-width or max-height: the box does
    // not change, no edge moves, and every clamped axis then reads as pinned on
    // the side that did not move -- which is the side that is free. That is not
    // an edge case. The default panel is 380px wide against a max-width of
    // 100vw minus 48, so any viewport under 428px is born clamped, and the grip
    // rendered on the wrong corner with the drag inverted before anyone touched
    // it. Shrinking always moves an edge, because the shrink is measured from
    // the box's *used* width rather than from whatever was asked for.
    const shrunk = this.#probeAnchor(before, -1);
    // Unless a host rule sets a minimum, in which case that axis is asked the
    // opposite question rather than left to a guess.
    const grown = shrunk.x === null || shrunk.y === null ? this.#probeAnchor(before, 1) : shrunk;
    // Restore exactly what was there, including "nothing" — leaving a probe
    // value behind would pin a panel that had been sizing itself.
    this.#restoreProperty("--ag-ui-width", width);
    this.#restoreProperty("--ag-ui-height", height);
    return {
      // Neither direction moved it: the axis cannot be resized at all, so the
      // floating default is the best answer available and is the one the
      // stylesheet would have used with no measurement at all.
      x: shrunk.x ?? grown.x ?? "right",
      y: shrunk.y ?? grown.y ?? "bottom",
    };
  }

  /**
   * Which edge each axis holds still when the panel changes size by `delta`.
   *
   * Null for an axis whose size did not change: nothing moved, so nothing was
   * learned, and reporting the unmoved edge as the pinned one would be exactly
   * backwards.
   */
  #probeAnchor(
    before: DOMRect,
    delta: number,
  ): { x: "left" | "right" | null; y: "top" | "bottom" | null } {
    this.#applySize({ width: before.width + delta, height: before.height + delta });
    const after = this.getBoundingClientRect();
    const moved = (a: number, b: number): boolean => Math.abs(a - b) >= 0.5;
    return {
      x: moved(after.width, before.width)
        ? moved(after.left, before.left)
          ? "right"
          : "left"
        : null,
      y: moved(after.height, before.height)
        ? moved(after.top, before.top)
          ? "bottom"
          : "top"
        : null,
    };
  }

  /** Stamp the measured anchor so the shadow CSS can place the grip. */
  #syncResizeAnchor(): void {
    if (!this.#connected) {
      return;
    }
    // When this element owns its position it knows which edges are pinned --
    // it just wrote them -- so there is nothing to probe. The probe is also
    // unreliable at a size resting against max-width or max-height, where a
    // nudge moves no edge and every axis reads as pinned on the wrong side.
    const anchor = this.#expandCorner ?? this.#measureAnchor();
    this.#anchor = anchor;
    this.setAttribute("data-resize-anchor", `${anchor.y}-${anchor.x}`);
    this.#focusableGrip();
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
    // The placement's max-width and max-height are left alone, which means a
    // grip pushed against the edge the placement is *not* anchored to stops one
    // gutter short of the screen. Moving the cap with the size fixes that and
    // shifts several resting sizes by a pixel or two, because the cap and the
    // size are not measured from the same box -- not worth the churn for a
    // symmetry nobody has asked for. The limit that matters, staying inside
    // what the host left free, is enforced above.
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

  /**
   * Whether this placement lets the launcher be dragged, read per interaction
   * because `placement` is a live attribute. `data-launcher-drag="false"` opts
   * a host out without giving up the launcher itself.
   */
  #launcherDraggable(): boolean {
    return (
      this.getAttribute("data-launcher-drag") !== "false" &&
      DRAGGABLE_PLACEMENTS.has(this.getAttribute("placement"))
    );
  }

  /**
   * The viewport the launcher and the panel both have to fit inside.
   *
   * The *visual* viewport, not the layout one, because they come apart exactly
   * when this matters. An on-screen keyboard shrinks the visual viewport and
   * leaves the layout viewport alone, so clamping against `innerHeight` parks
   * the launcher behind the keyboard and decides which corner to open into
   * using space that is not on the screen. Pinch-zoom does the same on both
   * axes.
   *
   * Falls back where the API is absent, which keeps this working in the
   * happy-dom project as well as in an old browser.
   */
  #viewport(): ViewportBox {
    const visual = window.visualViewport;
    const width = visual?.width ?? window.innerWidth;
    const height = visual?.height ?? window.innerHeight;
    // And minus whatever the host reserved for its own chrome. Without this a
    // panel is clamped against the whole screen and settles happily underneath
    // a sticky header, where it cannot be reached -- and where collapsing it,
    // the one thing a user tries, hides it completely rather than rescuing it.
    // Read as padding off the probe, not as custom properties off this
    // element. `getPropertyValue` on an unregistered custom property returns
    // the token stream rather than a length, so a host stating `4rem` reserves
    // four pixels here and sixty-four in the stylesheet, and one stating
    // `calc(56px + env(safe-area-inset-top))` -- which is the natural spelling
    // of what the token's own documentation recommends -- parses as NaN and
    // takes the panel's whole inset down with it.
    const style = getComputedStyle(this.#viewportProbe);
    const edge = (name: string): number => {
      const value = Number.parseFloat(style.getPropertyValue(name));
      // A detached or not-yet-rendered probe resolves to nothing at all, and
      // reserving NaN is worse than reserving zero in every case.
      return Number.isFinite(value) ? value : 0;
    };
    const left = edge("padding-left");
    const top = edge("padding-top");
    return {
      left,
      top,
      width: Math.max(0, width - left - edge("padding-right")),
      height: Math.max(0, height - top - edge("padding-bottom")),
    };
  }

  /**
   * The whole viewport, before anything the host reserved is taken out of it.
   *
   * Distinct from {@link #viewport} on purpose, and the two must not be
   * swapped. The usable box decides where the widget may rest; this is what a
   * CSS `inset` on a fixed element is measured from, because that is what the
   * browser measures it from.
   */
  #screen(): Extent {
    // The *layout* viewport, and `clientWidth`/`clientHeight` rather than
    // `innerWidth`/`innerHeight`, because those two disagree by the width of a
    // classic scrollbar and it is the smaller one a fixed element is laid out
    // against. Reading the visual viewport here would be the same mistake one
    // level up as clamping against the whole screen was one level down: a
    // keyboard shrinks the visual viewport without moving the box CSS measures
    // an inset from, so a panel the clamp had just held inside the visible
    // band would be written back out behind the keyboard.
    //
    // The zero checks are for a detached or not-yet-laid-out document, where
    // `clientWidth` is 0 and no viewport ever is.
    const root = document.documentElement;
    return {
      width: root.clientWidth || window.innerWidth,
      height: root.clientHeight || window.innerHeight,
    };
  }

  /**
   * Publish the measured viewport height so the stylesheet can size a
   * full-bleed panel to what the user can see.
   *
   * No CSS length carries this. An on-screen keyboard has no effect on any
   * viewport-percentage unit, so a panel sized from `100dvh` puts its composer
   * behind the keyboard being typed into. Written inline, and read through a
   * token the host's own `--ag-ui-viewport-height` still outranks.
   *
   * Removed rather than frozen when the two viewports agree, so a desktop that
   * never diverges carries no inline override at all and the declared fallback
   * stays in charge.
   */
  #publishVisualViewport(): void {
    const visual = window.visualViewport;
    if (visual === null || visual === undefined) {
      return;
    }
    if (Math.abs(visual.height - window.innerHeight) < 1) {
      this.style.removeProperty("--ag-ui-visual-viewport-height");
      this.style.removeProperty("--ag-ui-visual-viewport-inset-bottom");
      return;
    }
    this.style.setProperty("--ag-ui-visual-viewport-height", `${Math.round(visual.height)}px`);
    // What is hidden below the visible area, which is where a keyboard is. A
    // shorter panel does not help anything anchored to the bottom: a floating
    // widget is positioned against the layout viewport, so its bottom edge and
    // the launcher at that corner stay behind the keyboard until this lifts
    // them. Never negative -- a visual viewport panned up past the layout one
    // would otherwise pull the panel down off the screen.
    const hidden = window.innerHeight - visual.height - visual.offsetTop;
    this.style.setProperty(
      "--ag-ui-visual-viewport-inset-bottom",
      `${Math.max(0, Math.round(hidden))}px`,
    );
  }

  /**
   * The launcher's box in viewport coordinates, with its transform divided out.
   *
   * The launcher is scaled in four states -- the collapse animation, hover,
   * press, and the resting scale(0.4) it sits at while the panel is open -- and
   * `getBoundingClientRect` reports every one of them. A drag that started from
   * that rect would begin a couple of pixels off, because a press is one of
   * those states.
   *
   * So the size comes from `offsetWidth`/`offsetHeight`, which are layout
   * metrics no transform reaches, and the position from the rect's *centre*,
   * which a centred scale is the one point that cannot move.
   */
  #launcherBox(): LauncherBox {
    const width = this.#launcher.offsetWidth;
    const height = this.#launcher.offsetHeight;
    const dragged = this.#launcherPos;
    if (dragged !== null) {
      return { left: dragged.left, top: dragged.top, width, height };
    }
    const rect = this.#launcher.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2 - width / 2,
      top: rect.top + rect.height / 2 - height / 2,
      width,
      height,
    };
  }

  /**
   * Place the host box and the launcher for the position the user dragged to.
   *
   * This writes `--ag-ui-inset`, which is a host-facing property: an inline
   * value outranks the page's own rule for it, exactly as a dragged width
   * outranks a placement's. That is the intent -- the user moved it -- and it
   * is why switching to a placement that owns its position hands the property
   * back rather than leaving a stale inline one behind.
   */
  #applyLauncherPlacement(at: { readonly left: number; readonly top: number }): void {
    // The single gate: callers hand over a position and this decides whether
    // it is this element's to honour. Checking in both places instead would
    // leave one of the two checks permanently unreachable.
    if (!this.#launcherDraggable()) {
      return;
    }
    this.#launcherPos = at;
    // Dropping the bubble hands the panel's position back to the placement.
    // Keeping a stated one would pin the panel where it was dragged and leave
    // the launcher deriving nothing, which is the gesture doing half its job.
    this.#panelPos = null;
    // The host box keeps its expanded size while collapsed, so its own rect is
    // the panel's size in either state and needs no separate bookkeeping.
    const panel = this.getBoundingClientRect();
    const placement = launcherPlacement(
      this.#launcherBox(),
      { width: panel.width, height: panel.height },
      this.#viewport(),
      this.#screen(),
    );
    this.style.setProperty("--ag-ui-inset", placement.hostInset);
    this.style.setProperty("--ag-ui-launcher-inset", placement.launcherInset);
    this.#expandCorner = placement.corner;
    // The corner the panel grows from, for the open/close animation's origin.
    this.setAttribute("data-expand-corner", `${placement.corner.y}-${placement.corner.x}`);
    this.#syncResizeAnchor();
  }

  /** Move the launcher live during a drag, without persisting. */
  #moveLauncher(left: number, top: number): void {
    this.#applyLauncherPlacement({ left, top });
  }

  /** Move the launcher and remember where, per tab, like the dragged size. */
  #commitLauncher(left: number, top: number): void {
    this.#moveLauncher(left, top);
    this.#storeLauncherPosition();
  }

  /**
   * Move the panel live during a header drag, without persisting.
   *
   * Only the host box is written, and that is the whole trick: the launcher is
   * positioned *inside* that box, so leaving its own inset alone carries it
   * along by exactly the distance the panel travelled -- which is what a person
   * dragging a window expects of the thing it collapses into. Placing it on the
   * panel's pinned corner instead, as an earlier version did, sent it leaping
   * across the panel the moment the drag re-picked that corner.
   *
   * The corner is therefore held for the length of the gesture. Both insets are
   * measured from it, and rewriting one of them from a new corner while the
   * other still names the old one would move the launcher for no reason.
   */
  #movePanel(box: PanelRect, from: PanelRect): { held: PanelRect; launcher: LauncherBox | null } {
    if (!this.#launcherDraggable()) {
      return { held: box, launcher: null };
    }
    // Where the launcher rests, recorded before the first move writes anything.
    // From here on the DOM shows it mid-gesture, so this is the last moment it
    // can be read rather than derived.
    if (this.#launcherPos === null) {
      const resting = this.#launcherBox();
      this.#launcherPos = { left: resting.left, top: resting.top };
    }
    // The launcher as it was when the gesture began. Held for the whole drag:
    // every move measures from here, so the two halves cannot drift apart.
    const start = this.#launcherPos;
    // The screen-edge bound, not the resting gutter. The 24px margin is where
    // a placement rests one, not a rule about where a person may put it, and
    // enforcing it against a drag is what made the panel feel stuck short of
    // every edge on all four sides at once. Zero was the correction and it
    // went too far the other way: it welded the panel to the boundary while
    // the launcher -- same shadow, same rounded edge -- was held 8px off it,
    // and it disagreed with the restore below, so a panel dragged flush leapt
    // inward the next time the viewport changed.
    const held = clampPanel(box, this.#viewport(), SCREEN_EDGE_MARGIN);
    const corner = this.#expandCorner ?? this.#anchor;
    // The usable box decides where the panel may rest, above; the screen is
    // what these insets are measured from, because that is what the browser
    // measures a fixed element's inset from. Using the usable box here made a
    // right or bottom short by whatever the host had reserved, and the panel
    // jumped by that much the first time a gesture wrote one.
    const screen = this.#screen();
    this.style.setProperty(
      "--ag-ui-inset",
      [
        corner.y === "top" ? `${Math.round(held.top)}px` : "auto",
        corner.x === "right" ? `${Math.round(screen.width - held.right)}px` : "auto",
        corner.y === "bottom" ? `${Math.round(screen.height - held.bottom)}px` : "auto",
        corner.x === "left" ? `${Math.round(held.left)}px` : "auto",
      ].join(" "),
    );
    this.#panelPos = { left: held.left, top: held.top };

    // Where the launcher has ended up, derived rather than read. During a
    // header drag it rides inside the host box with its own inset untouched,
    // so the DOM shows it moving while `#launcherPos` still holds where it
    // started -- reading it back mid-gesture returns the stale value, and
    // adding the panel's travel to that a second time on release is a jump.
    // Measured from the box the press started on, so a long drag cannot
    // accumulate the rounding each move writes.
    const carried = {
      ...this.#launcherBox(),
      left: start.left + (held.left - from.left),
      top: start.top + (held.top - from.top),
    };
    // A bubble carried into an edge the host reserved is one nobody can press.
    // Clamping it live rather than at the end is what makes releasing the drag
    // change nothing: leaving it until then parked it under a nav bar for the
    // whole gesture and hopped it out on pointerup.
    const launcher = { ...carried, ...clampLauncher(carried, this.#viewport()) };
    this.style.setProperty(
      "--ag-ui-launcher-inset",
      placeWidget(held, launcher, corner, this.#screen()).launcherInset,
    );
    return { held, launcher };
  }

  /**
   * Finish a header drag: settle where both halves ended up, and remember it.
   *
   * The launcher travels the distance the panel actually travelled, which is
   * the clamped distance rather than the pointer's -- a panel held against the
   * viewport margin stops, and so does the bubble attached to it. Measured from
   * the box the press started on, so a long drag cannot accumulate the rounding
   * each move writes into the inset.
   *
   * Only now is the corner re-picked, from where the launcher has ended up, so
   * the panel opens into clear space next time. Re-picking it moves nothing:
   * both insets are rewritten from positions that are already decided.
   */
  #commitPanel(box: PanelRect, from: PanelRect): void {
    // Exactly what the last move applied, rather than the same sum computed
    // again. Recomputing it is how the two came apart: releasing the drag
    // moved the bubble by the panel's whole travel a second time.
    const { held, launcher } = this.#movePanel(box, from);
    if (launcher === null) {
      return;
    }
    this.#placePanelAndLauncher(held, launcher);
    this.#storeLauncherPosition();
  }

  /**
   * Write both insets for a panel and launcher that are already positioned,
   * re-picking the corner they are measured from.
   */
  #placePanelAndLauncher(host: PanelRect, launcher: LauncherBox): void {
    const viewport = this.#viewport();
    const screen = this.#screen();
    const size = { width: host.right - host.left, height: host.bottom - host.top };
    const { corner } = launcherPlacement(launcher, size, viewport, screen);
    // The screen again, not the usable box: these are CSS insets on a fixed
    // element and the browser measures them from the real edges.
    const insets = placeWidget(host, launcher, corner, screen);
    this.style.setProperty("--ag-ui-inset", insets.hostInset);
    this.style.setProperty("--ag-ui-launcher-inset", insets.launcherInset);
    this.#launcherPos = { left: launcher.left, top: launcher.top };
    this.#panelPos = { left: host.left, top: host.top };
    this.#expandCorner = corner;
    this.setAttribute("data-expand-corner", `${corner.y}-${corner.x}`);
    this.#syncResizeAnchor();
  }

  /**
   * Re-apply a panel position the user stated, against the current viewport.
   *
   * The launcher keeps its offset from the panel through the clamp -- it was
   * put where it is relative to the panel, and a viewport that has since shrunk
   * is no reason to move one without the other -- and is then held on screen in
   * its own right.
   */
  #restorePanelPosition(at: { readonly left: number; readonly top: number }): void {
    if (!this.#launcherDraggable()) {
      return;
    }
    const rect = this.getBoundingClientRect();
    // The same bound the drag itself used. Taking the default here instead is
    // what made a panel dragged to an edge jump a whole resting gutter inward
    // on the next resize, reload or expand -- re-placing a position the user
    // had stated, against a limit they had never been shown.
    const held = clampPanel(
      { left: at.left, top: at.top, right: at.left + rect.width, bottom: at.top + rect.height },
      this.#viewport(),
      SCREEN_EDGE_MARGIN,
    );
    const launcher = this.#launcherBox();
    const carried = {
      ...launcher,
      left: launcher.left + (held.left - at.left),
      top: launcher.top + (held.top - at.top),
    };
    this.#placePanelAndLauncher(held, {
      ...carried,
      ...clampLauncher(carried, this.#viewport()),
    });
  }

  /**
   * Write the current position, if this element owns one.
   *
   * The panel's own position rides along only when the user stated it, because
   * its presence is what tells a restore which of the two gestures to honour:
   * with it, the panel goes back where it was put; without it, the panel is
   * re-derived from the launcher and opens into whatever room the viewport has
   * now.
   */
  #storeLauncherPosition(): void {
    const position = this.#launcherPos;
    if (position === null) {
      return;
    }
    const panel = this.#panelPos;
    this.#writePreference(
      LAUNCHER_KEY,
      JSON.stringify(panel === null ? position : { ...position, panel }),
    );
  }

  /**
   * Re-apply the dragged position against the current viewport: on connect,
   * whenever the window resizes, and before an expand. The viewport that
   * stored a position may since have shrunk, and a launcher past the edge is
   * unreachable -- it is the only way back to a collapsed conversation.
   */
  #restoreLauncherPosition(): void {
    const stored = this.#readLauncherPosition();
    const launcher = this.#launcherPos ?? stored;
    if (launcher === null) {
      return;
    }
    const panel = this.#panelPos ?? stored?.panel ?? null;
    if (panel !== null) {
      // Stated rather than derived: the launcher is only read here to keep the
      // offset the two were left with, so it has to be seeded before the panel
      // is placed around it.
      this.#launcherPos = { left: launcher.left, top: launcher.top };
      this.#restorePanelPosition(panel);
      return;
    }
    const box = this.#launcherBox();
    this.#applyLauncherPlacement(
      clampLauncher({ ...box, left: launcher.left, top: launcher.top }, this.#viewport()),
    );
  }

  /** The persisted position for this instance, or null. */
  #readLauncherPosition(): {
    readonly left: number;
    readonly top: number;
    readonly panel?: { readonly left: number; readonly top: number };
  } | null {
    const raw = this.#readPreference(LAUNCHER_KEY);
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const { left, top, panel } = parsed as { left?: unknown; top?: unknown; panel?: unknown };
      if (typeof left !== "number" || typeof top !== "number") {
        return null;
      }
      // A record written before the panel could be dragged has no panel half,
      // and one written by a launcher drag never will -- both restore by
      // deriving the panel, which is what they meant.
      const at = asPoint(panel);
      return at === null ? { left, top } : { left, top, panel: at };
    } catch {
      // A corrupt entry is not worth failing a mount over; fall back to the
      // placement's own corner.
      return null;
    }
  }

  /**
   * Give the position back to the host when the new placement owns it, the way
   * #releaseOwnedAxes gives back a size. Without this a dragged inset survives
   * the switch inline and pins a sidebar to wherever the floating launcher was.
   */
  #releaseLauncherPosition(): void {
    if (this.#launcherDraggable()) {
      return;
    }
    this.#launcherPos = null;
    this.#panelPos = null;
    this.#expandCorner = null;
    this.style.removeProperty("--ag-ui-inset");
    this.style.removeProperty("--ag-ui-launcher-inset");
    this.removeAttribute("data-expand-corner");
  }

  /**
   * Apply the box a grip is asking for.
   *
   * The size is the easy half. The other half is that **dragging the edge the
   * layout is holding still moves the panel as well as resizing it**, and the
   * layout cannot express that on its own: a floating panel pinned bottom-right
   * cannot grow rightward, because its right edge is what the placement fixed.
   * So a grip on a pinned edge takes the position over -- which is the same
   * ownership the launcher drag takes, written the same way.
   *
   * A grip on a free edge writes nothing but the size, exactly as before, so a
   * host positioning the panel with its own rule keeps that rule until someone
   * drags the edge it was holding.
   */
  #applyResize(grip: ResizeGrip, box: PanelRect): PanelRect {
    box = this.#withinViewport(box);
    this.#applySize({ width: box.right - box.left, height: box.bottom - box.top });
    if (grip.x !== this.#anchor.x && grip.y !== this.#anchor.y) {
      return box;
    }
    // The whole screen, not the usable box: a CSS inset on a fixed element is
    // measured from the real edges, so expressing a right or bottom against a
    // box the host has inset comes out short by exactly that inset.
    const screen = this.#screen();
    const anchor = this.#anchor;
    const side = (value: number): string => `${Math.round(value)}px`;
    this.style.setProperty(
      "--ag-ui-inset",
      [
        anchor.y === "top" ? side(box.top) : "auto",
        anchor.x === "right" ? side(screen.width - box.right) : "auto",
        anchor.y === "bottom" ? side(screen.height - box.bottom) : "auto",
        anchor.x === "left" ? side(box.left) : "auto",
      ].join(" "),
    );
    // The launcher lives at this corner of the panel, so a corner that moved
    // takes it along. Without this the next expand would re-derive the panel's
    // position from a launcher still standing where the panel used to be, and
    // undo the move.
    if (this.#launcherPos !== null) {
      const size = this.#launcher.offsetWidth;
      this.#launcherPos = {
        left: anchor.x === "left" ? box.left : box.right - size,
        top: anchor.y === "top" ? box.top : box.bottom - size,
      };
    }
    // A stated panel position is a claim about this box, so it moves with it.
    if (this.#panelPos !== null) {
      this.#panelPos = { left: box.left, top: box.top };
    }
    return box;
  }

  /** Finish a resize: keep the box, remember it, and re-read the pinned edges. */
  #commitResize(grip: ResizeGrip, box: PanelRect): void {
    // The bounded box, not the one the pointer asked for. Persisting the raw
    // one would store a size the panel never had and restore it on the next
    // mount, which is the same disagreement between apply and commit that made
    // the header drag jump on release.
    const held = this.#applyResize(grip, box);
    this.#persistSize({ width: held.right - held.left, height: held.bottom - held.top });
    this.#storeLauncherPosition();
    // Re-stamp after the drag: a host whose layout changed underneath us would
    // otherwise keep the tab-reachable grip in the old corner, which reads as
    // the control being in the wrong place even though the drag was right.
    this.#syncResizeAnchor();
  }

  /**
   * Put the tab stop on the grip diagonally opposite the pinned corner.
   *
   * That is the corner a resize grows the panel from, so an arrow key there
   * changes the size and never the position -- the behaviour the single grip
   * this replaced had, kept for the one path that cannot simply grab a
   * different edge.
   */
  #focusableGrip(): void {
    const free = `${this.#anchor.y === "top" ? "bottom" : "top"}-${
      this.#anchor.x === "left" ? "right" : "left"
    }`;
    for (const [name, handle] of this.#resizeHandles) {
      const reachable = name === free;
      handle.tabIndex = reachable ? 0 : -1;
      if (reachable) {
        handle.removeAttribute("aria-hidden");
      } else {
        handle.setAttribute("aria-hidden", "true");
      }
    }
  }

  /** Persist a dragged size per tab, alongside the collapsed/theme preferences. */
  #persistSize(size: ResizeSize): void {
    const stored = { ...this.#readSize(), ...size };
    this.#writePreference(SIZE_KEY, JSON.stringify(stored));
  }

  /** The persisted size for this instance, or an empty record. */
  #readSize(): ResizeSize {
    const raw = this.#readPreference(SIZE_KEY);
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

  /**
   * Read a layout preference: where the widget sits, how big it is, which
   * theme it wears.
   *
   * These live in `localStorage` rather than beside the transcript, because a
   * layout preference is not a conversation. The transcript is deliberately
   * per-tab -- two tabs are two conversations, and closing the tab ends it --
   * and everything else inherited that scoping without earning it. A user who
   * dragged the panel clear of their own UI did it again in the next tab, and
   * again after every restart.
   *
   * Whether the widget is *currently open* stays per-tab with the transcript.
   * It is a statement about this tab rather than a preference: carrying it
   * across would pop the panel open on every new tab because it was opened
   * once, somewhere else.
   *
   * Falls back to the session value it used to be written to, so an existing
   * position survives the upgrade rather than resetting once.
   */
  #readPreference(base: string): string | null {
    try {
      const stored = localStorage.getItem(this.#storageKey(base));
      if (stored !== null) {
        return stored;
      }
    } catch {
      // Fall through to the per-tab copy below.
    }
    return this.#readScopedItem(base);
  }

  /**
   * Persist a layout preference as durably as this browser allows: to
   * `localStorage` so it outlives the tab, and to the per-tab store as well.
   *
   * The second write is not redundancy for its own sake. A privacy mode can
   * deny `localStorage` while allowing `sessionStorage`, and losing the
   * durable copy should degrade to the per-tab behaviour this replaced rather
   * than to no persistence at all. The read above prefers the durable copy, so
   * a tab that has both cannot be shadowed by its own stale one.
   *
   * Neither write is worth an exception. Losing where the panel sat is not
   * worth a warning either -- unlike the transcript, which says so once,
   * because losing that loses the conversation on the next reload.
   */
  #writePreference(base: string, value: string): void {
    const key = this.#storageKey(base);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota, or a store that denies writes.
    }
    writeStoredItem(key, value);
  }

  /**
   * Drop a layout preference from both stores.
   *
   * The mirror of {@link AgUiChat.#writePreference}, and it has to clear both
   * for the same reason that writes both: leaving either copy behind means the
   * value comes back on the next read.
   */
  #clearPreference(base: string): void {
    const key = this.#storageKey(base);
    try {
      localStorage.removeItem(key);
    } catch {
      // A store that denies access; the per-tab copy below still goes.
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing left to do: the value was never persisted in the first place.
    }
  }

  /** Reflect the current theme on the toggle: show the destination's glyph. */
  #syncThemeGlyph(): void {
    const dark = this.getAttribute("theme") === "dark";
    // Replaced wholesale rather than toggling a class: the two marks are
    // different paths, not one path in two states, and the slot has to keep
    // working so a host can still supply its own.
    this.#themeToggle.replaceChildren(
      this.#iconElement("theme", "theme-icon", dark ? ICON_SUN : ICON_MOON, null),
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
    // Two overlapping surfaces, so opening one dismisses the other. Clicking away
    // already covers the built-in buttons, but a host driving its own chrome
    // through these methods raises no pointer event — and the drawer would then
    // open *underneath* a popover still floating over it.
    this.#checkpoints.close();
    void this.#refreshDrawer();
    this.#drawer.setModal(!this.#threadsDock());
    this.#drawer.open();
    this.#syncThreadsState();
  }

  /**
   * Whether the conversation list docks beside the transcript rather than
   * covering it.
   *
   * Only the full-page placement, and only where there is room. A dedicated
   * route is the one surface with width to spare -- everywhere else the panel
   * is a few hundred pixels wide, and a list docked into that leaves a column
   * of transcript too narrow to read. The width is the panel's own rather than
   * the window's, because an embedded host can give a full-page-sized box to
   * something that is not a page.
   */
  #threadsDock(): boolean {
    return (
      this.getAttribute("placement") === "page" &&
      this.getBoundingClientRect().width >= THREADS_DOCK_MIN_WIDTH
    );
  }

  /**
   * Stamp whether the list is showing, and how.
   *
   * On the host rather than inside the shell because the transcript has to move
   * over for a docked list, and the drawer is the last child of the panel -- CSS
   * cannot select backwards from it to the rows it needs to shift.
   */
  #syncThreadsState(): void {
    if (this.#drawer.isOpen() && this.#threadsDock()) {
      this.setAttribute("data-threads-docked", "");
    } else {
      this.removeAttribute("data-threads-docked");
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
    // The other half of the pair — see `openThreads`.
    this.#drawer.close();
    void this.#refreshCheckpoints();
    this.#checkpoints.open();
  }

  /**
   * Close the conversation list, if it is open.
   *
   * No state sync here: the drawer reports every close through `onVisibility`,
   * including the four that never reach this method, and doing it twice would
   * be a second place to keep right.
   */
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
    this.#endStream();
    this.#currentGroup = null;
    this.#thoughts = null;
    this.#hidePending();
    this.#toolCards.clear();
    // The panels go with the cards they hung off. Nothing restores them: the
    // progress rode the imperative carrier and was never persisted, which is
    // the correct half of that split -- a delegation that was live before this
    // transcript was wiped is not live now.
    this.#subagentPanels.clear();
    this.#subagentRunDelegations.clear();
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
        // The outcome `AgUiClient` annotated onto the persisted message, read
        // back through the same mapping the live path uses -- so a card that
        // said "declined" before the reload still says it after. Narrowed off
        // `unknown` rather than trusted, like every other field read out of the
        // store: `Message` does not declare it, a host store may not round-trip
        // it, and history written before this shipped has none. All three land
        // on DONE, which is what this line did unconditionally.
        card.settle(
          toolStatusFromOutcome((message as { outcome?: unknown }).outcome),
          message.content,
        );
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

    // A panel is a window and a header is its title bar. Only while open: a
    // collapsed widget has no header on screen, and the launcher is the handle
    // then.
    enablePanelDrag(header, {
      enabled: () => !this.collapsed && this.#launcherDraggable(),
      rect: () => this.getBoundingClientRect(),
      apply: (box, from) => this.#movePanel(box, from),
      commit: (box, from) => this.#commitPanel(box, from),
    });

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

    this.#quoteButton.className = "quote-selection";
    this.#quoteButton.type = "button";
    this.#quoteButton.setAttribute("part", "quote-selection");
    this.#quoteButton.textContent = this.#strings.quoteSelection;
    this.#quoteButton.hidden = true;
    // `mousedown` rather than `click`: pressing anywhere else collapses the
    // selection first, and by the time a click lands there is nothing left to
    // quote. Preventing the default keeps the selection alive long enough to
    // read it.
    this.#quoteButton.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    this.#quoteButton.addEventListener("click", () => {
      this.quote(this.#quoting);
      window.getSelection()?.removeAllRanges();
      this.#hideQuote();
    });

    // A settled selection, by either input. `mouseup` rather than
    // `selectionchange` so the offer does not chase the pointer mid-drag; the
    // second half of the same gesture, `mousedown`, retires the previous offer
    // before the new selection exists.
    this.#messages.addEventListener("mouseup", (event) => this.#onSelectionSettled(event));
    this.#messages.addEventListener("keyup", () => this.#onSelectionSettled());
    this.#messages.addEventListener("mousedown", () => this.#hideQuote());

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
    // Fallback content, so a host that slots its own gets exactly that and
    // nothing of ours: the starters live *inside* the slot rather than beside
    // it, which is the difference between an offer and an imposition.
    const starters = this.#starterChips();
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
    this.#messagesWrap.append(this.#messages, this.#jumpButton, this.#quoteButton);

    this.#chat.append(
      header,
      this.#messagesWrap,
      this.#skillsMenu.palette,
      this.#skillsMenu.chips,
      this.#skillHint,
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
      this.#iconElement("launcher", "launcher-icon", ICON_LAUNCHER, this.#launcherIconUrl()),
      this.#railLabel,
      this.#badge,
    );
    this.#launcher.addEventListener("click", () => this.setCollapsed(false));
    // Only while collapsed: the launcher is scaled away and unclickable behind
    // the open panel, so a drag there would move something nobody can see.
    enableLauncherDrag(this.#launcher, {
      enabled: () => this.collapsed && this.#launcherDraggable(),
      rect: () => this.#launcherBox(),
      viewport: () => this.#viewport(),
      apply: (left, top) => this.#moveLauncher(left, top),
      commit: (left, top) => this.#commitLauncher(left, top),
    });

    for (const grip of RESIZE_GRIPS) {
      const handle = createResizeHandle(grip, {
        axis: () => this.#resizeAxis(),
        rect: () => this.getBoundingClientRect(),
        apply: (box) => this.#applyResize(grip, box),
        commit: (box) => this.#commitResize(grip, box),
        label: this.#strings.resizePanel,
      });
      // Only one of the eight is in the tab order. Eight separators between the
      // transcript and the composer is not keyboard parity, it is a keyboard
      // obstacle -- and one grip already reaches both axes, which is exactly
      // what the single grip this replaced offered. #syncResizeAnchor decides
      // which one, and it is the free corner, so an arrow key grows the panel
      // rather than moving it.
      handle.tabIndex = -1;
      handle.setAttribute("aria-hidden", "true");
      this.#resizeHandles.set(gripName(grip), handle);
      this.#chat.appendChild(handle);
    }
    this.#focusableGrip();
    this.#adoptStyles();
    this.#viewportProbe.className = "viewport-probe";
    this.#viewportProbe.setAttribute("aria-hidden", "true");
    this.#root.append(this.#viewportProbe, this.#announcer, this.#chat, this.#launcher);
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
  /**
   * The prompts offered on an empty transcript, from `data-starters`.
   *
   * Different from the suggestion chips a run pushes, which are follow-ups to
   * something already said. These answer the blank-page question instead, and
   * they are the host's rather than the model's -- only the host knows what its
   * page is for. Shares the renderer, the count and the length limit, because
   * two rows of prompt chips that behaved differently would be the harder
   * thing to explain.
   *
   * Read once at connect: it is content for a state the widget is in before
   * anything happens, and a host that wants it to change has `slot="empty"`.
   */
  #starterChips(): HTMLElement | null {
    const raw = this.getAttribute("data-starters");
    if (raw === null) {
      return null;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(
        "<ag-ui-chat>: data-starters is not valid JSON, so no starters are shown. " +
          "It takes an array of strings, e.g. data-starters='[\"Summarise this page\"]'.",
      );
      return null;
    }
    return renderSuggestionChips({ prompts: parsed }, this.#strings, (prompt) => {
      void this.sendMessage(prompt);
    });
  }

  #updateEmptyState(): void {
    this.#emptyWrap.hidden = this.#messages.childElementCount > 1;
  }

  /** Forward input changes to the skills palette and clear any stale hint. */
  #onInput(): void {
    this.#skillsMenu.onInput(this.#input.value);
    this.#skillHint.hidden = true;
    this.#autoGrow();
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
    this.#autoGrow();
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
      chip.title = this.#strings.removeQueued.replace("{text}", text);
      chip.setAttribute("aria-label", chip.title);
      chip.addEventListener("click", () => {
        this.#queued.splice(index, 1);
        this.#renderQueued();
      });
      this.#queuedRow.appendChild(chip);
    }
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
    const content = this.#input.value.trim();
    const attachments = this.#attachTray?.readyRefs() ?? [];
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
        this.#autoGrow();
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
        maxToolRounds: this.#maxToolRounds(),
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
   *
   * `data-message-actions` subtracts from that. The row is built only when
   * something survives to go in it: an empty row still takes its margin, still
   * answers to the `message-actions` part, and still reads to a screen reader
   * as a group of actions with none in it.
   */
  #attachActions(bubble: HTMLDivElement, options: { rateable?: boolean } = {}): void {
    const enabled = this.#messageActions();
    const copyable = enabled.has(MESSAGE_ACTIONS.COPY);
    // A failed run is copyable -- error text is what people paste into a bug
    // report -- but not rateable: a rating is a statement about an *answer*,
    // and mixing "the connection dropped" into that signal makes the host's
    // feedback data say less than it did before.
    const rateable = options.rateable !== false && enabled.has(MESSAGE_ACTIONS.FEEDBACK);
    if (copyable || rateable) {
      attachMessageActions(bubble, {
        strings: this.#strings,
        // Read at click time, not captured: a bubble rendered from markdown
        // holds its text in the DOM, and that is what the user sees and means
        // to copy. Serialised rather than read off `textContent`, which welds
        // a table into one run of digits and picks up the code blocks' own
        // copy buttons on the way past.
        ...(copyable
          ? {
              text: () => copyPayload(bubble).text,
              html: () => copyPayload(bubble).html,
            }
          : {}),
        ...(rateable
          ? {
              onFeedback: (rating: "up" | "down") => {
                this.dispatchEvent(
                  new CustomEvent<FeedbackDetail>(FEEDBACK_EVENT, {
                    detail: { content: copyPayload(bubble).text, rating },
                    bubbles: true,
                    composed: true,
                  }),
                );
              },
            }
          : {}),
      });
    }
    if (enabled.has(MESSAGE_ACTIONS.RETRY)) {
      this.#moveRetryTo(messageActionBar(bubble, this.#strings));
    }
  }

  /** Move the Retry button onto `bar`, taking it off whoever held it. */
  #moveRetryTo(bar: HTMLElement): void {
    this.#retryOwner?.querySelector(".message-action--retry")?.remove();
    const retry = messageActionButton("retry", this.#strings.retryMessage, ICON_RETRY);
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
      // Stated so a reload settles this card the same way. The card's own status
      // lives only in the DOM, and the DOM is what a reload throws away.
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
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
        // The one outcome with no error text and no server involvement at all:
        // a person said no in this browser. Nothing else records that, so
        // without the annotation the reload showed a green card for an action
        // the user had explicitly refused.
        return { content: message, outcome: TOOL_OUTCOME.DENIED };
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
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
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
        if (name === SUBAGENT_CUSTOM_NAME) {
          this.#reportSubAgent(value);
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
      // The delegation's own lifetime, on the protocol's events rather than the
      // CUSTOM channel its steps ride. Both end at the same panel.
      onSubAgentStarted: (subagentRunId, agent, parentToolCallId) => {
        // A delegation naming no parent call names no card, and a floating
        // panel is exactly what attaching to the card was chosen over.
        if (parentToolCallId === null) {
          return;
        }
        this.#subagentRunDelegations.set(subagentRunId, parentToolCallId);
        this.#applySubAgent({
          delegationId: parentToolCallId,
          agent: agent === "" ? null : agent,
          phase: SUBAGENT_PHASE.STARTED,
          status: this.#strings.subAgentDelegatedTo.replace("{agent}", agent),
          tool: null,
        });
      },
      onSubAgentFinished: (subagentRunId) => {
        this.#closeSubAgent(subagentRunId, SUBAGENT_PHASE.FINISHED, null);
      },
      onSubAgentError: (subagentRunId, message) => {
        // The server's own words, which the contract keeps to the sub-agent's
        // name. Passed through as the status line and set with textContent
        // downstream, never parsed as markup.
        //
        // The message is required by the protocol and can still arrive empty,
        // which would settle the row to a blank line -- a delegation that reads
        // as having said nothing rather than as having failed. The fallback was
        // written and documented in UiStrings and never wired up, so until now
        // the only reader who knew it existed was the one reading the string
        // table.
        this.#closeSubAgent(
          subagentRunId,
          SUBAGENT_PHASE.FAILED,
          message === "" ? this.#strings.subAgentFailed : message,
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
      onToolResult: (toolCallId, content, outcome) => {
        const card = this.#toolCards.get(toolCallId);
        if (card === undefined) {
          return;
        }
        // Settled as the server says it ended, not as "it ended". This path used
        // to pass DONE unconditionally, so a refusal arrived as a green card
        // with the reason folded inside it -- a booking the server declined
        // read, at a glance, as a booking that was made. An absent or
        // unrecognised outcome still means DONE, so every server written before
        // the field existed renders exactly as it did.
        card.settle(toolStatusFromOutcome(outcome), content);
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

  /**
   * Draw one step of a delegated sub-agent's progress, on the card that
   * delegated.
   *
   * `delegationId` is the parent's own `delegate_task` tool-call id, so the
   * attachment point is a card this element already drew on `TOOL_CALL_START`.
   * That is the whole design: a run that hands work to a sub-agent used to read
   * as a stall -- the card sat at "running…" for the child's entire duration --
   * and the fix is to narrate *into* the thing that was already standing there,
   * rather than to float a second element with the same identity.
   *
   * A progress event for a call this client never drew is dropped. It has no
   * card to attach to, and inventing a floating one is precisely the alternative
   * that was rejected: parent and child interleave in the transcript with
   * nothing marking whose is whose, and the persisted transcript -- which never
   * held the progress at all -- would not match what was on screen.
   *
   * Nothing here writes to the conversation store. `CUSTOM` never enters
   * `agent.messages`, so a reload mid-run leaves the tool card and loses the
   * nested detail, which is the intended behaviour rather than a gap.
   */
  #reportSubAgent(value: unknown): void {
    const update = subAgentUpdate(value);
    if (update === null) {
      return;
    }
    this.#applySubAgent(update);
  }

  /**
   * Fold one already-narrowed update into the delegation's panel.
   *
   * The join point of the two carriers, and the reason it is separate from
   * {@link #reportSubAgent}: a `CUSTOM` step arrives as `unknown` and has to be
   * vouched for, while a lifecycle event arrives typed off the protocol and has
   * nothing left to check. Both end up here, so the panel has one way in and
   * the phases stay a single state machine regardless of which wire they came
   * from.
   */
  /**
   * Settle the delegation a closing lifecycle event names.
   *
   * `status` is the server's text on a failure and `null` on a success, where
   * the wording is this element's own -- the protocol's finish event carries no
   * message, which is the better shape for a localised UI and the reason
   * {@link UiStrings.subAgentFinished} exists.
   *
   * The pairing is deliberately not deleted on close. A panel outlives the
   * delegation it drew, the map is cleared with the transcript alongside the
   * panels, and forgetting the id here would only make a duplicate close draw
   * nothing instead of drawing the same settled row again.
   */
  #closeSubAgent(subagentRunId: string, phase: SubAgentPhase, status: string | null): void {
    const delegationId = this.#subagentRunDelegations.get(subagentRunId);
    if (delegationId === undefined) {
      // A close naming a delegation this never saw open -- the same refusal a
      // step for an undrawn card gets, and the same reason.
      return;
    }
    const agent = this.#subagentPanels.get(delegationId)?.agent ?? null;
    this.#applySubAgent({
      delegationId,
      agent,
      phase,
      status: status === null ? this.#finishedLine(agent) : status,
      tool: null,
    });
  }

  /** The row's line for a delegation that completed, named if its name is known. */
  #finishedLine(agent: string | null): string {
    return agent === null
      ? this.#strings.subAgentWorking
      : this.#strings.subAgentFinished.replace("{agent}", agent);
  }

  #applySubAgent(update: SubAgentUpdate): void {
    const card = this.#toolCards.get(update.delegationId);
    if (card === undefined) {
      return;
    }
    let panel = this.#subagentPanels.get(update.delegationId);
    if (panel === undefined) {
      // Created on whichever phase arrives first rather than only on `started`.
      // The contract says exactly one opens a delegation, and a client that
      // insisted on it would answer a server that dropped one frame by showing
      // nothing at all for the rest of the run.
      panel = new SubAgentPanel(this.#strings);
      this.#subagentPanels.set(update.delegationId, panel);
      card.subagentSlot.appendChild(panel.element);
    }
    panel.report(update);
    // The card grew, and the transcript is usually pinned to the foot while a
    // run is in flight.
    this.#scroller.follow();
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

  /**
   * An inline notice about something the run did.
   *
   * `undo` is offered only where the agent rearranged the user's own window --
   * see {@link renderRunNotice} for why a notice may carry that one control and
   * nothing else.
   */
  #appendNotice(
    icon: string,
    text: string,
    kind: string,
    undo?: { readonly label: string; readonly onActivate: () => void },
  ): void {
    this.#ensureGroup().appendChild(renderRunNotice(icon, text, kind, undo));
    this.#updateEmptyState();
    this.#scroller.follow();
  }

  /**
   * Say that the agent rearranged the user's window, and offer the way back.
   *
   * Only on the agent's path. A host calling {@link moveTo} is arranging its
   * own page and does not need telling what it just did; an agent doing it
   * mid-conversation is the case where a panel appears to move on its own.
   */
  #announceSurfaceChange(text: string, undo: (() => void) | null): void {
    this.#appendNotice(
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
    const card = new ToolCallCard(call.name, call.args, summary, this.#strings, {
      // A thunk over the live property, not the property itself: the card keeps
      // this for the life of the call, and the result region is filled when the
      // tool settles -- which can be long after a host set the hook.
      formatPayload: (payload) => this.formatToolPayload?.(payload) ?? null,
    });
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

/**
 * A pasted file, guaranteed to have a name.
 *
 * A file dropped or picked always carries one; a pasted one need not. Some
 * engines hand over a blob with an empty name, which travels all the way to
 * the upload as an empty `filename` and lands on the server as a file nobody
 * can identify -- while the chip in the tray shows an empty label. A file that
 * already has a name keeps it, including the generic one Chrome gives a pasted
 * screenshot: it is at least what the file is, and the chip shows the size
 * beside it.
 */
function named(file: File): File {
  if (file.name !== "") {
    return file;
  }
  // The subtype is the extension for every clipboard image type worth naming.
  // A type with no slash in it falls back to the whole string, and an absent
  // one leaves a bare stamp rather than a name ending in a dot.
  const subtype = file.type.split("/")[1] ?? file.type;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new File([file], subtype === "" ? `pasted-${stamp}` : `pasted-${stamp}.${subtype}`, {
    type: file.type,
  });
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
