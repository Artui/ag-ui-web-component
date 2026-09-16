/**
 * A `<slot>` a host can project its own mark into, falling back to one of the
 * built-in glyphs. The markup is an author-written constant, never user or
 * server data, so it is assigned directly rather than sanitised.
 */
export function glyphSlot(slotName: string, className: string, markup: string): HTMLSlotElement {
  const slot = document.createElement("slot");
  slot.name = slotName;
  slot.className = className;
  slot.innerHTML = markup;
  return slot;
}
