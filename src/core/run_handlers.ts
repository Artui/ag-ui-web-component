import {
  CUSTOM_AGENT_EVENT,
  INVALIDATE_CUSTOM_NAME,
  INVALIDATE_EVENT,
  MESSAGE_ROLE,
  RUN_FINISHED_EVENT,
  SUBAGENT_CUSTOM_NAME,
  TOOL_CALL_STATUS,
} from "../constants.js";
import { attachCopyButtons } from "../ui/excerpts/attach_copy_buttons.js";
import type { RunAnnouncer } from "../ui/progress/run_announcer.js";
import type { SubAgentProgress } from "../ui/progress/subagent_progress.js";
import type { AnswerActions } from "../ui/transcript/answer_actions.js";
import type { AnswerStream } from "../ui/transcript/answer_stream.js";
import type { Transcript } from "../ui/transcript/transcript.js";
import type { UiStrings } from "../ui/ui_strings.js";
import type { ActivityRegistry } from "./activity_registry.js";
import type { AgUiClientHandlers } from "./agui_client.js";
import type { CustomAgentDetail } from "./events/custom_agent_detail.js";
import type { InvalidateDetail } from "./events/invalidate_detail.js";
import type { RunFinishedDetail } from "./events/run_finished_detail.js";
import type { ToolRun } from "./events/tool_run.js";
import type { MessageRole } from "./message_role.js";
import { toolStatusFromOutcome } from "./tool_outcome.js";

/** What the run's event handlers need from the element that owns them. */
export interface RunHandlersHost {
  /** The custom element, which the run's events are dispatched on. */
  readonly element: HTMLElement;
  /** The transcript the run draws into. */
  readonly transcript: Transcript;
  /** The answer streaming into its bubble. */
  readonly stream: AnswerStream;
  /** The action row under each finished answer. */
  readonly actions: AnswerActions;
  /** The activity renderers, and the blocks they drew. */
  readonly activities: ActivityRegistry;
  /** A delegated sub-agent's progress, on the card that delegated. */
  readonly subagents: SubAgentProgress;
  /** The screen-reader status region. */
  readonly announcer: RunAnnouncer;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Whether an interaction is already in flight, which the composer owns. */
  readonly running: () => boolean;
  /** Swap the composer between Send and Stop; settling sends a queued turn. */
  readonly setRunning: (running: boolean) => void;
  /** The element's `appendMessage`, which a failed run's bubble opens through. */
  readonly appendMessage: (role: MessageRole, content: string) => HTMLDivElement;
  /** Count an answer that finished while the widget was collapsed. */
  readonly noteUnread: () => void;
}

/**
 * What one conversation's runs accumulate for the host between an
 * interaction's first round and its settle.
 *
 * A record per conversation rather than fields on the controller, because a
 * run can outlive the conversation it belongs to. Cancelling is a request, not
 * an ending: a stopped run reports how it ended once its request has closed --
 * or once a host tool's handler, which cancelling cannot interrupt, has
 * returned -- and by then New chat may have cleared the transcript and the next
 * message may already be running. Each handler table keeps the record it was
 * built with, so that report describes the run that made it and nothing the
 * next conversation did.
 */
interface RunLedger {
  /**
   * Tool calls made during the current interaction, in the order they started,
   * so {@link RUN_FINISHED_EVENT} can report them once the whole thing settles.
   * Spans tool rounds and an approval interrupt; emptied when the event fires.
   */
  readonly tools: { readonly id: string; readonly name: string }[];
  /**
   * Which of those calls had a result streamed back, and so ran on the server.
   *
   * The transcript keeps the same fact for its cards, and this used to be read
   * from there. But New chat clears the transcript, and a run it cut off
   * reports afterwards -- so a booking the server made came out as the host's
   * own tool, which is the one side the documented listener skips a refetch for.
   */
  readonly serverSettled: Set<string>;
  /**
   * Keys announced during this interaction, de-duplicated in first-seen order.
   *
   * Per element, never module-level: a second mounted chat is a second run, and
   * sharing this would tell one page to refetch on the other's writes. Emptied
   * by {@link RunHandlers.#dispatchRunFinished}, which is the one place that has
   * read it.
   */
  readonly invalidated: Set<string>;
  /**
   * Whether this turn already announced how it ended.
   *
   * `onSettled` is the terminal guarantee and fires however the run ended, so
   * it is the only place that can promise the user hears *something*. But a
   * stopped or failed run has already said the truer thing from `onCancelled`
   * or `onError`, and "assistant answered" after "response stopped" is worse
   * than silence.
   */
  announcedOutcome: boolean;
}

/** An empty ledger, for a conversation nothing has run in yet. */
function emptyLedger(): RunLedger {
  return {
    tools: [],
    serverSettled: new Set<string>(),
    invalidated: new Set<string>(),
    announcedOutcome: false,
  };
}

/** Handlers with the same signatures as `table`, each doing nothing once `attached` is false. */
function whileAttached<T extends object>(table: T, attached: () => boolean): T {
  const guarded: Record<string, (...args: unknown[]) => void> = {};
  for (const [name, handler] of Object.entries(table) as [string, (...args: unknown[]) => void][]) {
    guarded[name] = (...args) => {
      if (attached()) {
        handler(...args);
      }
    };
  }
  return guarded as T;
}

/**
 * The AG-UI event handlers a run is drawn by, and what one interaction
 * accumulates for the host between its first round and its settle: the tool
 * calls it made, the keys it invalidated, and whether it already said how it
 * ended.
 *
 * A controller rather than a factory. The handlers hold nothing of their own,
 * but that bookkeeping is state, and it has never belonged to one handler
 * table: a table is built per client -- the conversation's own, rebuilt after
 * a reset, and one for each checkpoint continuation -- and every table built
 * for one conversation reports into the same bookkeeping. {@link forClient}
 * still returns a fresh table per call.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class RunHandlers {
  readonly #host: RunHandlersHost;
  /**
   * The bookkeeping of the conversation on screen. Replaced rather than
   * emptied by {@link detach}, so a table built before then keeps its own.
   */
  #ledger: RunLedger = emptyLedger();

  constructor(host: RunHandlersHost) {
    this.#host = host;
  }

  /**
   * Detach every handler table built so far, because the conversation they
   * drew into has been cleared away.
   *
   * The element calls this when it resets, having first cancelled what was
   * running. A cancelled run still ends later, and a detached table still
   * reports to the host what that run did: a run stopped part-way may already
   * have written something, and {@link RUN_FINISHED_EVENT} fires on
   * cancellation for exactly that reason. Everything else it would do -- draw a
   * stopped note, announce, put the composer back to Send, settle the pending
   * cards -- would land in a transcript and a composer that now belong to
   * another conversation, possibly mid-run, and is dropped. So is any event the
   * run streams after the reset, invalidations included: an abort closes the
   * request those would arrive on, so what a cancelled run still delivers is
   * how it ended.
   */
  detach(): void {
    this.#ledger = emptyLedger();
  }

  /**
   * A handler table for one AG-UI client. Every table built for the current
   * conversation draws into the same transcript and shares its bookkeeping, so
   * a continuation run reports into the interaction the user is looking at.
   */
  forClient(): AgUiClientHandlers {
    const ledger = this.#ledger;
    const attached = (): boolean => ledger === this.#ledger;
    const { onSettled, ...drawing } = this.#tableFor(ledger);
    return {
      ...whileAttached(drawing, attached),
      onSettled: () => {
        if (attached()) {
          onSettled();
        }
        // Last, so a listener that refetches sees a transcript that has already
        // stopped changing -- and outside the check, because what a run did is
        // true whichever conversation is on screen when it ends.
        this.#dispatchRunFinished(ledger);
      },
    };
  }

  /**
   * The handler table itself, recording into `ledger`. {@link forClient}
   * decides how much of it still runs once the table is detached.
   */
  #tableFor(ledger: RunLedger): AgUiClientHandlers {
    return {
      onRunStart: () => {
        // Per *round*, so guard on the turn: a run that calls three tools fires
        // this three times and the user needs telling once.
        if (!this.#host.running()) {
          ledger.announcedOutcome = false;
          this.#host.announcer.announce(this.#host.strings().announceResponding);
        }
        this.#host.setRunning(true);
        // Open the answer group on the turn's first run so the pending
        // indicator (and everything after) lands inside the well. Idempotent:
        // later rounds of the same turn reuse it.
        this.#host.transcript.ensureGroup();
        this.#host.transcript.showPending();
      },
      onReasoningStart: () => {
        // The model is thinking: swap the pending dots for a live thoughts
        // region at the top of the turn's answer group.
        this.#host.transcript.hidePending();
        this.#host.transcript.showThoughts();
      },
      onReasoningDelta: (buffer) => {
        this.#host.transcript.showThoughts().stream(buffer);
      },
      onReasoningEnd: () => {
        // Leave the region expanded until the answer text starts — it collapses
        // on the first text delta (onTextDelta).
      },
      onTextDelta: (buffer) => {
        this.#host.transcript.hidePending();
        // The answer has begun — fold the thoughts away so they don't crowd it.
        this.#host.transcript.collapseThoughts();
        this.#host.stream.queue(buffer);
        this.#host.stream.countDelta();
      },
      onTextEnd: (buffer) => {
        // A text message that carried no content is a declaration, not an
        // answer, and drawing one puts an empty bubble above every tool call.
        //
        // `TOOL_CALL_START` names the assistant message a call belongs to, and
        // a response whose first part is a tool call has no text to open that
        // message with. pydantic-ai 2.37 started opening and closing an empty
        // one there so the id names a message the stream actually announced --
        // before that it named one no event carried, which a client could only
        // answer by inventing an id of its own that matches nothing echoed
        // back. So this envelope is a correctness fix upstream, it is legal
        // AG-UI, and any server may send one.
        //
        // `ConversationHistory.replay` already declines to draw a bubble for
        // an assistant message with no text. Without the same rule
        // here the live transcript and the reloaded one disagree about the
        // same conversation, which is the harder half of the bug to notice.
        if (buffer === "") {
          this.#host.stream.end();
          return;
        }
        const bubble = this.#host.stream.into(buffer);
        // Only reveal word-by-word when the message arrived at once. If it
        // streamed across multiple deltas it already revealed progressively, so
        // wrapping it now would re-animate the whole message — the awkward
        // "finished response replays one word at a time" bug.
        if (this.#host.stream.deltas <= 1) {
          this.#host.transcript.revealWords(bubble);
        }
        attachCopyButtons(bubble, this.#host.strings());
        this.#host.actions.attach(bubble);
        this.#host.stream.end();
        this.#host.noteUnread();
      },
      onToolCall: (call) => {
        this.#host.transcript.hidePending();
        // A skill activation is an ordinary `load_capability` tool call — the
        // deferred-capability mechanism pydantic-ai already uses — so it arrives
        // here rather than on a channel of its own. Render it as a notice and
        // *return*: falling through would show a raw tool card beside the chip,
        // which is worse than the card alone.
        if (this.#host.transcript.noticeIfSkillLoad(call)) {
          return;
        }
        // Recorded after the skill-load return: a capability load is the agent
        // arranging itself, not work a host's data could have moved under.
        ledger.tools.push({ id: call.id, name: call.name });
        this.#host.transcript.cardFor(call);
      },
      onActivity: (activityType, content, messageId) => {
        this.#host.activities.draw(messageId, activityType, content);
      },
      onCustomEvent: (name, value) => {
        if (name === INVALIDATE_CUSTOM_NAME) {
          this.#dispatchInvalidation(ledger, value);
          return;
        }
        if (name === SUBAGENT_CUSTOM_NAME) {
          this.#host.subagents.report(value);
          return;
        }
        // Straight out to the host page, uninterpreted. This is the imperative
        // carrier: whatever it means, it means it to the page, not to the
        // transcript -- so it is dispatched and deliberately not rendered,
        // persisted or replayed. A host that does not know the name simply has
        // no listener, which is the graceful outcome the open field is for.
        this.#host.element.dispatchEvent(
          new CustomEvent<CustomAgentDetail>(CUSTOM_AGENT_EVENT, {
            detail: { name, value },
            bubbles: true,
            composed: true,
          }),
        );
      },
      // The delegation's own lifetime, on the protocol's events rather than the
      // CUSTOM channel its steps ride. Both end at the same panel.
      onSubAgentStarted: (subagentRunId, agent, parentToolCallId) => {
        this.#host.subagents.start(subagentRunId, agent, parentToolCallId);
      },
      onSubAgentFinished: (subagentRunId) => {
        this.#host.subagents.finish(subagentRunId);
      },
      onSubAgentError: (subagentRunId, message) => {
        this.#host.subagents.fail(subagentRunId, message);
      },
      onMessagesSnapshot: () => {
        // Honoured for persistence and announced, not re-rendered.
        //
        // The store follows the server, because the server is authoritative
        // about what the conversation *is* -- and it would follow it anyway:
        // `@ag-ui/client` replaces `agent.messages` before any subscriber runs,
        // and the run loop persists `agent.messages`. What was wrong was that
        // it happened in silence, so the screen and the store disagreed and
        // nobody found out until a reload served a transcript they had never
        // seen. That is not reportable as a bug; it is reportable as "the chat
        // lost my messages".
        //
        // Re-rendering from the snapshot was the other candidate and is
        // declined: a snapshot can land mid-run, and rebuilding the transcript
        // then would destroy the in-flight run's own UI state -- the streaming
        // bubble, the open answer group, and every tool card keyed by call id,
        // some of which are still waiting on results. Telling the reader costs
        // none of that, and this is the same answer the same question already
        // got for compaction, one handler up.
        this.#host.transcript.appendNotice(
          "\u{1F504}",
          this.#host.strings().historyReplaced,
          "history-replaced",
        );
      },
      onToolResult: (toolCallId, content, outcome) => {
        const card = this.#host.transcript.card(toolCallId);
        if (card === undefined) {
          return;
        }
        // Settled as the server says it ended, not as "it ended". This path used
        // to pass DONE unconditionally, so a refusal arrived as a green card
        // with the reason folded inside it -- a booking the server declined
        // read, at a glance, as a booking that was made. An absent or
        // unrecognised outcome still means DONE, so every server written before
        // the field existed renders exactly as it did.
        card.settle(toolStatusFromOutcome(outcome), content);
        this.#host.transcript.markServerSettled(toolCallId);
        ledger.serverSettled.add(toolCallId);
        // The card stops being the live thing the moment it settles, and the
        // server goes straight back to the model with the result -- a wait with
        // nothing on screen to own it, and the longest one in a run when the
        // result is a large inlined attachment being re-sent with every request.
        // The dots go back where ``onToolCall`` took them from, after the card,
        // and whatever comes next clears them: reasoning, the first text delta,
        // the round ending, or ``onSettled``'s terminal guarantee.
        //
        // Not the same case as the one ``ToolDispatch.execute`` refuses to show
        // them for. That runs after the run has ended, so there is nothing left to
        // clear them and they would hang -- which is what happened before 0.2.1
        // and is why they were removed from here too. The terminal guarantee
        // that shipped in the same release is what makes showing them safe now.
        this.#host.transcript.showPending();
      },
      onActivityChanged: (messageId, activityType, content) => {
        this.#host.activities.draw(messageId, activityType, content);
      },
      onRunEnd: () => {
        // Per-round end; the button stays on Stop until the whole interaction
        // settles — the user must be able to cancel between tool rounds.
        this.#host.transcript.hidePending();
        this.#host.stream.end();
      },
      onError: (message) => {
        ledger.announcedOutcome = true;
        this.#host.announcer.announce(this.#host.strings().announceFailed);
        this.#host.transcript.hidePending();
        const bubble = this.#host.appendMessage(MESSAGE_ROLE.ASSISTANT, `⚠️ ${message}`);
        bubble.classList.add("message--failed");
        // A failure is the one message whose action row is only worth having
        // for Retry: there is nothing here worth copying and nothing to rate.
        // A dropped connection with no way back was the whole of the gap --
        // uploads had a retry and runs did not.
        //
        // Not a `run-notice`: that element's contract is that it "never
        // settles, takes no action, and carries no controls", and is explicitly
        // "distinct from an error, which is a failure". This is a failure, so
        // it stays an error and gains the control instead.
        this.#host.actions.attach(bubble, { rateable: false });
        this.#host.transcript.revealWords(bubble);
        this.#host.stream.end();
      },
      onCancelled: () => {
        // Deliberate stop, not a failure: keep whatever partial text already
        // streamed and add a muted note instead of an error bubble.
        ledger.announcedOutcome = true;
        this.#host.announcer.announce(this.#host.strings().announceStopped);
        this.#host.transcript.hidePending();
        this.#host.transcript.appendStoppedNote();
        this.#host.stream.end();
      },
      onSettled: () => {
        // Terminal guarantee: whatever path ended the run, return to rest.
        if (!ledger.announcedOutcome) {
          this.#host.announcer.announce(this.#host.strings().announceAnswerReady);
        }
        this.#host.transcript.hidePending();
        this.#host.setRunning(false);
        this.#host.stream.end();
        // A tool card still pending at settle would hang forever: a call Stop or
        // RUN_ERROR ended before it ran, a server tool whose result never
        // streamed because the connection dropped, an approved call Stop kept
        // from resuming. None of them finished and nobody refused them, so the
        // card says exactly that, in the words the client sends the agent for
        // the same call on the next request.
        for (const card of this.#host.transcript.cards()) {
          if (!card.settled) {
            card.settle(TOOL_CALL_STATUS.INTERRUPTED, this.#host.strings().callNotFinished);
          }
        }
        this.#host.transcript.closeGroup();
      },
    };
  }

  /**
   * Tell the host the interaction is over and what ran in it.
   *
   * Last thing in `onSettled`, so a listener that refetches sees a transcript
   * that has already stopped changing. `side` is read from the streamed-result
   * bookkeeping rather than from the tool list: whether a call executed on the
   * server is a fact about the run, and a name can appear on both sides across a
   * conversation.
   */
  #dispatchRunFinished(ledger: RunLedger): void {
    const tools: ToolRun[] = ledger.tools.map(({ id, name }) => ({
      name,
      side: ledger.serverSettled.has(id) ? "server" : "client",
    }));
    const invalidated = [...ledger.invalidated];
    ledger.tools.length = 0;
    ledger.serverSettled.clear();
    ledger.invalidated.clear();
    this.#host.element.dispatchEvent(
      new CustomEvent<RunFinishedDetail>(RUN_FINISHED_EVENT, {
        detail: { tools, invalidated },
        bubbles: true,
        composed: true,
      }),
    );
  }

  /**
   * Route one invalidation to the host, and remember it for the run summary.
   *
   * Dispatched immediately rather than only at the end, because that is what
   * makes a long multi-step run feel live -- the list refreshes as the third of
   * eight writes lands. The accumulated set rides
   * {@link RUN_FINISHED_EVENT} as well, so a host that would rather refetch once
   * upgrades by reading one extra field instead of adding a listener.
   *
   * Nothing is rendered, persisted or replayed. An invalidation is an
   * imperative: it has no place in the transcript and no meaning once acted on,
   * and replaying one on every thread load would be a refetch storm. That is the
   * whole reason the server sends it as `CUSTOM` rather than as an activity.
   */
  #dispatchInvalidation(ledger: RunLedger, value: unknown): void {
    const payload = (value ?? {}) as { keys?: unknown; reason?: unknown };
    // Defensive about the payload, not about the name: `value` is typed
    // `unknown` by the protocol, so a server can put anything there, and a
    // malformed announcement must not take the run down with it.
    const keys = Array.isArray(payload.keys)
      ? payload.keys.filter((key): key is string => typeof key === "string")
      : [];
    if (keys.length === 0) {
      return;
    }
    for (const key of keys) {
      ledger.invalidated.add(key);
    }
    this.#host.element.dispatchEvent(
      new CustomEvent<InvalidateDetail>(INVALIDATE_EVENT, {
        detail: { keys, reason: typeof payload.reason === "string" ? payload.reason : null },
        bubbles: true,
        composed: true,
      }),
    );
  }
}
