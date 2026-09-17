/**
 * An icon holder wrapping a `<slot>` so a host can project custom markup;
 * with an `<img>` as the slot's fallback when an icon URL is configured, or
 * the given glyph markup when it is not.
 *
 * `iconUrl` is the caller's to read rather than defaulted here, because the
 * three marks answer it differently: the header's is `data-icon-url`, the
 * launcher's falls back to it from an attribute of its own, and the theme
 * toggle never takes an image at all.
 */
export function iconElement(
  slotName: string,
  part: string,
  fallbackGlyph: string | null,
  iconUrl: string | null,
): HTMLSpanElement {
  const holder = document.createElement("span");
  holder.className = "icon-holder";
  holder.setAttribute("part", part);
  const slot = document.createElement("slot");
  slot.name = slotName;
  if (iconUrl !== null) {
    const img = document.createElement("img");
    img.className = "icon-img";
    img.src = iconUrl;
    img.alt = "";
    slot.append(img);
  } else if (fallbackGlyph !== null) {
    slot.innerHTML = fallbackGlyph;
  }
  holder.append(slot);
  return holder;
}
