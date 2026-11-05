/**
 * Whether consecutive tool calls fold into one step group on `element`.
 *
 * On by default, off for the classic and code themes, which keep the per-call
 * cards they always had. `data-tool-group` overrides either way: present (or
 * any value but `off` / `false`) folds, `off` or `false` keeps the cards.
 * Read per card, so changing the theme or the attribute affects calls from
 * then on without touching the ones already drawn.
 */
export function groupsToolSteps(element: HTMLElement): boolean {
  const attr = element.getAttribute("data-tool-group");
  if (attr !== null) {
    return attr !== "off" && attr !== "false";
  }
  const words = (element.getAttribute("theme") ?? "").split(/\s+/);
  return !words.includes("classic") && !words.includes("code");
}
