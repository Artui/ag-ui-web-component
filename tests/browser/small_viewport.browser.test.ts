import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The small-viewport layout: one shape, reached from whichever placement the
 * host chose for the desktop it was designing.
 *
 * These really narrow the viewport rather than emulating it, because a media
 * query is the subject and nothing short of the real width evaluates one. The
 * project otherwise runs at a stated desktop size, so the width is put back
 * afterwards -- the browser context is shared with every file that runs after
 * this one.
 *
 * The measurements are taken from the panel rather than the host. The host is
 * the positioned box; the radius and the shadow belong to the panel inside it,
 * and asserting them on the host is how these tests passed while measuring
 * nothing at all.
 */

/** The width at and below which every placement becomes full-bleed. */
const BREAKPOINT_PX = 600;

/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

function mount(placement?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  if (placement !== undefined) {
    el.setAttribute("placement", placement);
  }
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

function panelOf(el: AgUiChat): HTMLElement {
  const found = el.shadowRoot?.querySelector(".chat");
  if (found === null || found === undefined) {
    throw new Error("no .chat in the shadow root");
  }
  return found as HTMLElement;
}

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

describe("small-viewport layout (real browser)", () => {
  beforeAll(async () => {
    defineAgUiChat();
    await page.viewport(BREAKPOINT_PX - 200, 720);
  });

  afterAll(async () => {
    // Politeness rather than the guarantee. The guarantee is in the project's
    // setup file, which gives every browser file this size to start from --
    // restoring it here alone was not enough, because the ordering that
    // decides who runs next changes with coverage on.
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it.each(["floating", "sidebar", "bottom-left", "side", undefined])(
    "collapses the %s placement onto one full-bleed shape",
    async (placement) => {
      const el = mount(placement);
      await settle();
      const box = el.getBoundingClientRect();

      // Each of these is a different shape above the breakpoint -- a corner
      // panel with a 24px margin, or a 420px dock. Below it they are the
      // screen: a 380x560 panel with a frame round it is not a smaller version
      // of the host's decision, it is most of a phone.
      expect(box.width).toBeCloseTo(window.innerWidth, 0);
      expect(box.height).toBeCloseTo(window.innerHeight, 0);
      expect(getComputedStyle(panelOf(el)).borderRadius).toBe("0px");
    },
  );

  it("leaves the embedded placement to the host that sized it", async () => {
    const el = mount("embedded");
    await settle();

    // Taking over a box the host placed in its own layout would break the app
    // shell it was embedded into, and only the host knows whether its column
    // should become the whole screen.
    expect(getComputedStyle(el).position).toBe("static");
    expect(el.getBoundingClientRect().height).not.toBeCloseTo(window.innerHeight, 0);
  });

  it("lets a host keep its desktop shape at every width", async () => {
    // Everything the breakpoint sets is a token a host can re-state, but the
    // trigger is a media query and a media query cannot read one -- so without
    // an opt-out this is the only part of the placement model a host cannot
    // reach.
    const el = mount("floating");
    el.setAttribute("data-small-viewport", "off");
    await settle();
    const box = el.getBoundingClientRect();

    expect(box.width).not.toBeCloseTo(window.innerWidth, 0);
    expect(getComputedStyle(panelOf(el)).borderRadius).not.toBe("0px");
    expect(
      getComputedStyle(el.shadowRoot?.querySelector(".resize-handle") as HTMLElement).display,
    ).not.toBe("none");
  });

  it("takes the resize grips away once the panel is the screen", async () => {
    const el = mount("floating");
    await settle();

    const grip = el.shadowRoot?.querySelector(".resize-handle") as HTMLElement;
    expect(getComputedStyle(grip).display).toBe("none");
  });

  it("keeps the transcript's scroll out of the page behind it", async () => {
    // Reaching the end of the transcript chained the scroll into the host
    // page, and on iOS bounced the whole document with it.
    const el = mount("floating");
    await settle();
    const messages = el.shadowRoot?.querySelector(".messages") as HTMLElement;

    expect(getComputedStyle(messages).overscrollBehavior).toBe("contain");
  });

  it("still rests at the launcher, which is the way back in", async () => {
    // Full-bleed and always-on would be a takeover. The launcher is what keeps
    // it a chat the user opens rather than a screen they are given.
    const el = mount("floating");
    el.removeAttribute("data-start-open");
    el.setCollapsed(true);
    await settle();

    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });
});

/**
 * A corner panel the user placed on a wide window, and the phone that window
 * becomes. A spot stated on a wide window is written inline, and the phone
 * block reads the host's inset before its own, so it has to come off for the
 * panel to be the screen, and it has to come back when there is room again.
 *
 * Its own block because the one above runs the whole file at a phone's width.
 * Motion is off on each chat, so a rect read after a frame is the resting one
 * and not a frame of the collapse morph.
 */
describe("a corner panel placed on a wide window (real browser)", () => {
  const PHONE = { width: 390, height: 844 };
  const ID = "placed";
  const LAUNCHER_KEY = `ag-ui-chat:launcher:${ID}`;

  function chat(attrs: Record<string, string> = {}): AgUiChat {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.id = ID;
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    el.style.setProperty("--ag-ui-motion", "0s");
    document.body.appendChild(el);
    return el;
  }

  function part(el: AgUiChat, selector: string): HTMLElement {
    const found = el.shadowRoot?.querySelector<HTMLElement>(selector);
    if (found === null || found === undefined) {
      throw new Error(`expected ${selector} in the shadow root`);
    }
    return found;
  }

  const frames = async (): Promise<void> => {
    for (let frame = 0; frame < 3; frame += 1) {
      await settle();
    }
  };

  async function resize(size: { width: number; height: number }): Promise<void> {
    await page.viewport(size.width, size.height);
    await frames();
  }

  /** A gesture by a pointer: press, travel, release. */
  async function drag(handle: HTMLElement, dx: number, dy: number): Promise<void> {
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
    await frames();
  }

  /** The panel dragged by its header to [376, 96] on a wide window. */
  async function placed(attrs: Record<string, string> = {}): Promise<AgUiChat> {
    const el = chat({ "data-start-open": "", ...attrs });
    await frames();
    const box = el.getBoundingClientRect();
    await drag(part(el, ".header"), 376 - box.left, 96 - box.top);
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    return el;
  }

  /** Full-bleed, measured, with nothing inline holding it off the edges. */
  function expectFullBleed(el: AgUiChat): void {
    const box = el.getBoundingClientRect();
    expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, PHONE.width, PHONE.height]);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  }

  /**
   * The bubble's resting box. The size from the layout and the position from
   * the centre, because it is scaled in several states and a centred scale is
   * the one point that cannot move.
   */
  function bubble(el: AgUiChat): { left: number; top: number; right: number; bottom: number } {
    const launcher = part(el, ".launcher");
    const rect = launcher.getBoundingClientRect();
    const left = rect.left + rect.width / 2 - launcher.offsetWidth / 2;
    const top = rect.top + rect.height / 2 - launcher.offsetHeight / 2;
    return { left, top, right: left + launcher.offsetWidth, bottom: top + launcher.offsetHeight };
  }

  /** On the screen, and held off its edges as a dragged bubble always is. */
  function expectBubbleOnScreen(el: AgUiChat): void {
    const at = bubble(el);
    expect(at.left).toBeGreaterThanOrEqual(8 - 0.5);
    expect(at.top).toBeGreaterThanOrEqual(8 - 0.5);
    expect(at.right).toBeLessThanOrEqual(PHONE.width - 8 + 0.5);
    expect(at.bottom).toBeLessThanOrEqual(PHONE.height - 8 + 0.5);
  }

  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    localStorage.clear();
    sessionStorage.clear();
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("goes full-bleed when the window narrows to a phone", async () => {
    const el = await placed();
    await resize(PHONE);
    expectFullBleed(el);
    expect(getComputedStyle(panelOf(el)).borderRadius).toBe("0px");
  });

  it("stays full-bleed through a reopen on the phone", async () => {
    const el = await placed();
    await resize(PHONE);
    el.setCollapsed(true);
    await frames();
    expectBubbleOnScreen(el);
    el.setCollapsed(false);
    await frames();
    expectFullBleed(el);
  });

  it("goes full-bleed when it was collapsed as the window narrowed", async () => {
    const el = await placed();
    el.setCollapsed(true);
    await frames();
    await resize(PHONE);
    expectBubbleOnScreen(el);
    el.setCollapsed(false);
    await frames();
    expectFullBleed(el);
  });

  it("refuses a header drag and moveTo on the phone, placed or not", async () => {
    const dragged = await placed();
    await resize(PHONE);
    for (const el of [dragged, chat({ "data-start-open": "" })]) {
      await frames();
      await drag(part(el, ".header"), 60, 80);
      expectFullBleed(el);
      expect(el.describeSurface().movable).toBe(false);
      expect(el.moveTo("top-left")).toBe(false);
      expectFullBleed(el);
      el.remove();
    }
  });

  it("takes its spot back when the window widens", async () => {
    const el = await placed();
    const before = bubble(el);
    await resize(PHONE);
    await resize(DESKTOP);
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    // The launcher comes back with it: it is what the panel collapses into,
    // and the clamp on the way down is what would have lost its offset.
    expect(bubble(el).left).toBeCloseTo(before.left, 0);
    expect(bubble(el).top).toBeCloseTo(before.top, 0);
  });

  it("takes its spot back after a window that narrowed by way of the widths between", async () => {
    // How a desktop window actually narrows. Each width that cannot hold the
    // panel where it was put holds it further in, and the spot has to survive
    // all of them rather than be the last one held.
    const el = await placed();
    await resize({ width: 700, height: DESKTOP.height });
    const held = el.getBoundingClientRect();
    expect(held.right).toBeLessThanOrEqual(700 - 8 + 0.5);
    expect(held.left).toBeLessThan(376);
    await resize(PHONE);
    expectFullBleed(el);
    await resize(DESKTOP);
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
  });

  it("does not store what the phone or a narrower window made of the spot", async () => {
    const el = await placed();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    expect(stored).not.toBeNull();
    await resize({ width: 700, height: DESKTOP.height });
    await resize(PHONE);
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
    el.remove();
    const again = chat({ "data-start-open": "" });
    await frames();
    expectFullBleed(again);
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
    await resize(DESKTOP);
    expect(again.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(again.getBoundingClientRect().top).toBeCloseTo(96, 0);
  });

  it("goes full-bleed and comes back when only the launcher was dragged", async () => {
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    const home = bubble(el);
    await drag(part(el, ".launcher"), 500 - home.left, 300 - home.top);
    expect(bubble(el).left).toBeCloseTo(500, 0);
    expect(bubble(el).top).toBeCloseTo(300, 0);
    await resize(PHONE);
    expectBubbleOnScreen(el);
    el.setCollapsed(false);
    await frames();
    expectFullBleed(el);
    await resize(DESKTOP);
    el.setCollapsed(true);
    await frames();
    expect(bubble(el).left).toBeCloseTo(500, 0);
    expect(bubble(el).top).toBeCloseTo(300, 0);
  });

  it("keeps a launcher dragged on the phone where it was dropped", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    const home = bubble(el);
    // From where it stands: a drag starting anywhere else makes the bubble
    // leap under the finger.
    await drag(part(el, ".launcher"), 120 - home.left, 300 - home.top);
    expect(bubble(el).left).toBeCloseTo(120, 0);
    expect(bubble(el).top).toBeCloseTo(300, 0);
    el.setCollapsed(false);
    await frames();
    expectFullBleed(el);
    el.setCollapsed(true);
    await frames();
    expect(bubble(el).left).toBeCloseTo(120, 0);
    expect(bubble(el).top).toBeCloseTo(300, 0);
    // A second drag starts from there as well, after the panel has been open.
    await drag(part(el, ".launcher"), 40, 40);
    expect(bubble(el).left).toBeCloseTo(160, 0);
    expect(bubble(el).top).toBeCloseTo(340, 0);
  });

  it("drags a launcher the narrowing held in from where it now stands", async () => {
    // The spot stays as stated for a wider window to give back. The bubble on
    // screen is where a press finds it, and a drag measured from the stated
    // spot would make it leap.
    const el = await placed();
    el.setCollapsed(true);
    await frames();
    await resize(PHONE);
    const held = bubble(el);
    await drag(part(el, ".launcher"), -40, -40);
    expect(bubble(el).left).toBeCloseTo(held.left - 40, 0);
    expect(bubble(el).top).toBeCloseTo(held.top - 40, 0);
  });

  it("drags the panel from where a narrower window holds it, and that becomes the spot", async () => {
    const el = await placed();
    await resize({ width: 700, height: DESKTOP.height });
    const held = el.getBoundingClientRect();
    await drag(part(el, ".header"), -30, 20);
    expect(el.getBoundingClientRect().left).toBeCloseTo(held.left - 30, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(held.top + 20, 0);
    await resize(DESKTOP);
    expect(el.getBoundingClientRect().left).toBeCloseTo(held.left - 30, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(held.top + 20, 0);
  });

  it("gives back an undone move as the spot, on a phone full-bleed", async () => {
    const el = await placed();
    el.moveTo("top-left", { announce: true });
    await frames();
    expect(el.getBoundingClientRect().left).not.toBeCloseTo(376, 0);
    await resize(PHONE);
    const undo = el.shadowRoot?.querySelector<HTMLButtonElement>(".run-notice-undo");
    expect(undo).toBeTruthy();
    undo?.click();
    await frames();
    expectFullBleed(el);
    await resize(DESKTOP);
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
  });

  it("puts a stored spot back after a move undone on a fresh mount", async () => {
    // The spot came from storage here, not from a gesture this element saw, and
    // undoing the move has to leave that record standing.
    const first = await placed();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    first.remove();
    const el = chat({ "data-start-open": "" });
    await frames();
    el.moveTo("top-left", { announce: true });
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).not.toBe(stored);
    part(el, ".run-notice-undo").click();
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
  });

  it("forgets the move once undone back to no spot at all", async () => {
    // Nothing had been stated, so the next viewport change must have nothing to
    // re-apply: the record of the undone move would otherwise take the panel
    // back to the corner the user just rejected.
    const el = chat({ "data-start-open": "" });
    await frames();
    const home = el.getBoundingClientRect();
    el.moveTo("top-left", { announce: true });
    await frames();
    part(el, ".run-notice-undo").click();
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
    await resize({ width: 1200, height: DESKTOP.height });
    expect(el.getBoundingClientRect().right).toBeCloseTo(home.right - (DESKTOP.width - 1200), 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(home.bottom, 0);
  });

  describe("a host that fills a wide window through its own sizing", () => {
    const WIDE = { width: 1200, height: 760 };

    function fill(el: AgUiChat, top = "0px"): void {
      el.style.setProperty("--ag-ui-viewport-inset-top", top);
      el.style.setProperty("--ag-ui-width", "100vw");
      el.style.setProperty("--ag-ui-height", `calc(100vh - ${top})`);
      el.style.setProperty("--ag-ui-max-width", "100vw");
      el.style.setProperty("--ag-ui-max-height", "100vh");
    }

    function unfill(el: AgUiChat): void {
      for (const token of [
        "--ag-ui-viewport-inset-top",
        "--ag-ui-width",
        "--ag-ui-height",
        "--ag-ui-max-width",
        "--ag-ui-max-height",
      ]) {
        el.style.removeProperty(token);
      }
    }

    function expectFills(el: AgUiChat, size: { width: number; height: number }): void {
      const box = el.getBoundingClientRect();
      expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, size.width, size.height]);
    }

    it("stands at 0,0 after a window resize, and the spot waits for its size to drop", async () => {
      const el = await placed();
      const stored = localStorage.getItem(LAUNCHER_KEY);
      fill(el);
      await resize(WIDE);
      expectFills(el, WIDE);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
      // The report tells the truth about what is on the screen.
      const report = el.describeSurface();
      expect(report.fullBleed).toBe(true);
      expect(report.movable).toBe(false);
      expect(report.draggable).toBe(true);
      expect(report.box).toEqual({ left: 0, top: 0, width: WIDE.width, height: WIDE.height });
      expect(report.viewport).toEqual({ left: 0, top: 0, width: WIDE.width, height: WIDE.height });

      unfill(el);
      await resize(DESKTOP);
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
      expect(el.describeSurface().fullBleed).toBe(false);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
    });

    it("keeps the launcher on the screen behind it", async () => {
      const el = await placed();
      fill(el);
      await resize(WIDE);
      el.setCollapsed(true);
      await frames();
      const at = bubble(el);
      expect(at.left).toBeGreaterThanOrEqual(8 - 0.5);
      expect(at.top).toBeGreaterThanOrEqual(8 - 0.5);
      expect(at.right).toBeLessThanOrEqual(WIDE.width - 8 + 0.5);
      expect(at.bottom).toBeLessThanOrEqual(WIDE.height - 8 + 0.5);
    });

    it("stands at the start of the room the host left free", async () => {
      const el = await placed();
      fill(el, "56px");
      await resize(WIDE);
      const box = el.getBoundingClientRect();
      expect([box.left, box.top, box.width, box.height]).toEqual([0, 56, WIDE.width, 704]);
    });

    // One edge each, because a resting inset that hangs the box off any one of
    // them is the case, and a chain of four conditions is one branch to coverage.
    it.each([
      ["left", "0 24px auto auto"],
      ["top", "auto 0 24px auto"],
      ["right", "0 auto auto 24px"],
      ["bottom", "24px auto auto 0"],
    ])("comes in off the %s edge a host's own inset hangs it past", async (_edge, inset) => {
      const rule = document.createElement("style");
      rule.textContent = `#${ID} { --ag-ui-inset: ${inset}; }`;
      document.body.appendChild(rule);
      const el = await placed();
      fill(el);
      await resize(WIDE);
      expectFills(el, WIDE);
    });

    it("leaves a host's own rule alone once it already stands the box on the screen", async () => {
      const rule = document.createElement("style");
      rule.textContent = `#${ID} { --ag-ui-inset: 0 auto auto 0; }`;
      document.body.appendChild(rule);
      const el = await placed();
      fill(el);
      await resize(WIDE);
      expectFills(el, WIDE);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    });
  });

  describe("a host that fills the room it left free beside chrome it reserved", () => {
    const WIDE = { width: 1200, height: 760 };
    type Sides = { left?: number; top?: number; right?: number; bottom?: number };

    /** The panel as large as the usable box the tokens leave, and nothing else. */
    function fillUsable(el: AgUiChat, sides: Sides): void {
      const { left = 0, top = 0, right = 0, bottom = 0 } = sides;
      for (const [side, value] of Object.entries({ left, top, right, bottom })) {
        el.style.setProperty(`--ag-ui-viewport-inset-${side}`, `${value}px`);
      }
      const width = `calc(100vw - ${left + right}px)`;
      const height = `calc(100vh - ${top + bottom}px)`;
      el.style.setProperty("--ag-ui-width", width);
      el.style.setProperty("--ag-ui-max-width", width);
      el.style.setProperty("--ag-ui-height", height);
      el.style.setProperty("--ag-ui-max-height", height);
    }

    function restAt(inset: string): void {
      const rule = document.createElement("style");
      rule.textContent = `#${ID} { --ag-ui-inset: ${inset}; }`;
      document.body.appendChild(rule);
    }

    // The usable box begins and ends where the tokens say, and the screen where the
    // window does. A box past the usable box's near edge hangs off it; one past its
    // far edge but inside the screen does not, because a keyboard shortens the first
    // and pans the panel down inside the second.
    it.each([
      ["left", { left: 100 }, "0 24px auto auto", [100, 0, 1100, 760], "0px auto auto 100px"],
      ["top", { top: 56 }, "32px 0 auto auto", [0, 56, 1200, 704], "56px auto auto 0px"],
    ] as const)(
      "stands at the start of the usable box when the %s edge hangs off it",
      async (_edge, sides, rest, box, inset) => {
        restAt(rest);
        const el = chat({ "data-start-open": "" });
        await frames();
        fillUsable(el, sides);
        await resize(WIDE);
        const at = el.getBoundingClientRect();
        expect([at.left, at.top, at.width, at.height]).toEqual(box);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(inset);
      },
    );

    it.each([
      ["right", { right: 100 }, "0 0 auto auto", [100, 0, 1100, 760]],
      ["bottom", { bottom: 100 }, "100px 0 auto auto", [0, 100, 1200, 660]],
    ] as const)(
      "leaves a box that stands past the usable %s edge but inside the screen",
      async (_edge, sides, rest, box) => {
        restAt(rest);
        const el = chat({ "data-start-open": "" });
        await frames();
        fillUsable(el, sides);
        await resize(WIDE);
        const at = el.getBoundingClientRect();
        expect([at.left, at.top, at.width, at.height]).toEqual(box);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      },
    );

    it("stands a spot kept from the far corner at the start of the usable box", async () => {
      const el = chat({ "data-start-open": "" });
      await frames();
      const box = el.getBoundingClientRect();
      await drag(part(el, ".header"), 700 - box.left, 400 - box.top);
      expect(el.getBoundingClientRect().left).toBeCloseTo(700, 0);
      fillUsable(el, { left: 100, top: 56 });
      await resize(WIDE);
      const at = el.getBoundingClientRect();
      expect([at.left, at.top, at.width, at.height]).toEqual([100, 56, 1100, 704]);
    });

    it("counts a box a fraction of a pixel past the screen as on it", async () => {
      restAt("0 auto auto 0");
      const el = chat({ "data-start-open": "" });
      await frames();
      el.style.setProperty("--ag-ui-width", "calc(100vw + 0.3px)");
      el.style.setProperty("--ag-ui-max-width", "calc(100vw + 0.3px)");
      el.style.setProperty("--ag-ui-height", "100vh");
      el.style.setProperty("--ag-ui-max-height", "100vh");
      await resize(WIDE);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    });
  });

  describe("a corner panel with no spot", () => {
    /** Motion off and open, with a grip pulled on an edge the layout holds. */
    async function gripped(attrs: Record<string, string> = {}): Promise<AgUiChat> {
      const el = chat({ "data-start-open": "", ...attrs });
      await frames();
      await drag(part(el, ".resize-handle--bottom-right"), -40, -30);
      expect(el.style.getPropertyValue("--ag-ui-inset")).not.toBe("");
      return el;
    }

    it("goes full-bleed on a phone when only a grip placed it, and widening gives that back", async () => {
      const el = await gripped();
      const grown = el.getBoundingClientRect();
      await resize(PHONE);
      expectFullBleed(el);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      await resize(DESKTOP);
      const back = el.getBoundingClientRect();
      expect(back.left).toBeCloseTo(grown.left, 0);
      expect(back.top).toBeCloseTo(grown.top, 0);
      expect(back.width).toBeCloseTo(grown.width, 0);
      expect(back.height).toBeCloseTo(grown.height, 0);
    });

    it("keeps its launcher on the screen and stays full-bleed through a reopen", async () => {
      const el = await gripped();
      await resize(PHONE);
      el.setCollapsed(true);
      await frames();
      // At the panel's corner, where an unmoved one rests, rather than held off
      // the edges as a dragged one is.
      const at = bubble(el);
      expect(at.left).toBeGreaterThanOrEqual(0);
      expect(at.top).toBeGreaterThanOrEqual(0);
      expect(at.right).toBeLessThanOrEqual(PHONE.width);
      expect(at.bottom).toBeLessThanOrEqual(PHONE.height);
      el.setCollapsed(false);
      await frames();
      expectFullBleed(el);
    });

    it("leaves an inset the host wrote inline where the host wrote it, phone or not", async () => {
      const el = chat({ "data-start-open": "" });
      el.style.setProperty("--ag-ui-inset", "56px 0 0 0");
      await frames();
      await resize(PHONE);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("56px 0 0 0");
      expect(el.getBoundingClientRect().top).toBeCloseTo(56, 0);
      await resize(DESKTOP);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("56px 0 0 0");
    });

    it("stands at 0,0 when a host fills a wide window, and rests again when it stops", async () => {
      const el = chat({ "data-start-open": "" });
      await frames();
      const home = el.getBoundingClientRect();
      const sized = {
        "--ag-ui-width": "100vw",
        "--ag-ui-height": "100vh",
        "--ag-ui-max-width": "100vw",
        "--ag-ui-max-height": "100vh",
      };
      for (const [token, value] of Object.entries(sized)) {
        el.style.setProperty(token, value);
      }
      await resize({ width: 1200, height: 760 });
      const box = el.getBoundingClientRect();
      expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, 1200, 760]);
      expect(el.describeSurface().box).toEqual({ left: 0, top: 0, width: 1200, height: 760 });
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();

      for (const token of Object.keys(sized)) {
        el.style.removeProperty(token);
      }
      await resize(DESKTOP);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.getBoundingClientRect().left).toBeCloseTo(home.left, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(home.top, 0);
    });

    it("puts the grip's place back, not the resting one, when a host's fill stops", async () => {
      const el = await gripped();
      const grown = el.getBoundingClientRect();
      el.resetSize();
      await frames();
      const reset = el.getBoundingClientRect();
      for (const token of ["--ag-ui-width", "--ag-ui-max-width"]) {
        el.style.setProperty(token, "100vw");
      }
      for (const token of ["--ag-ui-height", "--ag-ui-max-height"]) {
        el.style.setProperty(token, "100vh");
      }
      await resize({ width: 1200, height: 760 });
      expect(el.getBoundingClientRect().left).toBe(0);
      expect(el.getBoundingClientRect().top).toBe(0);
      for (const token of [
        "--ag-ui-width",
        "--ag-ui-max-width",
        "--ag-ui-height",
        "--ag-ui-max-height",
      ]) {
        el.style.removeProperty(token);
      }
      await resize(DESKTOP);
      expect(el.getBoundingClientRect().right).toBeCloseTo(reset.right, 0);
      expect(el.getBoundingClientRect().bottom).toBeCloseTo(grown.bottom, 0);
    });

    describe("a fill that has stopped", () => {
      const WIDE = { width: 1200, height: 760 };
      const SIZED = {
        "--ag-ui-width": "100vw",
        "--ag-ui-height": "100vh",
        "--ag-ui-max-width": "100vw",
        "--ag-ui-max-height": "100vh",
      };

      /** Filling a wide window, and the inset that stood the panel at the start of it. */
      async function filling(): Promise<{
        el: AgUiChat;
        fillInset: string;
        anchor: string | null;
      }> {
        const el = chat({ "data-start-open": "" });
        await frames();
        const anchor = el.getAttribute("data-resize-anchor");
        for (const [token, value] of Object.entries(SIZED)) {
          el.style.setProperty(token, value);
        }
        await resize(WIDE);
        const fillInset = el.style.getPropertyValue("--ag-ui-inset");
        expect(fillInset).not.toBe("");
        return { el, fillInset, anchor };
      }

      function stop(el: AgUiChat): void {
        for (const token of Object.keys(SIZED)) {
          el.style.removeProperty(token);
        }
      }

      it("measures the edges the layout holds again once the panel rests", async () => {
        const { el, anchor } = await filling();
        expect(el.getAttribute("data-resize-anchor")).not.toBe(anchor);
        stop(el);
        await resize(DESKTOP);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
        expect(el.getAttribute("data-resize-anchor")).toBe(anchor);
      });

      it("takes an inset the host then writes, spelled as the fill's was, to be the host's", async () => {
        const { el, fillInset } = await filling();
        stop(el);
        await resize(DESKTOP);
        el.style.setProperty("--ag-ui-inset", fillInset);
        await resize(PHONE);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(fillInset);
      });

      it("forgets the fill when the host states an inset of its own as the fill stops", async () => {
        const { el, fillInset } = await filling();
        stop(el);
        el.style.setProperty("--ag-ui-inset", "40px 40px auto auto");
        await resize(DESKTOP);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("40px 40px auto auto");
        el.style.setProperty("--ag-ui-inset", fillInset);
        await resize(PHONE);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(fillInset);
      });
    });
  });

  describe("data-launcher-drag turned to false on a moved panel", () => {
    /** Where the host's CSS rests a default corner panel at this window. */
    function expectAtRest(el: AgUiChat, size: { width: number; height: number }): void {
      const box = el.getBoundingClientRect();
      expect(box.right).toBeCloseTo(size.width - 24, 0);
      expect(box.bottom).toBeCloseTo(size.height - 24, 0);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
    }

    it("leaves an inset the host wrote inline where it is, with nothing of the element's own", async () => {
      const el = chat({ "data-start-open": "", "data-launcher-drag": "false" });
      el.style.setProperty("--ag-ui-inset", "56px 0 0 0");
      await frames();
      await resize({ width: 1200, height: 760 });
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("56px 0 0 0");
      expect(el.getBoundingClientRect().top).toBeCloseTo(56, 0);
    });

    it("records nothing for a header drag the attribute stopped half way", async () => {
      const el = chat({ "data-start-open": "" });
      await frames();
      const header = part(el, ".header").getBoundingClientRect();
      const x = header.left + header.width / 2;
      const y = header.top + header.height / 2;
      part(el, ".header").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
      );
      el.setAttribute("data-launcher-drag", "false");
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 200, clientY: y - 150 }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 200, clientY: y - 150 }));
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
    });

    it("does nothing until the next restore, which hands the panel to the host's CSS", async () => {
      const el = await placed();
      const stored = localStorage.getItem(LAUNCHER_KEY);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      // Nothing watches the attribute, and it is not a reason for a panel to jump.
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.describeSurface().movable).toBe(false);

      await resize({ width: 1200, height: 760 });
      expectAtRest(el, { width: 1200, height: 760 });
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
    });

    it("stays where it is while the reader types, and rests at the next resize", async () => {
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      const transcript = part(el, ".messages").getBoundingClientRect().height;
      const input = part(el, "textarea") as HTMLTextAreaElement;
      input.value = "one\ntwo\nthree\nfour";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      await frames();
      // The keystroke has to have reached the observer, or this proves nothing.
      expect(part(el, ".messages").getBoundingClientRect().height).toBeLessThan(transcript);
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);

      await resize({ width: 1200, height: 760 });
      expectAtRest(el, { width: 1200, height: 760 });
    });

    it("stays where it is when a viewport inset token changes", async () => {
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      el.style.setProperty("--ag-ui-viewport-inset-top", "40px");
      await frames();
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    });

    it("goes full-bleed on a phone", async () => {
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await resize(PHONE);
      expectFullBleed(el);
    });

    it("stands at 0,0 when a host then fills the window, with no resize", async () => {
      const el = await placed();
      const stored = localStorage.getItem(LAUNCHER_KEY);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      for (const token of ["--ag-ui-width", "--ag-ui-max-width"]) {
        el.style.setProperty(token, "100vw");
      }
      for (const token of ["--ag-ui-height", "--ag-ui-max-height"]) {
        el.style.setProperty(token, "100vh");
      }
      await frames();
      const box = el.getBoundingClientRect();
      expect([box.left, box.top, box.width, box.height]).toEqual([
        0,
        0,
        DESKTOP.width,
        DESKTOP.height,
      ]);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);

      // The fill going is a layout change too, and there is nothing left to wait for.
      for (const token of [
        "--ag-ui-width",
        "--ag-ui-max-width",
        "--ag-ui-height",
        "--ag-ui-max-height",
      ]) {
        el.style.removeProperty(token);
      }
      await frames();
      expectAtRest(el, DESKTOP);
    });

    it("hands back when a host's width alone pushes the panel off an edge", async () => {
      // A panel a host only widened covers nothing, and its header is still cut off.
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      el.style.setProperty("--ag-ui-width", "900px");
      el.style.setProperty("--ag-ui-max-width", "900px");
      await frames();
      expect(el.getBoundingClientRect().width).toBe(900);
      expectAtRest(el, DESKTOP);
    });

    it("stays where it is when a host's size still fits the window", async () => {
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      const right = el.getBoundingClientRect().right;
      el.style.setProperty("--ag-ui-width", "500px");
      await frames();
      expect(el.getBoundingClientRect().width).toBe(500);
      expect(el.getBoundingClientRect().right).toBeCloseTo(right, 0);
    });

    it("stays where it is under a viewport inset token that reaches past its top", async () => {
      // Under chrome the host reserved is not off the screen: it is what this
      // attribute has always left to the next resize or reopen.
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      el.style.setProperty("--ag-ui-viewport-inset-top", "120px");
      await frames();
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    });

    it("takes the spot back when the attribute comes off, from the stored record", async () => {
      const el = await placed();
      el.setAttribute("data-launcher-drag", "false");
      await resize(PHONE);
      await resize(DESKTOP);
      expectAtRest(el, DESKTOP);

      el.removeAttribute("data-launcher-drag");
      await resize({ width: DESKTOP.width - 10, height: DESKTOP.height });
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    });
  });

  describe("a docked panel a host fills", () => {
    const WIDE = { width: 1200, height: 760 };
    const DOCK_KEY = `ag-ui-chat:dock:${ID}`;
    const TOKENS = ["--ag-ui-width", "--ag-ui-height", "--ag-ui-max-width", "--ag-ui-max-height"];

    function fill(el: AgUiChat): void {
      el.style.setProperty("--ag-ui-width", "100vw");
      el.style.setProperty("--ag-ui-height", "100vh");
      el.style.setProperty("--ag-ui-max-width", "none");
      el.style.setProperty("--ag-ui-max-height", "none");
    }

    function unfill(el: AgUiChat): void {
      for (const token of TOKENS) {
        el.style.removeProperty(token);
      }
    }

    function expectFills(el: AgUiChat, size: { width: number; height: number }): void {
      const box = el.getBoundingClientRect();
      expect([box.left, box.top, box.width, box.height]).toEqual([0, 0, size.width, size.height]);
      // The controls a panel standing above the window took out of reach.
      expect(part(el, ".header").getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
    }

    /** Open on its dock, and dragged off it to [376, 96] when asked to be. */
    async function docked(
      collapseTo: string,
      moved: boolean,
      attrs: Record<string, string> = {},
    ): Promise<AgUiChat> {
      const el = chat({ "collapse-to": collapseTo, "data-start-open": "", ...attrs });
      await frames();
      if (moved) {
        const box = el.getBoundingClientRect();
        await drag(part(el, ".header"), 376 - box.left, 96 - box.top);
        expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
        expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
      }
      return el;
    }

    describe.each(["bar", "none"])('under collapse-to="%s"', (collapseTo) => {
      it("stands at 0,0 unmoved, and goes back on its dock when the fill stops", async () => {
        const el = await docked(collapseTo, false);
        const home = el.getBoundingClientRect();
        fill(el);
        await resize(WIDE);
        expectFills(el, WIDE);
        expect(el.describeSurface().box).toEqual({ left: 0, top: 0, ...WIDE });
        expect(el.describeSurface().movable).toBe(false);
        expect(localStorage.getItem(DOCK_KEY)).toBeNull();

        unfill(el);
        await resize(DESKTOP);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
        expect(el.getBoundingClientRect().left).toBeCloseTo(home.left, 0);
        expect(el.getBoundingClientRect().top).toBeCloseTo(home.top, 0);
        expect(localStorage.getItem(DOCK_KEY)).toBeNull();
      });

      it("stands at 0,0 moved, keeps the stored spot, and takes it back", async () => {
        const el = await docked(collapseTo, true);
        const stored = localStorage.getItem(DOCK_KEY);
        expect(stored).not.toBeNull();
        fill(el);
        await resize(WIDE);
        expectFills(el, WIDE);
        expect(localStorage.getItem(DOCK_KEY)).toBe(stored);

        unfill(el);
        await resize(DESKTOP);
        expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
        expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
        expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
      });

      it("follows a fill that comes and goes with no resize", async () => {
        const el = await docked(collapseTo, false);
        const home = el.getBoundingClientRect();
        fill(el);
        await frames();
        expectFills(el, DESKTOP);
        unfill(el);
        await frames();
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
        expect(el.getBoundingClientRect().left).toBeCloseTo(home.left, 0);
        expect(el.getBoundingClientRect().top).toBeCloseTo(home.top, 0);
      });

      it.each([
        ["moved", true],
        ["unmoved", false],
      ])("stands at 0,0 %s under data-launcher-drag=false", async (_name, moved) => {
        const el = await docked(collapseTo, moved);
        const stored = localStorage.getItem(DOCK_KEY);
        el.setAttribute("data-launcher-drag", "false");
        await frames();
        fill(el);
        await frames();
        expectFills(el, DESKTOP);
        expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
      });
    });

    it("keeps a moved panel where it is under the attribute until it would hang off", async () => {
      const el = await docked("bar", true);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      const right = el.getBoundingClientRect().right;
      el.style.setProperty("--ag-ui-width", "500px");
      await frames();
      expect(el.getBoundingClientRect().width).toBe(500);
      expect(el.getBoundingClientRect().right).toBeCloseTo(right, 0);
    });

    it("takes its spot back from the record once the attribute comes off", async () => {
      const el = await docked("bar", true);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      fill(el);
      await frames();
      expectFills(el, DESKTOP);
      unfill(el);
      await frames();
      // Handed back, so it rests on its dock until then.
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      el.removeAttribute("data-launcher-drag");
      await resize(WIDE);
      expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
    });

    it("stands on its dock through a grip once it has been handed back", async () => {
      const el = await docked("bar", true);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      fill(el);
      await frames();
      unfill(el);
      await frames();
      const home = el.getBoundingClientRect();
      await drag(part(el, ".resize-handle--bottom-right"), -40, -30);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.getBoundingClientRect().right).toBeCloseTo(home.right, 0);
      expect(el.getBoundingClientRect().bottom).toBeCloseTo(home.bottom, 0);
    });

    it("rests on its dock when the attribute went on while it filled the window", async () => {
      const el = await docked("bar", true);
      fill(el);
      await frames();
      expectFills(el, DESKTOP);
      el.setAttribute("data-launcher-drag", "false");
      await frames();
      unfill(el);
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.getBoundingClientRect().right).toBeCloseTo(DESKTOP.width - 24, 0);
    });

    it.each([
      ["unmoved", false],
      ["moved", true],
    ])("takes the bar away while the panel fills, %s, as a phone does", async (_name, moved) => {
      const el = await docked("bar", moved);
      const bar = part(el, ".dock-bar");
      const height = el.barHeight;
      expect(height).toBeGreaterThan(0);
      fill(el);
      await frames();
      expectFills(el, DESKTOP);
      expect(getComputedStyle(bar).display).toBe("none");
      expect(el.barHeight).toBe(0);
      // What the strip took: a press on the composer's foot landed on the bar.
      const send = part(el, ".send");
      const at = send.getBoundingClientRect();
      const hit = el.shadowRoot?.elementFromPoint(at.left + at.width / 2, at.top + at.height / 2);
      expect(hit === send || send.contains(hit as Node)).toBe(true);

      // Collapsed, it is the way back, with the panel's size still the host's.
      el.setCollapsed(true);
      await frames();
      expect(getComputedStyle(bar).display).toBe("flex");
      expect(bar.getBoundingClientRect().bottom).toBeCloseTo(DESKTOP.height, 0);
      expect(el.barHeight).toBe(height);
      el.setCollapsed(false);
      await frames();
      expect(getComputedStyle(bar).display).toBe("none");
      expectFills(el, DESKTOP);

      unfill(el);
      await frames();
      expect(getComputedStyle(bar).display).toBe("flex");
      expect(el.barHeight).toBe(height);
      expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        bar.getBoundingClientRect().top,
      );
    });

    it("keeps the bar while the panel does not fill the window", async () => {
      const el = await docked("bar", false);
      el.style.setProperty("--ag-ui-width", "100vw");
      el.style.setProperty("--ag-ui-max-width", "none");
      await frames();
      expect(getComputedStyle(part(el, ".dock-bar")).display).toBe("flex");
    });

    it("rests where the corner does once a live switch has taken the dock away", async () => {
      const el = await docked("bar", false);
      fill(el);
      await frames();
      expectFills(el, DESKTOP);
      el.removeAttribute("collapse-to");
      await frames();
      expectFills(el, DESKTOP);
      unfill(el);
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      const box = el.getBoundingClientRect();
      expect(box.right).toBeCloseTo(DESKTOP.width - 24, 0);
      expect(box.bottom).toBeCloseTo(DESKTOP.height - 24, 0);
    });

    it("leaves an inset the host wrote inline where the host wrote it", async () => {
      const el = await docked("bar", false);
      el.style.setProperty("--ag-ui-inset", "56px 0 0 0");
      fill(el);
      await resize(WIDE);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("56px 0 0 0");
      unfill(el);
      await resize(DESKTOP);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("56px 0 0 0");
    });

    it.each([
      ["moved", true],
      ["unmoved", false],
    ])(
      "leaves a host's own rule alone when it stands the box on the screen, %s",
      async (_name, moved) => {
        const rule = document.createElement("style");
        rule.textContent = `#${ID} { --ag-ui-inset: 0 auto auto 0; }`;
        document.body.appendChild(rule);
        const el = await docked("bar", moved);
        fill(el);
        await resize(WIDE);
        expectFills(el, WIDE);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      },
    );

    it("leaves a placement that owns its position to the host's own rule", async () => {
      // A side panel under the bar is docked and does not move, so the host's rule
      // that hangs it is the host's to answer for, as it is with no dock at all.
      const rule = document.createElement("style");
      rule.textContent = `#${ID} { --ag-ui-inset: 0 24px 0 auto; }`;
      document.body.appendChild(rule);
      const el = await docked("bar", false, { placement: "side" });
      fill(el);
      await resize(WIDE);
      expect(el.getBoundingClientRect().left).toBeCloseTo(-24, 0);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(getComputedStyle(part(el, ".dock-bar")).display).toBe("flex");
    });

    it("stays the screen on a phone, with nothing inline", async () => {
      const el = await docked("bar", false);
      fill(el);
      await resize(PHONE);
      expectFullBleed(el);
    });
  });

  describe("a panel the reader cannot move", () => {
    it.each(["sidebar", "side", "page"])(
      "stays put under a header drag as a %s",
      async (placement) => {
        const el = chat({ "data-start-open": "", placement });
        await frames();
        const before = el.getBoundingClientRect();
        await drag(part(el, ".header"), -200, 100);
        expect(el.getBoundingClientRect().left).toBeCloseTo(before.left, 0);
        expect(el.getBoundingClientRect().top).toBeCloseTo(before.top, 0);
        expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
        expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      },
    );

    it("is left to its own layout when a host's size reaches past the room it reserved", async () => {
      // The panel owns its place, so a size that hangs it off the usable box is the
      // host's to answer for, and nothing stands it at the start of that box.
      const el = chat({ "data-start-open": "", placement: "sidebar" });
      el.style.setProperty("--ag-ui-viewport-inset-left", "100px");
      el.style.setProperty("--ag-ui-width", "100vw");
      el.style.setProperty("--ag-ui-max-width", "none");
      await resize({ width: 1200, height: 760 });
      expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    });
  });

  describe("a docked panel's spot, kept by the element and by the store", () => {
    const DOCK_KEY = `ag-ui-chat:dock:${ID}`;
    const SPOT = { left: 376, top: 96 };

    function dockedChat(attrs: Record<string, string> = {}): AgUiChat {
      return chat({ "collapse-to": "bar", "data-start-open": "", ...attrs });
    }

    async function dragTo(el: AgUiChat, to: { left: number; top: number }): Promise<void> {
      const box = el.getBoundingClientRect();
      await drag(part(el, ".header"), to.left - box.left, to.top - box.top);
    }

    it("keeps a spot the store refused, and holds it inside a narrower window", async () => {
      const refuse = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("denied");
      });
      try {
        const el = dockedChat();
        await frames();
        await dragTo(el, SPOT);
        expect(localStorage.getItem(DOCK_KEY)).toBeNull();
        await resize({ width: 700, height: 800 });
        const box = el.getBoundingClientRect();
        expect(box.right).toBeLessThanOrEqual(700);
        // Held where it was put rather than put back on the bar, whose place is the
        // bottom of the window.
        expect(box.top).toBeCloseTo(SPOT.top, 0);
      } finally {
        refuse.mockRestore();
      }
    });

    it("does not stand a corner panel at the spot a dock stored", async () => {
      const first = dockedChat();
      await frames();
      await dragTo(first, SPOT);
      expect(localStorage.getItem(DOCK_KEY)).not.toBeNull();
      first.remove();

      const el = chat({ "data-start-open": "" });
      await frames();
      const box = el.getBoundingClientRect();
      expect(box.right).toBeCloseTo(DESKTOP.width - 24, 0);
      expect(box.bottom).toBeCloseTo(DESKTOP.height - 24, 0);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    });

    it("holds a stored spot above the bar it was stored under", async () => {
      localStorage.setItem(DOCK_KEY, JSON.stringify({ left: 700, top: 760 }));
      const el = dockedChat();
      await frames();
      const box = el.getBoundingClientRect();
      expect(box.left).toBeCloseTo(700, 0);
      expect(box.bottom).toBeLessThanOrEqual(part(el, ".dock-bar").getBoundingClientRect().top);
    });

    it("writes a restored spot from the corner the dock holds still", async () => {
      localStorage.setItem(DOCK_KEY, JSON.stringify(SPOT));
      const el = dockedChat({ placement: "bottom-left" });
      await frames();
      expect(el.getAttribute("data-resize-anchor")).toBe("bottom-left");
      expect(el.style.getPropertyValue("--ag-ui-inset")).toMatch(/^auto auto \d+px \d+px$/);
      expect(el.getBoundingClientRect().left).toBeCloseTo(SPOT.left, 0);
    });

    it("resizes a spot restored from the store as it does one dragged in this session", async () => {
      const first = dockedChat();
      await frames();
      await dragTo(first, SPOT);
      const stored = localStorage.getItem(DOCK_KEY) as string;
      await drag(part(first, ".resize-handle--bottom-right"), -40, -30);
      const resized = first.getBoundingClientRect();
      first.remove();

      // The size the pull stored is the first panel's; this one starts from its own.
      localStorage.removeItem(`ag-ui-chat:size:${ID}`);
      sessionStorage.removeItem(`ag-ui-chat:size:${ID}`);
      localStorage.setItem(DOCK_KEY, stored);
      const el = dockedChat();
      await frames();
      expect(el.getBoundingClientRect().left).toBeCloseTo(SPOT.left, 0);
      await drag(part(el, ".resize-handle--bottom-right"), -40, -30);
      const again = el.getBoundingClientRect();
      expect([again.left, again.top, again.width, again.height].map(Math.round)).toEqual(
        [resized.left, resized.top, resized.width, resized.height].map(Math.round),
      );
    });
  });

  it("holds a launcher moved by a key through an expand before the key comes up", async () => {
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    const launcher = part(el, ".launcher");
    // A spot already stated, which is what the expand would otherwise go back to.
    await drag(launcher, -300, -200);
    const dropped = bubble(el);
    launcher.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    const moved = bubble(el);
    expect(moved.left).toBeLessThan(dropped.left);
    el.setCollapsed(false);
    await frames();
    el.setCollapsed(true);
    await frames();
    expect(bubble(el).left).toBeCloseTo(moved.left, 0);
    expect(bubble(el).top).toBeCloseTo(moved.top, 0);
  });

  it("leaves a placement that owns its position alone on a phone", async () => {
    // Without the launcher's gate the stored spot would stamp a corner and a
    // launcher inset on a sidebar that covers the screen here.
    localStorage.setItem(
      LAUNCHER_KEY,
      JSON.stringify({ left: 200, top: 200, panel: { left: 100, top: 100 } }),
    );
    await page.viewport(PHONE.width, PHONE.height);
    const el = chat({ placement: "sidebar", "data-start-open": "" });
    await frames();
    expect(el.getBoundingClientRect().width).toBe(PHONE.width);
    expect(el.hasAttribute("data-expand-corner")).toBe(false);
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
  });

  it("keeps the placed spot under data-small-viewport=off, where a phone is not the screen", async () => {
    const el = await placed({ "data-small-viewport": "off" });
    await resize({ width: 420, height: PHONE.height });
    expect(el.getBoundingClientRect().width).toBeLessThan(420);
    expect(el.style.getPropertyValue("--ag-ui-inset")).not.toBe("");
  });
});
