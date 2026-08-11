import {
  type FlashOptions,
  focusWithFlash,
  type HighlightClickOptions,
  highlightThenClick,
  type PressOptions,
  pressThenClick,
  type SelectOptions,
  scrollIntoCenterView,
  selectOption,
  type TextLikeElement,
  type ToggleOptions,
  type TypeOptions,
  toggleControl,
  typeInto,
} from "./animations.js";
import { setNativeChecked, setNativeValue } from "./native_setter.js";

/**
 * Generic, framework-free DOM-driving primitives.
 *
 * Each operates on an element the caller has already located. Host packages
 * (e.g. `django-admin-agent`) wrap these with environment-aware lookups —
 * `fill_field(name, value)` finds `#id_<name>` then calls {@link fillField}.
 */

/**
 * A field has to hold focus to be typed into, so ``focus`` is not on offer
 * here — everything else the flash takes is.
 */
export interface FillFieldOptions extends TypeOptions, Omit<FlashOptions, "focus"> {}

/**
 * Scroll to, focus (with a flash), and type ``value`` into a text field.
 *
 * The scroll is awaited: typing into an element that is still gliding past
 * shows the user nothing.
 */
export async function fillField(
  el: TextLikeElement,
  value: string,
  options: FillFieldOptions = {},
): Promise<void> {
  await scrollIntoCenterView(el);
  await focusWithFlash(el, { ...options, flashMs: options.flashMs ?? 0 });
  await typeInto(el, value, options);
}

/** Scroll to, highlight, and click an element. */
export async function clickElement(
  el: HTMLElement,
  options: HighlightClickOptions = {},
): Promise<void> {
  await scrollIntoCenterView(el);
  await highlightThenClick(el, options);
}

/** Scroll to a button/control and click it with a visible "press" animation. */
export async function pressButton(el: HTMLElement, options: PressOptions = {}): Promise<void> {
  await scrollIntoCenterView(el);
  await pressThenClick(el, options);
}

/** Scroll to a `<select>`, highlight it, and pick the matching option (animated). */
export async function selectControl(
  el: HTMLSelectElement,
  value: string,
  options: SelectOptions = {},
): Promise<void> {
  await scrollIntoCenterView(el);
  await selectOption(el, value, options);
}

/** Scroll to a checkbox/radio, flash it, and set its checked state (animated). */
export async function toggleCheckbox(
  el: HTMLInputElement,
  checked: boolean,
  options: ToggleOptions = {},
): Promise<void> {
  await scrollIntoCenterView(el);
  await toggleControl(el, checked, options);
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
    setNativeChecked(el, Boolean(value));
  } else {
    setNativeValue(el, String(value));
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
