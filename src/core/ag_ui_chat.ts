import type { Context, Message, Tool } from "@ag-ui/core";
import {
  DEFAULT_ATTACHMENT_MAX_BYTES,
  MESSAGE_ROLE,
  SUBMIT_EVENT,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  X_CONFIRM_KEY,
  X_SUMMARY_KEY,
} from "../constants.js";
import { fillTemplate } from "../skills/fill_template.js";
import { parseSkills } from "../skills/parse_skills.js";
import type { Skill } from "../skills/skill.js";
import { type ClientTool, ClientToolRegistry } from "../tools/client_tool_registry.js";
import { isDestructive } from "../tools/is_destructive.js";
import { isNavigates } from "../tools/is_navigates.js";
import { createPageMapContext, type PageMap } from "../tools/page_map.js";
import { parseToolCatalog } from "../tools/parse_tool_catalog.js";
import { createRouteTools, type RouteMap } from "../tools/route_map.js";
import { createStateHookTools, type StateHook } from "../tools/state_hook.js";
import { renderAttachmentChips } from "../ui/attachment_chips.js";
import { AttachmentTray } from "../ui/attachment_tray.js";
import { type ConfirmationRequest, requestConfirmation } from "../ui/confirmation_card.js";
import { prettifyToolName } from "../ui/prettify_tool_name.js";
import { renderMarkdown } from "../ui/render_markdown.js";
import { wrapWords } from "../ui/reveal_words.js";
import { SkillsMenu } from "../ui/skills_menu.js";
import { STYLES } from "../ui/styles.js";
import { ThreadDrawer } from "../ui/thread_drawer.js";
import { ToolCallCard, type ToolDisplayMode } from "../ui/tool_call_card.js";
import {
  AgUiClient,
  type AgUiClientHandlers,
  type AgUiToolCall,
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
import { uploadAttachment } from "./upload_attachment.js";

/** The role a rendered chat message takes. */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/** `detail` shape of the {@link SUBMIT_EVENT} CustomEvent. */
export interface SubmitDetail {
  readonly content: string;
  /** Durable refs for the files attached to this message (empty when none). */
  readonly attachments: readonly AttachmentRef[];
}

/** `detail` shape of the {@link TOGGLE_EVENT} CustomEvent. */
export interface ToggleDetail {
  readonly collapsed: boolean;
}

/** Per-tab persistence key for the collapsed state (survives MPA reloads). */
const COLLAPSED_KEY = "ag-ui-chat:collapsed";

/**
 * `<ag-ui-chat>` — a framework-free chat sidebar Web Component over AG-UI.
 *
 * Owns the Shadow DOM shell (header, scrolling message list, input row),
 * builds an {@link AgUiClient} on first send (via the overridable
 * {@link agentFactory}), and renders streaming assistant text plus tool-call
 * activity. Emits a {@link SUBMIT_EVENT} for host visibility.
 *
 * The per-run frontend tool catalog and context are supplied by
 * {@link getTools} / {@link getContext}, which later phases (the tool
 * registry, DOM driver) populate.
 */
export class AgUiChat extends HTMLElement {
  /** Agent factory; override to inject a custom or fake agent (tests). */
  agentFactory: AgentFactory = createHttpAgent;

  /** Extra HTTP headers for the AG-UI endpoint (e.g. CSRF). */
  headers: Record<string, string> = {};

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
   * Optional per-call confirmation predicate. When set, it is authoritative:
   * given a tool name + args it decides whether *this* call needs confirmation
   * (so one tool can be instant for some args and confirmed for others — what a
   * static `x-destructive` flag can't express). When unset, the `x-destructive`
   * schema flag is used. `autoConfirm` short-circuits both.
   */
  confirmPredicate:
    | ((toolName: string, args: Record<string, unknown>) => boolean | Promise<boolean>)
    | null = null;

  /**
   * Per-run frontend tool catalog provider. Defaults to the built-in
   * `route.*` tools (when a {@link routeMap} is set) plus the tools registered
   * via {@link registerTool} / {@link registerStateHook}; override to supply a
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
   * Per-run context provider. Defaults to the compact page map (when a
   * {@link getPageMap} provider is set and {@link autoInjectPageMap} is on)
   * plus a one-line manifest of the files attached to the message being sent,
   * so the agent knows which `read_attachment` ids are available.
   */
  getContext: () => Context[] = () => [
    ...createPageMapContext(this.getPageMap, this.autoInjectPageMap),
    ...this.#attachmentContext(),
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
   * Friendly display labels for tool-call cards, keyed by tool name (e.g.
   * `{ list_projects: "Search projects" }`). Used as a fallback when a tool has
   * no `x-summary` in its own schema — chiefly **server-side tools** (drf-mcp,
   * `@tool` registry), whose schema never reaches the browser (AG-UI streams
   * only the tool-call name). Client tools should prefer `x-summary` on their
   * schema; this map is the seam for everything else.
   */
  toolSummaries: Record<string, string> = {};

  /**
   * Card labels fetched from a server tool catalog (`data-tools-url`), keyed by
   * tool name. The base layer behind {@link toolSummaries}: an explicit entry in
   * `toolSummaries` wins, this fills the rest. Populated once on connect.
   */
  #toolCatalog: Record<string, string> = {};

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
  readonly #skillHint: HTMLDivElement;
  /** File-picker button + hidden input + tray slot; the tray mounts on connect. */
  readonly #attachButton: HTMLButtonElement;
  readonly #fileInput: HTMLInputElement;
  readonly #attachSlot: HTMLDivElement;
  /** Upload tray; created on connect only when `data-attachments-url` is set. */
  #attachTray: AttachmentTray | null = null;
  /** Refs attached to the message currently being sent (the context manifest). */
  #runAttachments: readonly AttachmentRef[] = [];

  #client: AgUiClient | null = null;
  // Whether an interaction is in flight (first onRunStart → onSettled). Drives
  // the Send⇄Stop button: `agent.isRunning` is false between frontend-tool
  // rounds, but the user must still be able to stop there.
  #running = false;
  // Aborting this dismisses (declines) an open confirmation card when the run
  // is cancelled while the card awaits a decision. One controller per card.
  #confirmAbort: AbortController | null = null;
  #streamingBubble: HTMLDivElement | null = null;
  // Text deltas applied to the current streaming bubble. >1 ⇒ the message
  // revealed progressively as it streamed, so the word reveal must not re-animate
  // it; ≤1 ⇒ it arrived at once and the word reveal is appropriate.
  #streamDeltas = 0;
  #pending: HTMLDivElement | null = null;
  #threadId = "";
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
  }

  /** Attributes whose late changes must reflect in already-rendered chrome. */
  static get observedAttributes(): string[] {
    return ["title-text"];
  }

  attributeChangedCallback(_name: string, _previous: string | null, value: string | null): void {
    // Only `title-text` is observed (other attributes are read at use-time or
    // are CSS-reactive), so update the header title directly.
    this.#title.textContent = value ?? "Assistant";
  }

  /** Declare a frontend tool the agent may call. */
  registerTool(tool: ClientTool): void {
    this.#toolRegistry.register(tool);
  }

  /** Bind a piece of host state to `read_<name>` / `set_<name>` tools. */
  registerStateHook(hook: StateHook): void {
    for (const tool of createStateHookTools(hook)) {
      this.#toolRegistry.register(tool);
    }
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
        name: "read_page",
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

  /** All built-in (route + page) frontend tools. */
  #builtinTools(): ClientTool[] {
    return [...this.#routeTools(), ...this.#pageTools()];
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
   * How much detail tool-call cards show, from the `data-tool-display`
   * attribute (`minimal` / `compact` / `full`). Defaults to `full`.
   */
  get toolDisplay(): ToolDisplayMode {
    const attr = this.getAttribute("data-tool-display");
    if (attr === TOOL_DISPLAY.MINIMAL || attr === TOOL_DISPLAY.COMPACT) {
      return attr;
    }
    return TOOL_DISPLAY.FULL;
  }

  set toolDisplay(value: ToolDisplayMode) {
    this.setAttribute("data-tool-display", value);
  }

  connectedCallback(): void {
    this.#render();
    if (sessionStorage.getItem(COLLAPSED_KEY) === "1") {
      this.setAttribute("collapsed", "");
    }
    this.#initSkills();
    void this.#fetchToolCatalog();
    this.#wireThreadStore();
    this.#wireAttachments();
    this.#threadId = this.conversationStore.threadId();
    void this.#rehydrate();
  }

  /**
   * When `data-attachments-url` is set, enable the composer's file-upload tray:
   * reveal the 📎 button, wire the hidden file input + drag-and-drop, and mount
   * a tray that uploads each picked file (with the element's `headers`) to that
   * endpoint. Without the attribute, the affordance stays hidden — the chat
   * degrades to text-only.
   */
  #wireAttachments(): void {
    const url = this.getAttribute("data-attachments-url");
    if (url === null) {
      return;
    }
    const accept = this.getAttribute("data-attachment-accept") ?? "";
    this.#attachTray = new AttachmentTray({
      upload: (file, onProgress) =>
        uploadAttachment(file, { url, headers: this.headers, onProgress }),
      maxBytes: this.#attachmentMaxBytes(),
      accept,
    });
    this.#attachSlot.appendChild(this.#attachTray.element);
    this.#fileInput.accept = accept;
    this.#attachButton.hidden = false;
    this.#enableDragAndDrop();
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

  /** The one-line manifest of the message's attachments, for the run context. */
  #attachmentContext(): Context[] {
    if (this.#runAttachments.length === 0) {
      return [];
    }
    const lines = this.#runAttachments.map(
      (ref) => `- ${ref.name} (id: ${ref.id}, ${ref.mime || "unknown type"}, ${ref.size} bytes)`,
    );
    return [
      {
        description: "Files the user attached to this message",
        value: `${lines.join("\n")}\nUse the read_attachment tool with an id to read a file's contents.`,
      },
    ];
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
        () => this.headers,
        this.conversationStore,
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
      const response = await fetch(url, { headers: this.headers });
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

  /** Wire the skill surfaces: opt-in flags, embedded catalog, optional fetch. */
  #initSkills(): void {
    this.#skillsMenu.enableChips(this.getAttribute("data-prompt-chips") === "true");
    this.#skillsMenu.enableSlash(this.getAttribute("data-slash-commands") === "true");
    this.#embedSkills = this.#readEmbeddedSkills();
    this.#recomputeSkills();
    void this.#fetchSkills();
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
      const response = await fetch(url, { headers: this.headers });
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

  /** Pre-fill (or send) a picked skill's prompt, filling its placeholders. */
  #applySkill(skill: Skill): void {
    const { text, missing } = fillTemplate(skill.prompt, this.skillContext());
    if (missing.length > 0) {
      this.#skillHint.textContent = `“${skill.title}” needs: ${missing.join(", ")}`;
      this.#skillHint.hidden = false;
      return;
    }
    this.#skillHint.hidden = true;
    this.#input.value = text;
    if (skill.sendImmediately === true) {
      void this.#submit();
    } else {
      this.#input.focus();
    }
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
    sessionStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0");
    this.dispatchEvent(
      new CustomEvent<ToggleDetail>(TOGGLE_EVENT, {
        detail: { collapsed },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /** Flip the collapsed state. Bound to the built-in header toggle. */
  toggleCollapsed(): void {
    this.setCollapsed(!this.collapsed);
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
  }

  /** Drop the in-memory run + transcript, leaving the thread id untouched. */
  #resetState(): void {
    this.#client = null;
    this.#streamingBubble = null;
    this.#hidePending();
    this.#toolCards.clear();
    this.#serverSettled.clear();
    this.#initialMessages = [];
    this.#runAttachments = [];
    this.#attachTray?.clear();
    this.#messages.replaceChildren();
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
    const messages = await this.conversationStore.loadMessages(this.#threadId);
    if (messages !== null) {
      this.#initialMessages = messages;
      for (const message of messages) {
        this.#renderHistoricMessage(message);
      }
    }
    const checkpoint = this.conversationStore.loadCheckpoint(this.#threadId);
    if (checkpoint !== null) {
      await this.#resumeFrom(checkpoint);
    }
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
      const toolCalls = message.toolCalls;
      if (toolCalls !== undefined) {
        for (const call of toolCalls) {
          this.#cardFor({
            id: call.id,
            name: call.function.name,
            args: this.#parseArgs(call.function.arguments),
          });
        }
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

  /** Parse a tool call's JSON `arguments` string from history into an object. */
  #parseArgs(raw: string): Record<string, unknown> {
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
   * Assistant content is rendered as sanitised markdown/HTML; user content
   * stays literal text (no need to parse what the user typed, and it avoids
   * rendering user-authored markup).
   */
  appendMessage(role: MessageRole, content: string): HTMLDivElement {
    const bubble = document.createElement("div");
    bubble.className = `message message--${role}`;
    if (role === MESSAGE_ROLE.ASSISTANT) {
      bubble.innerHTML = renderMarkdown(content, { allowImages: this.allowImages });
    } else {
      bubble.textContent = content;
    }
    this.#messages.appendChild(bubble);
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return bubble;
  }

  #render(): void {
    const style = document.createElement("style");
    style.textContent = STYLES;

    this.#chat.className = "chat";

    const header = document.createElement("div");
    header.className = "header";

    const title = this.#title;
    title.className = "header-title";
    title.textContent = this.getAttribute("title-text") ?? "Assistant";

    const controls = document.createElement("div");
    controls.className = "header-controls";

    const history = document.createElement("button");
    history.type = "button";
    history.className = "header-btn header-btn--history";
    history.title = "Chat history";
    history.setAttribute("aria-label", "Chat history");
    history.textContent = "☰";
    history.addEventListener("click", () => {
      void this.#refreshDrawer();
      this.#drawer.open();
    });

    const newChat = document.createElement("button");
    newChat.type = "button";
    newChat.className = "header-btn header-btn--new";
    newChat.title = "New chat";
    newChat.setAttribute("aria-label", "New chat");
    newChat.textContent = "✚";
    newChat.addEventListener("click", () => this.newChat());

    const collapse = document.createElement("button");
    collapse.type = "button";
    collapse.className = "header-btn header-btn--collapse";
    collapse.title = "Collapse";
    collapse.setAttribute("aria-label", "Collapse");
    collapse.textContent = "—";
    collapse.addEventListener("click", () => this.toggleCollapsed());

    controls.append(history, newChat, collapse);
    header.append(title, controls);

    this.#messages.className = "messages";
    // Screen readers announce streamed messages as they arrive.
    this.#messages.setAttribute("role", "log");
    this.#messages.setAttribute("aria-live", "polite");
    this.#messages.setAttribute("aria-label", "Conversation");

    const inputRow = document.createElement("div");
    inputRow.className = "input-row";

    this.#input.className = "input";
    this.#input.setAttribute("aria-label", "Message");
    this.#input.rows = 2;
    this.#input.placeholder = "Ask anything…";
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));
    this.#input.addEventListener("input", () => this.#onInput());

    this.#send.className = "send";
    this.#send.type = "button";
    this.#send.textContent = "Send";
    this.#send.setAttribute("aria-label", "Send");
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
    this.#skillHint.hidden = true;

    // File-upload affordance: a 📎 button (hidden until `data-attachments-url`
    // is wired) opening a hidden multi-file input. Drag-and-drop covers the
    // whole shell (wired in #enableDragAndDrop).
    this.#attachButton.className = "attach-btn";
    this.#attachButton.type = "button";
    this.#attachButton.textContent = "📎";
    this.#attachButton.title = "Attach files";
    this.#attachButton.setAttribute("aria-label", "Attach files");
    this.#attachButton.hidden = true;
    this.#attachButton.addEventListener("click", () => this.#fileInput.click());

    this.#fileInput.className = "attach-input";
    this.#fileInput.type = "file";
    this.#fileInput.multiple = true;
    this.#fileInput.hidden = true;
    this.#fileInput.addEventListener("change", () => this.#onFilesPicked());

    this.#attachSlot.className = "attachment-slot";

    inputRow.append(this.#attachButton, this.#input, this.#send, this.#fileInput);
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
      this.#drawer.element,
    );
    this.#root.append(style, this.#chat);
  }

  /** Forward input changes to the skills palette and clear any stale hint. */
  #onInput(): void {
    this.#skillsMenu.onInput(this.#input.value);
    this.#skillHint.hidden = true;
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

  /** Swap the composer button between Send (idle) and Stop (running). */
  #setRunning(running: boolean): void {
    this.#running = running;
    const label = running ? "Stop" : "Send";
    this.#send.textContent = label;
    this.#send.setAttribute("aria-label", label);
    this.#send.dataset["state"] = running ? "running" : "idle";
  }

  async #submit(): Promise<void> {
    const content = this.#input.value.trim();
    const attachments = this.#attachTray?.readyRefs() ?? [];
    // Allow an attachments-only message (no typed text), but nothing empty.
    if (content === "" && attachments.length === 0) {
      return;
    }
    const bubble = this.appendMessage(MESSAGE_ROLE.USER, content);
    if (attachments.length > 0) {
      bubble.appendChild(renderAttachmentChips(attachments));
    }
    this.#input.value = "";
    // The refs are now on the bubble; drop the settled chips, keep any still
    // uploading for a follow-up message.
    this.#attachTray?.clearReady();
    // Surfaced to the run via the context manifest until the run settles.
    this.#runAttachments = attachments;
    this.dispatchEvent(
      new CustomEvent<SubmitDetail>(SUBMIT_EVENT, {
        detail: { content, attachments },
        bubbles: true,
        composed: true,
      }),
    );
    await this.#client_send(content, attachments);
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
        headers: this.headers,
        // Live getter: the client is built once and cached, but a rotated
        // token must still reach every request — the factory's fetch wrapper
        // re-reads this on each call.
        getHeaders: () => this.headers,
        threadId: this.#threadId,
        initialMessages: this.#initialMessages,
      });
      this.#client = new AgUiClient({
        agent,
        handlers: this.#handlers(),
        getTools: () => this.getTools(),
        getContext: () => this.getContext(),
        executeTool: (call) => this.#executeTool(call),
        onPersist: (messages) => this.conversationStore.saveMessages(this.#threadId, messages),
      });
    }
    return this.#client;
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
        card.settle(TOOL_CALL_STATUS.DONE, "No result returned.");
      }
      return null;
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
      const decision = requestConfirmation(this.#messages, request, {
        signal: this.#confirmAbort.signal,
      });
      this.#messages.scrollTop = this.#messages.scrollHeight;
      const accepted = await decision;
      this.#confirmAbort = null;
      if (!accepted) {
        const message = "User declined the action.";
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
        card.settle(TOOL_CALL_STATUS.DONE, "Navigating…");
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

  #handlers(): AgUiClientHandlers {
    return {
      onRunStart: () => {
        this.#setRunning(true);
        this.#showPending();
      },
      onTextDelta: (buffer) => {
        this.#hidePending();
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
        this.#streamingBubble = null;
      },
      onToolCall: (call) => {
        this.#hidePending();
        this.#cardFor(call);
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
        // The attachment manifest was for this run only; the model has read what
        // it needed (results now live in history).
        this.#runAttachments = [];
      },
    };
  }

  /** A muted "⏹ Stopped" line in the transcript (distinct from the ⚠️ error bubble). */
  #appendStoppedNote(): void {
    const note = document.createElement("div");
    note.className = "stopped-note";
    note.setAttribute("role", "status");
    note.textContent = "⏹ Stopped";
    this.#messages.appendChild(note);
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
    pending.setAttribute("role", "status");
    pending.setAttribute("aria-label", "Assistant is thinking…");
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "pending-dot";
      pending.appendChild(dot);
    }
    this.#pending = pending;
    this.#messages.appendChild(pending);
    this.#messages.scrollTop = this.#messages.scrollHeight;
  }

  /** Remove the pending indicator if shown. */
  #hidePending(): void {
    this.#pending?.remove();
    this.#pending = null;
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
    const card = new ToolCallCard(call.name, call.args, this.toolDisplay, summary);
    this.#toolCards.set(call.id, card);
    this.#messages.appendChild(card.element);
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return card;
  }
}
