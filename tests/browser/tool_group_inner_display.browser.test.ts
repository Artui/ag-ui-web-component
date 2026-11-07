import type { Interrupt } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * How an opened step group draws its calls, chosen by data-tool-group-display.
 *
 * In the browser because the mode is CSS: happy-dom lays out no boxes, so a
 * region the mode hides and one it shows both measure zero there.
 *
 * Driven by the attributes, spelled out as strings, rather than by a constant or
 * the element's property, so the file runs unchanged against a release that has
 * neither and fails there on what it asserts rather than at import.
 */

const MODES = ["inline", "minimal", "compact", "full"] as const;

function mount(
  script: (emit: Emit, params: FakeRunParams) => void | Promise<void>,
  attributes: Readonly<Record<string, string>> = {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.style.width = "470px";
  el.style.height = "640px";
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

function cards(el: AgUiChat): HTMLElement[] {
  return [...shadow(el).querySelectorAll<HTMLElement>(".tool-call")];
}

async function send(el: AgUiChat, text: string): Promise<void> {
  void el.sendMessage(text);
  await new Promise((resolve) => setTimeout(resolve, 30));
}

function shown(node: Element): boolean {
  return node.getBoundingClientRect().height > 0;
}

/** Two settled calls, each with arguments and a result: every region has something to show. */
function twoSteps(emit: Emit): void {
  emit.runStart();
  emit.toolCall("c1", "fill_field", { field: "title" });
  emit.toolCall("c2", "select_option", { field: "status" });
  emit.toolResult("c1", "ok");
  emit.toolResult("c2", "picked");
  emit.text("Done.");
  emit.textEnd("Done.");
  emit.runEnd();
}

/** Which of a card's regions take space: what tells one display mode from another. */
function regions(card: HTMLElement): Record<string, boolean> {
  return {
    toggle: shown(part(card, ".tool-call-toggle")),
    body: shown(part(card, ".tool-call-body")),
    args: shown(part(card, ".tool-call-section--args")),
    result: shown(part(card, ".tool-call-section--result")),
  };
}

/** Every card's regions, then the same after pressing each toggle that is on screen. */
function faces(el: AgUiChat): Record<string, boolean>[][] {
  const before = cards(el).map(regions);
  for (const card of cards(el)) {
    const toggle = part(card, ".tool-call-toggle");
    if (shown(toggle)) {
      toggle.click();
    }
  }
  const after = cards(el).map(regions);
  return [before, after];
}

async function flatReference(mode: string): Promise<Record<string, boolean>[][]> {
  const reference = mount(twoSteps, { "data-tool-display": mode });
  await send(reference, "fill the form");
  const expected = faces(reference);
  reference.remove();
  return expected;
}

async function openGroup(attributes: Readonly<Record<string, string>>): Promise<AgUiChat> {
  const el = mount(twoSteps, attributes);
  await send(el, "fill the form");
  part(shadow(el), ".tool-group-head").click();
  return el;
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("an opened group under each inner mode", () => {
  for (const mode of MODES) {
    it(`draws its calls as the flat ${mode} cards draw theirs`, async () => {
      const expected = await flatReference(mode);
      const el = await openGroup({ "data-tool-group-display": mode });
      for (const card of cards(el)) {
        expect(card.closest(".tool-group-list")).not.toBeNull();
      }
      expect(faces(el)).toEqual(expected);
    });
  }

  it("draws full cards for an absent inner value, as before the attribute existed", async () => {
    const expected = await flatReference("full");
    const el = await openGroup({});
    expect(faces(el)).toEqual(expected);
  });

  it("draws full cards for an inner value it does not know", async () => {
    const expected = await flatReference("full");
    const el = await openGroup({ "data-tool-group-display": "dense" });
    expect(faces(el)).toEqual(expected);
  });
});

describe("the inner attribute", () => {
  it("restyles a group already on screen when it changes", async () => {
    const el = await openGroup({});
    const [card] = cards(el) as [HTMLElement];
    expect(regions(card)).toMatchObject({ toggle: true, args: true });

    el.setAttribute("data-tool-group-display", "compact");
    expect(regions(card)).toMatchObject({ toggle: true, args: false, result: false });

    el.setAttribute("data-tool-group-display", "minimal");
    expect(regions(card)).toMatchObject({ toggle: false, body: false });

    el.setAttribute("data-tool-group-display", "inline");
    expect(regions(card)).toMatchObject({ toggle: true, args: false });

    el.removeAttribute("data-tool-group-display");
    expect(regions(card)).toMatchObject({ toggle: true, args: true });
  });

  it("gives way to an outer card mode, which flattens the group into that mode's cards", async () => {
    const expected = await flatReference("compact");
    const el = await openGroup({ "data-tool-group-display": "minimal" });
    el.setAttribute("data-tool-display", "compact");
    expect(getComputedStyle(part(shadow(el), ".tool-group-head")).display).toBe("none");
    expect(faces(el)).toEqual(expected);

    // Back under grouped, the inner mode applies again.
    el.removeAttribute("data-tool-display");
    part(shadow(el), ".tool-group").setAttribute("data-open", "true");
    for (const card of cards(el)) {
      expect(regions(card)).toMatchObject({ toggle: false, body: false });
    }
  });
});

describe("an approval inside a group under an inner mode", () => {
  function approvalFor(toolCallId: string): Interrupt {
    return {
      id: `int-${toolCallId}`,
      reason: "tool_call",
      toolCallId,
      message: "Add this event to the board?",
    } as never;
  }

  for (const mode of MODES) {
    it(`shows its arguments and both buttons under ${mode}, and focuses Approve`, async () => {
      const el = mount(
        (emit, params) => {
          emit.runStart();
          if (params.resume === undefined) {
            emit.toolCall("e1", "create_event", { title: "Design sync" });
            emit.toolCall("e2", "create_event", { title: "Retro" });
            emit.toolResult("e2", "ok");
            emit.interrupt([approvalFor("e1")]);
            return;
          }
          emit.runEnd();
        },
        { "data-tool-group-display": mode },
      );
      await send(el, "import");

      const card = cards(el)[0] as HTMLElement;
      expect(card.closest(".tool-group-list")).not.toBeNull();
      expect(card.getAttribute("data-status")).toBe("deferred");
      expect(shown(part(card, ".tool-call-section--args"))).toBe(true);
      // The result region is still empty, and showing the arguments must not frame it.
      expect(shown(part(card, ".tool-call-section--result"))).toBe(false);
      const approve = part(card, ".approval-btn--approve");
      expect(shown(approve)).toBe(true);
      expect(shown(part(card, ".approval-btn--deny"))).toBe(true);
      expect(shadow(el).activeElement).toBe(approve);
    });
  }
});

describe("a deferred call that takes no arguments", () => {
  function approvalFor(toolCallId: string): Interrupt {
    return {
      id: `int-${toolCallId}`,
      reason: "tool_call",
      toolCallId,
      message: "Clear the board?",
    } as never;
  }

  /** Two calls, the first gated and without arguments, so the run groups them. */
  async function gatedWithoutArguments(
    attributes: Readonly<Record<string, string>>,
  ): Promise<HTMLElement> {
    const el = mount((emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.toolCall("e1", "clear_board", {});
        emit.toolCall("e2", "clear_board", {});
        emit.toolResult("e2", "ok");
        emit.interrupt([approvalFor("e1")]);
        return;
      }
      emit.runEnd();
    }, attributes);
    await send(el, "clear");
    const card = cards(el)[0] as HTMLElement;
    expect(card.getAttribute("data-status")).toBe("deferred");
    expect(shown(part(card, ".approval-btn--approve"))).toBe(true);
    return card;
  }

  // An empty ARGUMENTS heading under the question is a box: the section's own
  // hidden attribute has to survive the rule that shows the arguments of a
  // gated call, which is what a node with nothing in it measures as zero.
  for (const mode of ["compact", "inline", "minimal"]) {
    it(`draws no arguments box in a group under ${mode}`, async () => {
      const card = await gatedWithoutArguments({ "data-tool-group-display": mode });
      expect(card.closest(".tool-group-list")).not.toBeNull();
      expect(shown(part(card, ".tool-call-section--args"))).toBe(false);
    });

    it(`draws no arguments box in a flat card under ${mode}`, async () => {
      const card = await gatedWithoutArguments({ "data-tool-display": mode });
      expect(shown(part(card, ".tool-call-section--args"))).toBe(false);
    });
  }
});
