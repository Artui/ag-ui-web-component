/**
 * Visible-action animation primitives.
 *
 * These run against the **host page** DOM (not the element's shadow root) so a
 * user watches the agent type, highlight, and click at human-readable speed.
 * Each is configurable; pass small/zero durations in tests (or use fake timers).
 */

import { setNativeChecked, setNativeValue } from "./native_setter.js";

const ACCENT = "#4f46e5";

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** An element whose `value` can be typed into. */
export type TextLikeElement = HTMLInputElement | HTMLTextAreaElement;

export interface TypeOptions {
  /** Milliseconds between characters. Default 35. */
  charDelayMs?: number;
}

/**
 * Clear ``el`` and type ``value`` one character at a time, firing ``input``
 * events as a real user would, then a final ``change`` event.
 */
export async function typeInto(
  el: TextLikeElement,
  value: string,
  options: TypeOptions = {},
): Promise<void> {
  const charDelayMs = options.charDelayMs ?? 35;
  setNativeValue(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  for (const char of value) {
    setNativeValue(el, el.value + char);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    if (charDelayMs > 0) {
      await delay(charDelayMs);
    }
  }
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export interface HighlightClickOptions {
  /** Milliseconds to hold the highlight before clicking. Default 280. */
  highlightMs?: number;
}

/** Outline ``el``, pause so the user sees it, then click and restore. */
export async function highlightThenClick(
  el: HTMLElement,
  options: HighlightClickOptions = {},
): Promise<void> {
  const highlightMs = options.highlightMs ?? 280;
  const previousOutline = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  el.style.outline = `2px solid ${ACCENT}`;
  el.style.outlineOffset = "2px";
  await delay(highlightMs);
  el.style.outline = previousOutline;
  el.style.outlineOffset = previousOffset;
  el.click();
}

/** Scroll ``el`` to the vertical centre of the viewport. */
export function scrollIntoCenterView(el: HTMLElement): void {
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
}

export interface FlashOptions {
  /** Milliseconds to hold the focus flash. Default 200. */
  flashMs?: number;
}

/** Focus ``el`` and briefly flash a ring around it. */
export async function focusWithFlash(el: HTMLElement, options: FlashOptions = {}): Promise<void> {
  const flashMs = options.flashMs ?? 200;
  el.focus();
  const previousShadow = el.style.boxShadow;
  el.style.boxShadow = `0 0 0 3px rgba(79, 70, 229, 0.4)`;
  await delay(flashMs);
  el.style.boxShadow = previousShadow;
}

const RING = "0 0 0 3px rgba(79, 70, 229, 0.4)";

/**
 * Whether the user has asked the OS/browser to minimise motion.
 *
 * The richer action animations below check this and skip their hold delays so
 * the agent's edits still happen (events fire, values set) but without the
 * visible pause. The character-typing / highlight primitives above predate this
 * and keep their explicit-duration contract.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Like {@link delay}, but resolves immediately under reduced motion. */
function motionDelay(ms: number): Promise<void> {
  if (ms <= 0 || prefersReducedMotion()) {
    return Promise.resolve();
  }
  return delay(ms);
}

export interface PressOptions {
  /** Milliseconds to hold the pressed state before clicking. Default 140. */
  pressMs?: number;
}

/**
 * Show a brief "pressed" affordance on a button/control — a slight scale-down
 * plus accent ring — then click it and restore. Reads as an actual press, not
 * just an outline (cf. {@link highlightThenClick}).
 */
export async function pressThenClick(el: HTMLElement, options: PressOptions = {}): Promise<void> {
  const pressMs = options.pressMs ?? 140;
  const previousTransform = el.style.transform;
  const previousTransition = el.style.transition;
  const previousShadow = el.style.boxShadow;
  el.style.transition = "transform 80ms ease";
  el.style.transform = "scale(0.96)";
  el.style.boxShadow = RING;
  await motionDelay(pressMs);
  el.style.transform = previousTransform;
  el.style.transition = previousTransition;
  el.style.boxShadow = previousShadow;
  el.click();
}

export interface SelectOptions {
  /** Milliseconds to hold the highlight before committing. Default 220. */
  highlightMs?: number;
}

/** Find an option in ``el`` whose value or visible text equals ``value``. */
function findOption(el: HTMLSelectElement, value: string): HTMLOptionElement | null {
  for (const option of Array.from(el.options)) {
    if (option.value === value || option.text === value) {
      return option;
    }
  }
  return null;
}

/**
 * Outline a `<select>`, pause so the user sees the pick, then set it to the
 * option matching ``value`` (by value or visible text) and fire `input` +
 * `change`. Throws when no option matches.
 */
export async function selectOption(
  el: HTMLSelectElement,
  value: string,
  options: SelectOptions = {},
): Promise<void> {
  const option = findOption(el, value);
  if (option === null) {
    throw new Error(`no <option> matching "${value}"`);
  }
  const highlightMs = options.highlightMs ?? 220;
  const previousOutline = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  el.style.outline = `2px solid ${ACCENT}`;
  el.style.outlineOffset = "2px";
  await motionDelay(highlightMs);
  setNativeValue(el, option.value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.style.outline = previousOutline;
  el.style.outlineOffset = previousOffset;
}

export interface ToggleOptions {
  /** Milliseconds to hold the flash. Default 200. */
  flashMs?: number;
}

/**
 * Flash a ring around a checkbox/radio, set its ``checked`` state, and fire
 * `input` + `change` so frameworks observe the flip.
 */
export async function toggleControl(
  el: HTMLInputElement,
  checked: boolean,
  options: ToggleOptions = {},
): Promise<void> {
  const flashMs = options.flashMs ?? 200;
  const previousShadow = el.style.boxShadow;
  el.style.boxShadow = RING;
  await motionDelay(flashMs);
  setNativeChecked(el, checked);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.style.boxShadow = previousShadow;
}
