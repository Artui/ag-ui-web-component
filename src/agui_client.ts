import { type AbstractAgent, type AgentSubscriber, randomUUID } from "@ag-ui/client";
import type { Context, Tool } from "@ag-ui/core";
import { MAX_TOOL_ROUNDS } from "./constants.js";

/** A tool call surfaced to the host by {@link AgUiClient}. */
export interface AgUiToolCall {
  readonly id: string;
  readonly name: string;
  readonly args: Record<string, unknown>;
}

/** The result of executing a frontend tool, destined for a tool-result message. */
export interface ToolExecution {
  /** String content for the AG-UI tool-result message. */
  content: string;
  /** Present when the handler failed; surfaced for logging. */
  error?: string;
}

/**
 * Executes a frontend tool call.
 *
 * Returns the {@link ToolExecution} to post back to the agent, or ``null`` when
 * the call is not a frontend tool the host owns (a server-side tool the server
 * already executed — the client must not re-run for it).
 */
export type ExecuteTool = (call: AgUiToolCall) => Promise<ToolExecution | null>;

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
  /** Executes frontend tool calls. Omit for server-only tool sets. */
  executeTool?: ExecuteTool;
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
  readonly #executeTool: ExecuteTool | null;

  constructor(config: AgUiClientConfig) {
    this.#agent = config.agent;
    this.#handlers = config.handlers;
    this.#getTools = config.getTools ?? (() => []);
    this.#getContext = config.getContext ?? (() => []);
    this.#executeTool = config.executeTool ?? null;
  }

  /** Whether a run is currently in flight. */
  get running(): boolean {
    return this.#agent.isRunning;
  }

  /**
   * Append a user message and run the agent to completion.
   *
   * When the agent calls frontend tools, this executes them and re-runs the
   * agent with the results, looping until the agent stops calling frontend
   * tools (bounded by {@link MAX_TOOL_ROUNDS}).
   */
  async send(content: string): Promise<void> {
    this.#agent.addMessage({ id: randomUUID(), role: "user", content });
    try {
      await this.#runLoop();
    } catch (error) {
      this.#handlers.onError(error instanceof Error ? error.message : String(error));
    }
  }

  async #runLoop(): Promise<void> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const pending: AgUiToolCall[] = [];
      await this.#agent.runAgent(
        { tools: this.#getTools(), context: this.#getContext() },
        this.#buildSubscriber(pending),
      );
      if (this.#executeTool === null || pending.length === 0) {
        return;
      }
      let executed = false;
      for (const call of pending) {
        const result = await this.#executeTool(call);
        if (result === null) {
          continue;
        }
        this.#agent.addMessage({
          id: randomUUID(),
          role: "tool",
          content: result.content,
          toolCallId: call.id,
        });
        executed = true;
      }
      if (!executed) {
        return;
      }
    }
  }

  #buildSubscriber(pending: AgUiToolCall[]): AgentSubscriber {
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
        const call: AgUiToolCall = {
          id: event.toolCallId,
          name: toolCallName,
          args: toolCallArgs,
        };
        pending.push(call);
        h.onToolCall(call);
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
