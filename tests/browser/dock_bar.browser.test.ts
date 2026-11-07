import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * collapse-to="bar": the strip along the bottom edge, measured.
 *
 * Every number here is read from layout, because the bar's whole contract is
 * geometry the host builds on: where the strip sits, how tall it is (the host
 * pads its page by that), and where the panel stands above it. The element's
 * own state (what it stamps, what it dispatches) is in the happy-dom file.
 *
 * Motion is set to nothing on each chat, so a rect read after a frame is the
 * resting one and not a frame of the collapse morph.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const GUTTER = 24;

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("collapse-to", "bar");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.style.setProperty("--ag-ui-motion", "0s");
  document.body.appendChild(el);
  return el;
}

function part<T extends Element = HTMLElement>(el: AgUiChat, selector: string): T {
  const found = el.shadowRoot?.querySelector(selector);
  if (found === null || found === undefined) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found as T;
}

/** Two frames: one for the observer to report, one for the write to lay out. */
const settle = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

/** The element the user would hit at a point, looked up through the shadow root. */
function hit(el: AgUiChat, x: number, y: number): Element | null {
  return el.shadowRoot?.elementFromPoint(x, y) ?? null;
}

function centre(rect: DOMRect): [number, number] {
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

const screenHeight = (): number => document.documentElement.clientHeight;
const screenWidth = (): number => document.documentElement.clientWidth;

describe("the bottom bar (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("draws a strip along the whole bottom edge, and nothing in the corner", async () => {
    const el = mount();
    await settle();
    expect(el.collapsed).toBe(true);
    expect(el.getAttribute("data-collapsed-to")).toBe("bar");
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    expect(bar.left).toBe(0);
    expect(bar.width).toBe(screenWidth());
    expect(bar.bottom).toBe(screenHeight());
    expect(bar.height).toBeGreaterThanOrEqual(40);
    expect(bar.height).toBeLessThan(60);
    // The strip is what is pressed, at its right end.
    const strip = part(el, ".launcher").getBoundingClientRect();
    expect(strip.right).toBeGreaterThan(screenWidth() - 120);
    expect(hit(el, ...centre(strip))?.closest(".launcher")).not.toBeNull();
    expect(part(el, ".rail-label").textContent).toBe("Assistant");
    expect(getComputedStyle(part(el, ".rail-label")).display).toBe("block");
  });

  it("draws what data-collapsed-to names, and only that", async () => {
    // Under auto the corner launcher is a 56px round button; under the bar it
    // is the strip; over a sidebar the bar is ignored and the rail drawn.
    const corner = mount({ "collapse-to": "auto" });
    const docked = mount();
    const sidebar = mount({ placement: "sidebar", "data-start-open": "" });
    sidebar.setCollapsed(true);
    await settle();
    const round = part(corner, ".launcher").getBoundingClientRect();
    expect(round.width).toBe(round.height);
    expect(getComputedStyle(part(corner, ".dock-bar")).display).toBe("contents");
    expect(getComputedStyle(part(corner, ".bar-history")).display).toBe("none");
    const strip = part(docked, ".dock-bar").getBoundingClientRect();
    expect(strip.width).toBe(screenWidth());
    expect(getComputedStyle(part(docked, ".bar-history")).display).not.toBe("none");
    expect(sidebar.getAttribute("data-collapsed-to")).toBe("rail");
    expect(part(sidebar, ".launcher").getBoundingClientRect().height).toBe(screenHeight());
  });

  it("reports its height, and tells the host when the height changes", async () => {
    const heights: number[] = [];
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.addEventListener("ag-ui-bar-height", (event) => {
      heights.push((event as CustomEvent<{ height: number }>).detail.height);
    });
    document.body.appendChild(el);
    await settle();
    expect(el.barHeight).toBe(0);
    el.setAttribute("collapse-to", "bar");
    await settle();
    const bar = part(el, ".dock-bar");
    expect(el.barHeight).toBe(bar.offsetHeight);
    expect(el.barHeight).toBeGreaterThan(0);
    expect(heights).toEqual([el.barHeight]);
    // A larger font grows the strip; the host hears the new height.
    el.style.fontSize = "28px";
    await settle();
    expect(bar.offsetHeight).toBeGreaterThan(heights[0] ?? 0);
    expect(el.barHeight).toBe(bar.offsetHeight);
    expect(heights).toEqual([heights[0], bar.offsetHeight]);
    // And back to nothing when the bar goes.
    el.setAttribute("collapse-to", "auto");
    await settle();
    expect(el.barHeight).toBe(0);
    expect(heights.at(-1)).toBe(0);
  });

  it("raises the panel from the bar's right end, with the bar still there to minimise", async () => {
    const el = mount();
    await settle();
    el.setCollapsed(false);
    await settle();
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(panel.bottom).toBeCloseTo(bar.top - GUTTER, 0);
    expect(panel.right).toBeCloseTo(screenWidth() - GUTTER, 0);
    // The strip stays drawn and pressable beneath, and minimises.
    const strip = part<HTMLButtonElement>(el, ".launcher");
    expect(getComputedStyle(strip).visibility).toBe("visible");
    expect(getComputedStyle(strip).transform).toBe("none");
    expect(hit(el, ...centre(strip.getBoundingClientRect()))?.closest(".launcher")).toBe(strip);
    strip.click();
    expect(el.collapsed).toBe(true);
  });

  it("caps the panel at the viewport less the bar and one gutter", async () => {
    const el = mount({ "data-start-open": "" });
    el.style.setProperty("--ag-ui-height", "3000px");
    await settle();
    const panel = el.getBoundingClientRect();
    expect(panel.height).toBeCloseTo(screenHeight() - el.barHeight - GUTTER, 0);
    expect(panel.top).toBeCloseTo(0, 0);
  });

  it("keeps a column and a full-screen panel off the bar", async () => {
    for (const placement of ["side", "full"]) {
      const el = mount({ placement, "data-start-open": "" });
      await settle();
      const panel = el.getBoundingClientRect();
      const bar = part(el, ".dock-bar").getBoundingClientRect();
      expect(panel.bottom, placement).toBeCloseTo(bar.top, 0);
      expect(panel.top, placement).toBeCloseTo(0, 0);
      el.remove();
    }
  });

  it("keeps a left-hand chat on its side", async () => {
    const el = mount({ placement: "bottom-left", "data-start-open": "" });
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(GUTTER, 0);
    expect(part(el, ".launcher").getBoundingClientRect().left).toBeLessThan(120);
  });

  it("does not scale the strip under the pointer", async () => {
    const el = mount();
    await settle();
    const strip = part(el, ".launcher");
    await userEvent.hover(strip);
    expect(getComputedStyle(strip).transform).toBe("none");
  });

  it("opens the history as a popover over the bar, with the panel still away", async () => {
    const el = mount();
    await settle();
    part<HTMLButtonElement>(el, ".bar-history").click();
    await settle();
    expect(el.collapsed).toBe(true);
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    const list = part(el, ".drawer-panel").getBoundingClientRect();
    expect(list.bottom).toBeLessThanOrEqual(bar.top);
    expect(list.right).toBeCloseTo(screenWidth() - GUTTER, 0);
    expect(list.height).toBeGreaterThan(100);
    // Drawn and pressable, not just unhidden: the panel it used to live in is
    // transparent and scaled while collapsed.
    const fresh = part<HTMLButtonElement>(el, ".drawer-new");
    expect(hit(el, ...centre(fresh.getBoundingClientRect()))).toBe(fresh);
    // Escape closes it, and the panel never opened.
    fresh.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await settle();
    expect(part(el, ".drawer").hidden).toBe(true);
    expect(el.collapsed).toBe(true);
  });

  it.each([
    ["the right", {}, "right", "--ag-ui-viewport-inset-right"],
    ["the left", { placement: "bottom-left" }, "left", "--ag-ui-viewport-inset-left"],
  ] as const)("lines the popover up with the panel on %s", async (_name, attrs, side, reserved) => {
    // A reserved edge as well, so the popover is shown to line up with the
    // panel and not merely to sit a gutter in from the window.
    const el = mount({ ...attrs, "data-start-open": "" });
    el.style.setProperty(reserved, "30px");
    await settle();
    const panel = el.getBoundingClientRect()[side];
    el.setCollapsed(true);
    await settle();
    part<HTMLButtonElement>(el, ".bar-history").click();
    await settle();
    const list = part(el, ".drawer-panel").getBoundingClientRect();
    expect(list[side]).toBeCloseTo(panel, 0);
    expect(list.width).toBe(320);
  });

  it("leaves the gutter on both sides of a popover on a narrow window", async () => {
    await page.viewport(640, DESKTOP.height);
    const el = mount();
    el.style.setProperty("--ag-ui-edge-gutter", "200px");
    await settle();
    part<HTMLButtonElement>(el, ".bar-history").click();
    await settle();
    const list = part(el, ".drawer-panel").getBoundingClientRect();
    expect(list.left).toBeCloseTo(200, 0);
    expect(list.right).toBeCloseTo(screenWidth() - 200, 0);
  });

  it.each(["quiet", "soft", "ledger", "classic", "code", "soft dark"])(
    "draws the bar's two buttons as a pair under the %s theme",
    async (theme) => {
      const el = mount({ theme });
      await settle();
      const strip = part(el, ".launcher");
      const history = part(el, ".bar-history");
      // At rest: the pointer an earlier test left over the strip moves off it.
      await userEvent.unhover(strip);
      for (const property of [
        "border-top-width",
        "border-right-width",
        "border-bottom-width",
        "border-left-width",
        "box-shadow",
        "background-color",
        "border-radius",
      ]) {
        expect(getComputedStyle(strip).getPropertyValue(property), property).toBe(
          getComputedStyle(history).getPropertyValue(property),
        );
      }
      expect(getComputedStyle(strip).boxShadow).toBe("none");
      // The same wash under the pointer.
      await userEvent.hover(strip);
      const washed = getComputedStyle(strip).backgroundColor;
      await userEvent.hover(history);
      expect(getComputedStyle(history).backgroundColor).toBe(washed);
      expect(washed).not.toBe("rgba(0, 0, 0, 0)");
    },
  );

  it("keeps resize and refuses a move on a wide viewport", async () => {
    const el = mount({ "data-start-open": "" });
    await settle();
    const before = el.getBoundingClientRect();
    expect(el.moveTo("top-left")).toBe(false);
    // The header drag is off.
    const header = part(el, ".header");
    const [hx, hy] = centre(header.getBoundingClientRect());
    header.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: hx, clientY: hy }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: hx - 200, clientY: hy - 100 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: hx - 200, clientY: hy - 100 }));
    await settle();
    expect(el.getBoundingClientRect().left).toBe(before.left);
    expect(el.getBoundingClientRect().top).toBe(before.top);
    // A grip on a free edge resizes, from the edge the bar holds still.
    const pull = async (name: string, dx: number, dy: number): Promise<void> => {
      const grip = part(el, `.resize-handle--${name}`);
      const [x, y] = centre(grip.getBoundingClientRect());
      grip.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
      );
      window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
      window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
      await settle();
    };
    await pull("top-left", -60, -40);
    const grown = el.getBoundingClientRect();
    // The grip puts the edge under the pointer, which starts a few px inside it.
    expect(grown.width).toBeGreaterThan(before.width + 40);
    expect(grown.height).toBeGreaterThan(before.height + 20);
    expect(grown.bottom).toBeCloseTo(before.bottom, 0);
    expect(grown.right).toBeCloseTo(before.right, 0);
    // A grip on an edge the dock holds never moves the panel off it.
    await pull("bottom-right", 80, 60);
    const held = el.getBoundingClientRect();
    expect(held.bottom).toBeCloseTo(before.bottom, 0);
    expect(held.right).toBeCloseTo(before.right, 0);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("on a phone, opens full-bleed over the bar and shows the bar only while collapsed", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const el = mount();
    await settle();
    const collapsedHeight = el.barHeight;
    expect(collapsedHeight).toBeGreaterThan(0);
    expect(part(el, ".dock-bar").getBoundingClientRect().width).toBe(screenWidth());
    el.setCollapsed(false);
    await settle();
    const panel = el.getBoundingClientRect();
    expect(panel.left).toBe(0);
    expect(panel.top).toBe(0);
    expect(panel.width).toBe(screenWidth());
    expect(panel.height).toBe(screenHeight());
    expect(getComputedStyle(part(el, ".dock-bar")).display).toBe("none");
    expect(el.barHeight).toBe(0);
    el.setCollapsed(true);
    await settle();
    expect(el.barHeight).toBe(collapsedHeight);
  });

  it.each([
    ["the right", {}, "right"],
    ["the left", { placement: "bottom-left" }, "left"],
  ] as const)(
    "keeps a phone's popover 8px in from %s, with no panel edge to meet",
    async (_name, attrs, side) => {
      await page.viewport(PHONE.width, PHONE.height);
      const el = mount(attrs);
      await settle();
      part<HTMLButtonElement>(el, ".bar-history").click();
      await settle();
      const list = part(el, ".drawer-panel").getBoundingClientRect();
      expect(side === "right" ? screenWidth() - list.right : list.left).toBeCloseTo(8, 0);
      expect(list.width).toBe(320);
    },
  );
});
