import { TOOL_CALL_STATUS, TOOL_DISPLAY } from "../constants.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** Any state a tool-call card can be in. */
export type ToolCallStatus = (typeof TOOL_CALL_STATUS)[keyof typeof TOOL_CALL_STATUS];

/** How much detail a card renders. */
export type ToolDisplayMode = (typeof TOOL_DISPLAY)[keyof typeof TOOL_DISPLAY];

/** The terminal states a card settles into (everything but `pending`). */
export type SettledStatus = Exclude<ToolCallStatus, typeof TOOL_CALL_STATUS.PENDING>;

/** Short pill text shown for each status, drawn from the string table. */
function statusLabels(strings: UiStrings): Record<ToolCallStatus, string> {
  return {
    [TOOL_CALL_STATUS.PENDING]: strings.toolRunning,
    [TOOL_CALL_STATUS.DONE]: strings.toolDone,
    [TOOL_CALL_STATUS.ERROR]: strings.toolError,
    [TOOL_CALL_STATUS.DECLINED]: strings.toolDeclined,
  };
}

/** Toggle-button label for each settled outcome's collapsible body (full mode). */
function resultLabels(strings: UiStrings): Record<SettledStatus, string> {
  return {
    [TOOL_CALL_STATUS.DONE]: strings.resultLabel,
    [TOOL_CALL_STATUS.ERROR]: strings.errorLabel,
    [TOOL_CALL_STATUS.DECLINED]: strings.declinedLabel,
  };
}

/**
 * A live tool-call card for the chat transcript.
 *
 * Construction renders the tool name and a `running…` status pill; in `full`
 * mode it also shows the pretty-printed arguments inline. {@link settle} later
 * flips the pill to the outcome and — depending on the {@link ToolDisplayMode} —
 * appends a collapsible body:
 *
 * - `minimal` — pill only; nothing to expand.
 * - `compact` — one "Details" toggle revealing args *and* result together.
 * - `full` — the result (or error / decline message) behind its own toggle.
 *
 * Pure DOM (no framework); the host appends {@link element} into its shadow
 * root and themes it via the `--ag-ui-*` custom properties or the exposed
 * `tool-card*` `part`s. All visible text is sourced from {@link UiStrings}.
 */
export class ToolCallCard {
  /** The card's root element; append this into the message list. */
  readonly element: HTMLDivElement;

  readonly #status: HTMLSpanElement;
  readonly #mode: ToolDisplayMode;
  readonly #args: Record<string, unknown>;
  readonly #strings: UiStrings;
  #settled = false;

  constructor(
    name: string,
    args: Record<string, unknown>,
    mode: ToolDisplayMode = TOOL_DISPLAY.FULL,
    summary?: string,
    strings: UiStrings = DEFAULT_UI_STRINGS,
  ) {
    this.#mode = mode;
    this.#args = args;
    this.#strings = strings;

    this.element = document.createElement("div");
    this.element.className = "tool-call";
    this.element.setAttribute("part", "tool-card");
    this.element.setAttribute("data-tool-name", name);
    this.element.setAttribute("data-status", TOOL_CALL_STATUS.PENDING);
    this.element.setAttribute("data-display", mode);

    const head = document.createElement("div");
    head.className = "tool-call-head";
    head.setAttribute("part", "tool-card-head");

    const label = document.createElement("span");
    label.className = "tool-call-name";
    label.setAttribute("part", "tool-card-name");
    // A server-provided `x-summary` label reads better than the raw tool name.
    label.textContent = `🔧 ${summary ?? name}`;

    this.#status = document.createElement("span");
    this.#status.className = "tool-call-status";
    this.#status.setAttribute("part", "tool-card-status");
    this.#status.textContent = statusLabels(strings)[TOOL_CALL_STATUS.PENDING];

    head.append(label, this.#status);
    this.element.append(head);

    if (mode === TOOL_DISPLAY.FULL) {
      const argsEl = document.createElement("pre");
      argsEl.className = "tool-call-args";
      argsEl.setAttribute("part", "tool-card-args");
      argsEl.textContent = JSON.stringify(args, null, 2);
      this.element.append(argsEl);
    }
  }

  /** Whether {@link settle} has already run (so a terminal sweep can skip it). */
  get settled(): boolean {
    return this.#settled;
  }

  /**
   * Flip the status pill to ``status`` and, unless in `minimal` mode, append a
   * collapsed body behind a click-to-expand toggle: the result alone (`full`),
   * or the args + result together (`compact`).
   */
  settle(status: SettledStatus, text: string): void {
    this.#settled = true;
    this.element.setAttribute("data-status", status);
    this.#status.textContent = statusLabels(this.#strings)[status];

    if (this.#mode === TOOL_DISPLAY.MINIMAL) {
      return;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tool-call-toggle";
    toggle.setAttribute("part", "tool-card-toggle");
    toggle.setAttribute("aria-expanded", "false");

    const output = document.createElement("pre");
    output.className = "tool-call-result";
    output.setAttribute("part", "tool-card-result");
    output.hidden = true;

    if (this.#mode === TOOL_DISPLAY.COMPACT) {
      toggle.textContent = this.#strings.details;
      output.textContent = `args: ${JSON.stringify(this.#args)}\n\n${text}`;
    } else {
      toggle.textContent = resultLabels(this.#strings)[status];
      output.textContent = text;
    }

    toggle.addEventListener("click", () => {
      const expand = output.hidden;
      output.hidden = !expand;
      toggle.setAttribute("aria-expanded", String(expand));
    });

    this.element.append(toggle, output);
  }
}
