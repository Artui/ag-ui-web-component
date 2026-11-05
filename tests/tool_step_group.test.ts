import { describe, expect, it } from "vitest";
import { ToolStepGroup } from "../src/ui/progress/tool_step_group.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

/**
 * The step group's row, from the nodes it is handed.
 *
 * The behaviour a person sees -- the fold, opening for an approval, the named
 * sub-agent -- is held through the element in
 * tests/browser/tool_step_group.browser.test.ts. These are the edges a real
 * card does not reach: a step with no status, and a sub-agent that started
 * without a name.
 */

function step(status: string | null): HTMLElement {
  const card = document.createElement("div");
  card.className = "tool-call";
  if (status !== null) {
    card.setAttribute("data-status", status);
  }
  return card;
}

function text(group: ToolStepGroup, selector: string): string {
  return group.element.querySelector(selector)?.textContent ?? "";
}

describe("ToolStepGroup", () => {
  it("reads a step with no status as settled", () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS);
    group.add(step(null), "Look up");
    group.add(step(null), "Look up");

    expect(group.element.getAttribute("data-state")).toBe("done");
    expect(text(group, ".tool-group-label")).toBe("Worked through 2 steps");
    // No name element to put the ordinal beside, so none is drawn.
    expect(group.element.querySelector(".tool-call-repeat")).toBeNull();
    expect(group.element.querySelector(".tool-group-meta")?.hasAttribute("hidden")).toBe(true);
  });

  it("falls back to the working line for a sub-agent that gave no name", () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS);
    const card = step("pending");
    const slot = document.createElement("div");
    slot.className = "tool-call-subagent";
    const panel = document.createElement("div");
    panel.className = "subagent";
    panel.setAttribute("data-phase", "started");
    slot.append(panel);
    card.append(slot);
    group.add(card, "Delegate task");

    expect(text(group, ".tool-group-label")).toBe("Delegate task");
    expect(text(group, ".tool-group-meta")).toBe(DEFAULT_UI_STRINGS.subAgentWorking);
  });

  it("takes every word from the string table it was built with", () => {
    const group = new ToolStepGroup({
      ...DEFAULT_UI_STRINGS,
      toolGroupWorked: "{count} Schritte erledigt",
      toolGroupDeclined: "{count} abgelehnt",
      toolStepRepeat: "#{n}",
    });
    const name = (label: string): HTMLElement => {
      const card = step("declined");
      const span = document.createElement("span");
      span.className = "tool-call-name";
      span.textContent = label;
      card.append(span);
      return card;
    };
    group.add(name("Feld"), "Feld");
    group.add(name("Feld"), "Feld");

    expect(text(group, ".tool-group-label")).toBe("2 Schritte erledigt");
    expect(text(group, ".tool-group-meta")).toBe("2 abgelehnt");
    expect(text(group, ".tool-call-repeat")).toBe("#2");
  });
});
