import { TOOL_CALL_STATUS, type TOOL_DISPLAY } from "../constants.js";
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

/** Section-heading text for each settled outcome's result region. */
function resultLabels(strings: UiStrings): Record<SettledStatus, string> {
  return {
    [TOOL_CALL_STATUS.DONE]: strings.resultLabel,
    [TOOL_CALL_STATUS.ERROR]: strings.errorLabel,
    [TOOL_CALL_STATUS.DECLINED]: strings.declinedLabel,
  };
}

/** Pretty-print a JSON payload; fall back to the raw text if it isn't JSON. */
function formatPayload(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/**
 * A live tool-call card for the chat transcript.
 *
 * Construction renders a status icon, the tool name, a `running…` pill, and the
 * card's body: an **arguments** region and a **result** region, each with its own
 * heading and its own `part`. {@link settle} fills in the result and flips the
 * pill. Both payloads are pretty-printed, and the two are never concatenated —
 * the previous compact layout ran `args: {...}` and the result together in one
 * `<pre>`, leaving no way to see where the call ended and the answer began.
 *
 * **The card renders one DOM shape in every display mode, and CSS decides what
 * shows.** That is what makes `data-tool-display` behave like `data-answer-well`
 * — flip it on the host and every card already on screen re-reads it. Building a
 * different structure per mode meant only cards created *after* the change
 * picked it up, so the setting appeared not to work until the next conversation.
 * Visibility is selected from the host attribute rather than a value copied onto
 * the card at construction, for the same reason.
 *
 * The leading icon carries no text of its own: its glyph/spinner is drawn by
 * the shadow CSS keyed off the card's `data-status`, so a host themes it via
 * the `--ag-ui-tool-icon-*` custom properties (or the `tool-card-icon` part)
 * without the card reaching into the host stylesheet.
 *
 * Pure DOM (no framework); the host appends {@link element} into its shadow
 * root and themes it via the `--ag-ui-*` custom properties or the exposed
 * `tool-card*` `part`s. All visible text is sourced from {@link UiStrings}.
 */
export class ToolCallCard {
  /** The card's root element; append this into the message list. */
  readonly element: HTMLDivElement;

  readonly #status: HTMLSpanElement;
  readonly #toggle: HTMLButtonElement;
  readonly #resultSection: HTMLDivElement;
  readonly #resultLabel: HTMLSpanElement;
  readonly #resultBody: HTMLPreElement;
  readonly #strings: UiStrings;
  #settled = false;

  constructor(
    name: string,
    args: Record<string, unknown>,
    summary?: string,
    strings: UiStrings = DEFAULT_UI_STRINGS,
  ) {
    this.#strings = strings;

    this.element = document.createElement("div");
    this.element.className = "tool-call";
    this.element.setAttribute("part", "tool-card");
    this.element.setAttribute("data-tool-name", name);
    this.element.setAttribute("data-status", TOOL_CALL_STATUS.PENDING);
    this.element.setAttribute("data-expanded", "false");

    const head = document.createElement("div");
    head.className = "tool-call-head";
    head.setAttribute("part", "tool-card-head");

    // The leading status icon — a spinner while pending, a check/cross/slash on
    // settle. Empty in the DOM: the shadow CSS draws it from `data-status`, so
    // the glyphs stay themeable (`--ag-ui-tool-icon-*`) and the spin is real.
    const icon = document.createElement("span");
    icon.className = "tool-call-icon";
    icon.setAttribute("part", "tool-card-icon");
    icon.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "tool-call-name";
    label.setAttribute("part", "tool-card-name");
    // A server-provided `x-summary` label reads better than the raw tool name.
    label.textContent = summary ?? name;

    this.#status = document.createElement("span");
    this.#status.className = "tool-call-status";
    this.#status.setAttribute("part", "tool-card-status");
    this.#status.textContent = statusLabels(strings)[TOOL_CALL_STATUS.PENDING];

    head.append(icon, label, this.#status);

    const argsSection = this.#section("args", strings.argumentsLabel);
    argsSection.body.textContent = JSON.stringify(args, null, 2);
    // A call with no arguments renders an empty object in a box of its own,
    // which is a frame around nothing. Drop the region instead.
    argsSection.root.hidden = Object.keys(args).length === 0;

    const resultSection = this.#section("result", strings.resultLabel);
    this.#resultSection = resultSection.root;
    this.#resultLabel = resultSection.label;
    this.#resultBody = resultSection.body;
    // Nothing to show until `settle` supplies it; a pending card would
    // otherwise expand onto an empty region.
    resultSection.root.hidden = true;

    this.#toggle = document.createElement("button");
    this.#toggle.type = "button";
    this.#toggle.className = "tool-call-toggle";
    this.#toggle.setAttribute("part", "tool-card-toggle");
    this.#toggle.setAttribute("aria-expanded", "false");
    this.#toggle.textContent = strings.details;
    this.#toggle.addEventListener("click", () => this.#setExpanded(!this.#expanded()));

    const body = document.createElement("div");
    body.className = "tool-call-body";
    body.setAttribute("part", "tool-card-body");
    body.append(argsSection.root, resultSection.root);

    this.element.append(head, this.#toggle, body);
  }

  /** Whether {@link settle} has already run (so a terminal sweep can skip it). */
  get settled(): boolean {
    return this.#settled;
  }

  /**
   * Flip the status pill to `status` and fill in the result region, whose
   * heading names the outcome (result / error / declined).
   */
  settle(status: SettledStatus, text: string): void {
    // Idempotent: a duplicate `TOOL_CALL_RESULT`, or a replayed tool message
    // for an already-settled card, must not overwrite the first outcome.
    if (this.#settled) {
      return;
    }
    this.#settled = true;
    this.element.setAttribute("data-status", status);
    this.#status.textContent = statusLabels(this.#strings)[status];
    this.#resultLabel.textContent = resultLabels(this.#strings)[status];
    this.#resultBody.textContent = formatPayload(text);
    this.#resultSection.hidden = false;
  }

  /** Build one labelled region of the body: a heading plus a payload block. */
  #section(
    kind: string,
    labelText: string,
  ): {
    root: HTMLDivElement;
    label: HTMLSpanElement;
    body: HTMLPreElement;
  } {
    const root = document.createElement("div");
    root.className = `tool-call-section tool-call-section--${kind}`;
    root.setAttribute("part", `tool-card-section tool-card-${kind}-section`);

    const label = document.createElement("span");
    label.className = "tool-call-section-label";
    label.setAttribute("part", `tool-card-section-label tool-card-${kind}-label`);
    label.textContent = labelText;

    const body = document.createElement("pre");
    body.className = `tool-call-${kind}`;
    body.setAttribute("part", `tool-card-${kind}`);

    root.append(label, body);
    return { root, label, body };
  }

  #expanded(): boolean {
    return this.element.getAttribute("data-expanded") === "true";
  }

  #setExpanded(expand: boolean): void {
    this.element.setAttribute("data-expanded", String(expand));
    this.#toggle.setAttribute("aria-expanded", String(expand));
  }
}
