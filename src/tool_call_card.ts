import { TOOL_CALL_STATUS } from "./constants.js";

/** Any state a tool-call card can be in. */
export type ToolCallStatus = (typeof TOOL_CALL_STATUS)[keyof typeof TOOL_CALL_STATUS];

/** The terminal states a card settles into (everything but `pending`). */
export type SettledStatus = Exclude<ToolCallStatus, typeof TOOL_CALL_STATUS.PENDING>;

/** Short pill text shown for each status. */
const STATUS_LABEL: Record<ToolCallStatus, string> = {
  [TOOL_CALL_STATUS.PENDING]: "running…",
  [TOOL_CALL_STATUS.DONE]: "✓ done",
  [TOOL_CALL_STATUS.ERROR]: "⚠ error",
  [TOOL_CALL_STATUS.DECLINED]: "⊘ declined",
};

/** Toggle-button label for each settled outcome's collapsible body. */
const RESULT_LABEL: Record<SettledStatus, string> = {
  [TOOL_CALL_STATUS.DONE]: "Result",
  [TOOL_CALL_STATUS.ERROR]: "Error",
  [TOOL_CALL_STATUS.DECLINED]: "Declined",
};

/**
 * A live tool-call card for the chat transcript.
 *
 * Construction renders the tool name, its pretty-printed arguments, and a
 * `running…` status pill. {@link settle} later flips the pill to the outcome
 * and appends a click-to-expand body holding the result (or error / decline
 * message), collapsed by default.
 *
 * Pure DOM (no framework); the host appends {@link element} into its shadow
 * root and themes it via the `--ag-ui-*` custom properties.
 */
export class ToolCallCard {
  /** The card's root element; append this into the message list. */
  readonly element: HTMLDivElement;

  readonly #status: HTMLSpanElement;

  constructor(name: string, args: Record<string, unknown>) {
    this.element = document.createElement("div");
    this.element.className = "tool-call";
    this.element.setAttribute("data-tool-name", name);
    this.element.setAttribute("data-status", TOOL_CALL_STATUS.PENDING);

    const head = document.createElement("div");
    head.className = "tool-call-head";

    const label = document.createElement("span");
    label.className = "tool-call-name";
    label.textContent = `🔧 ${name}`;

    this.#status = document.createElement("span");
    this.#status.className = "tool-call-status";
    this.#status.textContent = STATUS_LABEL[TOOL_CALL_STATUS.PENDING];

    head.append(label, this.#status);

    const argsEl = document.createElement("pre");
    argsEl.className = "tool-call-args";
    argsEl.textContent = JSON.stringify(args, null, 2);

    this.element.append(head, argsEl);
  }

  /**
   * Flip the status pill to ``status`` and append a collapsed body holding
   * ``text`` (the JSON result, an error message, a decline notice, or a
   * server-executed note) behind a click-to-expand toggle.
   */
  settle(status: SettledStatus, text: string): void {
    this.element.setAttribute("data-status", status);
    this.#status.textContent = STATUS_LABEL[status];

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "tool-call-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.textContent = RESULT_LABEL[status];

    const output = document.createElement("pre");
    output.className = "tool-call-result";
    output.textContent = text;
    output.hidden = true;

    toggle.addEventListener("click", () => {
      const expand = output.hidden;
      output.hidden = !expand;
      toggle.setAttribute("aria-expanded", String(expand));
    });

    this.element.append(toggle, output);
  }
}
