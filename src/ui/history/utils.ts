export function openerElement(root: Document | ShadowRoot): Element | null {
  const inside = root.activeElement;
  if (inside !== null) {
    return inside;
  }
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }
  return active === document.body ? null : active;
}
