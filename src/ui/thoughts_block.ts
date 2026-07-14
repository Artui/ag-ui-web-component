import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/**
 * A muted, collapsible "thinking" region for a reasoning model's streamed
 * chain-of-thought.
 *
 * Lives at the top of the current answer group (the turn container): it
 * opens expanded while the model reasons — {@link stream} replaces its body with
 * the running reasoning buffer — and {@link collapse} folds it away once the
 * answer's first text token arrives, so the thoughts don't crowd the answer.
 * The header toggle lets the reader reopen it.
 *
 * Pure DOM (no framework); the host inserts {@link element} and themes it via
 * the `--ag-ui-*` custom properties or the `thoughts*` `part`s. All visible
 * chrome text is sourced from {@link UiStrings}.
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
    // `data-streaming` lets CSS animate the header (e.g. a pulse) while the
    // model is still reasoning; dropped on collapse.
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
   * Fold the region away — called when the answer's first text token arrives.
   * Idempotent (the per-token text handler calls it repeatedly) and flips the
   * header label from "thinking…" to the settled "Thoughts" affordance.
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
