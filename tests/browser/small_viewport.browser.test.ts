import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
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
