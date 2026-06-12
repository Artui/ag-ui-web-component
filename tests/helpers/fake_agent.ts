import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";

/** A scripted emitter handed to a fake agent's run script. */
export interface Emit {
  runStart(): void;
  text(buffer: string): void;
  textEnd(buffer: string): void;
  toolCall(id: string, name: string, args: Record<string, unknown>): void;
  toolResult(toolCallId: string, content: string): void;
  error(message: string): void;
  runEnd(): void;
}

function emitter(s: AgentSubscriber): Emit {
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
    error: (message) => void s.onRunErrorEvent?.({ event: { message } } as never),
    runEnd: () => void s.onRunFinalized?.({} as never),
  };
}

export interface FakeAgentOptions {
  isRunning?: boolean;
  script?: (emit: Emit) => void | Promise<void>;
  throwOnRun?: Error;
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
      await opts.script?.(emitter(subscriber));
      return {};
    },
  };
  handle.agent = agent as unknown as AbstractAgent;
  return handle;
}
