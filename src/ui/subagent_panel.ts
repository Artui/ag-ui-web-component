import type { SUBAGENT_PHASE } from "../constants.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** One phase of a delegation's life, as the server spells it. */
export type SubAgentPhase = (typeof SUBAGENT_PHASE)[keyof typeof SUBAGENT_PHASE];

/**
 * One tool call the child made, as the two tool phases report it.
 *
 * `ok` is a tri-state and stays one here rather than collapsing to a boolean:
 * `null` is the call in flight, `true` a result the child accepted, `false` a
 * result that came back to it. Flattening `null` into `false` would draw a
 * running call as a failed one for as long as it runs.
 */
export interface SubAgentTool {
  readonly toolCallId: string;
  readonly name: string;
  readonly ok: boolean | null;
}

/**
 * One narrowed progress announcement about a delegation.
 *
 * Every field but `phase` and `delegationId` is nullable because the wire's
 * `value` is `unknown` and a malformed announcement must not take the run down
 * with it. `null` means "said nothing about this", never "said nothing was
 * there" — the panel leaves what it already shows alone.
 */
export interface SubAgentUpdate {
  /** The **parent's** `delegate_task` tool-call id, not the child's run id. */
  readonly delegationId: string;
  /** The child agent's name, for a host that wants to style or select by it. */
  readonly agent: string | null;
  readonly phase: SubAgentPhase;
  /** The server's pre-rendered line. The collapsed row needs nothing else. */
  readonly status: string | null;
  /** Present on the two tool phases only. */
  readonly tool: SubAgentTool | null;
}

/**
 * The nested surface for one delegation: a collapsed status row that expands
 * onto the child agent's own tool calls.
 *
 * ## Where it goes and why
 *
 * Into {@link ToolCallCard.subagentSlot} — the card the parent's own
 * `delegate_task` call already drew. The wire keys progress on the *parent's*
 * tool-call id, so the thing being narrated is already on screen; a floating
 * element would have duplicated its identity and then had to explain the
 * relationship. Attaching instead means the delegation reuses how tool cards
 * already behave, and there is no second visual language to learn.
 *
 * ## The shape
 *
 * One row per delegation, live, carrying nothing but the server's own `status`
 * line — which is what makes a ten-step child cost one row until somebody opens
 * it. Two alternatives were rejected on the way here and both are worth naming:
 * a bare status line is cheaper and gives up the detail entirely, and inline
 * child cards in the transcript interleave parent and child with nothing marking
 * whose is whose, in an order the persisted transcript will not reproduce.
 *
 * A child's steps are keyed by the child's own `toolCallId`, so the `tool_call`
 * that opens one and the `tool_result` that settles it are the same row updated
 * in place rather than two rows stacked.
 *
 * ## What it never does
 *
 * It never renders failure text. A `failed` phase carries none, on purpose; the
 * detail arrives on the ordinary `TOOL_CALL_RESULT` and lands in the same card's
 * result region, a few pixels below. Anything invented here would be this
 * component guessing at words the server declined to send.
 *
 * Nothing here is persisted: the events ride the imperative carrier, so a thread
 * restore rebuilds the tool card and not the delegation under it.
 *
 * Pure DOM, like the other widgets: the host appends {@link element}, and all
 * chrome text comes from {@link UiStrings}. The status line is server text and
 * is set with `textContent`, never parsed as markup.
 */
export class SubAgentPanel {
  /** The panel's root; append this into the delegating card's slot. */
  readonly element: HTMLDivElement;

  /**
   * The collapsed row, which is the expander as well as the status.
   *
   * Disabled while the child has called nothing, so a delegation that failed
   * before it started offers no control that expands onto an empty region —
   * the same refusal the card's own Details toggle already makes.
   */
  readonly #row: HTMLButtonElement;
  readonly #status: HTMLSpanElement;
  readonly #steps: HTMLDivElement;
  /** The child's tool calls, keyed by the child's own call id. */
  readonly #stepRows = new Map<string, HTMLDivElement>();

  constructor(strings: UiStrings = DEFAULT_UI_STRINGS) {
    this.element = document.createElement("div");
    this.element.className = "subagent";
    this.element.setAttribute("part", "subagent");

    this.#row = document.createElement("button");
    this.#row.type = "button";
    this.#row.className = "subagent-row";
    this.#row.setAttribute("part", "subagent-row");
    this.#row.setAttribute("aria-expanded", "false");
    this.#row.disabled = true;

    // Left empty in the DOM, like the tool card's: the shadow CSS draws a
    // spinner or a settled mark from the panel's data-phase, so a host themes
    // the glyph without either side reaching into the other's stylesheet.
    const icon = document.createElement("span");
    icon.className = "subagent-icon";
    icon.setAttribute("part", "subagent-icon");
    icon.setAttribute("aria-hidden", "true");

    this.#status = document.createElement("span");
    this.#status.className = "subagent-status";
    this.#status.setAttribute("part", "subagent-status");
    // Seeded rather than left blank: an announcement whose status field is
    // unusable must still leave a readable row, since the row is the control.
    this.#status.textContent = strings.subAgentWorking;

    this.#row.append(icon, this.#status);

    this.#steps = document.createElement("div");
    this.#steps.className = "subagent-steps";
    this.#steps.setAttribute("part", "subagent-steps");
    this.#steps.setAttribute("role", "list");
    this.#steps.setAttribute("aria-label", strings.subAgentSteps);
    this.#steps.hidden = true;

    // The attribute is the state, as it is on the tool card: one place holds
    // whether the region is open, and it is the one a screen reader reads.
    this.#row.addEventListener("click", () => {
      this.#setExpanded(this.#row.getAttribute("aria-expanded") !== "true");
    });

    this.element.append(this.#row, this.#steps);
  }

  /**
   * Fold one announcement in.
   *
   * Every field is applied only when the update actually carried it, so a phase
   * that says nothing about the agent or the status leaves both as they stand.
   * That is what lets `finished` be two keys wide on the wire without blanking
   * the row it closes.
   */
  report(update: SubAgentUpdate): void {
    this.element.setAttribute("data-phase", update.phase);
    if (update.agent !== null) {
      this.element.setAttribute("data-agent", update.agent);
    }
    if (update.status !== null) {
      this.#status.textContent = update.status;
    }
    if (update.tool !== null) {
      this.#recordStep(update.tool);
    }
  }

  /**
   * Open or settle one of the child's calls, keyed by its own id.
   *
   * The absence of `data-ok` is what "still running" looks like, mirroring the
   * wire's `null` rather than inventing a third value for it — so the attribute
   * is removed on the way in and written on the way out.
   */
  #recordStep(tool: SubAgentTool): void {
    const row = this.#stepRows.get(tool.toolCallId) ?? this.#createStep(tool);
    if (tool.ok === null) {
      row.removeAttribute("data-ok");
      return;
    }
    row.setAttribute("data-ok", String(tool.ok));
  }

  #createStep(tool: SubAgentTool): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "subagent-step";
    row.setAttribute("part", "subagent-step");
    row.setAttribute("role", "listitem");
    row.setAttribute("data-tool-call-id", tool.toolCallId);

    const icon = document.createElement("span");
    icon.className = "subagent-step-icon";
    icon.setAttribute("part", "subagent-step-icon");
    icon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "subagent-step-name";
    name.setAttribute("part", "subagent-step-name");
    // The child's raw tool name. Not prettified and not looked up in the tool
    // catalog: a sub-agent's tools are its own and never reached the browser's
    // schema, and the status line above quotes the same raw name, so relabelling
    // here would make the two lines disagree about one call.
    name.textContent = tool.name;

    row.append(icon, name);
    this.#steps.appendChild(row);
    this.#stepRows.set(tool.toolCallId, row);
    // There is something behind the row now, so it becomes a control.
    this.#row.disabled = false;
    return row;
  }

  #setExpanded(expanded: boolean): void {
    this.#steps.hidden = !expanded;
    this.#row.setAttribute("aria-expanded", String(expanded));
  }
}
