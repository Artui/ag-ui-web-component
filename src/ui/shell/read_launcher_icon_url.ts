/**
 * The launcher's own image URL. `data-launcher-icon-url` lets the collapsed
 * button carry a different mark from the header's — a product logo reads at
 * 22px in a header bar but rarely at 26px in a circle — and falls back to the
 * header icon so a single `data-icon-url` still feeds both.
 */
export function readLauncherIconUrl(element: Element): string | null {
  return element.getAttribute("data-launcher-icon-url") ?? element.getAttribute("data-icon-url");
}
