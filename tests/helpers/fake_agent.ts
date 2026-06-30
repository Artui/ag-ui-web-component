import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";

/** A scripted emitter handed to a fake agent's run script. */
export interface Emit {
  runStart(): void;
  text(buffer: string): void;
  textEnd(buffer: string): void;
  toolCall(id: string, name: string, args: Record<string, unknown>): void;
  toolResult(toolCallId: string, content: string): void;
  reasoningStart(): void;
  reasoning(buffer: string): void;
  reasoningEnd(): void;
  error(message: string): void;
  runEnd(): void;
}

/** Tracks whether the script emitted a terminal AG-UI event (finish / error). */
interface EmitState {
  terminal: boolean;
}

function emitter(s: AgentSubscriber, state: EmitState): Emit {
  // The subscriber callbacks require full AgentSubscriberParams; tests only
  // exercise the fields the client reads, so minimal objects are cast through
  // ``never`` (which is assignable to any parameter type).
  return {
    runStart: () => void s.onRunInitialized?.({} as never),
    text: (textMessageBuffer) => void s.onTextMessageContentEvent?.({ textMessageBuffer } as never),
    textEnd: (textMessageBuffer) => void s.onTextMessageEndEvent?.({ textMessageBuffer } as never),
    toolCall: (toolCallId, toolCallName, toolCallArgs) =>
      void s.onToolCallEndEvent?.({
        event: { toolCallId },
        toolCallName,
        toolCallArgs,
      } as never),
    toolResult: (toolCallId, content) =>
      void s.onToolCallResultEvent?.({ event: { toolCallId, content } } as never),
    reasoningStart: () => void s.onReasoningStartEvent?.({ event: {} } as never),
    reasoning: (reasoningMessageBuffer) =>
      void s.onReasoningMessageContentEvent?.({ reasoningMessageBuffer } as never),
    reasoningEnd: () => void s.onReasoningEndEvent?.({ event: {} } as never),
    error: (message) => {
      state.terminal = true;
      void s.onRunErrorEvent?.({ event: { message } } as never);
    },
    runEnd: () => {
      state.terminal = true;
      void s.onRunFinalized?.({} as never);
    },
  };
}

export interface FakeAgentOptions {
  isRunning?: boolean;
  script?: (emit: Emit) => void | Promise<void>;
  throwOnRun?: Error;
  /**
   * Simulate a dropped stream: skip the implicit `RUN_FINISHED` the fake emits
   * after a script that didn't terminate itself. A real successful run always
   * finalizes, so by default the fake does too — only the connection-loss tests
   * opt out.
   */
  dropStream?: boolean;
}

export interface FakeAgentHandle {
  agent: AbstractAgent;
  messages: ReadonlyArray<{ id: string; role: string; content: string; toolCallId?: string }>;
  lastRunParams: { tools?: unknown; context?: unknown } | null;
  /** How many times abortRun() was called (the protocol-level cancel). */
  abortRuns: number;
}

/** Build a minimal fake AG-UI agent that drives the client's subscriber. */
export function makeFakeAgent(opts: FakeAgentOptions = {}): FakeAgentHandle {
  const messages: Array<{ id: string; role: string; content: string; toolCallId?: string }> = [];
  const handle: FakeAgentHandle = {
    messages,
    lastRunParams: null,
    abortRuns: 0,
    agent: undefined as unknown as AbstractAgent,
  };
  const agent = {
    isRunning: opts.isRunning ?? false,
    messages,
    addMessage(message: { id: string; role: string; content: string; toolCallId?: string }): void {
      messages.push(message);
    },
    abortRun(): void {
      handle.abortRuns += 1;
    },
    async runAgent(
      params: { tools?: unknown; context?: unknown },
      subscriber: AgentSubscriber,
    ): Promise<unknown> {
      handle.lastRunParams = params;
      if (opts.throwOnRun !== undefined) {
        throw opts.throwOnRun;
      }
      const state: EmitState = { terminal: false };
      await opts.script?.(emitter(subscriber, state));
      // A real run that streamed cleanly ends with RUN_FINISHED; mirror that so
      // the client's dropped-stream detection only trips when asked to.
      if (!state.terminal && opts.dropStream !== true) {
        subscriber.onRunFinalized?.({} as never);
      }
      return {};
    },
  };
  handle.agent = agent as unknown as AbstractAgent;
  return handle;
}
