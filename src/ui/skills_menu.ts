import type { Skill } from "../skills/skill.js";

/**
 * The two skill surfaces over a single catalog: a **chips** row (the
 * `chip: true` subset) and a **`/`-command palette** (all skills, filtered).
 * Both are opt-in. Pure DOM; the host ({@link AgUiChat}) appends
 * {@link chips} + {@link palette}, feeds input via {@link onInput} /
 * {@link onKeydown}, and acts on the {@link onPick} callback.
 */
export class SkillsMenu {
  /** Chips row — append above the input. Hidden unless chips are enabled and present. */
  readonly chips: HTMLDivElement;
  /** The `/`-command dropdown — append in the input area. Hidden until opened. */
  readonly palette: HTMLDivElement;

  readonly #onPick: (skill: Skill) => void;
  #skills: readonly Skill[] = [];
  #chipsEnabled = false;
  #slashEnabled = false;
  #filtered: Skill[] = [];
  #activeIndex = 0;

  constructor(onPick: (skill: Skill) => void) {
    this.#onPick = onPick;
    this.chips = document.createElement("div");
    this.chips.className = "skill-chips";
    this.chips.setAttribute("part", "skill-chips");
    this.chips.hidden = true;
    this.palette = document.createElement("div");
    this.palette.className = "skill-palette";
    this.palette.setAttribute("part", "skill-palette");
    this.palette.setAttribute("role", "listbox");
    this.palette.hidden = true;
  }

  /** Replace the catalog (both surfaces re-derive from it). */
  setSkills(skills: readonly Skill[]): void {
    this.#skills = skills;
    this.#renderChips();
  }

  enableChips(enabled: boolean): void {
    this.#chipsEnabled = enabled;
    this.#renderChips();
  }

  enableSlash(enabled: boolean): void {
    this.#slashEnabled = enabled;
  }

  /** Whether the palette is currently open. */
  isOpen(): boolean {
    return !this.palette.hidden;
  }

  /**
   * React to an input value change: open + filter the palette when slash mode
   * is on and the value starts with `/`, otherwise close it.
   */
  onInput(value: string): void {
    if (this.#slashEnabled && value.startsWith("/")) {
      this.#open(value.slice(1));
    } else {
      this.close();
    }
  }

  /**
   * Handle a keydown while the palette is open. Returns ``true`` when consumed
   * (the host should `preventDefault` and skip its own handling).
   */
  onKeydown(event: KeyboardEvent): boolean {
    if (!this.isOpen()) {
      return false;
    }
    if (event.key === "ArrowDown") {
      this.#move(1);
      return true;
    }
    if (event.key === "ArrowUp") {
      this.#move(-1);
      return true;
    }
    if (event.key === "Escape") {
      this.close();
      return true;
    }
    if (event.key === "Enter") {
      // `slice(i, i+1)` yields a 0-or-1 element array; forEach gives a
      // definite Skill (no indexed-access `| undefined`).
      this.#filtered.slice(this.#activeIndex, this.#activeIndex + 1).forEach((skill) => {
        this.#pick(skill);
      });
      return true;
    }
    return false;
  }

  /** Close the palette. */
  close(): void {
    this.palette.hidden = true;
    this.palette.replaceChildren();
  }

  #open(query: string): void {
    const needle = query.trim().toLowerCase();
    const matches = this.#skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(needle) || skill.title.toLowerCase().includes(needle),
    );
    if (matches.length === 0) {
      this.close();
      return;
    }
    this.#filtered = matches;
    this.#activeIndex = 0;
    this.#renderPalette();
    this.palette.hidden = false;
  }

  #move(delta: number): void {
    const count = this.#filtered.length;
    this.#activeIndex = (this.#activeIndex + delta + count) % count;
    this.#renderPalette();
  }

  #pick(skill: Skill): void {
    this.close();
    this.#onPick(skill);
  }

  #renderChips(): void {
    this.chips.replaceChildren();
    const chipSkills = this.#chipsEnabled
      ? this.#skills.filter((skill) => skill.chip === true)
      : [];
    this.chips.hidden = chipSkills.length === 0;
    for (const skill of chipSkills) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skill-chip";
      button.setAttribute("part", "skill-chip");
      button.textContent = skill.title;
      button.addEventListener("click", () => this.#pick(skill));
      this.chips.appendChild(button);
    }
  }

  #renderPalette(): void {
    this.palette.replaceChildren();
    this.#filtered.forEach((skill, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "skill-item";
      item.setAttribute("part", "skill-item");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", index === this.#activeIndex ? "true" : "false");

      const title = document.createElement("span");
      title.className = "skill-item-title";
      title.setAttribute("part", "skill-item-title");
      title.textContent = skill.title;
      item.appendChild(title);

      if (skill.description !== undefined) {
        const desc = document.createElement("span");
        desc.className = "skill-item-desc";
        desc.setAttribute("part", "skill-item-desc");
        desc.textContent = skill.description;
        item.appendChild(desc);
      }

      item.addEventListener("click", () => this.#pick(skill));
      this.palette.appendChild(item);
    });
  }
}
