import { TOOL_CALL_STATUS } from "../../constants.js";

/** What a group says about itself, read by the shadow CSS from `data-state`. */
type GroupState = "running" | "done" | "error";

/** The statuses a step is still open in. */
const OPEN_STATUSES: ReadonlySet<string> = new Set([
  TOOL_CALL_STATUS.PENDING,
  TOOL_CALL_STATUS.DEFERRED,
]);

/** The visible name of one card, which is its head's label. */
function stepName(card: Element): string {
  return card.querySelector(".tool-call-name")?.textContent ?? "";
}

/**
 * PROTOTYPE (design revamp, never merged): consecutive tool calls folded into
 * one quiet row, "Worked through 5 steps", with the per-call cards one click
 * down. Behind the element's `data-tool-group` attribute so the existing card
 * display stays the baseline.
 *
 * The group owns no state of its own beyond its nodes: it reads every card's
 * `data-status` each time one changes, so a card settled by any path (a client
 * handler, a streamed server result, a declined confirmation) updates the row
 * without the group being told. Strings are English only on this branch.
 */
export class ToolStepGroup {
  readonly element: HTMLDivElement;
  readonly #list: HTMLDivElement;
  readonly #head: HTMLButtonElement;
  readonly #label: HTMLSpanElement;
  readonly #meta: HTMLSpanElement;

  constructor() {
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
    icon.setAttribute("aria-hidden", "true");

    this.#label = document.createElement("span");
    this.#label.className = "tool-group-label";

    this.#meta = document.createElement("span");
    this.#meta.className = "tool-group-meta";

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
    }).observe(this.#list, { attributes: true, attributeFilter: ["data-status"], subtree: true });
  }

  /** Add a card's element as the group's next step. */
  add(card: HTMLElement): void {
    this.#list.append(card);
    this.#refresh();
  }

  /** Show or hide the per-step cards. */
  setOpen(open: boolean): void {
    this.element.setAttribute("data-open", String(open));
    this.#head.setAttribute("aria-expanded", String(open));
  }

  #refresh(): void {
    const cards = [...this.#list.children].filter((child) => child.classList.contains("tool-call"));
    const statuses = cards.map((card) => card.getAttribute("data-status") ?? "");
    const open = cards.filter((_, i) => OPEN_STATUSES.has(statuses[i] ?? ""));
    const failed = statuses.filter((status) => status === TOOL_CALL_STATUS.ERROR).length;
    const declined = statuses.filter((status) => status === TOOL_CALL_STATUS.DECLINED).length;
    const total = cards.length;

    let state: GroupState = "done";
    if (open.length > 0) {
      state = "running";
    } else if (failed > 0) {
      state = "error";
    }
    this.element.setAttribute("data-state", state);
    this.element.setAttribute("data-count", String(total));

    const first = cards[0];
    if (total === 1 && first !== undefined) {
      this.#label.textContent = stepName(first);
    } else if (state === "running") {
      this.#label.textContent = `Working through ${total} steps`;
    } else {
      this.#label.textContent = `Worked through ${total} steps`;
    }

    const notes: string[] = [];
    const current = open[0];
    if (state === "running" && current !== undefined && total > 1) {
      notes.push(stepName(current));
    }
    if (failed > 0) {
      notes.push(`${failed} failed`);
    }
    if (declined > 0) {
      notes.push(`${declined} declined`);
    }
    this.#meta.textContent = notes.join(" · ");
    this.#meta.hidden = notes.length === 0;
  }
}
