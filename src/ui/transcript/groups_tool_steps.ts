import { TOOL_DISPLAY } from "../../constants.js";
import type { ToolDisplayMode } from "../progress/tool_call_card.js";

/**
 * Whether a new tool call folds into a step group, given the element's
 * `toolDisplay`.
 *
 * The display mode alone decides, whatever the theme: `grouped` (the default,
 * and what an unknown value reads as) folds, and the four card modes keep
 * per-call cards. Asked as each card is built, so switching to `grouped`
 * folds only the calls drawn afterwards; switching away flattens the groups
 * already drawn, which the shadow CSS does from the host attribute.
 */
export function groupsToolSteps(mode: ToolDisplayMode): boolean {
  return mode === TOOL_DISPLAY.GROUPED;
}
