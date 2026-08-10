import type { RunRow } from "../core/run_index.js";
import { relativeTime } from "./relative_time.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** How the host continues a picked run. */
export type CheckpointVerb = "resume" | "fork";

/**
 * The checkpoint panel: continuable runs, each offering **resume** or **fork**.
 *
 * A separate surface from the thread drawer on purpose — they are different
 * axes. A thread is a conversation you switch *to*; a checkpoint is a run you
 * continue *from*, and one thread can hold many. Folding them into one list
 * would make "resume" look like "open", which it isn't: resuming starts a new
 * run seeded from a snapshot.
 *
 * Only rows the server marked `continuable` are worth offering, so the host
 * feeds those; a run with no snapshot would resume from nothing. Pure DOM in
 * the spirit of {@link SkillsMenu} — the host appends {@link element}, toggles
 * it, feeds rows via {@link setRuns}, and acts on {@link onPick}.
 */
export class CheckpointMenu {
  /** The panel root. Append to the chat shell; hidden until opened. */
  readonly element: HTMLDivElement;

  readonly #onPick: (runId: string, verb: CheckpointVerb) => void;
  readonly #list: HTMLDivElement;
  readonly #heading: HTMLSpanElement;
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
    this.element.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    });
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
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
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
