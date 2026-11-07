import type { Context } from "@ag-ui/core";
import type { Place } from "./place.js";

const ICON_PLACE = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>`;
const ICON_SHARED = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
const ICON_HIDDEN = `<svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6.5 9.5-6.5c2 0 3.7.7 5.1 1.7M21.5 12s-3.5 6.5-9.5 6.5c-2 0-3.7-.7-5.1-1.7"/><path d="M4 20 20 4"/></svg>`;

/** What identifies a place for the sticky exclusion: its link, else its name. */
function keyOf(place: Place): string {
  return place.href ?? `${place.label}\u0000${place.detail ?? ""}`;
}

/**
 * The "you are here" chip. Holds the last place read and whether the user has
 * taken it out of the conversation; the element decides when to read.
 *
 * The exclusion is keyed on the place, so it holds across turns on the same
 * page and lapses on its own when the user moves somewhere else.
 */
export class PlaceChip {
  readonly element: HTMLElement = document.createElement("div");
  readonly #icon: HTMLElement = document.createElement("span");
  readonly #label: HTMLElement = document.createElement("span");
  readonly #detail: HTMLElement = document.createElement("span");
  readonly #toggle: HTMLButtonElement = document.createElement("button");
  #place: Place | null = null;
  #excluded: string | null = null;

  constructor(signal: AbortSignal) {
    this.element.className = "place";
    this.element.setAttribute("part", "place");
    this.element.hidden = true;
    this.#icon.className = "place-icon";
    this.#icon.setAttribute("part", "place-icon");
    this.#label.className = "place-label";
    this.#label.setAttribute("part", "place-label");
    this.#detail.className = "place-detail";
    this.#detail.setAttribute("part", "place-detail");
    this.#toggle.type = "button";
    this.#toggle.className = "place-toggle";
    this.#toggle.setAttribute("part", "place-toggle");
    this.#toggle.addEventListener("click", () => this.#flip(), { signal });
    const text = document.createElement("span");
    text.className = "place-text";
    text.append(this.#label, this.#detail);
    this.element.append(this.#icon, text, this.#toggle);
  }

  /** Show a fresh read. Null hides the chip and sends nothing. */
  update(place: Place | null): void {
    this.#place = place;
    if (place !== null && this.#excluded !== null && this.#excluded !== keyOf(place)) {
      this.#excluded = null;
    }
    this.#render();
  }

  /** Whether the next round carries the place. */
  get shared(): boolean {
    return this.#place !== null && this.#excluded === null;
  }

  /** The context entry for the round: the place as shown, or nothing. */
  context(): Context[] {
    const place = this.#place;
    if (place === null || !this.shared) {
      return [];
    }
    return [
      {
        description:
          "Where in the application the user is while writing this message (the page, tab or record on screen).",
        value: JSON.stringify(place),
      },
    ];
  }

  #flip(): void {
    const place = this.#place;
    if (place === null) {
      return;
    }
    this.#excluded = this.#excluded === null ? keyOf(place) : null;
    this.#render();
  }

  #render(): void {
    const place = this.#place;
    this.element.hidden = place === null;
    if (place === null) {
      return;
    }
    const shared = this.shared;
    this.element.toggleAttribute("data-excluded", !shared);
    if (place.icon === undefined) {
      this.#icon.innerHTML = ICON_PLACE;
    } else {
      const img = document.createElement("img");
      img.src = place.icon;
      img.alt = "";
      this.#icon.replaceChildren(img);
    }
    this.#label.textContent = place.label;
    this.#detail.textContent = place.detail ?? "";
    this.#detail.hidden = place.detail === undefined;
    this.element.title = shared
      ? `The agent sees that you are on ${place.label}`
      : `${place.label} is not sent with your next message`;
    this.#toggle.innerHTML = shared ? ICON_SHARED : ICON_HIDDEN;
    this.#toggle.setAttribute("aria-pressed", String(!shared));
    this.#toggle.setAttribute(
      "aria-label",
      shared ? "Stop sharing this page" : "Share this page again",
    );
  }
}
