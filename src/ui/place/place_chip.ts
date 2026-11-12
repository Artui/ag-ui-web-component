import type { Context } from "@ag-ui/core";
import {
  ICON_PLACE,
  ICON_PLACE_SHARED,
  ICON_PLACE_WITHHELD,
  PLACE_CONTEXT,
} from "../../constants.js";
import { fillUiString } from "../fill_ui_string.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "../ui_strings.js";
import type { Place } from "./place.js";

/** What identifies a place for the exclusion: its href, else its label and detail. */
function keyOf(place: Place): string {
  return place.href ?? `${place.label}\u0000${place.detail ?? ""}`;
}

/**
 * The "you are here" chip in the composer's tool row, and the context entry it
 * stands for. It holds the last place read and whether the user withheld it;
 * the element decides when to read.
 *
 * The exclusion is keyed on the place, so it holds across turns on the same
 * place and lapses by itself when a different place is read. A read of no
 * place keeps it, so a page that briefly names nothing mid-navigation does not
 * undo what the user withheld. Nothing here persists, and nothing the host
 * sets can lift it.
 */
export class PlaceChip {
  readonly element: HTMLElement = document.createElement("div");
  /** The same place for the collapsed bar, drawn by the same render. */
  readonly barElement: HTMLElement = document.createElement("span");
  readonly #barLabel: HTMLElement = document.createElement("span");
  readonly #barDetail: HTMLElement = document.createElement("span");
  readonly #icon: HTMLElement = document.createElement("span");
  readonly #label: HTMLElement = document.createElement("span");
  readonly #detail: HTMLElement = document.createElement("span");
  readonly #toggle: HTMLButtonElement = document.createElement("button");
  #place: Place | null = null;
  #excluded: string | null = null;
  #strings: UiStrings = DEFAULT_UI_STRINGS;

  constructor() {
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
    const text = document.createElement("span");
    text.className = "place-text";
    text.append(this.#label, this.#detail);
    this.element.append(this.#icon, text, this.#toggle);
    this.barElement.className = "bar-place";
    this.barElement.setAttribute("part", "bar-place");
    this.barElement.hidden = true;
    this.#barLabel.className = "place-label";
    this.#barLabel.setAttribute("part", "place-label");
    this.#barDetail.className = "place-detail";
    this.#barDetail.setAttribute("part", "place-detail");
    this.barElement.append(this.#barLabel, this.#barDetail);
  }

  /** Wire the toggle for one connection, with the strings it resolved. */
  mount(signal: AbortSignal, strings: UiStrings): void {
    this.#strings = strings;
    this.#toggle.addEventListener("click", () => this.#flip(), { signal });
    this.#render();
  }

  /** Show a fresh read; null hides the chip and sends nothing. */
  update(place: Place | null): void {
    if (place !== null && this.#excluded !== null && this.#excluded !== keyOf(place)) {
      this.#excluded = null;
    }
    this.#place = place;
    this.#render();
  }

  /** Whether there is a place and the user withheld it, which withholds the page too. */
  get withheld(): boolean {
    return this.#place !== null && this.#excluded !== null;
  }

  /** The round's context entry: the place as shown, without its icon, or nothing. */
  context(): Context[] {
    const place = this.#place;
    if (place === null || this.#excluded !== null) {
      return [];
    }
    const sent = {
      label: place.label,
      ...(place.detail === undefined ? {} : { detail: place.detail }),
      ...(place.href === undefined ? {} : { href: place.href }),
    };
    return [{ description: PLACE_CONTEXT, value: JSON.stringify(sent) }];
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
    this.barElement.hidden = place === null;
    if (place === null) {
      return;
    }
    const shared = this.#excluded === null;
    this.element.toggleAttribute("data-excluded", !shared);
    this.barElement.toggleAttribute("data-excluded", !shared);
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
    this.#barLabel.textContent = place.label;
    this.#barDetail.textContent = place.detail ?? "";
    this.#barDetail.hidden = place.detail === undefined;
    this.element.title = fillUiString(
      shared ? this.#strings.placeShared : this.#strings.placeWithheld,
      { label: place.label },
    );
    const action = shared ? this.#strings.placeStopSharing : this.#strings.placeShareAgain;
    this.#toggle.innerHTML = shared ? ICON_PLACE_SHARED : ICON_PLACE_WITHHELD;
    this.#toggle.title = action;
    this.#toggle.setAttribute("aria-label", action);
  }
}
