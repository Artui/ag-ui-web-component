import { SUBAGENT_PHASE, TOOL_CALL_STATUS } from "../../constants.js";
import { fillUiString } from "../fill_ui_string.js";
import type { UiStrings } from "../ui_strings.js";

/** What a group says about itself, read by the shadow CSS from `data-state`. */
type GroupState = "waiting" | "running" | "done" | "error";

/** The statuses a step is still open in. */
const OPEN_STATUSES: ReadonlySet<string> = new Set([
  TOOL_CALL_STATUS.PENDING,
  TOOL_CALL_STATUS.DEFERRED,
]);

/**
 * A sub-agent panel still working, by the phase it stamps on itself. A panel
 * outlives the delegation it drew, so a settled one does not match.
 */
const RUNNING_SUBAGENT = `.tool-call-subagent > .subagent:is(${[
  SUBAGENT_PHASE.STARTED,
  SUBAGENT_PHASE.TOOL_CALL,
  SUBAGENT_PHASE.TOOL_RESULT,
]
  .map((phase) => `[data-phase="${phase}"]`)
  .join(", ")})`;

/** One step of the group: its card, and its label as the row names it. */
interface Step {
  readonly element: HTMLElement;
  readonly name: string;
  readonly label: string;
}

/**
 * The attributes the row is drawn from: each card's `data-status`, and the
 * `data-phase` and `data-agent` a sub-agent panel stamps on itself inside the
 * card that delegated to it. Watched rather than told, so a step settled or
 * delegated by any path updates the row without the group being called.
 */
const WATCHED_ATTRIBUTES: readonly string[] = ["data-status", "data-phase", "data-agent"];

/**
 * Consecutive tool calls folded into one quiet row, "Worked through 5 steps",
 * with the per-call cards one click down. Built by the transcript for each run
 * of calls when the element's `toolDisplay` is `grouped`.
 *
 * The group owns no state of its own beyond its nodes and two facts: each
 * step's label, and whether it has already opened itself for the current wait.
 * Everything else is read back off the cards each time one changes.
 *
 * It opens itself while a step waits on the user, because a deferred step
 * carries its approval prompt inside its card and a folded group would hide
 * the very question it is asking. Once per wait, so the user can fold it
 * again. A running sub-agent does not open it: the row names the sub-agent
 * instead, beside the running mark.
 */
export class ToolStepGroup {
  readonly element: HTMLDivElement;
  readonly #strings: UiStrings;
  readonly #list: HTMLDivElement;
  readonly #head: HTMLButtonElement;
  readonly #label: HTMLSpanElement;
  readonly #meta: HTMLSpanElement;
  /** The steps, in order. Cards only ever join a group, so this is its list's children. */
  readonly #steps: Step[] = [];
  /** Whether the group has already opened itself for the current wait. */
  #openedForWait = false;

  constructor(strings: UiStrings) {
    this.#strings = strings;
    this.element = document.createElement("div");
    this.element.className = "tool-group";
    this.element.setAttribute("part", "tool-group");
    this.element.setAttribute("data-open", "false");

    this.#head = document.createElement("button");
    this.#head.type = "button";
    this.#head.className = "tool-group-head";
    this.#head.setAttribute("part", "tool-group-head");
    this.#head.setAttribute("aria-expanded", "false");

    const icon = document.createElement("span");
    icon.className = "tool-group-icon";
    icon.setAttribute("part", "tool-group-icon");
    icon.setAttribute("aria-hidden", "true");

    this.#label = document.createElement("span");
    this.#label.className = "tool-group-label";
    this.#label.setAttribute("part", "tool-group-label");

    this.#meta = document.createElement("span");
    this.#meta.className = "tool-group-meta";
    this.#meta.setAttribute("part", "tool-group-meta");

    const chevron = document.createElement("span");
    chevron.className = "tool-group-chevron";
    chevron.setAttribute("aria-hidden", "true");

    this.#head.append(icon, this.#label, this.#meta, chevron);
    this.#head.addEventListener("click", () => {
      this.setOpen(this.element.getAttribute("data-open") !== "true");
    });

    this.#list = document.createElement("div");
    this.#list.className = "tool-group-list";
    this.#list.setAttribute("part", "tool-group-list");

    this.element.append(this.#head, this.#list);

    new MutationObserver(() => {
      this.#refresh();
    }).observe(this.#list, {
      attributes: true,
      attributeFilter: [...WATCHED_ATTRIBUTES],
      subtree: true,
    });
  }

  /**
   * Add a card's element as the group's next step, under the label the card
   * was built with.
   *
   * A step whose label an earlier step already has gets a repeat ordinal,
   * "Fill field (2)", in an element of its own beside the card's name. The
   * name itself is never rewritten, so a group flattened back into per-call
   * cards by a card display mode shows exactly the label the card was built
   * with, and the CSS hides the ordinal there.
   */
  add(card: HTMLElement, name: string): void {
    const seen = this.#steps.filter((step) => step.name === name).length + 1;
    let label = name;
    if (seen > 1) {
      const repeat = document.createElement("span");
      repeat.className = "tool-call-repeat";
      repeat.setAttribute("part", "tool-card-repeat");
      repeat.textContent = fillUiString(this.#strings.toolStepRepeat, { n: seen });
      card.querySelector(".tool-call-name")?.after(repeat);
      label = `${name} ${repeat.textContent}`;
    }
    this.#steps.push({ element: card, name, label });
    this.#list.append(card);
    this.#refresh();
  }

  /** Show or hide the per-step cards. */
  setOpen(open: boolean): void {
    this.element.setAttribute("data-open", String(open));
    this.#head.setAttribute("aria-expanded", String(open));
  }

  /**
   * The row's note for a running sub-agent, naming it, or `null` when no step
   * is delegating right now. Only a step that is itself still running counts.
   */
  #delegation(): string | null {
    for (const { element } of this.#steps) {
      const panel =
        element.getAttribute("data-status") === TOOL_CALL_STATUS.PENDING
          ? element.querySelector(RUNNING_SUBAGENT)
          : null;
      if (panel !== null) {
        const agent = panel.getAttribute("data-agent");
        return agent === null
          ? this.#strings.subAgentWorking
          : fillUiString(this.#strings.subAgentDelegatedTo, { agent });
      }
    }
    return null;
  }

  #refresh(): void {
    const strings = this.#strings;
    const steps = this.#steps;
    const statuses = steps.map((step) => step.element.getAttribute("data-status") ?? "");
    const open = steps.filter((_, i) => OPEN_STATUSES.has(statuses[i] as string));
    const count = (status: string): number => statuses.filter((s) => s === status).length;
    const failed = count(TOOL_CALL_STATUS.ERROR);
    const declined = count(TOOL_CALL_STATUS.DECLINED);
    const waiting = count(TOOL_CALL_STATUS.DEFERRED);
    const total = steps.length;

    if (waiting > 0 && !this.#openedForWait) {
      this.#openedForWait = true;
      this.setOpen(true);
    } else if (waiting === 0) {
      this.#openedForWait = false;
    }

    let state: GroupState = "done";
    if (waiting > 0) {
      state = "waiting";
    } else if (open.length > 0) {
      state = "running";
    } else if (failed > 0) {
      state = "error";
    }
    this.element.setAttribute("data-state", state);
    this.element.setAttribute("data-count", String(total));

    const only = total === 1 ? steps[0] : undefined;
    if (only !== undefined) {
      this.#label.textContent = only.label;
    } else {
      const template =
        state === "waiting"
          ? strings.toolGroupSteps
          : state === "running"
            ? strings.toolGroupWorking
            : strings.toolGroupWorked;
      this.#label.textContent = fillUiString(template, { count: total });
    }

    const notes: string[] = [];
    const delegation = this.#delegation();
    const current = open[0];
    if (waiting > 0) {
      notes.push(fillUiString(strings.toolGroupWaiting, { count: waiting }));
    } else if (delegation !== null) {
      notes.push(delegation);
    } else if (current !== undefined && total > 1) {
      notes.push(current.label);
    }
    if (failed > 0) {
      notes.push(fillUiString(strings.toolGroupFailed, { count: failed }));
    }
    if (declined > 0) {
      notes.push(fillUiString(strings.toolGroupDeclined, { count: declined }));
    }
    this.#meta.replaceChildren(
      ...notes.map((text) => {
        const note = document.createElement("span");
        note.className = "tool-group-note";
        note.textContent = text;
        return note;
      }),
    );
    this.#meta.hidden = notes.length === 0;
  }
}
