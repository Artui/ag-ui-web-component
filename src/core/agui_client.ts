import { type AbstractAgent, type AgentSubscriber, randomUUID } from "@ag-ui/client";
import type { Context, Message, Tool } from "@ag-ui/core";
import { MAX_TOOL_ROUNDS } from "../constants.js";
import type { AttachmentRef } from "./attachment.js";

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
  /**
   * When `true`, a navigating tool triggered a page reload. The loop stops
   * without appending a result — the result is supplied after the next mount
   * (see the resume path). Mutually exclusive with a usable `content`.
   */
  halt?: boolean;
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
  /**
   * Fired when a server-side tool's result streams back (AG-UI's
   * `TOOL_CALL_RESULT`). Frontend tools don't emit this — the client supplies
   * their result itself — so this is the channel for server-executed output.
   */
  onToolResult(toolCallId: string, content: string): void;
  /** Fired when a reasoning model starts emitting its chain-of-thought. */
  onReasoningStart(): void;
  /** Fired on every reasoning token; ``buffer`` is the full reasoning text so far. */
  onReasoningDelta(buffer: string): void;
  /** Fired when the reasoning block ends (before the answer text streams). */
  onReasoningEnd(): void;
  onRunEnd(): void;
  onError(message: string): void;
  /**
   * Fired when the user cancelled the run ({@link AgUiClient.cancel}) — the
   * deliberate-stop sibling of `onError`. Any partial assistant text already
   * streamed stays valid; the host should keep the bubble and show a muted
   * "stopped" affordance rather than an error. `onSettled` still follows.
   */
  onCancelled(): void;
  /**
   * Fired exactly once when the whole interaction settles — after the run loop
   * ends for any reason (a server-only round, frontend-tool rounds exhausted,
   * a cancellation, or an error). The terminal guarantee that the UI returns
   * to rest (pending indicator cleared, input re-enabled) no matter how the
   * run finished.
   */
  onSettled(): void;
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
  /**
   * Invoked with the latest history whenever it changes, so the host can
   * persist it for durability across page reloads. Omit to keep the
   * conversation in-memory only.
   */
  onPersist?: (messages: readonly Message[]) => void;
  /**
   * Error text surfaced to {@link AgUiClientHandlers.onError} when a run's
   * stream closes without a terminal AG-UI event (`RUN_FINISHED`/`RUN_ERROR`) —
   * a dropped connection. Defaults to `"Connection lost"`; the host passes its
   * localized string.
   */
  connectionLostMessage?: string;
}

/**
 * Raised when a run's stream closes cleanly at the transport level but never
 * emits a terminal AG-UI event, so the run neither finished nor errored. Routed
 * to {@link AgUiClientHandlers.onError} (it is not an abort), turning a silent
 * "stuck pending" into a visible "connection lost".
 */
export class ConnectionLostError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectionLostError";
  }
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
  readonly #onPersist: (messages: readonly Message[]) => void;
  readonly #connectionLostMessage: string;
  // Set by cancel(); reset at the top of each #run(). Checked by the loop so
  // a cancel between frontend-tool rounds doesn't start another round.
  #cancelled = false;

  constructor(config: AgUiClientConfig) {
    this.#agent = config.agent;
    this.#handlers = config.handlers;
    this.#getTools = config.getTools ?? (() => []);
    this.#getContext = config.getContext ?? (() => []);
    this.#executeTool = config.executeTool ?? null;
    this.#onPersist = config.onPersist ?? (() => {});
    this.#connectionLostMessage = config.connectionLostMessage ?? "Connection lost";
  }

  /** Whether a run is currently in flight. */
  get running(): boolean {
    return this.#agent.isRunning;
  }

  /** The current conversation history (for persistence / rehydration). */
  get messages(): readonly Message[] {
    return this.#agent.messages;
  }

  /**
   * Append a user message and run the agent to completion.
   *
   * When the agent calls frontend tools, this executes them and re-runs the
   * agent with the results, looping until the agent stops calling frontend
   * tools (bounded by {@link MAX_TOOL_ROUNDS}).
   *
   * `attachments` ride on the user message as a non-standard field so the
   * default client store round-trips them for history replay; the agent learns
   * the ids from the run context (the server's strict validation ignores the
   * unknown message field), then reads bytes via the `read_attachment` tool.
   */
  async send(content: string, attachments: readonly AttachmentRef[] = []): Promise<void> {
    // Cast at the AG-UI boundary: `attachments` is a web-component augmentation
    // the strict `Message` union doesn't declare, but `addMessage` /
    // `structuredClone` preserve it verbatim.
    const message = { id: randomUUID(), role: "user", content } as Message;
    if (attachments.length > 0) {
      (message as { attachments?: readonly AttachmentRef[] }).attachments = attachments;
    }
    this.#agent.addMessage(message);
    this.#onPersist(this.#agent.messages);
    await this.#run();
  }

  /**
   * Resume the run loop after a navigating tool's result was supplied
   * post-reload (via {@link addToolResult}). Unlike {@link send}, adds no user
   * message — it simply continues the conversation already in history.
   */
  async resume(): Promise<void> {
    await this.#run();
  }

  /** Append a frontend tool result to history (used by the resume path). */
  addToolResult(toolCallId: string, content: string): void {
    this.#agent.addMessage({ id: randomUUID(), role: "tool", content, toolCallId });
    this.#onPersist(this.#agent.messages);
  }

  /**
   * Cancel the in-flight run (AG-UI has no server cancel route — aborting the
   * streaming request is the protocol's cancel; the server observes the
   * disconnect). Safe to call with no run in flight. Partial text already
   * streamed stays in history; {@link AgUiClientHandlers.onCancelled} fires
   * instead of `onError`, and `onSettled` still follows.
   */
  cancel(): void {
    this.#cancelled = true;
    this.#agent.abortRun();
  }

  async #run(): Promise<void> {
    this.#cancelled = false;
    try {
      await this.#runLoop();
      // `@ag-ui/client` filters abort errors inside `runAgent` (it resolves
      // rather than rejects on a cancelled fetch), so a cancelled run usually
      // ends here, not in the catch.
      if (this.#cancelled) {
        this.#onCancelled();
      }
    } catch (error) {
      if (this.#cancelled || isAbortError(error)) {
        this.#onCancelled();
      } else {
        this.#handlers.onError(error instanceof Error ? error.message : String(error));
      }
    } finally {
      this.#handlers.onSettled();
    }
  }

  #onCancelled(): void {
    // The truncated exchange (including any partial assistant text the agent
    // already applied) survives a reload.
    this.#onPersist(this.#agent.messages);
    this.#handlers.onCancelled();
  }

  async #runLoop(): Promise<void> {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      // A cancel during the previous round's frontend-tool execution lands
      // here: the running handler completed, but no further round starts.
      if (this.#cancelled) {
        return;
      }
      const pending: AgUiToolCall[] = [];
      const runState = { terminal: false };
      await this.#agent.runAgent(
        { tools: this.#getTools(), context: this.#getContext() },
        this.#buildSubscriber(pending, runState),
      );
      this.#onPersist(this.#agent.messages);
      // Cancelled mid-stream: the user said stop — don't execute the tool
      // calls collected before the abort.
      if (this.#cancelled) {
        return;
      }
      // The stream resolved without RUN_FINISHED / RUN_ERROR: the transport
      // dropped mid-run. Surface it as an error so the UI doesn't rest silently
      // with a stuck pending indicator (caught by #run → onError).
      if (!runState.terminal) {
        throw new ConnectionLostError(this.#connectionLostMessage);
      }
      if (this.#executeTool === null || pending.length === 0) {
        return;
      }
      let executed = false;
      for (const call of pending) {
        const result = await this.#executeTool(call);
        if (result === null) {
          continue;
        }
        if (result.halt === true) {
          // A navigating tool reloaded the page; the result arrives on the
          // next mount. Stop here rather than re-running into a dead context.
          return;
        }
        this.#agent.addMessage({
          id: randomUUID(),
          role: "tool",
          content: result.content,
          toolCallId: call.id,
        });
        this.#onPersist(this.#agent.messages);
        executed = true;
      }
      if (!executed) {
        return;
      }
    }
  }

  #buildSubscriber(pending: AgUiToolCall[], runState: { terminal: boolean }): AgentSubscriber {
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
      onToolCallResultEvent({ event }) {
        h.onToolResult(event.toolCallId, event.content);
      },
      // Reasoning (THINK-1). `@ag-ui/client` already maps the deprecated
      // THINKING_* events onto these REASONING_* callbacks, so handling the
      // reasoning family alone covers both protocol versions.
      onReasoningStartEvent() {
        h.onReasoningStart();
      },
      onReasoningMessageContentEvent({ reasoningMessageBuffer }) {
        h.onReasoningDelta(reasoningMessageBuffer);
      },
      onReasoningEndEvent() {
        h.onReasoningEnd();
      },
      onRunErrorEvent({ event }) {
        runState.terminal = true;
        h.onError(event.message);
      },
      onRunFinalized() {
        runState.terminal = true;
        h.onRunEnd();
      },
    };
  }
}

/**
 * Whether a rejection came from aborting the run's fetch. Belt-and-suspenders
 * with the `#cancelled` flag: some `@ag-ui/client` versions re-throw the
 * `AbortError` instead of filtering it.
 */
function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
