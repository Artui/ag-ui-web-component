/**
 * Where the launcher goes when the panel is the thing being moved.
 *
 * One property carries this module, and it is the reason the module exists:
 * feed the position it returns back through launcherPlacement and the panel
 * box must come out unchanged. Everything else here is that property read at a
 * particular spot on the screen.
 */

import { describe, expect, it } from "vitest";
import { launcherForPanel } from "../src/ui/launcher_for_panel.js";
import { type Extent, launcherPlacement } from "../src/ui/launcher_placement.js";
import type { PanelRect } from "../src/ui/resize_handle.js";

const LAUNCHER: Extent = { width: 56, height: 56 };
const DESKTOP: Extent = { width: 1440, height: 900 };
const PANEL: Extent = { width: 380, height: 560 };

/** A panel box of `size`, placed at (left, top). */
function panelAt(left: number, top: number, size: Extent = PANEL): PanelRect {
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/**
 * The box the placement actually produces for a launcher at `at`, read back
 * out of the `inset` shorthand it writes. Two of the four sides are `auto`,
 * and which two is the corner's own answer -- so the box is rebuilt from the
 * side that is pinned plus the panel's size, exactly as the browser would.
 */
function placedBox(
  at: { left: number; top: number },
  viewport: Extent,
  size: Extent = PANEL,
): PanelRect {
  const placement = launcherPlacement({ ...at, ...LAUNCHER }, size, viewport);
  const sides = placement.hostInset.split(" ").map(Number.parseFloat) as [
    number,
    number,
    number,
    number,
  ];
  const left = placement.corner.x === "left" ? sides[3] : viewport.width - sides[1] - size.width;
  const top = placement.corner.y === "top" ? sides[0] : viewport.height - sides[2] - size.height;
  return { left, top, right: left + size.width, bottom: top + size.height };
}

/** The round trip this module exists to make hold. */
function roundTrip(box: PanelRect, viewport: Extent, size: Extent = PANEL): PanelRect {
  return placedBox(launcherForPanel(box, LAUNCHER, viewport), viewport, size);
}

describe("launcherForPanel", () => {
  it("gives back a launcher the placement puts the panel straight back on", () => {
    // Every quadrant, because the corner the placement picks changes per axis
    // and a launcher on the wrong corner moves the panel by its own width.
    const short: Extent = { width: 380, height: 300 };
    for (const box of [
      panelAt(40, 40),
      panelAt(1000, 40),
      panelAt(530, 170),
      panelAt(40, 560, short),
      panelAt(1000, 560, short),
    ]) {
      const size = { width: box.right - box.left, height: box.bottom - box.top };
      expect(roundTrip(box, DESKTOP, size)).toEqual(box);
    }
  });

  it("puts the launcher on the corner the placement pins", () => {
    // Near the top-left the panel opens down and right, so the launcher is at
    // the box's top-left and the panel hangs off it.
    expect(launcherForPanel(panelAt(40, 40), LAUNCHER, DESKTOP)).toEqual({ left: 40, top: 40 });
    // Far along both axes it is the other two edges that are free, so the
    // launcher takes the far corner instead.
    const far = panelAt(1000, 560, { width: 380, height: 300 });
    expect(launcherForPanel(far, LAUNCHER, DESKTOP)).toEqual({
      left: far.right - 56,
      top: far.bottom - 56,
    });
  });

  it("resolves the two axes separately", () => {
    // Low on the left: pinned left and bottom, which no corner-shaped answer
    // to a single question would produce.
    const box = panelAt(40, 560, { width: 380, height: 300 });

    expect(launcherForPanel(box, LAUNCHER, DESKTOP)).toEqual({ left: 40, top: box.bottom - 56 });
  });

  it("reports where the clamp puts a panel too wide for its viewport", () => {
    // A phone: 380 of panel between 24px margins does not fit 414 of viewport,
    // so the placement holds the panel against the near margin whatever it is
    // asked for. The launcher has to be the one that reproduces *that*, not
    // the box that was asked for -- otherwise the drag ends with a jump.
    const phone: Extent = { width: 414, height: 896 };

    expect(roundTrip(panelAt(24, 24), phone)).toEqual(panelAt(24, 24));
    expect(roundTrip(panelAt(200, 24), phone)).toEqual(panelAt(24, 24));
  });

  it("holds a launcher on screen for a panel dragged past the edge", () => {
    // The placement clamps the panel back to its margin, but the launcher is
    // the half that persists -- so an unclamped one would be remembered
    // hanging over the edge and collapse to somewhere unreachable.
    const box = panelAt(-160, -80);

    expect(launcherForPanel(box, LAUNCHER, DESKTOP)).toEqual({ left: 0, top: 0 });
    // And the panel still lands where the placement would have clamped it.
    expect(roundTrip(box, DESKTOP)).toEqual(panelAt(24, 24));
  });
});
