import { describe, expect, it } from "vitest";
import {
  ICON_CHEVRON_DOWN,
  ICON_CHEVRON_LEFT,
  ICON_CHEVRON_RIGHT,
  ICON_CHEVRON_UP,
  ICON_PANEL_CLOSE_LEFT,
  ICON_PANEL_CLOSE_RIGHT,
} from "../src/constants.js";
import { collapseGlyph } from "../src/ui/shell/collapse_glyph.js";

describe("collapseGlyph", () => {
  it.each([
    [null, null, null, ICON_CHEVRON_DOWN],
    [null, "floating", "left", ICON_CHEVRON_DOWN],
    [null, "embedded", null, ICON_CHEVRON_DOWN],
    [null, "sidebar", null, ICON_PANEL_CLOSE_RIGHT],
    [null, "sidebar", "left", ICON_PANEL_CLOSE_LEFT],
    [null, "side", "left", ICON_PANEL_CLOSE_LEFT],
    ["unknown", "sidebar", "left", ICON_PANEL_CLOSE_LEFT],
    ["unknown", "floating", null, ICON_CHEVRON_DOWN],
    ["panel-close", "floating", "left", ICON_PANEL_CLOSE_RIGHT],
    ["panel-close", "sidebar", "left", ICON_PANEL_CLOSE_LEFT],
    ["chevron-up", "sidebar", null, ICON_CHEVRON_UP],
    ["chevron-down", "sidebar", "left", ICON_CHEVRON_DOWN],
    ["chevron-left", "floating", null, ICON_CHEVRON_LEFT],
    ["chevron-right", "sidebar", "left", ICON_CHEVRON_RIGHT],
  ] as const)("draws %s on %s (side %s)", (choice, placement, side, expected) => {
    expect(collapseGlyph(choice, placement, side)).toBe(expected);
  });
});
