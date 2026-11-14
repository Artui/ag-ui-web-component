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

/** Let the group's mutation observer run. */
const observed = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function open(group: ToolStepGroup): string | null {
  return group.element.getAttribute("data-open");
}

describe("ToolStepGroup", () => {
  it("reads a step with no status as settled", () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
    group.add(step(null), "Look up");
    group.add(step(null), "Look up");

    expect(group.element.getAttribute("data-state")).toBe("done");
    expect(text(group, ".tool-group-label")).toBe("Worked through 2 steps");
    // No name element to put the ordinal beside, so none is drawn.
    expect(group.element.querySelector(".tool-call-repeat")).toBeNull();
    expect(group.element.querySelector(".tool-group-meta")?.hasAttribute("hidden")).toBe(true);
  });

  it("falls back to the working line for a sub-agent that gave no name", () => {
    const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
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
    const group = new ToolStepGroup(
      {
        ...DEFAULT_UI_STRINGS,
        toolGroupWorked: "{count} Schritte erledigt",
        toolGroupDeclined: "{count} abgelehnt",
        toolStepRepeat: "#{n}",
      },
      () => "full",
    );
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

  describe("opening for a wait", () => {
    it("opens again for a second wait after the user folded the group during the first", async () => {
      const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
      const first = step("pending");
      group.add(first, "Create event");
      first.setAttribute("data-status", "deferred");
      await observed();
      expect(open(group)).toBe("true");

      // Answered, then folded by the user.
      first.setAttribute("data-status", "pending");
      await observed();
      group.setOpen(false);

      const second = step("pending");
      group.add(second, "Create event");
      second.setAttribute("data-status", "deferred");
      await observed();
      expect(open(group)).toBe("true");
    });

    it("stays folded when revealed ahead of the observer and then folded by the user", async () => {
      const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
      const card = step("pending");
      group.add(card, "Create event");
      // What a gated call does: marked deferred and revealed in one task, the
      // observer still to run. A fold before it runs must not be undone by it.
      card.setAttribute("data-status", "deferred");
      group.reveal();
      expect(open(group)).toBe("true");
      group.setOpen(false);
      await observed();
      expect(open(group)).toBe("false");
    });

    it("does not open for a question, which is drawn beside the group", async () => {
      const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
      const card = step("pending");
      group.add(card, "Ask user");
      card.setAttribute("data-asking", "");
      await observed();

      expect(open(group)).toBe("false");
      expect(group.element.getAttribute("data-state")).toBe("waiting");
      expect(text(group, ".tool-group-meta")).toBe("1 waiting for you");
    });
  });

  describe("redrawing from a sub-agent panel", () => {
    /** A running step holding a panel in the phase it is given, as a delegation draws one. */
    function delegating(
      phase: string,
      agent: string | null,
    ): { group: ToolStepGroup; panel: HTMLElement } {
      const group = new ToolStepGroup(DEFAULT_UI_STRINGS, () => "full");
      const card = step("pending");
      const slot = document.createElement("div");
      slot.className = "tool-call-subagent";
      const panel = document.createElement("div");
      panel.className = "subagent";
      panel.setAttribute("data-phase", phase);
      if (agent !== null) {
        panel.setAttribute("data-agent", agent);
      }
      slot.append(panel);
      card.append(slot);
      group.add(card, "Delegate task");
      return { group, panel };
    }

    // The panel stamps both on most updates, so each has to be watched on its
    // own for the case where only that one changes.
    it("drops the name when only the phase changes", async () => {
      const { group, panel } = delegating("started", "researcher");
      expect(text(group, ".tool-group-meta")).toBe("Delegated to researcher");

      panel.setAttribute("data-phase", "finished");
      await observed();
      expect(text(group, ".tool-group-meta")).toBe("");
    });

    it("takes up the name when only the agent changes", async () => {
      const { group, panel } = delegating("started", null);
      expect(text(group, ".tool-group-meta")).toBe(DEFAULT_UI_STRINGS.subAgentWorking);

      panel.setAttribute("data-agent", "researcher");
      await observed();
      expect(text(group, ".tool-group-meta")).toBe("Delegated to researcher");
    });
  });
});
