import {
  focusWithFlash,
  type HighlightClickOptions,
  highlightThenClick,
  scrollIntoCenterView,
  type TextLikeElement,
  type TypeOptions,
  typeInto,
} from "./animations.js";

/**
 * Generic, framework-free DOM-driving primitives.
 *
 * Each operates on an element the caller has already located. Host packages
 * (e.g. `django-admin-agent`) wrap these with environment-aware lookups —
 * `fill_field(name, value)` finds `#id_<name>` then calls {@link fillField}.
 */

export interface FillFieldOptions extends TypeOptions, FlashOptionsLike {}

interface FlashOptionsLike {
  flashMs?: number;
}

/** Scroll to, focus (with a flash), and type ``value`` into a text field. */
export async function fillField(
  el: TextLikeElement,
  value: string,
  options: FillFieldOptions = {},
): Promise<void> {
  scrollIntoCenterView(el);
  await focusWithFlash(el, { flashMs: options.flashMs ?? 0 });
  await typeInto(el, value, options);
}

/** Scroll to, highlight, and click an element. */
export async function clickElement(
  el: HTMLElement,
  options: HighlightClickOptions = {},
): Promise<void> {
  scrollIntoCenterView(el);
  await highlightThenClick(el, options);
}

/**
 * Set a `<select>` or checkbox value without typing animation, dispatching the
 * ``input`` and ``change`` events frameworks listen for.
 */
export function setControlValue(
  el: HTMLInputElement | HTMLSelectElement,
  value: string | boolean,
): void {
  if (el instanceof HTMLInputElement && el.type === "checkbox") {
    el.checked = Boolean(value);
  } else {
    el.value = String(value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
