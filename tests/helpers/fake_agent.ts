import type { AbstractAgent, AgentSubscriber } from "@ag-ui/client";
import { EventType, type Interrupt } from "@ag-ui/core";

/**
 * The payload an AG-UI activity event carries.
 *
 * Narrower than the `unknown` this used to be, because the protocol is: both
 * `ACTIVITY_SNAPSHOT.content` and an activity message's content are keyed
 * records on the wire. Stating that here is what lets the emitters below hand
 * the subscriber a genuinely typed event.
 */
export type ActivityContent = Record<string, unknown>;

/** A scripted emitter handed to a fake agent's run script. */
export interface Emit {
  runStart(): void;
  text(buffer: string): void;
  /** Open a text message with an explicit id (the real client always sends one). */
  textStart(messageId: string): void;
  textEnd(buffer: string, messageId?: string): void;
  toolCall(id: string, name: string, args: Record<string, unknown>): void;
  toolResult(toolCallId: string, content: string): void;
  /** Emit an AG-UI `ACTIVITY_SNAPSHOT` (the run-notice channel). */
  activity(activityType: string, content: ActivityContent, messageId?: string): void;
  /** Re-send an activity under an id already seen, as `replace` does. */
  activityReplace(activityType: string, content: ActivityContent, messageId: string): void;
  /**
   * An `ACTIVITY_DELTA`: the subscriber sees `before`, then the patched
   * `content` arrives via `onMessagesChanged`, as the real client orders it.
   */
  activityDelta(
    activityType: string,
    content: ActivityContent,
    messageId: string,
    before?: ActivityContent,
  ): void;
  /** A delta naming an id the message list does not hold as an activity. */
  activityDeltaOrphan(activityType: string, messageId: string): void;
  /** An ordinary message change, with no chart waiting on it. */
  messagesChanged(): void;
  reasoningStart(): void;
  reasoning(buffer: string): void;
  reasoningEnd(): void;
  error(message: string): void;
  /**
   * Finish the run on an *interrupt* outcome (RUN_FINISHED with pending
   * approvals) — the terminal event a gated server-side tool produces.
   */
  interrupt(interrupts: Interrupt[]): void;
  /**
   * Apply an AG-UI `STATE_SNAPSHOT`. Mirrors what `@ag-ui/client` does with the
   * real event: replace `agent.state`, then notify subscribers — the client
   * never sees the event itself, only the applied result.
   */
  state(snapshot: Record<string, unknown>): void;
  runEnd(): void;
}

/** Tracks whether the script emitted a terminal AG-UI event (finish / error). */
interface EmitState {
  terminal: boolean;
}

/** The full parameter object one subscriber callback declares. */
type SubscriberParams<K extends keyof AgentSubscriber> = Parameters<
  NonNullable<AgentSubscriber[K]>
>[0];

/**
 * Invoke one subscriber callback with a partial parameter object.
 *
 * Every callback takes the whole `AgentSubscriberParams` — the full message
 * list, the live agent, the run input — and a fake that assembled all of that
 * would be a second implementation of `@ag-ui/client` rather than a test
 * helper. So the *completeness* of the object is waived, here, in the one place
 * a reader has to check.
 *
 * What is no longer waived is the **fields**. These emitters used to cast each
 * literal through `never`, which is assignable to every parameter type and so
 * checked nothing whatsoever: a renamed field on the wire renamed here too, and
 * the type-checker had no opinion. `Partial` keeps the omissions legal while
 * measuring every key that *is* supplied against the real declaration — so a
 * rename in `@ag-ui/core` now fails `tsc` in this file, before any test runs.
 *
 * Called through `.call` so a subscriber written with method shorthand keeps
 * its receiver.
 */
function dispatch<K extends keyof AgentSubscriber>(
  subscriber: AgentSubscriber,
  key: K,
  params: Partial<SubscriberParams<K>>,
): void {
  const callback = subscriber[key] as ((p: unknown) => unknown) | undefined;
  void callback?.call(subscriber, params);
}

function emitter(s: AgentSubscriber, state: EmitState, agent: FakeAgentInternals): Emit {
  /** An activity message as `@ag-ui/client` holds it in the transcript. */
  const activityMessage = (
    messageId: string,
    activityType: string,
    content: ActivityContent,
  ): SubscriberParams<"onMessagesChanged">["messages"][number] => ({
    id: messageId,
    role: "activity",
    activityType,
    content,
  });

  return {
    runStart: () => dispatch(s, "onRunInitialized", {}),
    // Only the buffer: the component reads that and not the event, and stating
    // an event here would be inventing a delta the caller never supplied.
    text: (textMessageBuffer) => dispatch(s, "onTextMessageContentEvent", { textMessageBuffer }),
    textStart: (messageId) =>
      dispatch(s, "onTextMessageStartEvent", {
        event: { type: EventType.TEXT_MESSAGE_START, messageId, role: "assistant" },
      }),
    textEnd: (textMessageBuffer, messageId = "msg") =>
      dispatch(s, "onTextMessageEndEvent", {
        event: { type: EventType.TEXT_MESSAGE_END, messageId },
        textMessageBuffer,
      }),
    toolCall: (toolCallId, toolCallName, toolCallArgs) =>
      dispatch(s, "onToolCallEndEvent", {
        event: { type: EventType.TOOL_CALL_END, toolCallId },
        toolCallName,
        toolCallArgs,
      }),
    toolResult: (toolCallId, content) =>
      dispatch(s, "onToolCallResultEvent", {
        event: {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${toolCallId}-result`,
          toolCallId,
          content,
        },
      }),
    // `messages` is passed because the real client always passes it, and the
    // component reads it to tell a new activity from one being replaced. A fake
    // that omitted it would let a null-check rot in the source unnoticed.
    //
    // `replace` is true on both of these, including the one that is *not* a
    // replacement, because that is what the wire carries: the field has a
    // default on the server's model and every recorded snapshot has it set. The
    // distinction the component draws is between an id it has already seen and
    // one it has not, which is `messages`, not this flag.
    activity: (activityType, content, messageId = "act-1") =>
      dispatch(s, "onActivitySnapshotEvent", {
        event: {
          type: EventType.ACTIVITY_SNAPSHOT,
          activityType,
          content,
          messageId,
          replace: true,
        },
        messages: [],
      }),
    activityReplace: (activityType, content, messageId) =>
      dispatch(s, "onActivitySnapshotEvent", {
        event: {
          type: EventType.ACTIVITY_SNAPSHOT,
          activityType,
          content,
          messageId,
          replace: true,
        },
        messages: [activityMessage(messageId, activityType, content)],
      }),
    activityDeltaOrphan: (activityType, messageId) => {
      dispatch(s, "onActivityDeltaEvent", {
        event: { type: EventType.ACTIVITY_DELTA, activityType, messageId, patch: [] },
        messages: [],
      });
      // Present but not an activity, which the client warns about and this
      // component must simply not draw.
      dispatch(s, "onMessagesChanged", {
        messages: [{ id: messageId, role: "assistant", content: "text" }],
      });
    },
    messagesChanged: () => dispatch(s, "onMessagesChanged", { messages: [] }),
    // Models the real order, which is the opposite of what it looks like:
    // `@ag-ui/client` dispatches `onActivityDeltaEvent` **first**, with the
    // message still holding its *pre*-patch content, and only then applies the
    // patch and emits `onMessagesChanged`. A fake that handed the subscriber
    // the patched content would let a component redraw from stale data and
    // still go green -- which is exactly what happened.
    activityDelta: (activityType, content, messageId, before = {}) => {
      dispatch(s, "onActivityDeltaEvent", {
        event: { type: EventType.ACTIVITY_DELTA, activityType, messageId, patch: [] },
        messages: [activityMessage(messageId, activityType, before)],
      });
      dispatch(s, "onMessagesChanged", {
        messages: [activityMessage(messageId, activityType, content)],
      });
    },
    reasoningStart: () =>
      dispatch(s, "onReasoningStartEvent", {
        event: { type: EventType.REASONING_START, messageId: "reasoning" },
      }),
    reasoning: (reasoningMessageBuffer) =>
      dispatch(s, "onReasoningMessageContentEvent", { reasoningMessageBuffer }),
    reasoningEnd: () =>
      dispatch(s, "onReasoningEndEvent", {
        event: { type: EventType.REASONING_END, messageId: "reasoning" },
      }),
    error: (message) => {
      state.terminal = true;
      dispatch(s, "onRunErrorEvent", { event: { type: EventType.RUN_ERROR, message } });
    },
    interrupt: (interrupts) => {
      state.terminal = true;
      dispatch(s, "onRunFinishedEvent", {
        event: { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" },
        outcome: "interrupt",
        interrupts,
      });
    },
    state: (snapshot) => {
      agent.applyState(snapshot);
    },
    runEnd: () => {
      state.terminal = true;
      dispatch(s, "onRunFinalized", {});
    },
  };
}

export interface FakeAgentOptions {
  isRunning?: boolean;
  script?: (emit: Emit, params: FakeRunParams) => void | Promise<void>;
  throwOnRun?: Error;
  /**
   * Simulate a dropped stream: skip the implicit `RUN_FINISHED` the fake emits
   * after a script that didn't terminate itself. A real successful run always
   * finalizes, so by default the fake does too — only the connection-loss tests
   * opt out.
   */
  dropStream?: boolean;
  /** Seed for `agent.state`, as `@ag-ui/client`'s `initialState` would. */
  initialState?: Record<string, unknown>;
}

export interface FakeAgentHandle {
  agent: AbstractAgent;
  messages: ReadonlyArray<{ id: string; role: string; content: string; toolCallId?: string }>;
  lastRunParams: FakeRunParams | null;
  /** Every run's params in order — lets a test assert the resume follow-up. */
  runParams: FakeRunParams[];
  /** How many times abortRun() was called (the protocol-level cancel). */
  abortRuns: number;
}

/** What the emitter needs from the agent to apply state the way the real one does. */
interface FakeAgentInternals {
  applyState(snapshot: Record<string, unknown>): void;
}

/** The subset of `RunAgentParameters` the fake records / hands to the script. */
export interface FakeRunParams {
  tools?: unknown;
  context?: unknown;
  resume?: unknown;
}

/** Build a minimal fake AG-UI agent that drives the client's subscriber. */
export function makeFakeAgent(opts: FakeAgentOptions = {}): FakeAgentHandle {
  const messages: Array<{ id: string; role: string; content: string; toolCallId?: string }> = [];
  const handle: FakeAgentHandle = {
    messages,
    lastRunParams: null,
    runParams: [],
    abortRuns: 0,
    agent: undefined as unknown as AbstractAgent,
  };
  const subscribers: AgentSubscriber[] = [];
  const applyState = (snapshot: Record<string, unknown>): void => {
    agent.state = { ...snapshot };
    for (const subscriber of subscribers) {
      dispatch(subscriber, "onStateChanged", { state: agent.state });
    }
  };
  const agent = {
    isRunning: opts.isRunning ?? false,
    messages,
    state: { ...(opts.initialState ?? {}) } as Record<string, unknown>,
    subscribe(subscriber: AgentSubscriber): { unsubscribe: () => void } {
      subscribers.push(subscriber);
      return {
        unsubscribe: () => {
          subscribers.splice(subscribers.indexOf(subscriber), 1);
        },
      };
    },
    setState(next: Record<string, unknown>): void {
      applyState(next);
    },
    // Interrupts a run finished on, mirroring @ag-ui/client's field. The client
    // reads interrupts off the RUN_FINISHED event, not this — present only so
    // the fake structurally resembles a real agent.
    pendingInterrupts: [] as unknown[],
    addMessage(message: { id: string; role: string; content: string; toolCallId?: string }): void {
      messages.push(message);
    },
    abortRun(): void {
      handle.abortRuns += 1;
    },
    async runAgent(params: FakeRunParams, subscriber: AgentSubscriber): Promise<unknown> {
      handle.lastRunParams = params;
      handle.runParams.push(params);
      if (opts.throwOnRun !== undefined) {
        throw opts.throwOnRun;
      }
      const state: EmitState = { terminal: false };
      await opts.script?.(emitter(subscriber, state, { applyState }), params);
      // A real run that streamed cleanly emits RUN_FINISHED with an ordinary
      // outcome and *then* finalizes — both, in that order. Emitting only the
      // finalize left the client's normal RUN_FINISHED path unreached: the fake
      // could produce that event solely via `emit.interrupt()`, so the one
      // outcome every successful run actually carries was never exercised.
      if (!state.terminal && opts.dropStream !== true) {
        dispatch(subscriber, "onRunFinishedEvent", {
          event: { type: EventType.RUN_FINISHED, threadId: "thread", runId: "run" },
          outcome: "success",
        });
        dispatch(subscriber, "onRunFinalized", {});
      }
      return {};
    },
  };
  handle.agent = agent as unknown as AbstractAgent;
  return handle;
}
