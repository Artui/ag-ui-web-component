/**
 * Visible-action animation primitives.
 *
 * These run against the **host page** DOM (not the element's shadow root) so a
 * user watches the agent type, highlight, and click at human-readable speed.
 * Each is configurable; pass small/zero durations in tests (or use fake timers).
 */

import { setNativeChecked, setNativeValue } from "./native_setter.js";

/** Ring colour when the host page has not themed `--ag-ui-accent`. */
const ACCENT = "#4f46e5";

/**
 * Fallback for the box-shadow rings, which read as a soft halo rather than a
 * line and so carry their own alpha.
 */
const ACCENT_HALO = "rgba(79, 70, 229, 0.4)";

const ACCENT_PROPERTY = "--ag-ui-accent";

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Whether the user has asked the OS/browser to minimise motion.
 *
 * Honoured by every primitive that moves something: hold delays are skipped,
 * `scrollIntoCenterView` jumps instead of gliding, and the flash drops its fade
 * but still holds the ring long enough to be seen — reduced motion asks for no
 * animation, not for no feedback. `typeInto` and `highlightThenClick` keep
 * their explicit-duration contract instead.
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

/**
 * Resolve the accent colour from the target's own computed style.
 *
 * `--ag-ui-accent` inherits, so reading it off the element about to be touched
 * picks up whatever the host's cascade produced there, and a themed page is
 * flashed in its own colour rather than this package's indigo.
 */
function accentColor(el: HTMLElement, fallback: string): string {
  const themed = window.getComputedStyle(el).getPropertyValue(ACCENT_PROPERTY).trim();
  return themed === "" ? fallback : themed;
}

function ringShadow(el: HTMLElement): string {
  return `0 0 0 3px ${accentColor(el, ACCENT_HALO)}`;
}

/** An element whose `value` can be typed into. */
export type TextLikeElement = HTMLInputElement | HTMLTextAreaElement;

export interface TypeOptions {
  /** Milliseconds between characters. Default 35. */
  charDelayMs?: number;
}

/**
 * Clear `el` and type `value` one character at a time, firing an `input` event
 * per character as a real user would, then a final `change`.
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

/** Outline `el`, pause so the user sees it, then click and restore. */
export async function highlightThenClick(
  el: HTMLElement,
  options: HighlightClickOptions = {},
): Promise<void> {
  const highlightMs = options.highlightMs ?? 280;
  const previousOutline = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  el.style.outline = `2px solid ${accentColor(el, ACCENT)}`;
  el.style.outlineOffset = "2px";
  await delay(highlightMs);
  el.style.outline = previousOutline;
  el.style.outlineOffset = previousOffset;
  el.click();
}

export interface ScrollOptions {
  /**
   * How long to wait for a moving scroll to settle before giving up.
   * Default 600.
   */
  settleMs?: number;
}

const SCROLL_SETTLE_MS = 600;

/** How long to give a smooth scroll to start moving before assuming it will not. */
const SCROLL_START_MS = 100;

/**
 * Scroll `el` to the vertical centre of the viewport.
 *
 * Resolves once the scroll settles, so a caller can hold its animation until
 * the element stops moving — a ring drawn mid-glide lands where the user is not
 * looking yet. Awaiting is optional; the scroll is requested synchronously.
 */
export function scrollIntoCenterView(el: HTMLElement, options: ScrollOptions = {}): Promise<void> {
  const reduced = prefersReducedMotion();
  el.scrollIntoView({
    block: "center",
    inline: "nearest",
    behavior: reduced ? "auto" : "smooth",
  });
  if (reduced) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout>;
    const settle = (): void => {
      clearTimeout(timer);
      document.removeEventListener("scroll", started, true);
      document.removeEventListener("scrollend", settle, true);
      resolve();
    };
    const started = (): void => {
      document.removeEventListener("scroll", started, true);
      clearTimeout(timer);
      timer = setTimeout(settle, options.settleMs ?? SCROLL_SETTLE_MS);
    };
    // Neither event bubbles, and both fire on whichever ancestor actually
    // scrolled, so listen on the document in the capture phase.
    //
    // Two timeouts, for two failure modes: an element already in view never
    // scrolls and so never fires scrollend (the short did-anything-move probe),
    // and once something is moving the longer budget covers browsers without
    // scrollend at all.
    timer = setTimeout(settle, SCROLL_START_MS);
    document.addEventListener("scroll", started, true);
    document.addEventListener("scrollend", settle, true);
  });
}

/** Total on-screen life of the flash ring, hold plus fade. */
const FLASH_MS = 1200;

/** Share of {@link FLASH_MS} spent fading out rather than holding. */
const FLASH_FADE_RATIO = 1 / 3;

export interface FlashOptions {
  /** Total milliseconds the ring is on screen, hold plus fade. Default 1200. */
  flashMs?: number;
  /** Ring colour. Defaults to the target's `--ag-ui-accent`, else the package accent. */
  color?: string;
  /**
   * Move keyboard focus to the element as well. Defaults to false for
   * {@link flash} and true for {@link focusWithFlash}.
   */
  focus?: boolean;
}

async function flashRing(
  el: HTMLElement,
  options: FlashOptions,
  focusByDefault: boolean,
): Promise<void> {
  if (options.focus ?? focusByDefault) {
    // preventScroll: a caller's smooth scroll is typically still in flight, and
    // the instant scroll focus() would otherwise do fights it.
    el.focus({ preventScroll: true });
  }
  const flashMs = options.flashMs ?? FLASH_MS;
  if (flashMs <= 0) {
    return;
  }
  const previousOutline = el.style.outline;
  const previousOffset = el.style.outlineOffset;
  const previousTransition = el.style.transition;
  const color = options.color ?? accentColor(el, ACCENT);
  // outline, not box-shadow: a shadow paints outside the border box, so any
  // overflow:hidden ancestor sharing the target's box (a card, a table cell)
  // clips the whole ring away while the helper still reports success.
  el.style.outline = `3px solid ${color}`;
  el.style.outlineOffset = "2px";
  const fadeMs = prefersReducedMotion() ? 0 : Math.round(flashMs * FLASH_FADE_RATIO);
  await delay(flashMs - fadeMs);
  if (fadeMs > 0) {
    // Transition and new colour in the same task is fine: the browser starts
    // transitions from the after-change style.
    el.style.transition = `outline-color ${fadeMs}ms ease-out`;
    el.style.outline = "3px solid transparent";
    await delay(fadeMs);
  }
  el.style.outline = previousOutline;
  el.style.outlineOffset = previousOffset;
  el.style.transition = previousTransition;
}

/**
 * Flash a ring around `el` without touching focus.
 *
 * Prefer this over {@link focusWithFlash} when the point is to show the user
 * something: moving focus steals it from the composer, can fire blur validation
 * on whatever they were mid-edit in, and can close an open menu.
 */
export function flash(el: HTMLElement, options: FlashOptions = {}): Promise<void> {
  return flashRing(el, options, false);
}

/**
 * Focus `el` and flash a ring around it. Focus moves unless `options.focus`
 * says otherwise; use {@link flash} to leave focus where the user put it.
 */
export function focusWithFlash(el: HTMLElement, options: FlashOptions = {}): Promise<void> {
  return flashRing(el, options, true);
}

export interface PressOptions {
  /** Milliseconds to hold the pressed state before clicking. Default 140. */
  pressMs?: number;
}

/**
 * Show a brief pressed affordance on a control — a slight scale-down plus
 * accent ring — then click it and restore. Reads as a press rather than the
 * plain outline {@link highlightThenClick} draws.
 */
export async function pressThenClick(el: HTMLElement, options: PressOptions = {}): Promise<void> {
  const pressMs = options.pressMs ?? 140;
  const previousTransform = el.style.transform;
  const previousTransition = el.style.transition;
  const previousShadow = el.style.boxShadow;
  el.style.transition = "transform 80ms ease";
  el.style.transform = "scale(0.96)";
  el.style.boxShadow = ringShadow(el);
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

/** Find an option in `el` whose value or visible text equals `value`. */
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
 * option matching `value` (by value or visible text) and fire `input` +
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
  el.style.outline = `2px solid ${accentColor(el, ACCENT)}`;
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
 * Flash a ring around a checkbox/radio, set its `checked` state, and fire
 * `input` + `change` so frameworks observe the flip.
 */
export async function toggleControl(
  el: HTMLInputElement,
  checked: boolean,
  options: ToggleOptions = {},
): Promise<void> {
  const flashMs = options.flashMs ?? 200;
  const previousShadow = el.style.boxShadow;
  el.style.boxShadow = ringShadow(el);
  await motionDelay(flashMs);
  setNativeChecked(el, checked);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.style.boxShadow = previousShadow;
}
