import type { Context, Interrupt, Message, Tool } from "@ag-ui/core";
import {
  ATTACHMENT_EVENT,
  COMPACTION_ACTIVITY_TYPE,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  ICON_ATTACH,
  ICON_LAUNCHER,
  ICON_SEND,
  ICON_STOP,
  LOAD_CAPABILITY_TOOL,
  MESSAGE_ROLE,
  READ_PAGE_TOOL,
  STATE_EVENT,
  SUBMIT_EVENT,
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
import { type ClientTool, ClientToolRegistry } from "../tools/client_tool_registry.js";
import { isDestructive } from "../tools/is_destructive.js";
import { isNavigates } from "../tools/is_navigates.js";
import { createPageActionTools, type ResolvePageTarget } from "../tools/page_action_tools.js";
import { createPageMapContext, type PageMap } from "../tools/page_map.js";
import { createPageStateTools, type PageState } from "../tools/page_state.js";
import { parseToolCatalog } from "../tools/parse_tool_catalog.js";
import { createRouteTools, type RouteMap } from "../tools/route_map.js";
import {
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "../ui/approval_card.js";
import { attachCopyButtons } from "../ui/attach_copy_buttons.js";
import { renderAttachmentChips } from "../ui/attachment_chips.js";
import { AttachmentTray } from "../ui/attachment_tray.js";
import { CheckpointMenu, type CheckpointVerb } from "../ui/checkpoint_menu.js";
import { type ConfirmationRequest, requestConfirmation } from "../ui/confirmation_card.js";
import { prettifyToolName } from "../ui/prettify_tool_name.js";
import {
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "../ui/question_card.js";
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
import { STYLES } from "../ui/styles.js";
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
} from "./conversation_store.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import { RemoteConversationStore } from "./remote_conversation_store.js";
import { RunIndex } from "./run_index.js";
import { type TranscribeHandler, transcribeAudio } from "./transcribe_audio.js";
import { type UploadHandler, uploadAttachment } from "./upload_attachment.js";
import { withCredentials } from "./utils.js";

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
export interface StateDetail {
  readonly state: Readonly<Record<string, unknown>>;
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
   * Permit `<img>` in rendered assistant markdown. **Off by default**: a
   * model-controlled image URL is fetched with no user interaction, which
   * makes it a zero-click exfiltration channel for prompt-injected page
   * data. Enable only when the content source is trusted.
   */
  allowImages = false;

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
   * Card labels fetched from a server tool catalog (`data-tools-url`), keyed by
   * tool name. The base layer behind {@link toolSummaries}: an explicit entry in
   * `toolSummaries` wins, this fills the rest. Populated once on connect.
   */
  #toolCatalog: Record<string, string> = {};
  /** The resolved string table (defaults ← `data-strings` ← `strings`). */
  #strings: UiStrings = DEFAULT_UI_STRINGS;

  readonly #toolRegistry = new ClientToolRegistry();
  /** Tool-call cards awaiting execution, keyed by call id. */
  readonly #toolCards = new Map<string, ToolCallCard>();
  /**
   * Call ids whose card was already settled from a streamed server-side result
   * (`TOOL_CALL_RESULT`), so the post-run executeTool sweep doesn't overwrite
   * the real output with the generic "executed on the server" fallback.
   */
  readonly #serverSettled = new Set<string>();
  readonly #root: ShadowRoot;
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
  // active thread), so two instances on one origin don't clobber each other.
  // Empty ⇒ the pre-namespacing global keys (back-compat). Resolved on connect.
  #storageNs = "";
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
        () => this.#requestHeaders(),
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
      ...this.#credentialsOption(),
      threadId: this.#threadId,
      // The seed the endpoints assume: nothing. The snapshot is the history.
      initialMessages: [],
    });
    const client = new AgUiClient({
      agent,
      handlers: this.#handlers(),
      getTools: () => this.getTools(),
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
    this.#checkpoints.setRuns(index === null ? [] : await index.continuable());
  }

  /** Attributes the element reacts to after it has been connected. */
  static get observedAttributes(): string[] {
    return ["title-text", "placement", "credentials", ...CONNECT_TIME_ATTRIBUTES];
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

  /** Declare a frontend tool the agent may call. */
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
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return answer;
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
  #fetchInit(): RequestInit | undefined {
    return withCredentials({ headers: this.#requestHeaders() }, this.#requestCredentials());
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
    // Resolve the per-instance storage namespace (id, else endpoint) before any
    // key read/write, so this instance doesn't share collapsed/theme/thread
    // state with another on the same origin.
    this.#storageNs = this.id !== "" ? this.id : this.endpoint;
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
    if (this.#storageNs !== "" && this.conversationStore instanceof SessionStorageStore) {
      this.conversationStore = new SessionStorageStore(this.#storageNs);
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
    this.#cancelRun();
    this.#attachTray?.dispose();
    this.#voice?.dispose();
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
        headers: this.#requestHeaders(),
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
        headers: this.#requestHeaders(),
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
   */
  #wireThreadStore(): void {
    const url = this.getAttribute("data-threads-url");
    if (url !== null) {
      this.conversationStore = new RemoteConversationStore(
        url,
        () => this.#requestHeaders(),
        this.conversationStore,
        () => this.#requestCredentials(),
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
      const response = await fetch(url, this.#fetchInit());
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
      const response = await fetch(url, this.#fetchInit());
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
    sessionStorage.setItem(this.#storageKey(COLLAPSED_KEY), collapsed ? "1" : "0");
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
    sessionStorage.setItem(this.#storageKey(THEME_KEY), next);
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
    sessionStorage.setItem(this.#storageKey(SIZE_KEY), JSON.stringify(stored));
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
    void this.#refreshCheckpoints();
    this.#checkpoints.open();
  }

  /**
   * Start a fresh conversation: forget the persisted history, drop the
   * in-memory run state, clear the transcript, and mint a new thread id.
   */
  newChat(): void {
    // Stop any in-flight run first — discarding the client mid-run would
    // leave the old agent streaming into a cleared transcript.
    this.#cancelRun();
    this.conversationStore.clear(this.#threadId);
    this.#resetState();
    this.#threadId = this.conversationStore.threadId();
    this.#setRunning(false);
    this.#setUnread(0);
  }

  /** Drop the in-memory run + transcript, leaving the thread id untouched. */
  #resetState(): void {
    this.#client = null;
    this.#streamingBubble = null;
    this.#currentGroup = null;
    this.#thoughts = null;
    this.#hidePending();
    this.#toolCards.clear();
    this.#serverSettled.clear();
    this.#initialMessages = [];
    this.#attachTray?.clear();
    // Keep the empty-state region; everything else clears.
    this.#messages.replaceChildren(this.#emptyWrap);
    this.#updateEmptyState();
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
        this.appendMessage(MESSAGE_ROLE.ASSISTANT, text).classList.add("message--restored");
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
        this.#cardFor(restored);
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
    this.#messages.scrollTop = this.#messages.scrollHeight;
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
    const style = document.createElement("style");
    style.textContent = STYLES;

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

    const checkpoints = this.#headerButton("checkpoints", this.#strings.checkpoints, "⭯");
    checkpoints.addEventListener("click", () => this.openCheckpoints());

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
    // Screen readers announce streamed messages as they arrive.
    this.#messages.setAttribute("role", "log");
    this.#messages.setAttribute("aria-live", "polite");
    this.#messages.setAttribute("aria-label", this.#strings.conversation);

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
    this.#chat.append(
      header,
      this.#messages,
      this.#skillsMenu.palette,
      this.#skillsMenu.chips,
      this.#skillHint,
      this.#attachSlot,
      inputRow,
      footer,
      this.#drawer.element,
      this.#checkpoints.element,
    );

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
    this.#root.append(style, this.#chat, this.#launcher);
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
        ...this.#credentialsOption(),
        threadId: this.#threadId,
        initialMessages: this.#initialMessages,
        initialState: this.#sharedState,
      });
      this.#client = new AgUiClient({
        agent,
        handlers: this.#handlers(),
        getTools: () => this.getTools(),
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

  /** Whether ``call`` should be gated behind the confirmation card. */
  async #needsConfirmation(call: AgUiToolCall, tool: ClientTool): Promise<boolean> {
    if (this.autoConfirm) {
      return false;
    }
    if (this.confirmPredicate !== null) {
      return (await this.confirmPredicate(call.name, call.args)) === true;
    }
    return isDestructive(tool.parameters);
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
    const tool = this.#resolveTool(call.name);
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
    if (await this.#needsConfirmation(call, tool)) {
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
      });
      this.#updateEmptyState();
      this.#messages.scrollTop = this.#messages.scrollHeight;
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
      const result = await tool.handler(call.args);
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
   * The run is suspended on these cards. A Stop while any is open aborts the
   * shared {@link #confirmAbort} controller, resolving every still-open card as
   * denied. An approved tool runs on the follow-up resume run and streams its
   * result into the same pending card; a denied one settles here, since no
   * result will ever arrive.
   */
  async #resolveInterrupts(
    interrupts: readonly Interrupt[],
  ): Promise<Record<string, InterruptResponse>> {
    const responses: Record<string, InterruptResponse> = {};
    // One controller covers the whole batch: a single Stop denies all of them.
    this.#confirmAbort = new AbortController();
    this.#hidePending();
    for (const interrupt of interrupts) {
      const request: ApprovalRequest = {};
      if (interrupt.message !== undefined) {
        request.message = interrupt.message;
      }
      const card =
        interrupt.toolCallId !== undefined ? this.#toolCards.get(interrupt.toolCallId) : undefined;
      const toolName = card?.element.getAttribute("data-tool-name");
      if (toolName !== null && toolName !== undefined) {
        request.toolName = toolName;
      }
      const signal = this.#confirmAbort.signal;
      // A host-supplied renderer takes full control of the approval UI;
      // otherwise the built-in inline card renders into the current answer group.
      const approved =
        this.approvalRenderer !== null
          ? await this.approvalRenderer(request, { signal })
          : await requestApproval(this.#ensureGroup(), request, { signal, strings: this.#strings });
      this.#updateEmptyState();
      this.#messages.scrollTop = this.#messages.scrollHeight;
      // Same annotation as the client-side confirmation gate. Without it the
      // two gates read differently for the same act: a locally-confirmed call
      // said who let it through and a server-gated one said nothing, which is
      // backwards, since the server-side gate is the one guarding the tools
      // that actually run on the backend.
      card?.recordDecision(approved ? "approved" : "declined");
      if (approved) {
        responses[interrupt.id] = { status: "resolved", payload: { approved: true } };
      } else {
        responses[interrupt.id] = { status: "cancelled" };
        // No TOOL_CALL_RESULT will stream for a denied tool — settle its pending
        // card now rather than leaving it hanging until the onSettled sweep.
        card?.settle(TOOL_CALL_STATUS.DECLINED, this.#strings.declinedAction);
      }
    }
    this.#confirmAbort = null;
    return responses;
  }

  #handlers(): AgUiClientHandlers {
    return {
      onRunStart: () => {
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
        this.#streamInto(buffer);
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
        this.#streamingBubble = null;
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
        this.#cardFor(call);
      },
      onActivity: (activityType, content) => {
        if (activityType !== COMPACTION_ACTIVITY_TYPE) {
          return;
        }
        const removed = compactionRemoved(content);
        if (removed === null) {
          return;
        }
        this.#appendNotice(
          "🗜",
          this.#strings.historyCompacted.replace("{count}", String(removed)),
          "compaction",
        );
      },
      onToolResult: (toolCallId, content) => {
        const card = this.#toolCards.get(toolCallId);
        if (card === undefined) {
          return;
        }
        card.settle(TOOL_CALL_STATUS.DONE, content);
        this.#serverSettled.add(toolCallId);
      },
      onRunEnd: () => {
        // Per-round end; the button stays on Stop until the whole interaction
        // settles — the user must be able to cancel between tool rounds.
        this.#hidePending();
        this.#streamingBubble = null;
      },
      onError: (message) => {
        this.#hidePending();
        this.#revealWords(this.appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`));
        this.#streamingBubble = null;
      },
      onCancelled: () => {
        // Deliberate stop, not a failure: keep whatever partial text already
        // streamed and add a muted note instead of an error bubble.
        this.#hidePending();
        this.#appendStoppedNote();
        this.#streamingBubble = null;
      },
      onSettled: () => {
        // Terminal guarantee: whatever path ended the run, return to rest.
        this.#hidePending();
        this.#setRunning(false);
        this.#streamingBubble = null;
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
      },
    };
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
    this.#messages.scrollTop = this.#messages.scrollHeight;
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
    this.#messages.scrollTop = this.#messages.scrollHeight;
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
      this.#messages.scrollTop = this.#messages.scrollHeight;
    }
    return this.#thoughts;
  }

  #streamInto(buffer: string): HTMLDivElement {
    if (this.#streamingBubble === null) {
      this.#streamingBubble = this.appendMessage(MESSAGE_ROLE.ASSISTANT, "");
      this.#streamDeltas = 0;
    }
    this.#streamingBubble.innerHTML = renderMarkdown(buffer, { allowImages: this.allowImages });
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return this.#streamingBubble;
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
    this.#messages.scrollTop = this.#messages.scrollHeight;
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
          this.#toolCatalog[call.name] ??
          prettifyToolName(call.name));
    const card = new ToolCallCard(call.name, call.args, summary, this.#strings);
    this.#toolCards.set(call.id, card);
    this.#ensureGroup().appendChild(card.element);
    this.#updateEmptyState();
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return card;
  }
}

/** One tool call as a restored assistant message carries it. */
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
