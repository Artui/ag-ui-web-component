import { SUBAGENT_PHASE } from "../../constants.js";
import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";
import { SubAgentPanel, type SubAgentPhase, type SubAgentUpdate } from "./subagent_panel.js";
import { subAgentUpdate } from "./subagent_update.js";
import type { ToolCallCard } from "./tool_call_card.js";

/** What delegated progress needs from the element that owns it. */
export interface SubAgentProgressHost {
  /** The tool card drawn for a call id, which a delegation's panel hangs off. */
  readonly card: (callId: string) => ToolCallCard | undefined;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Keep the transcript at its foot, if the reader is there. */
  readonly follow: () => void;
}

/**
 * A delegated sub-agent's progress, hung off the card that delegated: the live
 * panels by delegation, and which delegation each child run belongs to.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class SubAgentProgress {
  readonly #host: SubAgentProgressHost;
  /**
   * The live delegation panels, keyed by the **parent's** `delegate_task` call
   * id — which is what the wire keys a sub-agent's progress on, so this map and
   * the element's tool cards answer to the same key.
   *
   * Kept beside the cards rather than on them, so a card stays a card: the tool
   * card holds the slot and this holds what went into it, the same division the
   * approval prompt already uses.
   */
  readonly #subagentPanels = new Map<string, SubAgentPanel>();
  /**
   * Which delegation each live `subagentRunId` belongs to.
   *
   * The protocol's closing events -- `SUBAGENT_FINISHED` and `SUBAGENT_ERROR`
   * -- carry the child's run id and nothing else, while everything drawn here
   * is keyed on the parent's `delegate_task` call id. `SUBAGENT_STARTED` is the
   * one event carrying both, so the pairing is recorded there and read back on
   * the close. A close naming a run this never saw open is dropped, which is
   * the same refusal a step for an undrawn card gets.
   */
  readonly #subagentRunDelegations = new Map<string, string>();

  constructor(host: SubAgentProgressHost) {
    this.#host = host;
  }

  /**
   * Draw one step of a delegated sub-agent's progress, on the card that
   * delegated.
   *
   * `delegationId` is the parent's own `delegate_task` tool-call id, so the
   * attachment point is a card this element already drew on `TOOL_CALL_START`.
   * That is the whole design: a run that hands work to a sub-agent used to read
   * as a stall -- the card sat at "running…" for the child's entire duration --
   * and the fix is to narrate *into* the thing that was already standing there,
   * rather than to float a second element with the same identity.
   *
   * A progress event for a call this client never drew is dropped. It has no
   * card to attach to, and inventing a floating one is precisely the alternative
   * that was rejected: parent and child interleave in the transcript with
   * nothing marking whose is whose, and the persisted transcript -- which never
   * held the progress at all -- would not match what was on screen.
   *
   * Nothing here writes to the conversation store. `CUSTOM` never enters
   * `agent.messages`, so a reload mid-run leaves the tool card and loses the
   * nested detail, which is the intended behaviour rather than a gap.
   */
  report(value: unknown): void {
    const update = subAgentUpdate(value);
    if (update === null) {
      return;
    }
    this.#apply(update);
  }

  /** Open a delegation, on `SUBAGENT_STARTED`. */
  start(subagentRunId: string, agent: string, parentToolCallId: string | null): void {
    // A delegation naming no parent call names no card, and a floating
    // panel is exactly what attaching to the card was chosen over.
    if (parentToolCallId === null) {
      return;
    }
    this.#subagentRunDelegations.set(subagentRunId, parentToolCallId);
    this.#apply({
      delegationId: parentToolCallId,
      agent: agent === "" ? null : agent,
      phase: SUBAGENT_PHASE.STARTED,
      status: fillUiString(this.#host.strings().subAgentDelegatedTo, { agent }),
      tool: null,
    });
  }

  /** Settle a delegation that completed, on `SUBAGENT_FINISHED`. */
  finish(subagentRunId: string): void {
    this.#close(subagentRunId, SUBAGENT_PHASE.FINISHED, null);
  }

  /** Settle a delegation that failed, on `SUBAGENT_ERROR`. */
  fail(subagentRunId: string, message: string): void {
    // The server's own words, which the contract keeps to the sub-agent's
    // name. Passed through as the status line and set with textContent
    // downstream, never parsed as markup.
    //
    // The message is required by the protocol and can still arrive empty,
    // which would settle the row to a blank line -- a delegation that reads
    // as having said nothing rather than as having failed. The fallback was
    // written and documented in UiStrings and never wired up, so until now
    // the only reader who knew it existed was the one reading the string
    // table.
    this.#close(
      subagentRunId,
      SUBAGENT_PHASE.FAILED,
      message === "" ? this.#host.strings().subAgentFailed : message,
    );
  }

  /**
   * Forget every delegation. The panels go with the cards they hung off.
   * Nothing restores them: the progress rode the imperative carrier and was
   * never persisted, which is the correct half of that split -- a delegation
   * that was live before this transcript was wiped is not live now.
   */
  clear(): void {
    this.#subagentPanels.clear();
    this.#subagentRunDelegations.clear();
  }

  /**
   * Settle the delegation a closing lifecycle event names.
   *
   * `status` is the server's text on a failure and `null` on a success, where
   * the wording is this element's own -- the protocol's finish event carries no
   * message, which is the better shape for a localised UI and the reason
   * {@link UiStrings.subAgentFinished} exists.
   *
   * The pairing is deliberately not deleted on close. A panel outlives the
   * delegation it drew, the map is cleared with the transcript alongside the
   * panels, and forgetting the id here would only make a duplicate close draw
   * nothing instead of drawing the same settled row again.
   */
  #close(subagentRunId: string, phase: SubAgentPhase, status: string | null): void {
    const delegationId = this.#subagentRunDelegations.get(subagentRunId);
    if (delegationId === undefined) {
      // A close naming a delegation this never saw open -- the same refusal a
      // step for an undrawn card gets, and the same reason.
      return;
    }
    const agent = this.#subagentPanels.get(delegationId)?.agent ?? null;
    this.#apply({
      delegationId,
      agent,
      phase,
      status: status === null ? this.#finishedLine(agent) : status,
      tool: null,
    });
  }

  /** The row's line for a delegation that completed, named if its name is known. */
  #finishedLine(agent: string | null): string {
    const strings = this.#host.strings();
    return agent === null
      ? strings.subAgentWorking
      : fillUiString(strings.subAgentFinished, { agent });
  }

  /**
   * Fold one already-narrowed update into the delegation's panel.
   *
   * The join point of the two carriers, and the reason it is separate from
   * {@link report}: a `CUSTOM` step arrives as `unknown` and has to be vouched
   * for, while a lifecycle event arrives typed off the protocol and has nothing
   * left to check. Both end up here, so the panel has one way in and the phases
   * stay a single state machine regardless of which wire they came from.
   */
  #apply(update: SubAgentUpdate): void {
    const card = this.#host.card(update.delegationId);
    if (card === undefined) {
      return;
    }
    let panel = this.#subagentPanels.get(update.delegationId);
    if (panel === undefined) {
      // Created on whichever phase arrives first rather than only on `started`.
      // The contract says exactly one opens a delegation, and a client that
      // insisted on it would answer a server that dropped one frame by showing
      // nothing at all for the rest of the run.
      panel = new SubAgentPanel(this.#host.strings());
      this.#subagentPanels.set(update.delegationId, panel);
      card.subagentSlot.appendChild(panel.element);
    }
    panel.report(update);
    // The card grew, and the transcript is usually pinned to the foot while a
    // run is in flight.
    this.#host.follow();
  }
}
