import {
  type AbstractAgent,
  type AgentSubscriber,
  buildResumeArray,
  type RunAgentParameters,
  randomUUID,
} from "@ag-ui/client";
import type { Context, Interrupt, Message, ResumeEntry, Tool } from "@ag-ui/core";
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
 * Returns the {@link ToolExecution} to post back to the agent, or `null` when
 * the call is not a frontend tool the host owns — a server-side tool the server
 * already executed, which the client must not re-run.
 */
export type ExecuteTool = (call: AgUiToolCall) => Promise<ToolExecution | null>;

/**
 * One user decision for a server-side-tool approval interrupt. Structurally
 * matches `@ag-ui/client`'s (non-exported) `ResumeResponse`, the payload
 * {@link buildResumeArray} turns into a `ResumeEntry`: `resolved` approves (with
 * an optional `payload`, e.g. `{ approved: true }`), `cancelled` denies.
 */
export type InterruptResponse = { status: "resolved"; payload?: unknown } | { status: "cancelled" };

/**
 * Resolves the approval interrupts a run finished on, keyed by interrupt id.
 *
 * A gated server-side tool defers instead of executing, so the run finishes on
 * an interrupt outcome; the host collects one decision per interrupt and the
 * loop resumes with the answers. Omit for agents that never gate server-side
 * tools — an unresolved interrupt then ends the loop.
 */
export type ResolveInterrupts = (
  interrupts: readonly Interrupt[],
) => Promise<Record<string, InterruptResponse>>;

/**
 * Callbacks the {@link AgUiClient} invokes as a run progresses. The host
 * (the `<ag-ui-chat>` element) implements these to render streaming text and
 * tool activity into the chat.
 */
export interface AgUiClientHandlers {
  onRunStart(): void;
  /** Fired on every streamed token; `buffer` is the full text so far. */
  onTextDelta(buffer: string): void;
  /** Fired when the assistant message completes; `buffer` is the final text. */
  onTextEnd(buffer: string): void;
  /** Fired when the agent finishes calling a tool (server- or frontend-side). */
  onToolCall(call: AgUiToolCall): void;
  /**
   * Fired when a server-side tool's result streams back (AG-UI's
   * `TOOL_CALL_RESULT`). Frontend tools don't emit this — the client supplies
   * their result itself — so this is the channel for server-executed output.
   */
  onToolResult(toolCallId: string, content: string): void;
  /**
   * Fired for AG-UI activity events — ambient notices about what the *run* did,
   * as opposed to work the agent asked for. `django-ag-ui` emits one with
   * `activityType: "compaction"` when it condensed the history.
   */
  onActivity(activityType: string, content: unknown, messageId: string): void;
  /**
   * An activity's content changed in place — a snapshot re-sent under the same
   * `messageId` with `replace`, or an `ACTIVITY_DELTA` whose JSON patch
   * `@ag-ui/client` has already applied.
   *
   * Reported after the client has updated its own message, so `content` is the
   * result rather than the instruction. That is the whole reason this is a
   * separate callback: the raw delta event fires *before* the patch lands, and
   * a subscriber acting on it would redraw from stale content.
   */
  onActivityChanged(messageId: string, activityType: string, content: unknown): void;
  /** Fired when a reasoning model starts emitting its chain-of-thought. */
  onReasoningStart(): void;
  /**
   * Fired on every reasoning token, and once more when the block ends.
   *
   * ``buffer`` is the text accumulated *before* the token that triggered the
   * call, which is what the protocol client passes -- so the stream trails by
   * one delta and the final call, at the end of the block, is what completes
   * it. Render the buffer wholesale rather than appending it.
   */
  onReasoningDelta(buffer: string): void;
  /** Fired when the reasoning block ends (before the answer text streams). */
  onReasoningEnd(): void;
  onRunEnd(): void;
  /**
   * The server replaced the whole conversation with `MESSAGES_SNAPSHOT`.
   *
   * `@ag-ui/client` applies the event before any subscriber sees it, so by the
   * time this fires `agent.messages` **is** the server's list -- and the run
   * loop persists `agent.messages`. The replacement therefore reaches the
   * conversation store whatever the host does; this hook exists so the host can
   * stop that being invisible.
   */
  onMessagesSnapshot(messages: readonly Message[]): void;
  /**
   * The agent sent a `CUSTOM` event.
   *
   * Forwarded whole and uninterpreted: `name` is an open string the protocol
   * does not enumerate, so a client that decided which names were legal would
   * be the thing the open field exists to avoid.
   */
  onCustomEvent(name: string, value: unknown): void;
  onError(message: string): void;
  /**
   * Fired when the user cancelled the run ({@link AgUiClient.cancel}) — the
   * deliberate-stop sibling of `onError`. Partial assistant text already
   * streamed stays valid, so the host keeps the bubble and shows a stopped
   * affordance rather than an error. `onSettled` still follows.
   */
  onCancelled(): void;
  /**
   * Fired exactly once when the interaction settles, however the run loop ended
   * — server-only round, rounds exhausted, cancellation, or error. The terminal
   * guarantee that the UI returns to rest.
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
   * Resolves server-side-tool approval interrupts. Omit when no server-side
   * tool is gated for approval — an interrupt then ends the loop unanswered.
   */
  resolveInterrupts?: ResolveInterrupts;
  /**
   * Invoked with the latest history whenever it changes, so the host can
   * persist it for durability across page reloads. Omit to keep the
   * conversation in-memory only.
   */
  onPersist?: (messages: readonly Message[]) => void;
  /**
   * Called whenever AG-UI shared state changes — a streamed `STATE_SNAPSHOT` /
   * `STATE_DELTA`, or {@link AgUiClient.setState}. `@ag-ui/client` owns applying
   * those events; this only forwards the result.
   */
  onStateChanged?: (state: Readonly<Record<string, unknown>>) => void;
  /**
   * Error text for {@link AgUiClientHandlers.onError} when a run's stream closes
   * without a terminal AG-UI event. Defaults to `"Connection lost"`; the host
   * passes its localized string.
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
  readonly #resolveInterrupts: ResolveInterrupts | null;
  readonly #onPersist: (messages: readonly Message[]) => void;
  /**
   * Message ids the server has already closed, so a reuse can be reported. Per
   * client rather than per run — the merge happens across runs, which a per-run
   * set would miss entirely.
   */
  readonly #closedMessageIds = new Set<string>();
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
    this.#resolveInterrupts = config.resolveInterrupts ?? null;
    this.#onPersist = config.onPersist ?? (() => {});
    this.#connectionLostMessage = config.connectionLostMessage ?? "Connection lost";
    const onStateChanged = config.onStateChanged;
    if (onStateChanged !== undefined) {
      // The agent applies STATE_SNAPSHOT / STATE_DELTA itself; subscribing is
      // how the result is learned rather than re-derived from the event stream.
      // Lives for the agent's lifetime, which is this client's.
      this.#agent.subscribe({
        onStateChanged: ({ state }) => {
          onStateChanged(state as Record<string, unknown>);
        },
      });
    }
  }

  /** The current AG-UI shared state, as the agent last applied it. */
  get state(): Readonly<Record<string, unknown>> {
    return this.#agent.state as Record<string, unknown>;
  }

  /** Replace the shared state; the next run sends it as `RunAgentInput.state`. */
  setState(state: Readonly<Record<string, unknown>>): void {
    this.#agent.setState({ ...state });
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
   * default store round-trips them for history replay; see
   * {@link messageAttachments}.
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
   * message; it continues the conversation already in history.
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
    // Persist so the truncated exchange, partial assistant text included,
    // survives a reload.
    this.#onPersist(this.#agent.messages);
    this.#handlers.onCancelled();
  }

  async #runLoop(): Promise<void> {
    // Carries resolved approval answers into the next run when a round finished
    // on a server-side-tool interrupt. Distinct from the public resume(), which
    // continues an unfinished frontend-tool round after a page load; this stays
    // inside one #run().
    let resume: ResumeEntry[] | undefined;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      // A cancel during the previous round's tool execution lands here: the
      // running handler completed, but no further round starts.
      if (this.#cancelled) {
        return;
      }
      const pending: AgUiToolCall[] = [];
      const runState: RunState = { terminal: false, errored: false, interrupts: [] };
      const params: RunAgentParameters = {
        tools: this.#getTools(),
        context: this.#getContext(),
      };
      if (resume !== undefined) {
        params.resume = resume;
      }
      await this.#agent.runAgent(params, this.#buildSubscriber(pending, runState));
      resume = undefined;
      this.#onPersist(this.#agent.messages);
      // Cancelled mid-stream: don't execute the tool calls collected before the
      // abort.
      if (this.#cancelled) {
        return;
      }
      // The stream resolved without RUN_FINISHED / RUN_ERROR, so the transport
      // dropped mid-run. Surface it as an error (via #run) rather than resting
      // silently with a stuck pending indicator.
      if (!runState.terminal) {
        throw new ConnectionLostError(this.#connectionLostMessage);
      }
      // RUN_ERROR is terminal and the agent already reported it via onError.
      // Executing the calls collected before it, or starting another round,
      // would run into a broken context and raise a confusing second error.
      // Pending tool cards are swept at onSettled.
      if (runState.errored) {
        return;
      }
      // A gated server-side tool deferred, so the run finished on an interrupt
      // outcome: resolve each interrupt, then re-enter carrying the answers so
      // the follow-up run executes or denies the tool. Must precede the
      // frontend-tool sweep below — a server-side tool isn't ours to run.
      if (runState.interrupts.length > 0) {
        if (this.#resolveInterrupts === null) {
          return;
        }
        const responses = await this.#resolveInterrupts(runState.interrupts);
        if (this.#cancelled) {
          return;
        }
        resume = buildResumeArray(runState.interrupts, responses);
        continue;
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

  #buildSubscriber(pending: AgUiToolCall[], runState: RunState): AgentSubscriber {
    const h = this.#handlers;
    const closed = this.#closedMessageIds;
    // Read at event time, not captured now: the flag flips mid-run, and the
    // subscriber is built before the run that a later `cancel()` stops.
    const cancelled = (): boolean => this.#cancelled;
    // Charts whose patch has been dispatched but not yet applied. Scoped to the
    // subscriber, so it cannot outlive the run that created it.
    const pendingDeltas = new Set<string>();
    return {
      onRunInitialized() {
        h.onRunStart();
      },
      onTextMessageStartEvent({ event }) {
        // A reused message id merges two answers into one persisted transcript
        // entry. The protocol has no rule to enforce and refusing the event
        // would be worse than the merge, so warn and continue — but do not stay
        // silent, since the corruption outlives the session.
        if (closed.has(event.messageId)) {
          console.warn(
            `<ag-ui-chat>: the server reused message id "${event.messageId}", which was ` +
              "already closed. Its content will be appended to that earlier message rather " +
              "than starting a new one, and the merged result is what gets persisted. " +
              "Issue a fresh id per message.",
          );
        }
      },
      onTextMessageContentEvent({ textMessageBuffer }) {
        h.onTextDelta(textMessageBuffer);
      },
      onTextMessageEndEvent({ event, textMessageBuffer }) {
        closed.add(event.messageId);
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
      onActivitySnapshotEvent({ event, messages }) {
        // A snapshot for an id already in the list is a replacement, not a new
        // activity: the client has swapped its content in place, and a second
        // append would leave the superseded one on screen.
        const known = messages.some(
          (message) => message.id === event.messageId && message.role === "activity",
        );
        if (known) {
          h.onActivityChanged(event.messageId, event.activityType, event.content);
          return;
        }
        h.onActivity(event.activityType, event.content, event.messageId);
      },
      // Deliberately does *not* read the message here. `@ag-ui/client`
      // dispatches this subscriber **before** applying the patch, so the
      // message still holds its previous content: redrawing from it would leave
      // the chart one revision behind for the life of the run, and disagreeing
      // with what a reload shows. Note which chart moved and read the result on
      // the change that follows.
      onActivityDeltaEvent({ event }) {
        pendingDeltas.add(event.messageId);
      },
      // Emitted after the client has written the patched messages, which is the
      // first moment the result exists. Only the ids marked above are looked at,
      // so an ordinary text delta does not walk the transcript.
      onCustomEvent({ event }) {
        h.onCustomEvent(event.name, event.value);
      },
      onMessagesSnapshotEvent({ event }) {
        h.onMessagesSnapshot(event.messages as readonly Message[]);
      },
      onMessagesChanged({ messages }) {
        if (pendingDeltas.size === 0) {
          return;
        }
        for (const id of pendingDeltas) {
          const message = messages.find((entry) => entry.id === id);
          if (message !== undefined && message.role === "activity") {
            h.onActivityChanged(id, message.activityType, message.content);
          }
        }
        pendingDeltas.clear();
      },
      // `@ag-ui/client` maps the deprecated THINKING_* events onto these
      // REASONING_* callbacks, so the reasoning family alone covers both
      // protocol versions.
      onReasoningStartEvent() {
        h.onReasoningStart();
      },
      onReasoningMessageContentEvent({ reasoningMessageBuffer }) {
        h.onReasoningDelta(reasoningMessageBuffer);
      },
      // The delta callback reports the buffer as it stood *before* the announced
      // delta was appended, so on its own it always trails the stream by one and
      // renders nothing at all for a block that arrives as a single delta. The
      // answer text is spared that because its own end event carries the whole
      // message; this is the reasoning counterpart, and it has to be
      // REASONING_MESSAGE_END rather than REASONING_END, because only the former
      // carries a buffer.
      onReasoningMessageEndEvent({ reasoningMessageBuffer }) {
        h.onReasoningDelta(reasoningMessageBuffer);
      },
      onReasoningEndEvent() {
        h.onReasoningEnd();
      },
      onRunFinishedEvent(params) {
        // RUN_FINISHED is terminal for both a normal finish and an interrupt.
        // Capture the interrupts here rather than reading the agent's
        // `pendingInterrupts` afterwards, to stay independent of that field's
        // cross-run clearing semantics.
        runState.terminal = true;
        if (params.outcome === "interrupt") {
          runState.interrupts = params.interrupts;
        }
      },
      onRunErrorEvent({ event }) {
        runState.terminal = true;
        runState.errored = true;
        // Cancelling aborts the response mid-read, and the browser's own words
        // for that can arrive here as a RUN_ERROR — Chrome's is
        // "BodyStreamBuffer was aborted". The run is over either way, but a
        // deliberate stop is not a failure, and reporting it would raise a
        // warning bubble above the stopped note saying the same thing twice.
        // The promise route in `#run` reports the cancellation.
        if (cancelled()) {
          return;
        }
        h.onError(event.message);
      },
      onRunFinalized() {
        runState.terminal = true;
        h.onRunEnd();
      },
    };
  }
}

/** Per-run mutable flags the subscriber writes and {@link AgUiClient} reads. */
interface RunState {
  terminal: boolean;
  errored: boolean;
  /** Approval interrupts a run finished on (empty for a normal finish). */
  interrupts: Interrupt[];
}

/**
 * Whether a rejection came from aborting the run's fetch. Belt-and-suspenders
 * with the `#cancelled` flag: some `@ag-ui/client` versions re-throw the
 * `AbortError` instead of filtering it.
 *
 * Aborting a fetch whose body is mid-read does not always surface as an
 * `AbortError`. Chrome raises `TypeError: BodyStreamBuffer was aborted`, which
 * is the same event wearing a different name, so a message naming the abort is
 * read as one too. Narrow on purpose: only a `TypeError`, and only when it says
 * so — a genuine type error carries no such word, and misreading one as a
 * cancellation would hide a real failure behind a stopped note.
 */
function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.name === "AbortError" || (error instanceof TypeError && /abort/i.test(error.message))
  );
}
