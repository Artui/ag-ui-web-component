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
  /**
   * Emit a `TOOL_CALL_RESULT` and append the tool message the real client
   * appends for it.
   *
   * `outcome` is the optional field a server states to say the call failed or
   * was refused. Omitted by default, which is what every stream written before
   * the field existed looks like.
   */
  toolResult(toolCallId: string, content: string, outcome?: string): void;
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
  /**
   * Emit an AG-UI `CUSTOM` event -- the imperative carrier.
   *
   * `name` is an open string the protocol does not enumerate, so the cases that
   * matter are the ones nobody wrote a branch for.
   */
  custom(name: string, value: unknown): void;
  /**
   * Emit the protocol's own `SUBAGENT_STARTED`.
   *
   * `parentToolCallId` is optional on the wire, so it is optional here: a
   * delegation that names no parent call is a case the element has to handle
   * rather than one the fake should make impossible.
   */
  subAgentStarted(subagentRunId: string, name: string, parentToolCallId?: string): void;
  /** Emit `SUBAGENT_FINISHED`, which carries the child's run id and nothing else. */
  subAgentFinished(subagentRunId: string): void;
  /** Emit `SUBAGENT_ERROR`, whose `message` the protocol requires. */
  subAgentError(subagentRunId: string, message: string): void;
  /**
   * Apply an AG-UI `MESSAGES_SNAPSHOT`.
   *
   * Mirrors what `@ag-ui/client` does with the real event: **replace** the
   * agent's message list wholesale, then notify subscribers. The replacement is
   * the part that matters -- the client never hands the subscriber the event,
   * only the applied result, and anything reading `agent.messages` afterwards
   * sees the server's list rather than the one the run built.
   */
  messagesSnapshot(next: ReadonlyArray<{ id: string; role: string; content: string }>): void;
  reasoningStart(): void;
  /**
   * One reasoning *delta*, not the buffer so far. `@ag-ui/client` hands the
   * subscriber the content it holds *before* appending the announced delta, so
   * a helper that passes the accumulated text is describing a wire no server
   * writes -- and it hides the last delta going missing.
   */
  reasoning(delta: string): void;
  /** End the block, delivering the complete text the way REASONING_MESSAGE_END does. */
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
  /** Reasoning text accumulated so far, so a delta can report the pre-append buffer. */
  reasoning: string;
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
    toolCall: (toolCallId, toolCallName, toolCallArgs) => {
      agent.appendToolCall(toolCallId, toolCallName, JSON.stringify(toolCallArgs));
      dispatch(s, "onToolCallEndEvent", {
        event: { type: EventType.TOOL_CALL_END, toolCallId },
        toolCallName,
        toolCallArgs,
      });
    },
    toolResult: (toolCallId, content, outcome) => {
      dispatch(s, "onToolCallResultEvent", {
        event: {
          type: EventType.TOOL_CALL_RESULT,
          messageId: `${toolCallId}-result`,
          toolCallId,
          content,
          // Only when given, because the field is absent on every stream from a
          // server that predates it -- which is the case the component has to
          // keep rendering exactly as before, so it is the case the default
          // here has to be.
          ...(outcome === undefined ? {} : { outcome }),
        },
      });
      // The real client appends the tool message *after* dispatching the event,
      // building it from five named fields on the event and dropping anything
      // else -- `outcome` included. Modelled here because the omission is what a
      // test of persistence has to see: a fake that never wrote the message
      // would let "the outcome survives a reload" pass without a tool message to
      // survive on, and a fake that copied `outcome` onto it would agree with a
      // fix that was never made.
      agent.appendToolMessage(`${toolCallId}-result`, toolCallId, content);
    },
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
    custom: (name, value) => {
      dispatch(s, "onCustomEvent", {
        event: { type: EventType.CUSTOM, name, value },
      });
    },
    // The three lifecycle events are dispatched to subscribers and never
    // written into the message list, which is exactly the property that made
    // them adoptable for progress -- so the fake models them the same way,
    // with no touch of `agent.messages`.
    subAgentStarted: (subagentRunId, name, parentToolCallId) => {
      dispatch(s, "onSubagentStartedEvent", {
        event: {
          type: EventType.SUBAGENT_STARTED,
          subagentRunId,
          name,
          // Omitted rather than sent as null, which is what the protocol's own
          // client demands of every optional field on these events.
          ...(parentToolCallId === undefined ? {} : { parentToolCallId }),
        },
      });
    },
    subAgentFinished: (subagentRunId) => {
      dispatch(s, "onSubagentFinishedEvent", {
        event: { type: EventType.SUBAGENT_FINISHED, subagentRunId },
      });
    },
    subAgentError: (subagentRunId, message) => {
      dispatch(s, "onSubagentErrorEvent", {
        event: { type: EventType.SUBAGENT_ERROR, subagentRunId, message },
      });
    },
    messagesSnapshot: (next) => {
      agent.applyMessagesSnapshot(next);
      const applied = next.map((m) => ({
        ...m,
      })) as SubscriberParams<"onMessagesChanged">["messages"];
      // Both, and in this order, because that is what the real client does:
      // it applies the event, then emits the generic change. A fake that only
      // dispatched the snapshot event would let a handler reading the changed
      // list go green while the list it actually persists is a different one.
      dispatch(s, "onMessagesSnapshotEvent", {
        event: { type: EventType.MESSAGES_SNAPSHOT, messages: [...applied] },
      });
      dispatch(s, "onMessagesChanged", { messages: applied });
    },
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
    reasoning: (delta) => {
      // The buffer as it stands *before* this delta is appended, which is what
      // the real client passes.
      dispatch(s, "onReasoningMessageContentEvent", { reasoningMessageBuffer: state.reasoning });
      state.reasoning += delta;
    },
    reasoningEnd: () => {
      // REASONING_MESSAGE_END carries the complete block; REASONING_END does not.
      // Both are emitted because the real stream sends both, in this order.
      dispatch(s, "onReasoningMessageEndEvent", { reasoningMessageBuffer: state.reasoning });
      dispatch(s, "onReasoningEndEvent", {
        event: { type: EventType.REASONING_END, messageId: "reasoning" },
      });
      state.reasoning = "";
    },
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
  /** Replace the agent's message list, as `MESSAGES_SNAPSHOT` does. */
  applyMessagesSnapshot(next: ReadonlyArray<{ id: string; role: string; content: string }>): void;
  /** Append the tool message a `TOOL_CALL_RESULT` leaves in the transcript. */
  appendToolMessage(id: string, toolCallId: string, content: string): void;
  /** Append the assistant message a `TOOL_CALL_START` opens for a call. */
  appendToolCall(toolCallId: string, name: string, args: string): void;
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
  const applyMessagesSnapshot = (
    next: ReadonlyArray<{ id: string; role: string; content: string }>,
  ): void => {
    // Wholesale replacement, in place, because `agent.messages` is the same
    // array reference the handle exposes -- which is exactly how the real
    // client's list behaves and why anything reading it later sees the
    // server's version rather than the one the run built.
    messages.splice(0, messages.length, ...next.map((m) => ({ ...m })));
  };
  const appendToolMessage = (id: string, toolCallId: string, content: string): void => {
    messages.push({ id, role: "tool", content, toolCallId });
  };
  const appendToolCall = (toolCallId: string, name: string, args: string): void => {
    messages.push({
      id: `${toolCallId}-call`,
      role: "assistant",
      content: "",
      toolCalls: [{ id: toolCallId, type: "function", function: { name, arguments: args } }],
    } as never);
  };
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
    // The real `HttpAgent` has this (verified on its prototype, not inferred
    // from the .d.ts); a retry truncates through it, so a fake without it would
    // have made every retry test agree with a method that does not exist.
    setMessages(next: ReadonlyArray<{ id: string; role: string; content: string }>): void {
      applyMessagesSnapshot(next);
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
      const state: EmitState = { terminal: false, reasoning: "" };
      await opts.script?.(
        emitter(subscriber, state, {
          applyState,
          applyMessagesSnapshot,
          appendToolMessage,
          appendToolCall,
        }),
        params,
      );
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
