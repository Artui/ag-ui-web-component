import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../../src/core/conversation_store.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * How the composer gets from the centre of an empty page to its dock, frame by
 * frame.
 *
 * Only a send travels. A restored conversation, a thread switch and a new chat
 * are changes of context and snap, and a conversation a slow store is still
 * fetching is held docked with the greeting hidden, so it never paints a
 * centred composer that then drops. Every one of those is a claim about which
 * frames reach the screen, so each is sampled on animation frames in a real
 * engine rather than inferred from the attributes that drive it.
 *
 * Positions are read from `.input-row`, which is never scaled or transformed,
 * so its rect is its box.
 */

const nextFrame = (): Promise<number> => new Promise((resolve) => requestAnimationFrame(resolve));

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The composer row's top on every animation frame for `ms`, starting on the
 * frame after the call. The caller's own action goes between starting this and
 * awaiting it, so the first sample is already the first frame the action could
 * reach.
 */
function sampleTops(el: AgUiChat, ms: number): Promise<number[]> {
  const row = part(el, ".input-row");
  const tops: number[] = [];
  const start = performance.now();
  return new Promise((resolve) => {
    const tick = (): void => {
      tops.push(Math.round(row.getBoundingClientRect().top * 10) / 10);
      if (performance.now() - start < ms) {
        requestAnimationFrame(tick);
      } else {
        resolve(tops);
      }
    };
    requestAnimationFrame(tick);
  });
}

function mount(
  attrs: Record<string, string>,
  configure: (el: AgUiChat) => void = () => {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "page");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  configure(el);
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

/** The space between the composer row and the panel's foot. Zero is docked. */
function belowComposer(el: AgUiChat): number {
  const chat = part(el, ".chat");
  const foot =
    chat.getBoundingClientRect().bottom -
    Number.parseFloat(getComputedStyle(chat).borderBottomWidth);
  return foot - part(el, ".input-row").getBoundingClientRect().bottom;
}

/** Whether the rule over the composer is drawn, which only a docked composer has. */
function ruleDrawn(el: AgUiChat): boolean {
  return getComputedStyle(part(el, ".input-row")).borderTopColor !== "rgba(0, 0, 0, 0)";
}

/** Whether any part of the greeting is painted. */
function greetingPainted(el: AgUiChat): boolean {
  const greeting = part(el, ".greeting");
  return greeting.getClientRects().length > 0 && getComputedStyle(greeting).visibility !== "hidden";
}

/** An agent whose run stays open, so nothing the answer draws moves the layout mid-slide. */
function holdingAgent(): AgUiChat["agentFactory"] {
  const handle = makeFakeAgent({
    script: async (emit: Emit) => {
      emit.runStart();
      await new Promise(() => {});
    },
  });
  return () => handle.agent;
}

function type(el: AgUiChat, text: string): HTMLTextAreaElement {
  const input = part(el, ".input") as HTMLTextAreaElement;
  input.focus();
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  return input;
}

function pressEnter(input: HTMLTextAreaElement): void {
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true, cancelable: true }),
  );
}

/** A store answering after `ms`, the way a remote one does. */
function slowStore(ms: number, messages: readonly Message[] | null): ClientConversationStore {
  return {
    threadId: () => "t1",
    loadMessages: () => wait(ms).then(() => messages),
    saveMessages: () => {},
    loadCheckpoint: () => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: () => Promise.resolve([]),
    setActiveThread: () => {},
    renameThread: () => {},
  };
}

const HISTORY: readonly Message[] = [
  { id: "u1", role: "user", content: "earlier" },
  { id: "a1", role: "assistant", content: "an answer" },
];

beforeAll(() => {
  defineAgUiChat();
});

afterEach(async () => {
  for (const el of document.querySelectorAll(ELEMENT_TAG)) {
    el.remove();
  }
  await cdp().send("Emulation.setEmulatedMedia", { features: [] });
});

describe("the send that leaves an empty page", () => {
  it("slides the composer to its dock through intermediate frames", async () => {
    const el = mount({}, (e) => {
      e.agentFactory = holdingAgent();
    });
    await nextFrame();
    const centred = part(el, ".input-row").getBoundingClientRect().top;
    const input = type(el, "hello there");

    const sampling = sampleTops(el, 600);
    pressEnter(input);
    const tops = await sampling;
    const docked = part(el, ".input-row").getBoundingClientRect().top;

    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    expect(docked - centred).toBeGreaterThan(200);
    const between = tops.filter((top) => top > centred + 1 && top < docked - 1);
    expect(new Set(between).size).toBeGreaterThanOrEqual(3);
    // Downwards all the way, never overshooting and coming back.
    for (let i = 1; i < tops.length; i += 1) {
      expect(tops[i]).toBeGreaterThanOrEqual((tops[i - 1] ?? 0) - 0.1);
    }
  });

  it("keeps focus in the composer through the slide", async () => {
    const el = mount({}, (e) => {
      e.agentFactory = holdingAgent();
    });
    await nextFrame();
    const input = type(el, "hello there");

    pressEnter(input);
    await wait(50);
    expect(el.shadowRoot?.activeElement).toBe(input);
    await wait(400);
    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    expect(el.shadowRoot?.activeElement).toBe(input);
  });

  it("fades the rule over the composer in with the slide rather than drawing it at once", async () => {
    // Slowed through the public motion token, so one sample lands mid-travel.
    const el = mount({}, (e) => {
      e.agentFactory = holdingAgent();
      e.style.setProperty("--ag-ui-motion", "2s");
    });
    await nextFrame();
    const centred = part(el, ".input-row").getBoundingClientRect().top;

    pressEnter(type(el, "hello there"));
    await wait(400);

    const row = part(el, ".input-row");
    expect(row.getBoundingClientRect().top).toBeGreaterThan(centred + 1);
    expect(belowComposer(el)).toBeGreaterThan(1);
    const alpha = /rgba\([^)]*,\s*([\d.]+)\)/.exec(getComputedStyle(row).borderTopColor)?.[1];
    expect(alpha).toBeDefined();
    expect(Number(alpha)).toBeGreaterThan(0);
    expect(Number(alpha)).toBeLessThan(1);
  });

  it("jumps straight to the dock when the reader asked for reduced motion", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
    const el = mount({}, (e) => {
      e.agentFactory = holdingAgent();
    });
    await nextFrame();
    const centred = part(el, ".input-row").getBoundingClientRect().top;
    const input = type(el, "hello there");

    const sampling = sampleTops(el, 300);
    pressEnter(input);
    const tops = await sampling;

    // The state still changes; nothing travels between the two positions.
    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    expect(new Set([centred, ...tops]).size).toBe(2);
  });
});

describe("the ways back to the centre, and out of it, that snap", () => {
  it("snaps back to the centre on a new chat", async () => {
    const el = mount({}, (e) => {
      e.agentFactory = holdingAgent();
    });
    await nextFrame();
    pressEnter(type(el, "hello there"));
    await wait(450);
    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    const docked = part(el, ".input-row").getBoundingClientRect().top;

    const sampling = sampleTops(el, 300);
    el.newChat();
    const tops = await sampling;

    expect(belowComposer(el)).toBeGreaterThan(200);
    expect(new Set([docked, ...tops]).size).toBe(2);
  });

  it("mounts a stored conversation docked from its first frame", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "page");
    el.conversationStore = { ...slowStore(0, HISTORY), loadMessages: async () => HISTORY };
    const sampling = new Promise<boolean[]>((resolve) => {
      const docked: boolean[] = [];
      const tick = (): void => {
        docked.push(belowComposer(el) <= 1 && !greetingPainted(el));
        if (docked.length < 20) {
          requestAnimationFrame(tick);
        } else {
          resolve(docked);
        }
      };
      requestAnimationFrame(tick);
    });
    document.body.appendChild(el);

    expect(await sampling).not.toContain(false);
  });

  it("never paints the greeting or a centred composer while a slow store answers", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = slowStore(300, HISTORY);
    });
    const seen: { docked: boolean; greeting: boolean; rule: boolean }[] = [];
    const start = performance.now();
    while (performance.now() - start < 450) {
      await nextFrame();
      seen.push({
        docked: belowComposer(el) <= 1,
        greeting: greetingPainted(el),
        rule: ruleDrawn(el),
      });
    }

    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(false);
    // Enough frames while held for "never" to mean something.
    expect(seen.length).toBeGreaterThan(10);
    expect(seen.every((frame) => frame.docked && frame.rule)).toBe(true);
    expect(seen.some((frame) => frame.greeting)).toBe(false);
  });

  it("holds a slow store's empty thread docked, then centres it without travelling", async () => {
    const el = mount({ "data-starters": JSON.stringify(["Summarise this page"]) }, (e) => {
      e.conversationStore = slowStore(250, null);
    });
    await nextFrame();
    expect(el.hasAttribute("data-restoring")).toBe(true);
    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    expect(greetingPainted(el)).toBe(false);
    expect(ruleDrawn(el)).toBe(true);
    // The starters stay where they are on a docked page, in the middle of the
    // transcript, rather than moving down to sit under a greeting nobody sees.
    const middle = (box: DOMRect): number => box.top + box.height / 2;
    const empty = part(el, ".empty").getBoundingClientRect();
    expect(
      Math.abs(middle(empty) - middle(part(el, ".messages").getBoundingClientRect())),
    ).toBeLessThanOrEqual(1);
    const held = part(el, ".input-row").getBoundingClientRect().top;

    const tops = await sampleTops(el, 450);

    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(belowComposer(el)).toBeGreaterThan(200);
    expect(greetingPainted(el)).toBe(true);
    expect(new Set([held, ...tops]).size).toBe(2);
  });

  it("holds an embedded panel that opted in the same way", async () => {
    const el = mount(
      { placement: "embedded", "data-greeting": "", "data-starters": JSON.stringify(["Go"]) },
      (e) => {
        e.style.height = "560px";
        e.conversationStore = slowStore(250, null);
      },
    );
    await nextFrame();

    expect(el.hasAttribute("data-restoring")).toBe(true);
    expect(belowComposer(el)).toBeLessThanOrEqual(1);
    expect(ruleDrawn(el)).toBe(true);
    const middle = (box: DOMRect): number => box.top + box.height / 2;
    const empty = part(el, ".empty").getBoundingClientRect();
    expect(
      Math.abs(middle(empty) - middle(part(el, ".messages").getBoundingClientRect())),
    ).toBeLessThanOrEqual(1);

    await wait(400);
    expect(belowComposer(el)).toBeGreaterThan(100);
    expect(ruleDrawn(el)).toBe(false);
  });
});
