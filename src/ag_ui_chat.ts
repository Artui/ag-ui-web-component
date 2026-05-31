import type { Context, Tool } from "@ag-ui/core";
import {
  AgUiClient,
  type AgUiClientHandlers,
  type AgUiToolCall,
  type ToolExecution,
} from "./agui_client.js";
import { type ClientTool, ClientToolRegistry } from "./client_tool_registry.js";
import { requestConfirmation } from "./confirmation_modal.js";
import { MESSAGE_ROLE, SUBMIT_EVENT } from "./constants.js";
import { type AgentFactory, createHttpAgent } from "./create_http_agent.js";
import { isDestructive } from "./is_destructive.js";
import { STYLES } from "./styles.js";

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
   * Per-run frontend tool catalog provider. Defaults to the tools registered
   * via {@link registerTool}; override to supply a fully custom catalog.
   */
  getTools: () => Tool[] = () => this.#toolRegistry.tools();

  /** Per-run context provider. */
  getContext: () => Context[] = () => [];

  readonly #toolRegistry = new ClientToolRegistry();
  readonly #root: ShadowRoot;
  readonly #chat: HTMLDivElement;
  readonly #messages: HTMLDivElement;
  readonly #input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;

  #client: AgUiClient | null = null;
  #streamingBubble: HTMLDivElement | null = null;

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

  /** The AG-UI endpoint URL, read from the `endpoint` attribute. */
  get endpoint(): string {
    return this.getAttribute("endpoint") ?? "";
  }

  connectedCallback(): void {
    this.#render();
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
      const agent = this.agentFactory({ endpoint: this.endpoint, headers: this.headers });
      this.#client = new AgUiClient({
        agent,
        handlers: this.#handlers(),
        getTools: () => this.getTools(),
        getContext: () => this.getContext(),
        executeTool: (call) => this.#executeTool(call),
      });
    }
    return this.#client;
  }

  async #executeTool(call: AgUiToolCall): Promise<ToolExecution | null> {
    if (!this.#toolRegistry.has(call.name)) {
      // A server-side tool the server already executed — not ours to re-run.
      return null;
    }
    const tool = this.#toolRegistry.get(call.name);
    if (isDestructive(tool.parameters) && !this.autoConfirm) {
      const accepted = await requestConfirmation(this.#chat, {
        toolName: call.name,
        args: call.args,
      });
      if (!accepted) {
        return { content: "User declined the action." };
      }
    }
    try {
      const result = await tool.handler(call.args);
      return { content: JSON.stringify(result ?? null) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
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
        this.#appendToolCall(call);
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

  #appendToolCall(call: AgUiToolCall): void {
    const card = document.createElement("div");
    card.className = "tool-call";
    card.setAttribute("data-tool-name", call.name);
    card.textContent = `🔧 ${call.name}`;
    this.#messages.appendChild(card);
    this.#messages.scrollTop = this.#messages.scrollHeight;
  }
}
