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
  const rows: ReadonlyArray<
    readonly [string | null, string | null, boolean, "none" | "width" | "both", boolean]
  > = [
    // placement, collapseTo, launcherDraggable, resizeAxis, startsCollapsed
    [null, "launcher", true, "both", true],
    ["", "launcher", true, "both", true],
    ["floating", "launcher", true, "both", true],
    ["bottom-left", "launcher", true, "both", true],
    ["side", "launcher", false, "width", false],
    ["sidebar", "rail", false, "width", false],
    ["full", "launcher", false, "none", false],
    ["page", null, false, "none", false],
    ["embedded", "header", false, "both", false],
  ];

  it.each(rows)("describes placement=%j", (placement, collapseTo, draggable, axis, starts) => {
    expect(surfaceFor(placement)).toEqual({
      collapseTo,
      launcherDraggable: draggable,
      resizeAxis: axis,
      startsCollapsed: starts,
    });
  });

  it("keeps an unknown value in place and open, as the script always has", () => {
    // The stylesheet lays an unknown value out as the default corner, but a
    // typo must not start dragging or collapsing a panel the host meant to show.
    expect(surfaceFor("bottom-right")).toEqual({
      collapseTo: "launcher",
      launcherDraggable: false,
      resizeAxis: "both",
      startsCollapsed: false,
    });
  });

  it("only page has no collapsed state", () => {
    const placements = [null, "", "floating", "bottom-left", "side", "sidebar", "full", "embedded"];
    for (const placement of placements) {
      expect(surfaceFor(placement).collapseTo).not.toBeNull();
    }
    expect(surfaceFor("page").collapseTo).toBeNull();
  });
});
