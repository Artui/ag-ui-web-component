import type { Interrupt } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "../helpers/fake_agent.js";
import { FIXTURE_CUSTOM_NAME, subAgentValue } from "../helpers/subagent_fixture.js";

/**
 * The step group, the default way a run's tool calls are drawn: consecutive
 * calls fold into one quiet row, with the per-call cards one click down.
 *
 * In the browser because the fold is CSS. happy-dom lays out no boxes, so a
 * card hidden inside a folded group and one on screen both measure zero there,
 * and a group that hid an approval prompt would pass.
 *
 * Driven through the element and a scripted run, never by constructing a
 * group: what matters is what the element draws for a real run. The English
 * strings are spelled out rather than read from the string table, so the test
 * names the words a person sees.
 */

const NARROW = "300px";
const SIDEBAR = "470px";

function mount(
  script: (emit: Emit, params: FakeRunParams) => void | Promise<void>,
  options: { readonly display?: string; readonly width?: string } = {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (options.display !== undefined) {
    el.setAttribute("data-tool-display", options.display);
  }
  el.style.width = options.width ?? SIDEBAR;
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

function all(el: AgUiChat, selector: string): HTMLElement[] {
  return [...shadow(el).querySelectorAll<HTMLElement>(selector)];
}

/** Long enough for the run's microtasks and the group's mutation callbacks. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

async function send(el: AgUiChat, text: string): Promise<void> {
  void el.sendMessage(text);
  await settle();
}

function height(node: Element): number {
  return node.getBoundingClientRect().height;
}

/** The form-filling run the demo plays: five calls, two of them the same tool. */
function fiveSteps(emit: Emit): void {
  emit.runStart();
  emit.toolCall("c1", "fill_field", { field: "title" });
  emit.toolCall("c2", "fill_field", { field: "slug" });
  emit.toolCall("c3", "select_option", { field: "status" });
  emit.toolCall("c4", "toggle_checkbox", { field: "featured" });
  emit.toolCall("c5", "click_save", {});
  emit.toolResult("c1", "ok");
  emit.toolResult("c2", "ok");
  emit.toolResult("c3", "ok");
  emit.toolResult("c4", "ok");
  emit.toolResult("c5", "no save button", { outcome: "failed" });
  emit.text("Saved.");
  emit.textEnd("Saved.");
  emit.runEnd();
}

/** A promise the script awaits and the test opens, to put a frame in a later task. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open: () => void = () => {};
  const wait = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { wait, open };
}

/** Long enough for a mutation callback to run and the row to be redrawn. */
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 20));

function approvalFor(toolCallId: string): Interrupt {
  return { id: `int-${toolCallId}`, reason: "tool_call", toolCallId, message: "Go?" } as never;
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(async () => {
  document.body.replaceChildren();
  // A test that emulated reduced motion must not leave it on for the next.
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

describe("a run's tool calls under the default display", () => {
  it("fold into one row naming the count, with the cards one click down", async () => {
    const el = mount(fiveSteps);
    await send(el, "fill the form");

    const groups = all(el, ".tool-group");
    expect(groups).toHaveLength(1);
    const group = groups[0] as HTMLElement;
    const head = part(group, ".tool-group-head");
    expect(part(group, ".tool-group-label").textContent).toBe("Worked through 5 steps");
    expect(part(group, ".tool-group-meta").textContent).toContain("1 failed");
    expect(group.getAttribute("data-state")).toBe("error");
    expect(head.getAttribute("aria-expanded")).toBe("false");

    // Folded: the row has a box and every card is out of the layout.
    expect(height(head)).toBeGreaterThan(0);
    const cards = all(el, ".tool-call");
    expect(cards).toHaveLength(5);
    for (const card of cards) {
      expect(card.closest(".tool-group")).toBe(group);
      expect(height(card)).toBe(0);
    }

    head.click();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    for (const card of cards) {
      expect(height(card)).toBeGreaterThan(0);
    }
  });

  it("keeps the row and every open card inside the panel at the narrow end", async () => {
    const el = mount(fiveSteps, { width: NARROW });
    await send(el, "fill the form");
    const group = part(shadow(el), ".tool-group");
    part(group, ".tool-group-head").click();

    const box = group.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    const inside = [
      ...group.querySelectorAll(".tool-group-head > *"),
      ...group.querySelectorAll(".tool-call"),
      ...group.querySelectorAll(".tool-call-head > :not([hidden])"),
    ];
    for (const child of inside) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0) {
        continue;
      }
      expect(rect.left).toBeGreaterThanOrEqual(box.left - 8);
      expect(rect.right).toBeLessThanOrEqual(box.right + 1);
    }
  });

  it("tells repeated labels apart in the group, and only there", async () => {
    const el = mount(fiveSteps);
    await send(el, "fill the form");
    part(shadow(el), ".tool-group-head").click();

    const [first, second] = all(el, ".tool-call");
    // The card's own name is untouched: the ordinal is an element beside it.
    expect(part(first as HTMLElement, ".tool-call-name").textContent).toBe("Fill field");
    expect(part(second as HTMLElement, ".tool-call-name").textContent).toBe("Fill field");
    expect((first as HTMLElement).querySelector(".tool-call-repeat")).toBeNull();
    const repeat = part(second as HTMLElement, ".tool-call-repeat");
    expect(repeat.textContent).toBe("(2)");
    expect(height(repeat)).toBeGreaterThan(0);

    // A card mode shows the label the card was built with, and nothing else.
    el.setAttribute("data-tool-display", "full");
    expect(getComputedStyle(repeat).display).toBe("none");
  });

  it("names the repeated step in the row while it runs", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mount(async (emit) => {
      emit.runStart();
      emit.toolCall("c1", "fill_field", { field: "title" });
      emit.toolResult("c1", "ok");
      emit.toolCall("c2", "fill_field", { field: "slug" });
      await held;
      emit.runEnd();
    });
    await send(el, "fill the form");

    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-state")).toBe("running");
    expect(part(group, ".tool-group-label").textContent).toBe("Working through 2 steps");
    expect(part(group, ".tool-group-meta").textContent).toContain("Fill field (2)");
    release();
  });

  it("places each rendered output after the group, in call order", async () => {
    let round = 0;
    const el = mount((emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("d1", "draw", { n: 1 });
        emit.toolCall("d2", "draw", { n: 2 });
      }
      round += 1;
      emit.runEnd();
    });
    el.registerTool({
      name: "draw",
      description: "draws its number",
      parameters: { type: "object", properties: { n: { type: "number" } } },
      handler: () => "drawn",
      render: (args) => {
        const node = document.createElement("div");
        node.className = "drawn";
        node.textContent = String(args["n"]);
        return node;
      },
    });
    await send(el, "draw two");
    await settle();

    const group = part(shadow(el), ".tool-group");
    const drawn = all(el, ".drawn");
    expect(drawn.map((node) => node.textContent)).toEqual(["1", "2"]);
    for (const node of drawn) {
      expect(node.closest(".tool-group")).toBeNull();
      expect(group.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(height(node)).toBeGreaterThan(0);
    }
  });
});

describe("a group that waits on the user", () => {
  function interrupt(toolCallId: string): Interrupt {
    return {
      id: `int-${toolCallId}`,
      reason: "tool_call",
      toolCallId,
      message: "Add this event to the board?",
    } as never;
  }

  it("opens itself for an approval, once, and stays folded when the user folds it", async () => {
    const el = mount((emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.toolCall("e1", "create_event", { title: "Design sync" });
        emit.toolCall("e2", "create_event", { title: "Retro" });
        emit.interrupt([interrupt("e1"), interrupt("e2")]);
        return;
      }
      emit.runEnd();
    });
    await send(el, "import two");

    const group = part(shadow(el), ".tool-group");
    const head = part(group, ".tool-group-head");
    expect(group.getAttribute("data-state")).toBe("waiting");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(part(group, ".tool-group-label").textContent).toBe("2 steps");
    expect(part(group, ".tool-group-meta").textContent).toContain("2 waiting for you");
    const prompts = all(el, ".approval");
    expect(prompts).toHaveLength(2);
    for (const prompt of prompts) {
      expect(prompt.closest(".tool-group")).toBe(group);
      expect(height(prompt)).toBeGreaterThan(0);
    }

    // Folded by the user, it stays folded while the same wait goes on, even
    // as one of the two is answered.
    head.click();
    expect(head.getAttribute("aria-expanded")).toBe("false");
    part(prompts[0] as HTMLElement, ".approval-btn--approve").click();
    await settle();
    expect(part(group, ".tool-group-meta").textContent).toContain("1 waiting for you");
    expect(head.getAttribute("aria-expanded")).toBe("false");
  });

  it("hands focus to the approve button and scrolls it into view, as under full", async () => {
    const long = Array.from({ length: 80 }, (_, i) => `Line ${i} of a long answer.`).join("\n\n");
    const el = mount((emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.text(long);
        emit.textEnd(long);
        emit.toolCall("e1", "create_event", { title: "Design sync" });
        emit.toolCall("e2", "create_event", { title: "Retro" });
        emit.toolResult("e2", "ok");
        emit.interrupt([interrupt("e1")]);
        return;
      }
      emit.runEnd();
    });
    await send(el, "import");
    // The scroll that focus causes is smooth, so give it time to land.
    await new Promise((resolve) => setTimeout(resolve, 800));

    // The group was folded when the prompt rendered, so focus had nothing on
    // screen to land on unless the group opened first, synchronously.
    const approve = part(shadow(el), ".approval-btn--approve");
    expect(shadow(el).activeElement).toBe(approve);
    const button = approve.getBoundingClientRect();
    const list = part(shadow(el), ".messages").getBoundingClientRect();
    expect(button.top).toBeGreaterThanOrEqual(list.top);
    expect(button.bottom).toBeLessThanOrEqual(list.bottom);
  });

  it("leaves a question in view beside the folded group", async () => {
    let round = 0;
    const el = mount((emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("q0", "lookup_docs", { q: "deadline" });
        emit.toolResult("q0", "two dates");
        emit.toolCall("q1", "ask_user", { question: "Which date?", options: ["Friday", "Monday"] });
      }
      round += 1;
      emit.runEnd();
    });
    el.askUser = true;
    await send(el, "when is it due");

    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-open")).toBe("false");
    const question = part(shadow(el), ".question");
    expect(question.closest(".tool-group")).toBeNull();
    expect(group.compareDocumentPosition(question) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(height(question)).toBeGreaterThan(0);
  });
});

describe("a second wait in the same group", () => {
  it("opens the group again after the user folded it during the first", async () => {
    const second = gate();
    const el = mount(async (emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.toolCall("e1", "create_event", { title: "A" });
        emit.interrupt([approvalFor("e1")]);
        return;
      }
      if (JSON.stringify(params.resume).includes("int-e1")) {
        emit.toolResult("e1", "ok");
        // Held so the second approval is a later wait, not the tail of the first.
        await second.wait;
        emit.toolCall("e2", "create_event", { title: "B" });
        emit.interrupt([approvalFor("e2")]);
        return;
      }
      emit.runEnd();
    });
    await send(el, "two waits");
    const group = part(shadow(el), ".tool-group");
    const head = part(group, ".tool-group-head");
    expect(head.getAttribute("aria-expanded")).toBe("true");
    part(shadow(el), ".approval-btn--approve").click();
    await tick();
    head.click();
    expect(head.getAttribute("aria-expanded")).toBe("false");

    second.open();
    await tick();
    await tick();
    expect(all(el, ".tool-group")).toHaveLength(1);
    expect(group.getAttribute("data-state")).toBe("waiting");
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("a group whose step is asking the user", () => {
  /** One call that already settled, then the call that opens a prompt. */
  function askAfterLookup(call: (emit: Emit) => void): AgUiChat {
    let round = 0;
    const el = mount((emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("q0", "lookup_docs", { q: "deadline" });
        emit.toolResult("q0", "two dates");
        // The prompt opens only once the round is over, a task after the
        // card was drawn, so the row hears of it by the attribute alone.
        call(emit);
      }
      round += 1;
      emit.runEnd();
    });
    return el;
  }

  function wipeTool(el: AgUiChat): void {
    el.registerTool({
      name: "wipe",
      description: "wipes",
      parameters: { type: "object", properties: {}, "x-destructive": true } as never,
      handler: () => "wiped",
    });
  }

  function expectWaiting(el: AgUiChat): void {
    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-state")).toBe("waiting");
    expect(part(group, ".tool-group-label").textContent).toBe("2 steps");
    expect(part(group, ".tool-group-meta").textContent).toContain("1 waiting for you");
    // The prompt sits beside the group, so there is nothing for it to open.
    expect(group.getAttribute("data-open")).toBe("false");
  }

  function expectDone(el: AgUiChat): void {
    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-state")).toBe("done");
    expect(part(group, ".tool-group-label").textContent).toBe("Worked through 2 steps");
    expect(part(group, ".tool-group-meta").textContent).not.toContain("waiting for you");
  }

  it("reads as waiting while a question is open, and as done once it is answered", async () => {
    const el = askAfterLookup((emit) =>
      emit.toolCall("q1", "ask_user", { question: "Which date?", options: ["Friday", "Monday"] }),
    );
    el.askUser = true;
    await send(el, "when is it due");
    expectWaiting(el);

    const friday = part(shadow(el), ".question-choice input");
    friday.click();
    part(shadow(el), ".question-btn").click();
    await settle();
    expectDone(el);
  });

  it("stops reading as waiting when a Stop abandons the question", async () => {
    const el = askAfterLookup((emit) =>
      emit.toolCall("q1", "ask_user", { question: "Which date?", options: ["Friday", "Monday"] }),
    );
    el.askUser = true;
    await send(el, "when is it due");
    expectWaiting(el);

    part(shadow(el), ".send").click();
    await settle();
    expectDone(el);
  });

  it("reads as waiting while a confirmation is open, and not once it is declined", async () => {
    const el = askAfterLookup((emit) => emit.toolCall("x1", "wipe", {}));
    wipeTool(el);
    await send(el, "wipe it");
    expectWaiting(el);

    part(shadow(el), ".confirm-btn--cancel").click();
    await settle();
    expectDone(el);
  });

  it("reads as waiting while a confirmation is open, and not after a Stop", async () => {
    const el = askAfterLookup((emit) => emit.toolCall("x1", "wipe", {}));
    wipeTool(el);
    await send(el, "wipe it");
    expectWaiting(el);

    part(shadow(el), ".send").click();
    await settle();
    expectDone(el);
  });
});

describe("a group whose step delegated to a sub-agent", () => {
  it("stays folded, and names the sub-agent beside the running mark", async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mount(
      async (emit) => {
        emit.runStart();
        emit.toolCall("s1", "search_docs", { q: "refunds" });
        emit.toolResult("s1", "three pages");
        emit.toolCall("s2", "delegate_task", { task: "summarise the refund policy" });
        emit.subAgentStarted("sub-1", "researcher", "s2");
        await held;
        emit.subAgentFinished("sub-1");
        emit.toolResult("s2", "summary");
        emit.runEnd();
      },
      { width: NARROW },
    );
    await send(el, "summarise refunds");

    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-open")).toBe("false");
    expect(group.getAttribute("data-state")).toBe("running");
    expect(part(group, ".tool-group-meta").textContent).toContain("Delegated to researcher");
    const icon = part(group, ".tool-group-icon");
    expect(getComputedStyle(icon).animationName).toBe("ag-ui-tool-spin");
    expect(height(icon)).toBeGreaterThan(0);

    // The longest folded row there is, at the narrow end: every piece of it
    // stays inside the transcript rather than inside a group that overflowed.
    const list = part(shadow(el), ".messages").getBoundingClientRect();
    for (const child of group.querySelectorAll(".tool-group-head > *")) {
      const rect = child.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(list.left);
      expect(rect.right).toBeLessThanOrEqual(list.right);
    }

    release();
    await settle();
    expect(part(group, ".tool-group-meta").textContent).not.toContain("researcher");
  });
});

describe("the folded row follows a sub-agent frame by frame", () => {
  /**
   * A run delegating from its second call, whose frames each arrive in a task
   * of their own: the row hears of a frame by the attribute it stamps and by
   * nothing else, since the card's own status has not changed.
   */
  async function delegation(
    after: (emit: Emit) => void,
  ): Promise<{ meta: () => string; step: (n: number) => void }> {
    const gates = [gate(), gate(), gate()] as const;
    const el = mount(async (emit) => {
      emit.runStart();
      emit.toolCall("s1", "search_docs", { q: "refunds" });
      emit.toolResult("s1", "three pages");
      emit.toolCall("s2", "delegate_task", { task: "summarise" });
      await gates[0].wait;
      emit.subAgentStarted("sub-1", "researcher", "s2");
      await gates[1].wait;
      after(emit);
      await gates[2].wait;
      emit.runEnd();
    });
    await send(el, "go");
    return {
      meta: () => part(shadow(el), ".tool-group-meta").textContent ?? "",
      step: (n) => gates[n]?.open(),
    };
  }

  it("names the sub-agent when it starts in a later frame", async () => {
    const { meta, step } = await delegation(() => {});
    expect(meta()).not.toContain("researcher");
    step(0);
    await tick();
    expect(meta()).toContain("Delegated to researcher");
    step(1);
    step(2);
  });

  for (const phase of ["tool_call", "tool_result"]) {
    it(`keeps the name through the sub-agent's ${phase} frame`, async () => {
      const frame = subAgentValue((v) => v.phase === phase && v.tool?.toolCallId === "sub-1");
      const { meta, step } = await delegation((emit) => {
        emit.custom(FIXTURE_CUSTOM_NAME, { ...frame, delegationId: "s2" });
      });
      step(0);
      await tick();
      step(1);
      await tick();
      expect(meta()).toContain("Delegated to");
      step(2);
    });
  }

  it("drops the name once the sub-agent finishes, before the call settles", async () => {
    const { meta, step } = await delegation((emit) => emit.subAgentFinished("sub-1"));
    step(0);
    await tick();
    expect(meta()).toContain("researcher");
    step(1);
    await tick();
    expect(meta()).not.toContain("researcher");
    step(2);
  });

  it("drops the name once the delegating call settles, even with the panel unfinished", async () => {
    const { meta, step } = await delegation((emit) => emit.toolResult("s2", "summary"));
    step(0);
    await tick();
    expect(meta()).toContain("researcher");
    step(1);
    await tick();
    expect(meta()).not.toContain("researcher");
    step(2);
  });
});

describe("a card mode set after groups were drawn", () => {
  const MODES = ["inline", "minimal", "compact", "full"] as const;

  /** What tells a card laid out in the answer from one laid out anywhere else. */
  function face(cards: readonly HTMLElement[]): Record<string, string | number> {
    const [first, second] = cards as [HTMLElement, HTMLElement];
    const style = getComputedStyle(first);
    return {
      border: style.borderTopWidth,
      padding: style.paddingTop,
      background: style.backgroundColor,
      width: Math.round(first.getBoundingClientRect().width),
      gap: Math.round(second.getBoundingClientRect().top - first.getBoundingClientRect().bottom),
    };
  }

  it("flattens them into the cards that mode builds", async () => {
    const reference = mount(fiveSteps, { display: "full" });
    await send(reference, "fill the form");
    const expected = face(all(reference, ".tool-call"));

    const el = mount(fiveSteps);
    await send(el, "fill the form");
    const head = part(shadow(el), ".tool-group-head");
    for (const mode of MODES) {
      el.setAttribute("data-tool-display", mode);
      expect(getComputedStyle(head).display).toBe("none");
      for (const card of all(el, ".tool-call")) {
        expect(height(card)).toBeGreaterThan(0);
      }
    }

    // Each card laid out as a child of the answer, as a card built in that
    // mode is: the same face, the same width, the answer's own gap between.
    el.setAttribute("data-tool-display", "full");
    expect(face(all(el, ".tool-call"))).toEqual(expected);

    // Back to the default, the group folds again.
    el.removeAttribute("data-tool-display");
    expect(height(head)).toBeGreaterThan(0);
    expect(height(all(el, ".tool-call")[0] as HTMLElement)).toBe(0);
  });
});

describe("the step group under a theme", () => {
  it("takes the theme's own row", async () => {
    const soft = mount(fiveSteps);
    soft.setAttribute("theme", "soft");
    await send(soft, "fill the form");
    expect(getComputedStyle(part(shadow(soft), ".tool-group-head")).borderTopLeftRadius).toBe(
      "999px",
    );

    const ledger = mount(fiveSteps);
    ledger.setAttribute("theme", "ledger");
    await send(ledger, "fill the form");
    expect(getComputedStyle(part(shadow(ledger), ".tool-group-head")).textTransform).toBe(
      "uppercase",
    );
  });
});

describe("a one-step group", () => {
  it("names its step once, in the label, and adds no note repeating it", async () => {
    const held = gate();
    const el = mount(async (emit) => {
      emit.runStart();
      emit.toolCall("c1", "fill_field", { field: "title" });
      await held.wait;
      emit.runEnd();
    });
    await send(el, "fill the title");

    const group = part(shadow(el), ".tool-group");
    expect(group.getAttribute("data-state")).toBe("running");
    expect(part(group, ".tool-group-label").textContent).toBe("Fill field");
    // The running step is the only step, so a note naming it would say the same
    // thing twice in one line.
    expect(part(group, ".tool-group-meta").textContent).toBe("");
    expect(part(group, ".tool-group-meta").hidden).toBe(true);
    held.open();
  });
});

describe("client tool rounds", () => {
  it("join one group across the pending dots between them", async () => {
    let round = 0;
    const el = mount((emit) => {
      emit.runStart();
      if (round < 3) {
        emit.toolCall(`k${round}`, "tick", { n: round });
      } else {
        emit.text("done");
        emit.textEnd("done");
      }
      round += 1;
      emit.runEnd();
    });
    el.registerTool({
      name: "tick",
      description: "ticks",
      parameters: { type: "object", properties: { n: { type: "number" } } },
      handler: () => "ticked",
    });
    await send(el, "tick");
    await settle();
    await settle();

    // The dots come back at the foot of the turn between rounds, and a call
    // takes them down before it draws its card, so they never split the group.
    expect(all(el, ".tool-call")).toHaveLength(3);
    expect(all(el, ".tool-group")).toHaveLength(1);
  });
});

describe("the step group's row", () => {
  it("stops spinning when the reader asked for reduced motion", async () => {
    const held = gate();
    const el = mount(async (emit) => {
      emit.runStart();
      emit.toolCall("c1", "fill_field", { field: "title" });
      emit.toolCall("c2", "fill_field", { field: "slug" });
      await held.wait;
      emit.runEnd();
    });
    await send(el, "fill the form");
    const icon = part(shadow(el), ".tool-group-icon");
    expect(getComputedStyle(icon).animationName).toBe("ag-ui-tool-spin");

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    expect(getComputedStyle(icon).animationName).toBe("none");
    held.open();
  });

  it("draws its focus outline in the ring token", async () => {
    const el = mount(fiveSteps);
    el.style.setProperty("--ag-ui-ring", "rgb(255, 0, 0)");
    await send(el, "fill the form");
    const head = part(shadow(el), ".tool-group-head");
    head.focus({ focusVisible: true } as FocusOptions);
    expect(shadow(el).activeElement).toBe(head);
    expect(getComputedStyle(head).outlineColor).toBe("rgb(255, 0, 0)");

    el.style.setProperty("--ag-ui-ring", "rgb(0, 0, 255)");
    expect(getComputedStyle(head).outlineColor).toBe("rgb(0, 0, 255)");
  });

  it("takes no space in any part once that part is hidden, as every class with a display does", async () => {
    const el = mount(fiveSteps);
    await send(el, "fill the form");
    const group = part(shadow(el), ".tool-group");
    part(group, ".tool-group-head").click();
    const parts = [".tool-group-head", ".tool-group-list", ".tool-group"];
    for (const selector of parts) {
      expect(height(part(shadow(el), selector))).toBeGreaterThan(0);
    }
    for (const selector of parts) {
      const node = part(shadow(el), selector);
      node.hidden = true;
      expect(height(node)).toBe(0);
      expect(getComputedStyle(node).display).toBe("none");
      node.hidden = false;
    }

    // The group is display: contents under a card mode, which a bare hidden
    // would not undo either.
    el.setAttribute("data-tool-display", "full");
    group.hidden = true;
    expect(getComputedStyle(group).display).toBe("none");
  });
});
