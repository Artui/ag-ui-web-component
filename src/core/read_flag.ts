/**
 * Read an opt-in flag attribute on `element` the way HTML reads a boolean
 * attribute.
 *
 * Present means on: bare (`data-prompt-chips`), empty (`=""`), or any value
 * except the literal `"false"`. Comparing against `"true"` instead would make
 * the bare spelling every native boolean attribute uses silently disable the
 * feature it names. `="false"` still turns it off.
 */
export function readFlag(element: Element, name: string): boolean {
  const value = element.getAttribute(name);
  return value !== null && value !== "false";
}
