/**
 * The decision a run is suspended on, and the one way to abandon it.
 *
 * A run pauses on a person in three places -- a client-side confirmation, a
 * batch of server interrupts, and the `ask_user` question -- and a Stop has to
 * reach whichever of them is open. Each used to assign the element's own abort
 * controller directly, so four places wrote one field and nothing said which
 * of them owned it. Holding it here gives it one owner: a wait opens, the Stop
 * aborts what is open, and the wait closes when it is answered.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class PendingDecision {
  // Aborting this dismisses (declines) an open confirmation card when the run
  // is cancelled while the card awaits a decision. One controller per wait.
  #controller: AbortController | null = null;

  /** Start waiting on a person; aborting the returned signal abandons the wait. */
  open(): AbortSignal {
    this.#controller = new AbortController();
    return this.#controller.signal;
  }

  /** The wait was answered; a later Stop has nothing of this wait's to abandon. */
  close(): void {
    this.#controller = null;
  }

  /** Abandon whatever wait is open, resolving it as declined. A no-op when none is. */
  abort(): void {
    this.#controller?.abort();
  }
}
