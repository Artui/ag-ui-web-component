import { fillUiString } from "../fill_ui_string.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "../ui_strings.js";

/** Below this, a reasoning block is too short to time and its header reads `thoughts`. */
const TIMED_FROM_MS = 1000;

/**
 * A muted "thinking" region for a reasoning model's streamed chain-of-thought.
 *
 * Sits at the top of the current answer group. Its header reads `thinking`
 * while the model reasons, and {@link settle} stops the clock and names how
 * long it took ("Thought for 4s"). {@link stream} replaces the body with the
 * running buffer, which opens expanded and folds away on {@link collapse},
 * once the answer's first text token arrives.
 *
 * The header is a disclosure only while there is text behind it. A provider
 * that reasons without sending any -- redacted thinking, or reasoning with
 * its summaries off -- still opens and closes a block, and a toggle there
 * folded and unfolded an empty, ruled box. Until the buffer has text the
 * header is a plain label and the body is not drawn; the first text turns the
 * label into the toggle, and the body comes with it.
 *
 * Pure DOM. The host inserts {@link element}; all visible chrome text comes
 * from {@link UiStrings}. The clock is injectable so the timing is testable.
 */
export class ThoughtsBlock {
  /** The block's root element; insert this at the top of the answer group. */
  readonly element: HTMLDivElement;

  readonly #label: HTMLSpanElement;
  readonly #body: HTMLPreElement;
  readonly #toggle: HTMLButtonElement;
  readonly #strings: UiStrings;
  readonly #now: () => number;
  /** When the running round started, or `null` once {@link settle} stopped the clock. */
  #startedAt: number | null;
  /** The reasoning time of the rounds already settled, in milliseconds. */
  #elapsed = 0;
  #collapsed = false;
  #hasText = false;

  /**
   * Build the block as reasoning starts, which is when its clock starts.
   *
   * @param strings - The resolved string table.
   * @param now - The clock, in milliseconds; `performance.now` unless a test
   *   supplies its own.
   */
  constructor(
    strings: UiStrings = DEFAULT_UI_STRINGS,
    now: () => number = () => performance.now(),
  ) {
    this.#strings = strings;
    this.#now = now;
    this.#startedAt = now();

    this.element = document.createElement("div");
    this.element.className = "thoughts";
    this.element.setAttribute("part", "thoughts");
    // Lets CSS animate the header while the model is still reasoning; dropped
    // when the block settles.
    this.element.setAttribute("data-streaming", "");

    this.#toggle = document.createElement("button");
    this.#toggle.type = "button";
    this.#toggle.className = "thoughts-toggle";
    this.#toggle.setAttribute("part", "thoughts-toggle");
    this.#toggle.setAttribute("aria-expanded", "true");

    this.#label = document.createElement("span");
    this.#label.className = "thoughts-label";
    this.#label.setAttribute("part", "thoughts-label");
    this.#label.textContent = strings.thinking;

    this.#body = document.createElement("pre");
    this.#body.className = "thoughts-body";
    this.#body.setAttribute("part", "thoughts-body");
    this.#body.hidden = true;

    this.#toggle.addEventListener("click", () => {
      this.#setCollapsed(!this.#collapsed);
    });

    // The label stands alone until there is text for the toggle to open onto.
    this.element.append(this.#label, this.#body);
  }

  /**
   * A further round of reasoning in the same turn, after a tool call settled
   * the first: restart the clock and the live header. The rounds' times add
   * up. Ignored while the clock is already running.
   */
  begin(): void {
    if (this.#startedAt !== null) {
      return;
    }
    this.#startedAt = this.#now();
    this.element.setAttribute("data-streaming", "");
    this.#label.textContent = this.#strings.thinking;
  }

  /** Replace the reasoning body with the running buffer (the full text so far). */
  stream(buffer: string): void {
    this.#body.textContent = buffer;
    this.#setHasText(buffer.trim() !== "");
  }

  /**
   * Stop the clock and settle the header to how long the reasoning took.
   *
   * Called when reasoning ends, or by whatever arrives first in its place --
   * the answer's text, a tool call, or the turn ending -- so the live label
   * never outlives the reasoning. Idempotent: only the first call after a
   * start counts.
   */
  settle(): void {
    if (this.#startedAt === null) {
      return;
    }
    this.#elapsed += this.#now() - this.#startedAt;
    this.#startedAt = null;
    this.element.removeAttribute("data-streaming");
    this.#label.textContent =
      this.#elapsed < TIMED_FROM_MS
        ? this.#strings.thoughts
        : fillUiString(this.#strings.thoughtFor, {
            seconds: Math.round(this.#elapsed / TIMED_FROM_MS),
          });
  }

  /**
   * Fold the region away when the answer's first text token arrives, settling
   * the header first. Idempotent, since the per-token text handler calls it
   * repeatedly.
   */
  collapse(): void {
    this.settle();
    if (this.#collapsed) {
      return;
    }
    this.#setCollapsed(true);
  }

  /** Swap the header between the plain label and the toggle around it. */
  #setHasText(hasText: boolean): void {
    if (hasText === this.#hasText) {
      return;
    }
    this.#hasText = hasText;
    if (hasText) {
      this.#toggle.append(this.#label);
      this.element.prepend(this.#toggle);
    } else {
      this.#toggle.remove();
      this.element.prepend(this.#label);
    }
    this.#setCollapsed(this.#collapsed);
  }

  #setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    this.#body.hidden = collapsed || !this.#hasText;
    this.#toggle.setAttribute("aria-expanded", String(!collapsed));
  }
}
