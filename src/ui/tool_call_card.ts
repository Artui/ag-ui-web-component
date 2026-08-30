import { TOOL_CALL_STATUS, type TOOL_DISPLAY } from "../constants.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** Any state a tool-call card can be in. */
export type ToolCallStatus = (typeof TOOL_CALL_STATUS)[keyof typeof TOOL_CALL_STATUS];

/** How much detail a card renders. */
export type ToolDisplayMode = (typeof TOOL_DISPLAY)[keyof typeof TOOL_DISPLAY];

/** The two states a card can sit in before an outcome exists. */
export type UnsettledStatus = typeof TOOL_CALL_STATUS.PENDING | typeof TOOL_CALL_STATUS.DEFERRED;

/** The terminal states a card settles into (everything unsettled excluded). */
export type SettledStatus = Exclude<ToolCallStatus, UnsettledStatus>;

/** Short pill text shown for each status, drawn from the string table. */
function statusLabels(strings: UiStrings): Record<ToolCallStatus, string> {
  return {
    [TOOL_CALL_STATUS.PENDING]: strings.toolRunning,
    [TOOL_CALL_STATUS.DEFERRED]: strings.toolDeferred,
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
 * One region of a card's body, handed to a host {@link ToolPayloadFormatter}.
 *
 * A discriminated union rather than three positional parameters because the two
 * halves do not carry the same thing: arguments are the parsed record the call
 * was made with, and a result is the raw string the tool returned, which may not
 * be JSON at all. Flattening both into one `payload` parameter would force every
 * formatter to re-derive which it had before it could read it, and the
 * arguments would arrive re-serialised for no reason.
 *
 * `toolName` is the raw tool name, not the card's `x-summary` label -- a
 * formatter dispatches on identity, and the label is a display string a server
 * may change.
 */
export type ToolPayload =
  | {
      readonly kind: "arguments";
      readonly toolName: string;
      readonly args: Record<string, unknown>;
    }
  | {
      readonly kind: "result";
      readonly toolName: string;
      readonly status: SettledStatus;
      readonly text: string;
    };

/**
 * Renders one region of a tool card's body, for a host that would rather show a
 * table or a summary line than a wall of pretty-printed JSON.
 *
 * Return a `Node` to take the region over, a `string` to replace its text, or
 * `null` to fall through to the built-in pretty-print -- so a formatter that
 * only cares about one tool, or only about results, declines the rest rather
 * than reimplementing them.
 *
 * **Presentation only.** The model reads the tool result from its own copy of
 * the message, which this never touches, so anything said here is said to the
 * person and not to the agent. Translating a value -- an enum constant into a
 * friendly label, an epoch into a date -- belongs on the server, where it also
 * reaches the model's prose; doing it here would make the card and the answer
 * beside it disagree about what happened.
 *
 * A returned string is set as text, never parsed as markup: this is not a
 * second HTML channel into the transcript, and a host that wants elements
 * builds them itself and returns the node.
 */
export type ToolPayloadFormatter = (payload: ToolPayload) => Node | string | null;

/** Optional per-card wiring beyond the name, arguments, label and strings. */
export interface ToolCallCardOptions {
  /** Host presentation hook for both body regions. See {@link ToolPayloadFormatter}. */
  readonly formatPayload?: ToolPayloadFormatter;
}

/**
 * A live tool-call card for the chat transcript.
 *
 * Construction renders a status icon, the tool name, a status pill, and a body
 * of two separately-headed regions — arguments and result — each with its own
 * `part`. {@link settle} fills in the result and flips the pill. Both payloads
 * are pretty-printed and never concatenated into one block.
 *
 * The card renders one DOM shape in every display mode and lets CSS decide what
 * shows, selecting visibility from the host attribute rather than a value
 * copied onto the card at construction. That is what lets `data-tool-display`
 * be flipped on the host and re-read by every card already on screen; building
 * a different structure per mode would leave existing cards stale.
 *
 * The leading icon carries no text: the shadow CSS draws its glyph or spinner
 * from the card's `data-status`, so a host themes it through the
 * `--ag-ui-tool-icon-*` custom properties or the `tool-card-icon` part without
 * the card reaching into the host stylesheet.
 *
 * Either region may be drawn by the host instead: `options.formatPayload` is
 * asked about each one and pretty-prints as before whenever it declines. The
 * arguments are offered from the constructor and the result from {@link settle},
 * because that is when each exists -- so a formatter is asked twice per card,
 * potentially long apart.
 *
 * Pure DOM. The host appends {@link element} into its shadow root; all visible
 * text comes from {@link UiStrings}.
 */
export class ToolCallCard {
  /** The card's root element; append this into the message list. */
  readonly element: HTMLDivElement;

  /**
   * Where a question about *this* call renders — the approval prompt for a
   * server-side tool the run deferred.
   *
   * It belongs to the card rather than to the transcript because a run can defer
   * several calls at once, and a prompt written per *tool* ("Add this event to
   * the board?") is identical for every one of them. Rendered into the answer
   * group they were three anonymous copies of one question, below the three
   * cards they gated; rendered here, position identifies them and the arguments
   * are already on screen above the question.
   *
   * Empty until used, and hidden while empty by the shadow CSS.
   */
  readonly approvalSlot: HTMLDivElement;

  readonly #status: HTMLSpanElement;
  readonly #decision: HTMLSpanElement;
  readonly #toggle: HTMLButtonElement;
  readonly #resultSection: HTMLDivElement;
  readonly #resultLabel: HTMLSpanElement;
  readonly #resultBody: HTMLPreElement;
  readonly #strings: UiStrings;
  /**
   * The arguments this call was made with.
   *
   * Retained rather than only rendered, because an approval interrupt names a
   * `toolCallId` and nothing else -- so this card is the only place the args
   * still exist when the user is asked to approve, edit or deny the call.
   */
  readonly args: Record<string, unknown>;
  /** The raw tool name, kept for the payloads handed to {@link ToolPayloadFormatter}. */
  readonly #name: string;
  readonly #formatPayload: ToolPayloadFormatter | null;
  #settled = false;

  constructor(
    name: string,
    args: Record<string, unknown>,
    summary?: string,
    strings: UiStrings = DEFAULT_UI_STRINGS,
    options: ToolCallCardOptions = {},
  ) {
    this.#strings = strings;
    this.args = args;
    this.#name = name;
    this.#formatPayload = options.formatPayload ?? null;

    this.element = document.createElement("div");
    this.element.className = "tool-call";
    this.element.setAttribute("part", "tool-card");
    this.element.setAttribute("data-tool-name", name);
    this.element.setAttribute("data-status", TOOL_CALL_STATUS.PENDING);
    this.element.setAttribute("data-expanded", "false");

    const head = document.createElement("div");
    head.className = "tool-call-head";
    head.setAttribute("part", "tool-card-head");

    // Left empty in the DOM on purpose: the shadow CSS draws the spinner or
    // settled mark from `data-status`, keeping the glyphs themeable.
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

    this.#decision = document.createElement("span");
    this.#decision.className = "tool-call-decision";
    this.#decision.setAttribute("part", "tool-card-decision");
    this.#decision.hidden = true;

    head.append(icon, label, this.#status, this.#decision);

    const argsSection = this.#section("args", strings.argumentsLabel);
    this.#renderPayload(
      argsSection.body,
      { kind: "arguments", toolName: name, args },
      JSON.stringify(args, null, 2),
    );
    // Drop the region rather than frame an empty object.
    argsSection.root.hidden = Object.keys(args).length === 0;

    const resultSection = this.#section("result", strings.resultLabel);
    this.#resultSection = resultSection.root;
    this.#resultLabel = resultSection.label;
    this.#resultBody = resultSection.body;
    // Nothing to show until `settle` supplies it, or a pending card expands
    // onto an empty region.
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

    this.approvalSlot = document.createElement("div");
    this.approvalSlot.className = "tool-call-approval";
    this.approvalSlot.setAttribute("part", "tool-card-approval");

    this.element.append(head, this.#toggle, body, this.approvalSlot);
  }

  /**
   * Move between the two states that are not an outcome — `pending` (running)
   * and `deferred` (gated, waiting on a person).
   *
   * Ignored once {@link settle} has run: a card that was declined must not be
   * talked back into looking live by a late event.
   */
  mark(status: UnsettledStatus): void {
    if (this.#settled) {
      return;
    }
    this.element.setAttribute("data-status", status);
    this.#status.textContent = statusLabels(this.#strings)[status];
  }

  /**
   * Record that a human approved or declined this call, as a line in the card.
   * The prompt disappears once answered, so this is the only lasting trace that
   * the call was gated at all.
   */
  recordDecision(kind: "approved" | "declined"): void {
    this.element.setAttribute("data-decision", kind);
    this.#decision.textContent =
      kind === "approved" ? this.#strings.decisionApproved : this.#strings.decisionDeclined;
    this.#decision.hidden = false;
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
    this.#renderPayload(
      this.#resultBody,
      { kind: "result", toolName: this.#name, status, text },
      formatPayload(text),
    );
    this.#resultSection.hidden = false;
  }

  /**
   * Fill one body region, offering it to the host formatter first.
   *
   * `fallback` is computed by the caller rather than here because the two
   * regions build it differently -- arguments are already parsed, a result is a
   * string that may or may not be JSON -- and because a formatter that takes
   * the region over should not have paid for a pretty-print nobody sees. It is
   * cheap either way; the point is that the built-in rendering stays written
   * once, beside the payload it belongs to.
   *
   * The `data-formatted` marker is what the shadow CSS reads to relax the
   * preformatted whitespace on a region a host owns -- a table inherits it as
   * mangled cell spacing, a sentence as line breaks nobody typed. Marked for a
   * returned string too: one rule, and a summary line wants ordinary wrapping
   * as much as a table does.
   */
  #renderPayload(body: HTMLPreElement, payload: ToolPayload, fallback: string): void {
    const rendered = this.#formatPayload === null ? null : this.#formatPayload(payload);
    if (rendered === null) {
      body.textContent = fallback;
      return;
    }
    body.setAttribute("data-formatted", "true");
    if (typeof rendered === "string") {
      body.textContent = rendered;
      return;
    }
    body.replaceChildren(rendered);
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
