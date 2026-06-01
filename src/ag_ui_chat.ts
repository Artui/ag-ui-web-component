import type { Context, Message, Tool } from "@ag-ui/core";
import {
  AgUiClient,
  type AgUiClientHandlers,
  type AgUiToolCall,
  type ToolExecution,
} from "./agui_client.js";
import { type ClientTool, ClientToolRegistry } from "./client_tool_registry.js";
import { requestConfirmation } from "./confirmation_modal.js";
import { MESSAGE_ROLE, SUBMIT_EVENT, TOOL_CALL_STATUS } from "./constants.js";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
} from "./conversation_store.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import { isDestructive } from "./is_destructive.js";
import { isNavigates } from "./is_navigates.js";
import { createPageMapContext, type PageMap } from "./page_map.js";
import { createRouteTools, type RouteMap } from "./route_map.js";
import { createStateHookTools, type StateHook } from "./state_hook.js";
import { STYLES } from "./styles.js";
import { ToolCallCard } from "./tool_call_card.js";

/** The role a rendered chat message takes. */
export type MessageRole = (typeof MESSAGE_ROLE)[keyof typeof MESSAGE_ROLE];

/** `detail` shape of the {@link SUBMIT_EVENT} CustomEvent. */
export interface SubmitDetail {
  readonly content: string;
}

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

  /** When true, destructive tools execute without a confirmation modal. */
  autoConfirm = false;

  /**
   * Per-run frontend tool catalog provider. Defaults to the built-in
   * `route.*` tools (when a {@link routeMap} is set) plus the tools registered
   * via {@link registerTool} / {@link registerStateHook}; override to supply a
   * fully custom catalog.
   */
  getTools: () => Tool[] = () => [
    ...this.#routeTools().map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    })),
    ...this.#toolRegistry.tools(),
  ];

  /**
   * Per-run context provider. Defaults to the compact page map (when a
   * {@link getPageMap} provider is set and {@link autoInjectPageMap} is on).
   */
  getContext: () => Context[] = () => createPageMapContext(this.getPageMap, this.autoInjectPageMap);

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

  readonly #toolRegistry = new ClientToolRegistry();
  /** Tool-call cards awaiting execution, keyed by call id. */
  readonly #toolCards = new Map<string, ToolCallCard>();
  readonly #root: ShadowRoot;
  readonly #chat: HTMLDivElement;
  readonly #messages: HTMLDivElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;

  #client: AgUiClient | null = null;
  #streamingBubble: HTMLDivElement | null = null;
  #threadId = "";
  #initialMessages: readonly Message[] = [];

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    this.#chat = document.createElement("div");
    this.#messages = document.createElement("div");
    this.#input = document.createElement("textarea");
    this.#send = document.createElement("button");
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

  /** Resolve a tool by name: built-in route tools first, then the registry. */
  #resolveTool(name: string): ClientTool | null {
    const route = this.#routeTools().find((t) => t.name === name);
    if (route !== undefined) {
      return route;
    }
    return this.#toolRegistry.has(name) ? this.#toolRegistry.get(name) : null;
  }

  /** The AG-UI endpoint URL, read from the `endpoint` attribute. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  connectedCallback(): void {
    this.#render();
    this.#threadId = this.conversationStore.threadId();
    void this.#rehydrate();
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

  /** Render a restored message as a chat bubble (text turns only). */
  #renderHistoricMessage(message: Message): void {
    if (typeof message.content !== "string" || message.content === "") {
      return;
    }
    if (message.role === MESSAGE_ROLE.USER) {
      this.appendMessage(MESSAGE_ROLE.USER, message.content);
    } else if (message.role === MESSAGE_ROLE.ASSISTANT) {
      this.appendMessage(MESSAGE_ROLE.ASSISTANT, message.content);
    }
  }

  /** Complete the checkpointed navigating tool call and continue the run. */
  async #resumeFrom(checkpoint: NavigationCheckpoint): Promise<void> {
    this.conversationStore.saveCheckpoint(this.#threadId, null);
    const client = this.#ensureClient();
    client.addToolResult(checkpoint.toolCallId, JSON.stringify(this.navigationResult(checkpoint)));
    await client.resume();
  }

  /** Append a message bubble and return it. */
  appendMessage(role: MessageRole, content: string): HTMLDivElement {
    const bubble = document.createElement("div");
    bubble.className = `message message--${role}`;
    bubble.textContent = content;
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
    header.textContent = this.getAttribute("title-text") ?? "Assistant";

    this.#messages.className = "messages";

    const inputRow = document.createElement("div");
    inputRow.className = "input-row";

    this.#input.className = "input";
    this.#input.rows = 2;
    this.#input.placeholder = "Ask anything…";
    this.#input.addEventListener("keydown", (event) => this.#onKeydown(event));

    this.#send.className = "send";
    this.#send.type = "button";
    this.#send.textContent = "Send";
    this.#send.addEventListener("click", () => {
      void this.#submit();
    });

    inputRow.append(this.#input, this.#send);
    this.#chat.append(header, this.#messages, inputRow);
    this.#root.append(style, this.#chat);
  }

  #onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void this.#submit();
    }
  }

  async #submit(): Promise<void> {
    const content = this.#input.value.trim();
    if (content === "") {
      return;
    }
    this.appendMessage(MESSAGE_ROLE.USER, content);
    this.#input.value = "";
    this.dispatchEvent(
      new CustomEvent<SubmitDetail>(SUBMIT_EVENT, {
        detail: { content },
        bubbles: true,
        composed: true,
      }),
    );
    await this.#client_send(content);
  }

  async #client_send(content: string): Promise<void> {
    if (this.endpoint === "") {
      return;
    }
    await this.#ensureClient().send(content);
  }

  #ensureClient(): AgUiClient {
    if (this.#client === null) {
      const agent = this.agentFactory({
        endpoint: this.endpoint,
        headers: this.headers,
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

  async #executeTool(call: AgUiToolCall): Promise<ToolExecution | null> {
    const card = this.#cardFor(call);
    this.#toolCards.delete(call.id);
    const tool = this.#resolveTool(call.name);
    if (tool === null) {
      // A server-side tool the server already executed — not ours to re-run.
      card.settle(TOOL_CALL_STATUS.DONE, "Executed on the server.");
      return null;
    }
    if (isDestructive(tool.parameters) && !this.autoConfirm) {
      const accepted = await requestConfirmation(this.#chat, {
        toolName: call.name,
        args: call.args,
      });
      if (!accepted) {
        const message = "User declined the action.";
        card.settle(TOOL_CALL_STATUS.DECLINED, message);
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
      return { content };
    } catch (error) {
      if (navigates) {
        // The navigation never happened; drop the dangling checkpoint.
        this.conversationStore.saveCheckpoint(this.#threadId, null);
      }
      const message = error instanceof Error ? error.message : String(error);
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      return { content: `Error: ${message}`, error: message };
    }
  }

  #handlers(): AgUiClientHandlers {
    return {
      onRunStart: () => {
        this.#send.disabled = true;
      },
      onTextDelta: (buffer) => {
        this.#streamInto(buffer);
      },
      onTextEnd: (buffer) => {
        this.#streamInto(buffer);
        this.#streamingBubble = null;
      },
      onToolCall: (call) => {
        this.#cardFor(call);
      },
      onRunEnd: () => {
        this.#send.disabled = false;
        this.#streamingBubble = null;
      },
      onError: (message) => {
        this.appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
        this.#send.disabled = false;
        this.#streamingBubble = null;
      },
    };
  }

  #streamInto(buffer: string): void {
    if (this.#streamingBubble === null) {
      this.#streamingBubble = this.appendMessage(MESSAGE_ROLE.ASSISTANT, "");
    }
    this.#streamingBubble.textContent = buffer;
    this.#messages.scrollTop = this.#messages.scrollHeight;
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
    const card = new ToolCallCard(call.name, call.args);
    this.#toolCards.set(call.id, card);
    this.#messages.appendChild(card.element);
    this.#messages.scrollTop = this.#messages.scrollHeight;
    return card;
  }
}
