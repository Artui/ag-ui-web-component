import type { Interrupt } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * A control is a disclosure only when something is behind it.
 *
 * Two rows offered one over nothing. A reasoning block that a provider opens
 * and closes with no text in it (redacted thinking, or reasoning with its
 * summaries off) left a Thoughts toggle over an empty, ruled box. And a tool
 * call made with no arguments that came back with no result kept its Details
 * toggle, or in a step group its whole row, which opened onto an empty rail.
 *
 * In the browser because both are about what is drawn and what takes focus:
 * happy-dom lays out no boxes, so a body with no box and one with an empty box
 * both measure zero there. Driven through the element and a scripted run.
 */

function mount(
  script: (emit: Emit, params: FakeRunParams) => void | Promise<void>,
  display?: string,
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (display !== undefined) {
    el.setAttribute("data-tool-display", display);
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

function find(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/** Long enough for the run's microtasks and a step group's mutation callbacks. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

async function send(el: AgUiChat, text: string): Promise<void> {
  void el.sendMessage(text);
  await tick();
}

/** The buttons under `root` that take focus, which is what a person can operate. */
function focusable(el: AgUiChat, root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>("button, [tabindex]")].filter((control) => {
    control.focus();
    const took = shadow(el).activeElement === control;
    control.blur();
    return took;
  });
}

/** Whether any part of a disclosure is drawn under `root`: a chevron, or an expanded state. */
function disclosureMarks(root: Element): string[] {
  const marks: string[] = [];
  for (const node of root.querySelectorAll<HTMLElement>("[aria-expanded]")) {
    if (node.checkVisibility()) {
      marks.push(`aria-expanded on ${node.className}`);
    }
  }
  for (const chevron of root.querySelectorAll<HTMLElement>(".tool-group-chevron")) {
    if (chevron.checkVisibility()) {
      marks.push("chevron");
    }
  }
  return marks;
}

function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("a reasoning block with no text", () => {
  for (const [name, after] of [
    ["followed only by a tool call", (emit: Emit) => emit.toolCall("c1", "ping", {})],
    ["at the end of the turn", () => {}],
  ] as const) {
    it(`settles to a plain label with no body box, ${name}`, async () => {
      const el = mount((emit) => {
        emit.runStart();
        emit.reasoningStart();
        emit.reasoningEnd();
        after(emit);
        emit.runEnd();
      });
      await send(el, "think silently");

      const thoughts = find(shadow(el), ".thoughts");
      expect(thoughts.querySelector("button")).toBeNull();
      expect(focusable(el, thoughts)).toEqual([]);
      const label = find(thoughts, ".thoughts-label");
      expect(label.textContent).toBe("Thoughts");
      expect(thoughts.hasAttribute("data-streaming")).toBe(false);
      // No ruled box under the label: the body either is not drawn or has no box.
      const body = thoughts.querySelector<HTMLElement>(".thoughts-body");
      expect(body === null || !body.checkVisibility()).toBe(true);
      expect(thoughts.getBoundingClientRect().height).toBeCloseTo(
        label.getBoundingClientRect().height,
        0,
      );
    });
  }
});

describe("a reasoning block with text", () => {
  it("still toggles, shows its text, and names how long it took", async () => {
    let time = 0;
    vi.spyOn(performance, "now").mockImplementation(() => time);
    const el = mount((emit) => {
      emit.runStart();
      emit.reasoningStart();
      emit.reasoning("Checking the table first.");
      time = 3000;
      emit.reasoningEnd();
      time = 9000;
      emit.text("Done.");
      emit.textEnd("Done.");
      emit.runEnd();
    });
    await send(el, "think");
    vi.restoreAllMocks();

    const thoughts = find(shadow(el), ".thoughts");
    const toggle = find(thoughts, "button.thoughts-toggle");
    expect(toggle.textContent).toBe("Thought for 3s");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(focusable(el, thoughts)).toEqual([toggle]);

    toggle.click();
    const body = find(thoughts, ".thoughts-body");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(body.checkVisibility()).toBe(true);
    expect(body.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(body.textContent).toBe("Checking the table first.");
  });
});

describe("a tool call with no arguments", () => {
  for (const display of ["full", "grouped", "compact"]) {
    it(`offers nothing to open until a result with text arrives, under ${display}`, async () => {
      const pong = gate();
      const el = mount(async (emit) => {
        emit.runStart();
        emit.toolCall("c1", "ping", {});
        emit.toolResult("c1", "");
        // Text between the calls, so the second starts a step group of its own.
        emit.text("Again.");
        emit.textEnd("Again.");
        emit.toolCall("c2", "ping", {});
        await pong.wait;
        emit.toolResult("c2", "pong");
        emit.runEnd();
      }, display);
      await send(el, "ping");

      const cards = [...shadow(el).querySelectorAll<HTMLElement>(".tool-call")];
      expect(cards).toHaveLength(2);
      const [blank, running] = cards as [HTMLElement, HTMLElement];
      const row = (card: HTMLElement): HTMLElement =>
        card.closest<HTMLElement>(".tool-group") ?? card;

      // Settled with a blank result: a status row, nothing to open.
      expect(blank.getAttribute("data-status")).toBe("done");
      expect(focusable(el, row(blank))).toEqual([]);
      expect(disclosureMarks(row(blank))).toEqual([]);
      // Still running: nothing to open yet either.
      expect(running.getAttribute("data-status")).toBe("pending");
      expect(focusable(el, row(running))).toEqual([]);
      expect(disclosureMarks(row(running))).toEqual([]);

      pong.open();
      await tick();

      // The result made it expandable: every control in reach opens onto it.
      const controls = focusable(el, row(running));
      expect(controls.length).toBeGreaterThan(0);
      const result = find(running, ".tool-call-result");
      expect(result.checkVisibility()).toBe(false);
      for (const control of controls) {
        control.click();
        await tick();
      }
      const more = focusable(el, row(running)).filter((control) => !controls.includes(control));
      for (const control of more) {
        control.click();
        await tick();
      }
      expect(result.checkVisibility()).toBe(true);
      expect(result.textContent).toBe("pong");
      // And the blank one is still nothing.
      expect(focusable(el, row(blank))).toEqual([]);
    });
  }
});

describe("a tool call with arguments and a blank result", () => {
  for (const display of ["full", "inline"]) {
    it(`offers no toggle under ${display}, where the arguments are not behind it`, async () => {
      const el = mount((emit) => {
        emit.runStart();
        emit.toolCall("c1", "ping", { host: "x" });
        emit.toolResult("c1", "");
        emit.runEnd();
      }, display);
      await send(el, "ping");
      const card = find(shadow(el), ".tool-call");
      expect(card.getAttribute("data-status")).toBe("done");
      expect(focusable(el, card)).toEqual([]);
    });
  }

  it("opens the grouped row onto the arguments, with no toggle under them", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("c1", "ping", { host: "x" });
      emit.toolResult("c1", "");
      emit.runEnd();
    }, "grouped");
    await send(el, "ping");
    const group = find(shadow(el), ".tool-group");
    const head = find(group, ".tool-group-head");
    expect(focusable(el, group)).toEqual([head]);
    head.click();
    await tick();
    expect(find(group, ".tool-call-args").checkVisibility()).toBe(true);
    expect(focusable(el, group)).toEqual([head]);
  });

  it("keeps the compact toggle, which folds the arguments", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("c1", "ping", { host: "x" });
      emit.toolResult("c1", "");
      emit.runEnd();
    }, "compact");
    await send(el, "ping");
    const card = find(shadow(el), ".tool-call");
    const toggle = find(card, ".tool-call-toggle");
    expect(focusable(el, card)).toEqual([toggle]);
    const args = find(card, ".tool-call-args");
    expect(args.checkVisibility()).toBe(false);
    toggle.click();
    expect(args.checkVisibility()).toBe(true);
    expect(find(card, ".tool-call-section--result").checkVisibility()).toBe(false);
  });
});

describe("a lone grouped call with no arguments that has something else to show", () => {
  it("keeps its row open over an approval prompt, and folds it once answered", async () => {
    const el = mount((emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.toolCall("e1", "create_event", {});
        emit.interrupt([
          { id: "int-e1", reason: "tool_call", toolCallId: "e1", message: "Go?" } as Interrupt,
        ]);
        return;
      }
      emit.toolResult("e1", "");
      emit.runEnd();
    }, "grouped");
    await send(el, "add it");

    const group = find(shadow(el), ".tool-group");
    const head = find(group, ".tool-group-head") as HTMLButtonElement;
    expect(group.getAttribute("data-open")).toBe("true");
    expect(head.disabled).toBe(false);
    expect(head.getAttribute("aria-expanded")).toBe("true");
    const approve = find(group, ".approval-btn--approve");
    expect(approve.checkVisibility()).toBe(true);

    approve.click();
    await tick();
    await tick();
    expect(find(group, ".tool-call").getAttribute("data-status")).toBe("done");
    expect(head.disabled).toBe(true);
    expect(head.hasAttribute("aria-expanded")).toBe(false);
    expect(group.getAttribute("data-open")).toBe("false");
    expect(focusable(el, group)).toEqual([]);
  });

  it("becomes a disclosure when the call delegates to a sub-agent", async () => {
    const started = gate();
    const finished = gate();
    const el = mount(async (emit) => {
      emit.runStart();
      emit.toolCall("s1", "delegate_task", {});
      await started.wait;
      emit.subAgentStarted("sub-1", "researcher", "s1");
      // Held, so the call is still running: a turn's end settles it with text.
      await finished.wait;
      emit.runEnd();
    }, "grouped");
    await send(el, "go");

    const group = find(shadow(el), ".tool-group");
    const head = find(group, ".tool-group-head") as HTMLButtonElement;
    expect(head.disabled).toBe(true);

    started.open();
    await tick();
    expect(head.disabled).toBe(false);
    expect(head.getAttribute("aria-expanded")).toBe("false");
    expect(find(group, ".tool-call").getAttribute("data-status")).toBe("pending");
    head.click();
    await tick();
    expect(find(group, ".subagent").checkVisibility()).toBe(true);
    finished.open();
  });
});
