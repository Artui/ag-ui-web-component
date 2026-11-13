import { describe, expect, it } from "vitest";
import { surfaceFor } from "../src/ui/placement/surface_for.js";

/**
 * The record replaced three separate answers -- a set of draggable placements,
 * a "not page" collapsible check, and a switch over resize axes -- plus the
 * element reading "draggable" to mean "starts collapsed". Each row below is
 * what those answered for the same value, so the table is the proof that the
 * move changed no placement's behaviour.
 */
describe("surfaceFor", () => {
  type Axis = "none" | "width" | "both";
  const rows: ReadonlyArray<
    readonly [string | null, string | null, boolean, Axis, boolean, "width" | "both" | null]
  > = [
    // placement, collapseTo, launcherDraggable, resizeAxis, startsCollapsed, maximizes
    [null, "launcher", true, "both", true, "both"],
    ["", "launcher", true, "both", true, "both"],
    ["floating", "launcher", true, "both", true, "both"],
    ["bottom-left", "launcher", true, "both", true, "both"],
    ["side", "launcher", false, "width", false, "width"],
    ["sidebar", "rail", false, "width", false, "width"],
    ["full", "launcher", false, "none", false, null],
    ["page", null, false, "none", false, null],
    ["embedded", "header", false, "both", false, null],
  ];

  it.each(rows)("describes placement=%j", (placement, collapseTo, draggable, axis, starts, max) => {
    expect(surfaceFor(placement)).toEqual({
      collapseTo,
      launcherDraggable: draggable,
      // Every placement on its own answers the two alike; only collapse-to
      // parts them, below.
      panelMovable: draggable,
      resizeAxis: axis,
      startsCollapsed: starts,
      maximizes: max,
    });
  });

  it("keeps an unknown value in place and open, as the script always has", () => {
    // The stylesheet lays an unknown value out as the default corner, but a
    // typo must not start dragging or collapsing a panel the host meant to show.
    expect(surfaceFor("bottom-right")).toEqual({
      collapseTo: "launcher",
      launcherDraggable: false,
      panelMovable: false,
      resizeAxis: "both",
      startsCollapsed: false,
      maximizes: null,
    });
  });

  it.each<[string | null, string, boolean]>([
    [null, "bar", true],
    ["floating", "bar", true],
    ["bottom-left", "bar", true],
    ["side", "bar", false],
    ["full", "bar", false],
    [null, "none", true],
    ["bottom-left", "none", true],
    ["side", "none", false],
    ["sidebar", "none", false],
    ["embedded", "none", false],
  ])("under placement=%j collapse-to=%s keeps the panel movable: %s", (placement, to, movable) => {
    // No launcher is left to drag under either, but a corner panel still moves
    // like one, and a placement that owns its position keeps owning it.
    const surface = surfaceFor(placement, to);
    expect(surface.collapseTo).toBe(to);
    expect(surface.launcherDraggable).toBe(false);
    expect(surface.panelMovable).toBe(movable);
    expect(surface.maximizes).toBe(surfaceFor(placement).maximizes);
  });

  it("only page has no collapsed state", () => {
    const placements = [null, "", "floating", "bottom-left", "side", "sidebar", "full", "embedded"];
    for (const placement of placements) {
      expect(surfaceFor(placement).collapseTo).not.toBeNull();
    }
    expect(surfaceFor("page").collapseTo).toBeNull();
  });
});
