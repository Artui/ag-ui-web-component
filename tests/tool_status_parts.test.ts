import { describe, expect, it } from "vitest";
import { TOOL_CALL_STATUS } from "../src/constants.js";
import { ToolCallCard } from "../src/ui/progress/tool_call_card.js";
import { ToolStepGroup } from "../src/ui/progress/tool_step_group.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

/**
 * The status each tool card and its pill name as a part.
 *
 * `::part()` takes no attribute selector, so `data-status` alone leaves a host
 * unable to style failures only. The modifier parts are the same convention as
 * a run notice's (`run-notice run-notice-<kind>`): the base part stays, and the
 * status rides beside it.
 */

const parts = (el: Element | null): string[] => (el?.getAttribute("part") ?? "").split(" ");
const pill = (card: ToolCallCard) => card.element.querySelector(".tool-call-status");

describe("tool card status parts", () => {
  it("names a new card pending, on the card and on its pill", () => {
    const card = new ToolCallCard("lookup", {});
    expect(card.element.getAttribute("part")).toBe("tool-card tool-card-pending");
    expect(pill(card)?.getAttribute("part")).toBe("tool-card-status tool-card-status-pending");
  });

  it("names a deferred card deferred", () => {
    const card = new ToolCallCard("lookup", {});
    card.mark(TOOL_CALL_STATUS.DEFERRED);
    expect(card.element.getAttribute("part")).toBe("tool-card tool-card-deferred");
    expect(pill(card)?.getAttribute("part")).toBe("tool-card-status tool-card-status-deferred");
  });

  it("returns a card to pending when it is marked running again", () => {
    const card = new ToolCallCard("lookup", {});
    card.mark(TOOL_CALL_STATUS.DEFERRED);
    card.mark(TOOL_CALL_STATUS.PENDING);
    expect(card.element.getAttribute("part")).toBe("tool-card tool-card-pending");
    expect(pill(card)?.getAttribute("part")).toBe("tool-card-status tool-card-status-pending");
  });

  it.each([
    TOOL_CALL_STATUS.DONE,
    TOOL_CALL_STATUS.ERROR,
    TOOL_CALL_STATUS.DECLINED,
    TOOL_CALL_STATUS.INTERRUPTED,
  ])("names a card settled %s, replacing the pending modifier", (status) => {
    const card = new ToolCallCard("lookup", {});
    card.settle(status, "x");
    expect(card.element.getAttribute("part")).toBe(`tool-card tool-card-${status}`);
    expect(pill(card)?.getAttribute("part")).toBe(`tool-card-status tool-card-status-${status}`);
    expect(card.element.getAttribute("data-status")).toBe(status);
  });

  it("carries one status modifier at a time, through every change", () => {
    const card = new ToolCallCard("lookup", {});
    card.mark(TOOL_CALL_STATUS.DEFERRED);
    card.settle(TOOL_CALL_STATUS.ERROR, "boom");
    for (const stale of ["pending", "deferred"]) {
      expect(parts(card.element)).not.toContain(`tool-card-${stale}`);
      expect(parts(pill(card))).not.toContain(`tool-card-status-${stale}`);
    }
    expect(parts(card.element)).toEqual(["tool-card", "tool-card-error"]);
  });

  it("keeps the status after a late mark on a settled card", () => {
    const card = new ToolCallCard("lookup", {});
    card.settle(TOOL_CALL_STATUS.DECLINED, "no");
    card.mark(TOOL_CALL_STATUS.PENDING);
    expect(card.element.getAttribute("part")).toBe("tool-card tool-card-declined");
  });
});

describe("tool step group state parts", () => {
  const observed = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

  it.each([
    ["done", [TOOL_CALL_STATUS.DONE]],
    ["error", [TOOL_CALL_STATUS.ERROR, TOOL_CALL_STATUS.DONE]],
    ["running", [TOOL_CALL_STATUS.PENDING]],
    ["waiting", [TOOL_CALL_STATUS.DEFERRED]],
  ])("names a %s group by its state", (state, statuses) => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS);
    for (const status of statuses) {
      const card = new ToolCallCard("lookup", {});
      if (status === TOOL_CALL_STATUS.PENDING) {
        // already pending
      } else if (status === TOOL_CALL_STATUS.DEFERRED) {
        card.mark(TOOL_CALL_STATUS.DEFERRED);
      } else {
        card.settle(status, "x");
      }
      group.add(card.element, "lookup");
    }
    expect(group.element.getAttribute("data-state")).toBe(state);
    expect(group.element.getAttribute("part")).toBe(`tool-group tool-group-${state}`);
  });

  it("replaces the old state modifier when a step settles", async () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS);
    const card = new ToolCallCard("lookup", {});
    group.add(card.element, "lookup");
    expect(group.element.getAttribute("part")).toBe("tool-group tool-group-running");
    card.settle(TOOL_CALL_STATUS.ERROR, "boom");
    await observed();
    expect(group.element.getAttribute("part")).toBe("tool-group tool-group-error");
  });

  it("carries the base part before any step joins", () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS);
    expect(group.element.getAttribute("part")).toBe("tool-group");
  });
});
