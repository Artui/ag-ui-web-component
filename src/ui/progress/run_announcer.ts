import { ANNOUNCE_CLEAR_MS } from "../../constants.js";

/**
 * The screen-reader-only status region, and the one short thing it says at a
 * time about how a run is going.
 *
 * The transcript cannot do this job. It is rewritten on every animation frame
 * while an answer streams, so as a live region it re-announced the whole
 * answer tens of times per turn -- not merely unhelpful but actively hostile.
 * The published fix for this exact bug (Microsoft's Bot Framework WebChat
 * #3236) is architectural rather than a matter of tuning attributes: demote the
 * visible transcript out of live-region duty and put one synthesised status per
 * event into a separate invisible region. MDN and Scott O'Hara prescribe the
 * same empty-region-then-inject shape.
 *
 * Roughly four calls land per turn -- responding, answered, a card is waiting,
 * stopped or failed -- so the user is told what happened and reads the answer
 * itself by navigating the log, at their own pace, rather than having it
 * shouted at them a token at a time.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance. The element places {@link region} in its shadow root.
 */
export class RunAnnouncer {
  /** The invisible `role="status"` region the statuses are written into. */
  readonly region = document.createElement("div");
  /** Pending clear of {@link region}; see {@link announce} for why it is cleared at all. */
  #timer: ReturnType<typeof setTimeout> | null = null;

  /** Stamp the region's live-region semantics, before the element places it. */
  mount(): void {
    this.region.className = "sr-only";
    this.region.setAttribute("role", "status");
    this.region.setAttribute("aria-live", "polite");
    // Atomic: each announcement replaces the last and is read whole. Without
    // it a reader may announce only the changed words between two statuses.
    this.region.setAttribute("aria-atomic", "true");
  }

  /**
   * Say one short thing to a screen reader, without touching the transcript.
   *
   * **The clear is load-bearing, twice.** A reader announces a live region when
   * its content *changes*, so setting the same string twice running -- two turns
   * in a row both starting -- is not a change and is silently not announced.
   * Emptying first makes the next set a change again. It also stops a stale
   * status being read out when a reader later lands on the region.
   */
  announce(message: string): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
    }
    this.region.textContent = message;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.region.textContent = "";
    }, ANNOUNCE_CLEAR_MS);
  }

  /** Cancel a pending clear, so no timer outlives the element's connection. */
  dispose(): void {
    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }
}
