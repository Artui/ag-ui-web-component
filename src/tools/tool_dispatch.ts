import type { Context, Interrupt } from "@ag-ui/core";
import { READ_PAGE_TOOL, TOOL_CALL_STATUS, TOOL_OUTCOME, X_CONFIRM_KEY } from "../constants.js";
import type { AgUiToolCall, InterruptResponse, ToolExecution } from "../core/agui_client.js";
import type { ClientConversationStore } from "../core/conversation_store.js";
import { skillNameFrom } from "../skills/skill_name_from.js";
import { fillUiString } from "../ui/fill_ui_string.js";
import {
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "../ui/interrupts/approval_card.js";
import {
  type ConfirmationRequest,
  requestConfirmation,
} from "../ui/interrupts/confirmation_card.js";
import type { PendingDecision } from "../ui/interrupts/pending_decision.js";
import type { Transcript } from "../ui/transcript/transcript.js";
import type { UiStrings } from "../ui/ui_strings.js";
import type { ClientTool } from "./client_tool_registry.js";
import { isDestructive } from "./is_destructive.js";
import { isNavigates } from "./is_navigates.js";
import type { PageMap } from "./page_map.js";
import type { ToolCatalog } from "./tool_catalog.js";

/** What tool dispatch needs from the element that owns it. */
export interface ToolDispatchHost {
  /** The custom element, which a host's predicate and renderer are called on. */
  readonly element: HTMLElement;
  /** The transcript the cards and prompts are drawn in. */
  readonly transcript: Transcript;
  /** The tools this round advertised, and their implementations. */
  readonly tools: ToolCatalog;
  /** The decision a run is suspended on, which a Stop abandons. */
  readonly decision: PendingDecision;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Say one short thing to a screen reader. */
  readonly announce: (message: string) => void;
  /** The element's `autoConfirm`. */
  readonly autoConfirm: () => boolean;
  /** The element's `confirmPredicate`. */
  readonly confirmPredicate: () =>
    | ((toolName: string, args: Record<string, unknown>) => boolean | Promise<boolean>)
    | null;
  /** The element's `getPageMap`. */
  readonly getPageMap: () => (() => PageMap) | null;
  /** The element's `navigate`. */
  readonly navigate: () => ((path: string) => void) | null;
  /** The element's `approveWithEdits`. */
  readonly approveWithEdits: () => boolean;
  /** The element's `approvalRenderer`. */
  readonly approvalRenderer: () => ApprovalRenderer | null;
  /** The element's `getContext`, which a host may have replaced. */
  readonly getContext: () => Context[];
  /** The element's `conversationStore`, read per use. */
  readonly conversationStore: () => ClientConversationStore;
  /** The active thread's id. */
  readonly threadId: () => string;
}

/**
 * Running the frontend tool calls a round produced, and answering the server's
 * interrupts: the page each round's context described, the confirmation rules,
 * and the tools the user waived confirmation for.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ToolDispatch {
  readonly #host: ToolDispatchHost;
  /**
   * Tool names the user waived confirmation for, for the life of this element
   * or until the principal changes, whichever comes first.
   *
   * Per instance and never persisted: a session decision that outlived the tab
   * would be a permanent grant made by one click, which is the thing
   * `autoConfirm` already exists to say deliberately. Cleared with the element,
   * and by {@link forgetWaivers} when the host names a different principal.
   */
  readonly #sessionApproved = new Set<string>();
  // The page the current round's context describes, captured when that context
  // was built. `null` until the first round. Compared in `execute` to
  // catch a page that moved under a round still in flight.
  #contextHref: string | null = null;

  constructor(host: ToolDispatchHost) {
    this.#host = host;
  }

  /**
   * Forget every tool the user waived confirmation for.
   *
   * A waiver is one person's click, and it is only ever that person's to give.
   * `user-key` exists because a logout is a navigation inside one tab rather
   * than a remount, so the element outlives the principal who clicked Always
   * allow -- and without this the next one's destructive calls would run on the
   * previous one's say-so, with no card to show that anyone was asked.
   */
  forgetWaivers(): void {
    this.#sessionApproved.clear();
  }

  /**
   * Build a round's context, recording which page it describes.
   *
   * The AG-UI client re-invokes this at the top of **every** tool round, not
   * once per `send()`, so the page map the agent sees is already refreshed
   * between rounds and the href captured here is the page it was shown for
   * *this* round. {@link execute} compares against it to catch a page that
   * moved under a round still in flight.
   */
  buildContext(): Context[] {
    this.#contextHref = window.location.href;
    return this.#host.getContext();
  }

  /**
   * Execute one frontend tool call the round produced, against its own card:
   * refused when the page moved under the round, asked about when a rule gates
   * it, and settled with what the handler returned or threw.
   */
  async execute(call: AgUiToolCall): Promise<ToolExecution | null> {
    // A skill load already rendered as a notice on the stream; it is never a
    // client tool and its result is pydantic-ai's business, so it must not
    // acquire a card here on the way to the no-result fallback below.
    if (skillNameFrom(call) !== null) {
      return null;
    }
    const card = this.#host.transcript.cardFor(call);
    this.#host.transcript.forgetCard(call.id);
    // Kept after the card leaves the awaiting cards: a tool that renders into the
    // transcript places itself against its own card, and by the time it runs the
    // card is no longer reachable by id.
    this.#host.transcript.setCardElement(call.id, card.element);
    // Scoped out of this round's catalog ⇒ not a frontend tool of ours, for
    // this round. A host that offers `delete_record` only on the page where
    // deleting makes sense has said something about *this* run, and a call
    // arriving anyway (a hallucinated name, or one steered by text the model
    // just read) must not find the handler that happens to be registered
    // mount-wide. Treated exactly as an unknown name rather than as a refusal:
    // withholding a tool and never registering it are the same statement, and
    // the branch below already says the honest thing for both.
    const tool = this.#host.tools.wasAdvertised(call.name)
      ? this.#host.tools.resolve(call.name)
      : null;
    if (tool === null) {
      // Not a client tool. A server-side tool's real output arrives via
      // `onToolResult` (TOOL_CALL_RESULT) and already settled the card — only
      // fall back when it didn't. When no result ever arrived, the call wasn't
      // executed by either side (no handler, no server result), so say so
      // honestly rather than claiming server execution. We do NOT show the
      // pending indicator: nothing here triggers another client round, so it
      // would hang after the run ended.
      if (!this.#host.transcript.isServerSettled(call.id)) {
        card.settle(TOOL_CALL_STATUS.DONE, this.#host.strings().noResult);
      }
      return null;
    }
    // The page moved under this round. Acting now would target whatever
    // matches on the new page, and the case worth preventing is a same-named
    // control matching silently — the only way the agent acts on the wrong page
    // without either side noticing.
    //
    // Must precede the confirmation prompt, so the user is never asked to
    // approve an action about to be refused. Navigating tools are exempt, since
    // moving the page is their job, as is read_page, the documented recovery.
    // Gated on a page-map provider: without one there is no read_page to
    // recommend and the host's tools are not page-scoped anyway.
    if (
      this.#host.getPageMap() !== null &&
      call.name !== READ_PAGE_TOOL &&
      !isNavigates(tool.parameters) &&
      this.#pageMoved()
    ) {
      const message = this.#host.strings().pageMoved;
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      this.#host.transcript.showPending();
      // Stated so a reload settles this card the same way. The card's own status
      // lives only in the DOM, and the DOM is what a reload throws away.
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
    }
    const rule = await this.#confirmationRule(call, tool);
    if (rule === "unanswered") {
      // Settled as a refusal and returned as one, so the run carries on to its
      // next round the way it does after a decline and the agent can say what
      // happened. Not recorded as a decision: no person was asked, and "declined
      // by you" would be a claim about someone who never saw a card.
      const message = this.#host.strings().confirmCheckFailed;
      card.settle(TOOL_CALL_STATUS.DECLINED, message);
      this.#host.transcript.showPending();
      return { content: message, outcome: TOOL_OUTCOME.DENIED };
    }
    if (rule !== null) {
      const request: ConfirmationRequest = { toolName: call.name, args: call.args };
      const confirmText = tool.parameters[X_CONFIRM_KEY];
      if (typeof confirmText === "string") {
        request.message = confirmText;
      }
      // The run loop is suspended on this card; a Stop while it's open aborts
      // the controller, resolving the decision as declined.
      const signal = this.#host.decision.open();
      // Into the turn's answer group, like every other inline card. Appending
      // to the message list made it a sibling *after* the group, so anything
      // that streamed afterwards rendered above it and the prompt drifted to
      // the foot of the turn no matter when it was asked.
      const decision = requestConfirmation(this.#host.transcript.ensureGroup(), request, {
        signal,
        strings: this.#host.strings(),
        // Offered only where it can be honoured -- see `#confirmationRule`.
        ...(rule === "destructive"
          ? { onAlwaysAllow: () => this.#sessionApproved.add(call.name) }
          : {}),
      });
      this.#host.transcript.updateEmptyState();
      this.#host.transcript.follow();
      const accepted = await decision;
      this.#host.decision.close();
      card.recordDecision(accepted ? "approved" : "declined");
      if (!accepted) {
        const message = this.#host.strings().declinedAction;
        card.settle(TOOL_CALL_STATUS.DECLINED, message);
        this.#host.transcript.showPending();
        // The one outcome with no error text and no server involvement at all:
        // a person said no in this browser. Nothing else records that, so
        // without the annotation the reload showed a green card for an action
        // the user had explicitly refused.
        return { content: message, outcome: TOOL_OUTCOME.DENIED };
      }
    }
    // A navigating tool reloads only without a client-side router; with a
    // host `navigate()` (SPA) it routes in-page and the loop just continues.
    const navigates = isNavigates(tool.parameters) && this.#host.navigate() === null;
    if (navigates) {
      // Checkpoint before the handler reloads the page; the history (incl.
      // this tool call) was already persisted when the run that produced it
      // settled. The result is supplied on the next mount via the resume path.
      this.#host.conversationStore().saveCheckpoint(this.#host.threadId(), { toolCallId: call.id });
    }
    try {
      // The call id lets a handler that renders into the transcript find its
      // own card; handlers that only act on the page ignore it.
      const result = await tool.handler(call.args, call.id);
      // Drawn from the arguments rather than the result, so the live path and
      // the replay path render the same thing from the same input.
      if (tool.render !== undefined) {
        this.#host.transcript.renderToolOutput(tool.render, call);
      }
      if (navigates) {
        card.settle(TOOL_CALL_STATUS.DONE, this.#host.strings().navigating);
        return { content: "", halt: true };
      }
      const content = JSON.stringify(result ?? null);
      card.settle(TOOL_CALL_STATUS.DONE, content);
      this.#host.transcript.showPending();
      return { content };
    } catch (error) {
      if (navigates) {
        // The navigation never happened; drop the dangling checkpoint.
        this.#host.conversationStore().saveCheckpoint(this.#host.threadId(), null);
      }
      // The handler's own message, verbatim, in two places at once: the card,
      // which the user sees, and the tool result, which goes to the endpoint,
      // is persisted there and is replayed to the model on every later round.
      // Kept verbatim because a real reason is what lets the agent recover —
      // and said out loud on `registerTool`, because the second destination is
      // invisible from the host's side and is not one it can take back.
      const message = error instanceof Error ? error.message : String(error);
      card.settle(TOOL_CALL_STATUS.ERROR, message);
      this.#host.transcript.showPending();
      return { content: `Error: ${message}`, error: message, outcome: TOOL_OUTCOME.FAILED };
    }
  }

  /**
   * Render an approval card per server-side-tool interrupt and collect the
   * user's decisions (approve → run it, deny → decline it).
   *
   * **One card per gated call, in that call's own tool card, all at once.** A run
   * can defer several calls, and the wire answers each independently — so the UI
   * has to let a person answer each independently, which means saying which is
   * which. The prompt cannot: it comes from the tool's `x-confirm` and is
   * identical for every call of that tool. The tool card can, by position, and it
   * is already showing the arguments. Asking them serially was the other half of
   * the problem: the second question only appeared once the first was answered,
   * so a person could neither compare them nor tell that more were coming.
   *
   * Each gated card is marked `deferred` for the wait. That is not cosmetic — at
   * `pending` it read "running…" while the stream was over and the server idle.
   *
   * The run is suspended on these cards. A Stop while any is open aborts the
   * shared pending decision, resolving every still-open card as
   * denied. An approved tool runs on the follow-up resume run and streams its
   * result into the same card (returned to `pending`, since it now really is
   * running); a denied one settles here, as no result will ever arrive.
   */
  async resolveInterrupts(
    interrupts: readonly Interrupt[],
  ): Promise<Record<string, InterruptResponse>> {
    // One controller covers the whole batch: a single Stop denies all of them.
    const signal = this.#host.decision.open();
    // The run has stopped and is waiting on a person. Nothing else on screen
    // says so to a screen reader: the cards appear inside the transcript, which
    // is deliberately not a live region, so without this the run simply goes
    // quiet and the user has no reason to go looking.
    this.#host.announce(
      fillUiString(this.#host.strings().announceAwaitingDecision, { count: interrupts.length }),
    );
    this.#host.transcript.hidePending();
    const answered = await Promise.all(
      interrupts.map(async (interrupt) => {
        const card =
          interrupt.toolCallId !== undefined
            ? this.#host.transcript.card(interrupt.toolCallId)
            : undefined;
        const request: ApprovalRequest = {};
        const phrase = confirmPhrase(interrupt) ?? interrupt.message;
        if (phrase !== undefined) {
          request.message = phrase;
        }
        const toolName = card?.element.getAttribute("data-tool-name");
        if (toolName !== null && toolName !== undefined) {
          request.toolName = toolName;
        }
        // Offered only where it can be honoured: the host has said its agent
        // accepts `editedArgs`, and this interrupt named a call whose arguments
        // we still hold.
        let editedArgs: Record<string, unknown> | undefined;
        const editable = this.#host.approveWithEdits() && card !== undefined;
        if (editable) {
          request.args = card.args;
        }
        card?.mark(TOOL_CALL_STATUS.DEFERRED);
        // The built-in card renders into the gated call's own card, falling back
        // to the answer group when the interrupt names no call we hold one for.
        const builtIn = (): Promise<boolean> =>
          requestApproval(card?.approvalSlot ?? this.#host.transcript.ensureGroup(), request, {
            signal,
            strings: this.#host.strings(),
            ...(editable
              ? {
                  onEdit: (args: Record<string, unknown>) => {
                    editedArgs = args;
                  },
                }
              : {}),
          });
        // A host-supplied renderer takes full control of the approval UI.
        const renderer = this.#host.approvalRenderer();
        let approved: boolean;
        if (renderer === null) {
          approved = await builtIn();
        } else {
          // Awaited here rather than inside a helper, so an answering renderer
          // takes exactly as many turns to be heard as it always did.
          try {
            // Called on the element, as `this.approvalRenderer(...)` always was.
            approved = await renderer.call(this.#host.element, request, { signal });
          } catch (error) {
            approved = await this.#afterRendererFailed(error, signal, interrupt.id, builtIn);
          }
        }
        // Same annotation as the client-side confirmation gate. Without it the
        // two gates read differently for the same act: a locally-confirmed call
        // said who let it through and a server-gated one said nothing, which is
        // backwards, since the server-side gate is the one guarding the tools
        // that actually run on the backend.
        card?.recordDecision(approved ? "approved" : "declined");
        if (approved) {
          card?.mark(TOOL_CALL_STATUS.PENDING);
        } else {
          // No TOOL_CALL_RESULT will stream for a denied tool — settle its card
          // now rather than leaving it hanging until the onSettled sweep.
          card?.settle(TOOL_CALL_STATUS.DECLINED, this.#host.strings().declinedAction);
        }
        return { id: interrupt.id, approved, editedArgs };
      }),
    );
    this.#host.transcript.updateEmptyState();
    this.#host.transcript.follow();
    this.#host.decision.close();
    const responses: Record<string, InterruptResponse> = {};
    for (const { id, approved, editedArgs } of answered) {
      // `editedArgs` rides only when the user actually changed something, so a
      // server can tell "approved as proposed" from "approved, but like this".
      responses[id] = approved
        ? {
            status: "resolved",
            payload: editedArgs === undefined ? { approved: true } : { approved: true, editedArgs },
          }
        : { status: "cancelled" };
    }
    return responses;
  }

  /**
   * Answer an interrupt whose host renderer threw or rejected instead of
   * answering: put it to the built-in card.
   *
   * The renderer is presentation, not a guard: it decides how the question
   * looks, never whether it is asked. Uncaught, one failure rejected the whole
   * batch, so the run ended on an error bubble quoting the host's message, the
   * server was never answered, and the end-of-run sweep settled the gated card
   * as a green "done" for a call that never ran. The built-in card still puts
   * the decision to a person, so nothing runs without a click, and the run
   * carries on as if no renderer had been set. Reported the way a failed
   * `render` is, and for the same reason: survived is not the same as findable.
   *
   * Except when the wait was already abandoned. A renderer honouring its signal
   * rejects once a Stop fires it, which is the signal working rather than the
   * renderer failing, and a card drawn then would ask about a run the user just
   * ended. So it resolves as not approved, which is what the built-in card
   * resolves on the same abort, and says nothing.
   */
  #afterRendererFailed(
    error: unknown,
    signal: AbortSignal,
    interruptId: string,
    builtIn: () => Promise<boolean>,
  ): Promise<boolean> {
    if (signal.aborted) {
      return Promise.resolve(false);
    }
    // Named by interrupt rather than by tool: a batch can gate several calls of
    // one tool, and the id is the one thing that tells them apart.
    console.warn(
      `ag-ui-chat: approvalRenderer failed for interrupt ${interruptId}, so the built-in approval card asks instead`,
      error,
    );
    return builtIn();
  }

  /**
   * Which rule gates `call`, or `null` when it runs straight through, or
   * `"unanswered"` when the host's predicate threw instead of deciding.
   *
   * The rule, rather than a bare boolean, because it decides whether the user
   * may *waive* the prompt for the rest of the session. Only the default
   * `x-destructive` gate is waivable: `confirmPredicate` is documented as
   * authoritative, so letting one click retire it would silently defeat a host
   * policy — and the session allowlist is consulted on the same path it can
   * be added from, so the button is never offered where honouring it would be
   * refused.
   */
  async #confirmationRule(call: AgUiToolCall, tool: ClientTool): Promise<ConfirmationRule | null> {
    if (this.#host.autoConfirm()) {
      return null;
    }
    const predicate = this.#host.confirmPredicate();
    if (predicate !== null) {
      try {
        // Called on the element, as `this.confirmPredicate(...)` always was.
        return (await predicate.call(this.#host.element, call.name, call.args)) === true
          ? "predicate"
          : null;
      } catch (error) {
        // A guard that cannot answer has not said the call is safe, and for a
        // tool with no `x-destructive` flag the predicate is the only guard
        // there is. So it fails closed: the call is refused outright, rather
        // than run, and rather than put to a card whose one click would run
        // what the host's own policy could not vouch for.
        //
        // Uncaught, the throw ended the run on an error bubble quoting the
        // host's message and left this call's card reading "running…" for
        // good, since dispatch had already taken it out of the settle sweep.
        // The message goes to the console instead, where a render failure is
        // reported, and not on to the endpoint: unlike a handler's, it was
        // never written for the model to read.
        console.warn(
          `ag-ui-chat: confirmPredicate failed for tool ${call.name}, so the call was refused`,
          error,
        );
        return "unanswered";
      }
    }
    if (this.#sessionApproved.has(call.name)) {
      return null;
    }
    return isDestructive(tool.parameters) ? "destructive" : null;
  }

  /**
   * Whether the page moved since the current round's context was built.
   *
   * `null` means no round has built context yet (nothing to compare), which is
   * not a move.
   */
  #pageMoved(): boolean {
    return this.#contextHref !== null && this.#contextHref !== window.location.href;
  }
}

/**
 * A server-authored question for a gated call, read off the interrupt's metadata.
 *
 * The question an AG-UI interrupt carries by default is the call itself, spelled
 * out: `Approve create_event({"title": "Design sync", …})?`. Accurate, and not
 * something to put in front of a person. A client-side confirmation has
 * `x-confirm` on the tool's schema for exactly this, so the same key is read here
 * — whichever end gates a call, the phrase comes from one place, and a server
 * that supplies none keeps the generated text.
 *
 * Narrowed rather than trusted: `metadata` is `Record<string, any>` on the wire,
 * so anything at all can arrive under that key, and a non-string would render as
 * "[object Object]" in the one place a person is being asked to allow a write.
 */
function confirmPhrase(interrupt: Interrupt): string | undefined {
  const phrase = interrupt.metadata?.[X_CONFIRM_KEY];
  return typeof phrase === "string" && phrase.trim() !== "" ? phrase : undefined;
}

/**
 * Why a client tool call is gated behind the confirmation card, or refused
 * before one is drawn.
 *
 * Only `"destructive"` -- the default `x-destructive` gate -- may be waived for
 * the session. `confirmPredicate` is documented as authoritative, so a call it
 * gates keeps asking. `"unanswered"` is a predicate that threw instead of
 * answering, and the call it was asked about is refused without a card.
 */
type ConfirmationRule = "destructive" | "predicate" | "unanswered";
