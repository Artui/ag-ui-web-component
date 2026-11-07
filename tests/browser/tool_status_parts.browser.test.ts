import { afterEach, describe, expect, it } from "vitest";
import { TOOL_CALL_STATUS } from "../../src/constants.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";

/**
 * A host styles failures only through the status modifier parts.
 *
 * `::part()` takes no attribute selector, so before the modifiers a rule on
 * `tool-card-status` hit every outcome alike. A browser test: happy-dom
 * computes no cascade and so cannot tell a part rule that matched from one
 * that did not.
 */

const hosts: HTMLElement[] = [];

function mount(...statuses: string[]): HTMLElement[] {
  const host = document.createElement("div");
  const shadow = host.attachShadow({ mode: "open" });
  const cards = statuses.map((status) => {
    const card = new ToolCallCard("lookup", {});
    if (status !== TOOL_CALL_STATUS.PENDING) {
      card.settle(status as "done" | "error" | "declined" | "interrupted", "x");
    }
    shadow.append(card.element);
    return card;
  });
  document.body.append(host);
  hosts.push(host);
  return cards.map((card) => card.element);
}

afterEach(() => {
  for (const host of hosts.splice(0)) {
    host.remove();
  }
  for (const sheet of document.querySelectorAll("style[data-test]")) {
    sheet.remove();
  }
});

function hostStyle(css: string): void {
  const style = document.createElement("style");
  style.setAttribute("data-test", "");
  style.textContent = css;
  document.head.append(style);
}

describe("tool status parts under ::part()", () => {
  it("styles a failed card's pill and not a done one's", () => {
    hostStyle("div::part(tool-card-status-error) { outline: 3px solid rgb(255, 0, 0); }");
    const [done, failed] = mount(TOOL_CALL_STATUS.DONE, TOOL_CALL_STATUS.ERROR) as [
      HTMLElement,
      HTMLElement,
    ];
    const outline = (card: HTMLElement) =>
      getComputedStyle(card.querySelector(".tool-call-status") as Element).outlineStyle;
    expect(outline(failed)).toBe("solid");
    expect(outline(done)).not.toBe("solid");
  });

  it("styles a failed card and not a pending one", () => {
    hostStyle("div::part(tool-card-error) { outline: 3px solid rgb(255, 0, 0); }");
    const [pending, failed] = mount(TOOL_CALL_STATUS.PENDING, TOOL_CALL_STATUS.ERROR) as [
      HTMLElement,
      HTMLElement,
    ];
    expect(getComputedStyle(failed).outlineStyle).toBe("solid");
    expect(getComputedStyle(pending).outlineStyle).not.toBe("solid");
  });
});
