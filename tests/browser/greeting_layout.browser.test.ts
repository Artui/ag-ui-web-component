import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Where the composer sits while a conversation is empty, measured.
 *
 * The greeting layout is stylesheet alone: the element stamps `data-empty`, and
 * a set of `:host(...)` rules decides whether a greeting shows and whether a
 * spacer below the composer grows to match the transcript above it. CSS has no
 * coverage, and happy-dom lays out no boxes, so a deleted condition in any of
 * those selectors is invisible to every gate except a test like these, sized so
 * the condition it names is the one that answers.
 *
 * "Centred" is measured as two equal halves: the transcript's box above the
 * composer rows, and the space between the composer and the panel's foot
 * below them. Equal halves are what the layout promises, and they stay equal
 * however tall the rows between them grow.
 */

/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(attrs: Record<string, string>, style: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  for (const [name, value] of Object.entries(style)) {
    el.style.setProperty(name, value);
  }
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

/** The space above the composer rows and the space below them, in px. */
function halves(el: AgUiChat): { above: number; below: number } {
  const chat = part(el, ".chat");
  const foot =
    chat.getBoundingClientRect().bottom -
    Number.parseFloat(getComputedStyle(chat).borderBottomWidth);
  return {
    above: part(el, ".messages-wrap").getBoundingClientRect().height,
    below: foot - part(el, ".input-row").getBoundingClientRect().bottom,
  };
}

/**
 * Whether the greeting has a box on screen. Its own display is not enough: the
 * empty region it sits in is hidden once the conversation has content, and a
 * child keeps its computed display under a parent that has none.
 */
function greetingShown(el: AgUiChat): boolean {
  return part(el, ".greeting").getClientRects().length > 0;
}

const TRANSPARENT = "rgba(0, 0, 0, 0)";

const STARTERS = JSON.stringify(["Summarise this page"]);

/**
 * The transcript's content box, inside its own padding, which is what the
 * empty region is laid out in.
 */
function transcriptBox(el: AgUiChat): { top: number; bottom: number } {
  const messages = part(el, ".messages");
  const style = getComputedStyle(messages);
  const box = messages.getBoundingClientRect();
  return {
    top: box.top + Number.parseFloat(style.paddingTop),
    bottom: box.bottom - Number.parseFloat(style.paddingBottom),
  };
}

const middleOf = (box: { top: number; bottom: number }): number => (box.top + box.bottom) / 2;

/**
 * How far the empty region sits from the middle of the transcript. Zero is
 * where it has always been without a greeting; the greeting layout moves it
 * down to sit over the composer.
 */
function emptyOffCentre(el: AgUiChat): number {
  const middle = (box: DOMRect): number => box.top + box.height / 2;
  const empty = part(el, ".empty").getBoundingClientRect();
  expect(empty.height).toBeGreaterThan(0);
  return Math.abs(middle(empty) - middle(part(el, ".messages").getBoundingClientRect()));
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  for (const el of document.querySelectorAll(ELEMENT_TAG)) {
    el.remove();
  }
});

describe("the greeting layout on a full page", () => {
  it("centres the composer rows between the header and the foot", async () => {
    const el = mount({ placement: "page" });
    await settle();

    const { above, below } = halves(el);
    // Well off the foot, so equal halves are not two zeros.
    expect(below).toBeGreaterThan(200);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("shows the greeting directly over the composer, centred on it", async () => {
    const el = mount({ placement: "page", "user-name": "Ada" });
    await settle();

    expect(greetingShown(el)).toBe(true);
    const greeting = part(el, ".greeting").getBoundingClientRect();
    const composer = part(el, ".composer").getBoundingClientRect();
    expect(greeting.bottom).toBeLessThanOrEqual(composer.top);
    // At the foot of the upper half rather than in its middle.
    expect(composer.top - greeting.bottom).toBeLessThan(80);
    const centre = (box: DOMRect): number => box.left + box.width / 2;
    expect(Math.abs(centre(greeting) - centre(composer))).toBeLessThanOrEqual(1);
  });

  it("draws no rule over the composer while there is nothing above it", async () => {
    const el = mount({ placement: "page" });
    await settle();

    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).toBe(TRANSPARENT);
  });

  it("docks the composer, rule and all, once the conversation has something in it", async () => {
    const el = mount({ placement: "page" });
    el.appendMessage(MESSAGE_ROLE.USER, "hello");
    await settle();

    expect(halves(el).below).toBeLessThanOrEqual(1);
    expect(greetingShown(el)).toBe(false);
    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
  });

  it("goes back to the centre when the conversation is emptied", async () => {
    const el = mount({ placement: "page" });
    el.appendMessage(MESSAGE_ROLE.USER, "hello");
    await settle();
    el.newChat();
    await settle();

    const { above, below } = halves(el);
    expect(below).toBeGreaterThan(200);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("keeps the rows centred as a draft grows them", async () => {
    const el = mount({ placement: "page" });
    await settle();
    const before = part(el, ".input-row").getBoundingClientRect().height;

    const input = part(el, ".input") as HTMLTextAreaElement;
    input.value = "one\ntwo\nthree\nfour\nfive";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle();

    expect(part(el, ".input-row").getBoundingClientRect().height).toBeGreaterThan(before + 20);
    const { above, below } = halves(el);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("recentres in a viewport the host reports as shorter, as an on-screen keyboard makes it", async () => {
    const el = mount({ placement: "page" }, { "--ag-ui-viewport-height": "480px" });
    await settle();

    expect(el.getBoundingClientRect().height).toBe(480);
    const { above, below } = halves(el);
    expect(below).toBeGreaterThan(60);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("is off with data-greeting=off: docked, no greeting, the rule drawn", async () => {
    const el = mount({ placement: "page", "data-greeting": "off", "data-starters": STARTERS });
    await settle();

    expect(halves(el).below).toBeLessThanOrEqual(1);
    expect(greetingShown(el)).toBe(false);
    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
    // And the starters stay in the middle of the transcript, where they were
    // before there was a greeting to sit under.
    expect(emptyOffCentre(el)).toBeLessThanOrEqual(1);
  });

  it("follows a placement switch with nothing from script", async () => {
    const el = mount({ placement: "floating" });
    await settle();
    expect(greetingShown(el)).toBe(false);

    el.setAttribute("placement", "page");
    await settle();

    expect(greetingShown(el)).toBe(true);
    expect(halves(el).below).toBeGreaterThan(200);
  });
});

/**
 * A phone gets the other shape: the composer at the foot, the greeting in the
 * space above it.
 *
 * These narrow the viewport for real rather than emulating it, because a media
 * query is half the subject and nothing short of the real width evaluates one.
 */
describe("the greeting layout on a phone", () => {
  beforeAll(async () => {
    await page.viewport(390, 844);
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("docks the composer at the foot, with the prompts against it", async () => {
    const el = mount({ placement: "page", "user-name": "Ada", "data-starters": STARTERS });
    await settle();

    expect(halves(el).below).toBeLessThanOrEqual(1);
    // A prompt chip is a way into the conversation, so it goes next to the
    // field it starts rather than under the greeting halfway up the panel.
    const starters = part(el, ".suggestions").getBoundingClientRect();
    const transcript = transcriptBox(el);
    expect(Math.abs(starters.bottom - transcript.bottom)).toBeLessThanOrEqual(1);
    // And the greeting takes the middle of what the prompts leave.
    const greeting = part(el, ".greeting").getBoundingClientRect();
    expect(
      Math.abs(middleOf(greeting) - middleOf({ top: transcript.top, bottom: starters.top })),
    ).toBeLessThanOrEqual(1);
  });

  it("centres the greeting in the transcript when no prompts are offered", async () => {
    const el = mount({ placement: "page", "user-name": "Ada" });
    await settle();

    expect(halves(el).below).toBeLessThanOrEqual(1);
    const greeting = part(el, ".greeting").getBoundingClientRect();
    expect(Math.abs(middleOf(greeting) - middleOf(transcriptBox(el)))).toBeLessThanOrEqual(1);
  });

  it("keeps it at the foot when the visible area shortens under a keyboard", async () => {
    // The height a host reports while iOS holds a keyboard over a 390x844
    // screen. Centred, the composer sat halfway up this with a band of empty
    // page under it, which is the shape that started this.
    const el = mount({ placement: "page" }, { "--ag-ui-viewport-height": "426px" });
    await settle();

    expect(el.getBoundingClientRect().height).toBe(426);
    expect(halves(el).below).toBeLessThanOrEqual(1);
    const send = part(el, ".send").getBoundingClientRect();
    const foot = part(el, ".chat").getBoundingClientRect().bottom;
    expect(send.bottom).toBeLessThanOrEqual(foot);
    expect(greetingShown(el)).toBe(true);
  });

  it("docks an embedded panel that opted in, within its own box", async () => {
    const el = mount({ placement: "embedded", "data-greeting": "", "data-starters": STARTERS });
    el.style.height = "560px";
    await settle();

    expect(greetingShown(el)).toBe(true);
    expect(halves(el).below).toBeLessThanOrEqual(1);
    const starters = part(el, ".suggestions").getBoundingClientRect();
    expect(Math.abs(starters.bottom - transcriptBox(el).bottom)).toBeLessThanOrEqual(1);
  });

  it("leaves the centred composer to a host that keeps its desktop shape", async () => {
    // The breakpoint's own opt-out, which is the only way to reach a media
    // query from outside the shadow root.
    const el = mount({
      placement: "page",
      "data-starters": STARTERS,
      "data-small-viewport": "off",
    });
    await settle();

    const { above, below } = halves(el);
    expect(below).toBeGreaterThan(150);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
    // Prompts and greeting stay one block hanging at the foot of the upper
    // half. Docked, the greeting is centred over the prompts instead, so the
    // gap above it is what tells the two shapes apart -- the prompts are
    // against the transcript's foot either way.
    const starters = part(el, ".suggestions").getBoundingClientRect();
    const greeting = part(el, ".greeting").getBoundingClientRect();
    expect(greeting.top - transcriptBox(el).top).toBeGreaterThan(
      starters.top - greeting.bottom + 50,
    );
  });
});

describe("the greeting layout elsewhere", () => {
  it("centres an embedded panel that opts in, within its own box", async () => {
    const el = mount({ placement: "embedded", "data-greeting": "" });
    el.style.height = "560px";
    await settle();

    expect(greetingShown(el)).toBe(true);
    const { above, below } = halves(el);
    expect(below).toBeGreaterThan(100);
    expect(Math.abs(above - below)).toBeLessThanOrEqual(1);
  });

  it("docks an embedded panel that opted in once it has content", async () => {
    const el = mount({ placement: "embedded", "data-greeting": "" });
    el.style.height = "560px";
    el.appendMessage(MESSAGE_ROLE.USER, "hello");
    await settle();

    expect(greetingShown(el)).toBe(false);
    expect(halves(el).below).toBeLessThanOrEqual(1);
    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
  });

  it("leaves an embedded panel that did not opt in as it was", async () => {
    const el = mount({ placement: "embedded", "data-starters": STARTERS });
    el.style.height = "560px";
    await settle();

    expect(greetingShown(el)).toBe(false);
    expect(halves(el).below).toBeLessThanOrEqual(1);
    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
    expect(emptyOffCentre(el)).toBeLessThanOrEqual(1);
  });

  it("is off for an embedded panel whose data-greeting says off", async () => {
    const el = mount({ placement: "embedded", "data-greeting": "off", "data-starters": STARTERS });
    el.style.height = "560px";
    await settle();

    expect(greetingShown(el)).toBe(false);
    expect(halves(el).below).toBeLessThanOrEqual(1);
    expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
    expect(emptyOffCentre(el)).toBeLessThanOrEqual(1);
  });

  it.each(["floating", "sidebar"])(
    "never reaches the %s placement, even when asked for",
    async (placement) => {
      const el = mount({ placement, "data-greeting": "on", "data-starters": STARTERS });
      await settle();

      expect(greetingShown(el)).toBe(false);
      expect(halves(el).below).toBeLessThanOrEqual(1);
      expect(getComputedStyle(part(el, ".input-row")).borderTopColor).not.toBe(TRANSPARENT);
      expect(emptyOffCentre(el)).toBeLessThanOrEqual(1);
    },
  );

  it("never reaches a corner placement made full-bleed by a phone-sized viewport", async () => {
    await page.viewport(390, 844);
    try {
      const el = mount({ placement: "floating", "data-greeting": "on" });
      await settle();

      expect(greetingShown(el)).toBe(false);
      expect(halves(el).below).toBeLessThanOrEqual(1);
    } finally {
      await page.viewport(DESKTOP.width, DESKTOP.height);
    }
  });
});
