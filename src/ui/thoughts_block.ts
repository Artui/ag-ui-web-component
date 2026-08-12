import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/**
 * A muted, collapsible "thinking" region for a reasoning model's streamed
 * chain-of-thought.
 *
 * Sits at the top of the current answer group. It opens expanded while the
 * model reasons, {@link stream} replacing its body with the running buffer, and
 * {@link collapse} folds it away once the answer's first text token arrives.
 * The header toggle reopens it.
 *
 * Pure DOM. The host inserts {@link element}; all visible chrome text comes
 * from {@link UiStrings}.
 */
export class ThoughtsBlock {
  /** The block's root element; insert this at the top of the answer group. */
  readonly element: HTMLDivElement;

  readonly #label: HTMLSpanElement;
  readonly #body: HTMLPreElement;
  readonly #toggle: HTMLButtonElement;
  readonly #strings: UiStrings;
  #collapsed = false;

  constructor(strings: UiStrings = DEFAULT_UI_STRINGS) {
    this.#strings = strings;

    this.element = document.createElement("div");
    this.element.className = "thoughts";
    this.element.setAttribute("part", "thoughts");
    // Lets CSS animate the header while the model is still reasoning; dropped
    // on collapse.
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
    this.#toggle.append(this.#label);

    this.#body = document.createElement("pre");
    this.#body.className = "thoughts-body";
    this.#body.setAttribute("part", "thoughts-body");

    this.#toggle.addEventListener("click", () => {
      this.#setCollapsed(!this.#collapsed);
    });

    this.element.append(this.#toggle, this.#body);
  }

  /** Replace the reasoning body with the running buffer (the full text so far). */
  stream(buffer: string): void {
    this.#body.textContent = buffer;
  }

  /**
   * Fold the region away when the answer's first text token arrives, flipping
   * the header label to its settled form. Idempotent, since the per-token text
   * handler calls it repeatedly.
   */
  collapse(): void {
    if (this.#collapsed) {
      return;
    }
    this.element.removeAttribute("data-streaming");
    this.#label.textContent = this.#strings.thoughts;
    this.#setCollapsed(true);
  }

  #setCollapsed(collapsed: boolean): void {
    this.#collapsed = collapsed;
    this.#body.hidden = collapsed;
    this.#toggle.setAttribute("aria-expanded", String(!collapsed));
  }
}
