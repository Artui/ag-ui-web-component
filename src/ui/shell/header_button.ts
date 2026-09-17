/**
 * Build a header control button: a named slot a host can project markup into,
 * with the built-in glyph as the slot's fallback.
 *
 * The slot is what lets a host replace the mark with its own `<img>` or
 * `<svg>` rather than only restyle it through the `part`; the same
 * slot-with-fallback idiom the header icon uses.
 */
export function headerButton(modifier: string, label: string, glyph: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `header-btn header-btn--${modifier}`;
  button.setAttribute("part", `header-button ${modifier}-button`);
  button.title = label;
  button.setAttribute("aria-label", label);
  const slot = document.createElement("slot");
  slot.name = `icon-${modifier}`;
  slot.append(document.createTextNode(glyph));
  button.append(slot);
  return button;
}
