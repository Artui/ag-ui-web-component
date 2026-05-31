/**
 * Visible-action animation primitives.
 *
 * These run against the **host page** DOM (not the element's shadow root) so a
 * user watches the agent type, highlight, and click at human-readable speed.
 * Each is configurable; pass small/zero durations in tests (or use fake timers).
 */

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
  el.value = "";
  el.dispatchEvent(new Event("input", { bubbles: true }));
  for (const char of value) {
    el.value += char;
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
