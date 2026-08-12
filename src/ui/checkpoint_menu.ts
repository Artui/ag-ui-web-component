import type { RunRow } from "../core/run_index.js";
import { relativeTime } from "./relative_time.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** How the host continues a picked run. */
export type CheckpointVerb = "resume" | "fork";

/**
 * The checkpoint panel: continuable runs, each offering **resume** or **fork**.
 *
 * Deliberately separate from the thread drawer: a thread is a conversation you
 * switch to, a checkpoint is a run you continue from, and one thread holds
 * many. One list would make "resume" read as "open", when resuming starts a new
 * run seeded from a snapshot.
 *
 * The host feeds only rows the server marked `continuable`, a run without a
 * snapshot having nothing to resume from. Pure DOM, like {@link SkillsMenu}:
 * append {@link element}, toggle it, feed {@link setRuns}, act on
 * {@link onPick}.
 */
export class CheckpointMenu {
  /** The panel root. Append to the chat shell; hidden until opened. */
  readonly element: HTMLDivElement;

  readonly #onPick: (runId: string, verb: CheckpointVerb) => void;
  readonly #list: HTMLDivElement;
  readonly #heading: HTMLSpanElement;
  /** What had focus before the panel opened, restored on close. */
  #lastFocused: HTMLElement | null = null;
  #strings: UiStrings;
  #runs: readonly RunRow[] = [];

  constructor(
    onPick: (runId: string, verb: CheckpointVerb) => void,
    strings: UiStrings = DEFAULT_UI_STRINGS,
  ) {
    this.#onPick = onPick;
    this.#strings = strings;

    this.element = document.createElement("div");
    this.element.className = "checkpoints";
    this.element.setAttribute("part", "checkpoints");
    this.element.setAttribute("role", "dialog");
    this.element.setAttribute("aria-label", strings.checkpoints);
    // Focusable as a fallback: with no continuable runs the panel holds no
    // controls at all, and a dialog that cannot take focus strands the
    // keyboard user outside it with no way back except Tab-ing blind.
    this.element.tabIndex = -1;
    this.element.hidden = true;

    const header = document.createElement("div");
    header.className = "checkpoints-header";
    header.setAttribute("part", "checkpoints-header");
    this.#heading = document.createElement("span");
    this.#heading.className = "checkpoints-title";
    this.#heading.setAttribute("part", "checkpoints-title");
    this.#heading.textContent = strings.checkpoints;
    header.append(this.#heading);

    this.#list = document.createElement("div");
    this.#list.className = "checkpoints-list";
    this.#list.setAttribute("part", "checkpoints-list");

    this.element.append(header, this.#list);
    this.element.addEventListener("keydown", (event) => this.#onKeydown(event));
  }

  /** Replace the rows. The host passes only `continuable` runs. */
  setRuns(runs: readonly RunRow[]): void {
    this.#runs = runs;
    this.#render();
  }

  /** Re-localize a panel built before the host's strings resolved. */
  setStrings(strings: UiStrings): void {
    this.#strings = strings;
    this.element.setAttribute("aria-label", strings.checkpoints);
    this.#heading.textContent = strings.checkpoints;
    this.#render();
  }

  open(): void {
    if (this.open_) {
      return;
    }
    // Remember what had focus so it is restored on close, then move focus into
    // the panel so a keyboard user lands inside the dialog rather than being
    // left behind it. The thread drawer already does this; a dialog that takes
    // no focus is one a keyboard user cannot reach and a screen reader does not
    // announce, however correct its role and label.
    this.#lastFocused = this.#activeElement() as HTMLElement | null;
    this.element.hidden = false;
    (this.#focusables()[0] ?? this.element).focus();
  }

  close(): void {
    if (!this.open_) {
      return;
    }
    this.element.hidden = true;
    this.#lastFocused?.focus();
    this.#lastFocused = null;
  }

  /** The focused element within this panel's root (shadow-aware). */
  #activeElement(): Element | null {
    return (this.element.getRootNode() as Document | ShadowRoot).activeElement;
  }

  /** The panel's tabbable controls, in document order. */
  #focusables(): HTMLElement[] {
    return Array.from(this.element.querySelectorAll<HTMLElement>("button, [tabindex]")).filter(
      (el) => !el.hidden,
    );
  }

  /** Escape closes; Tab is trapped so focus cannot wander behind the dialog. */
  #onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusables = this.#focusables();
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = this.#activeElement();
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  get open_(): boolean {
    return !this.element.hidden;
  }

  #render(): void {
    this.#list.replaceChildren();
    if (this.#runs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "checkpoints-empty";
      empty.setAttribute("part", "checkpoints-empty");
      empty.textContent = this.#strings.noCheckpoints;
      this.#list.append(empty);
      return;
    }
    for (const run of this.#runs) {
      this.#list.append(this.#row(run));
    }
  }

  #row(run: RunRow): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "checkpoint-row";
    row.setAttribute("part", "checkpoint-row");

    const label = document.createElement("span");
    label.className = "checkpoint-label";
    label.setAttribute("part", "checkpoint-label");
    // A run id is opaque to a person, so the time is the identifying detail;
    // the id rides `title` for anyone who needs to correlate with server logs.
    label.textContent =
      run.started_at === null
        ? run.run_id
        : relativeTime(Date.parse(run.started_at), Date.now(), this.#strings);
    label.title = run.run_id;
    row.append(label);

    if (run.parent_run_id !== null) {
      // Lineage, so a branch doesn't read as a duplicate of its parent.
      const branch = document.createElement("span");
      branch.className = "checkpoint-branch";
      branch.setAttribute("part", "checkpoint-branch");
      branch.textContent = this.#strings.forkedRun;
      branch.title = run.parent_run_id;
      row.append(branch);
    }

    row.append(
      this.#action(run.run_id, "resume", this.#strings.resumeRun),
      this.#action(run.run_id, "fork", this.#strings.forkRun),
    );
    return row;
  }

  #action(runId: string, verb: CheckpointVerb, label: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `checkpoint-action checkpoint-${verb}`;
    button.setAttribute("part", `checkpoint-action checkpoint-${verb}`);
    button.textContent = label;
    button.addEventListener("click", () => {
      this.close();
      this.#onPick(runId, verb);
    });
    return button;
  }
}
