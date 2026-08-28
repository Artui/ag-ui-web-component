import type { RunRow } from "../core/run_index.js";
import { type RelativeTimeFormatter, relativeTime } from "./relative_time.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** How the host continues a picked run. */
export type CheckpointVerb = "resume" | "fork";

/** The run's first message, or `null` where the row has no words to show. */
function previewOf(run: RunRow): string | null {
  return run.preview !== undefined && run.preview !== null && run.preview !== ""
    ? run.preview
    : null;
}

/**
 * A preview reduced to what the row puts on screen, for comparing two rows.
 *
 * Whitespace is collapsed because the rendered row collapses it anyway, so two
 * previews that differ only there are one label to the eye. Case is kept: two
 * spellings a person can tell apart are two labels, and an id beside them would
 * answer a question nobody asked.
 */
function asShown(preview: string): string {
  return preview.replace(/\s+/g, " ").trim();
}

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
  #formatRelativeTime: RelativeTimeFormatter | null = null;
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
  /**
   * Replace the timestamp formatter, or restore the built-in with `null`.
   *
   * The built-in is deliberately locale-neutral -- there is no `Intl` anywhere
   * in this component, so it never disagrees with a host's own formatting by
   * guessing a locale. That is a defensible default and a poor requirement, so
   * this is the way out.
   */
  setRelativeTimeFormatter(format: RelativeTimeFormatter | null): void {
    this.#formatRelativeTime = format;
  }

  /** This row's timestamp, through the host's formatter when it set one. */
  #formatTime(timestamp: number): string {
    return this.#formatRelativeTime !== null
      ? this.#formatRelativeTime(timestamp)
      : relativeTime(timestamp, Date.now(), this.#strings);
  }

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
    const repeated = this.#repeatedPreviews();
    for (const run of this.#runs) {
      this.#list.append(this.#row(run, repeated));
    }
  }

  /**
   * The previews more than one row shows.
   *
   * A preview identifies a run only while it is that run's alone. A real index
   * answered with five runs opening on the same sentence, and those rows read
   * alike exactly as bare timestamps used to — so where the words repeat the
   * short id comes back, and where they do not the row is left as it is.
   */
  #repeatedPreviews(): ReadonlySet<string> {
    const seen = new Set<string>();
    const repeated = new Set<string>();
    for (const run of this.#runs) {
      const preview = previewOf(run);
      if (preview === null) {
        continue;
      }
      const shown = asShown(preview);
      if (seen.has(shown)) {
        repeated.add(shown);
      }
      seen.add(shown);
    }
    return repeated;
  }

  #row(run: RunRow, repeated: ReadonlySet<string>): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "checkpoint-row";
    row.setAttribute("part", "checkpoint-row");

    const preview = previewOf(run);
    const time = run.started_at === null ? null : this.#formatTime(Date.parse(run.started_at));

    const label = document.createElement("span");
    label.className = "checkpoint-label";
    label.setAttribute("part", "checkpoint-label");
    // What the run was about, if the server says. Otherwise the time, and only
    // then the id — a person recognises the first, reads the second, and
    // recognises nothing at all in the third.
    label.textContent = preview ?? time ?? run.run_id;
    row.append(label);

    if (preview !== null && time !== null) {
      // Demoted to a chip: with words in the label the time is no longer what
      // identifies the run, but it still orders it.
      const when = document.createElement("span");
      when.className = "checkpoint-time";
      when.setAttribute("part", "checkpoint-time");
      when.textContent = time;
      row.append(when);
    }

    // The id, for a row whose label does not identify the run on its own: two
    // runs a few seconds apart both read "just now", and words another row also
    // opens with name neither of them. Picking between either pair is picking
    // blind. Shown rather than left in a tooltip, since a hover is not an
    // identity either — and eight characters beats a full id on the row. A
    // label that already is the id needs no second copy, and a run that arrived
    // without one has nothing better to offer than the words it shares.
    const ambiguous = preview === null ? time !== null : repeated.has(asShown(preview));
    if (ambiguous && run.run_id !== "") {
      const short = document.createElement("span");
      short.className = "checkpoint-id";
      short.setAttribute("part", "checkpoint-id");
      short.textContent = run.run_id.slice(0, 8);
      short.title = run.run_id;
      row.append(short);
    }

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
