import { type AbstractAgent, type AgentSubscriber, randomUUID } from "@ag-ui/client";
import type { Context, Tool } from "@ag-ui/core";

/** A tool call surfaced to the host by {@link AgUiClient}. */
export interface AgUiToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/**
 * Callbacks the {@link AgUiClient} invokes as a run progresses. The host
 * (the `<ag-ui-chat>` element) implements these to render streaming text and
 * tool activity into the chat.
 */
export interface AgUiClientHandlers {
  onRunStart(): void;
  /** Fired on every streamed token; ``buffer`` is the full text so far. */
  onTextDelta(buffer: string): void;
  /** Fired when the assistant message completes; ``buffer`` is the final text. */
  onTextEnd(buffer: string): void;
  /** Fired when the agent finishes calling a tool (server- or frontend-side). */
  onToolCall(call: AgUiToolCall): void;
  onRunEnd(): void;
  onError(message: string): void;
}

/**
 * Provider of the per-run frontend tool catalog and context. Both are read
 * fresh on every {@link AgUiClient.send} so the catalog reflects the current
 * page state.
 */
export interface AgUiRunInputs {
  getTools?: () => Tool[];
  getContext?: () => Context[];
}

export interface AgUiClientConfig extends AgUiRunInputs {
  /** The AG-UI agent to drive. Injected so it can be faked in tests. */
  agent: AbstractAgent;
  handlers: AgUiClientHandlers;
}

/**
 * Thin orchestration layer over an AG-UI {@link AbstractAgent}.
 *
 * Translates AG-UI's subscriber callbacks into the host's
 * {@link AgUiClientHandlers}, and appends the user message + current frontend
 * tool catalog + context to each run.
 */
export class AgUiClient {
  readonly #agent: AbstractAgent;
  readonly #handlers: AgUiClientHandlers;
  readonly #getTools: () => Tool[];
  readonly #getContext: () => Context[];

  constructor(config: AgUiClientConfig) {
    this.#agent = config.agent;
    this.#handlers = config.handlers;
    this.#getTools = config.getTools ?? (() => []);
    this.#getContext = config.getContext ?? (() => []);
  }

  /** Whether a run is currently in flight. */
  get running(): boolean {
    return this.#agent.isRunning;
  }

  /** Append a user message and run the agent, streaming results to handlers. */
  async send(content: string): Promise<void> {
    this.#agent.addMessage({ id: randomUUID(), role: "user", content });
    try {
      await this.#agent.runAgent(
        { tools: this.#getTools(), context: this.#getContext() },
        this.#buildSubscriber(),
      );
    } catch (error) {
      this.#handlers.onError(error instanceof Error ? error.message : String(error));
    }
  }

  #buildSubscriber(): AgentSubscriber {
    const h = this.#handlers;
    return {
      onRunInitialized() {
        h.onRunStart();
      },
      onTextMessageContentEvent({ textMessageBuffer }) {
        h.onTextDelta(textMessageBuffer);
      },
      onTextMessageEndEvent({ textMessageBuffer }) {
        h.onTextEnd(textMessageBuffer);
      },
      onToolCallEndEvent({ event, toolCallName, toolCallArgs }) {
        h.onToolCall({ id: event.toolCallId, name: toolCallName, args: toolCallArgs });
      },
      onRunErrorEvent({ event }) {
        h.onError(event.message);
      },
      onRunFinalized() {
        h.onRunEnd();
      },
    };
  }
}
