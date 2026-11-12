import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { createChatSurfaceTools } from "../../src/tools/chat_surface_tools.js";

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

/** A header drag, as a pointer would make it: press, travel, release. */
async function dragHeader(el: AgUiChat, dx: number, dy: number): Promise<void> {
  const header = part(el, ".header");
  const [x, y] = centre(header.getBoundingClientRect());
  header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await settle();
}

/** Pull one resize grip by a delta, as a pointer would. */
async function pull(el: AgUiChat, name: string, dx: number, dy: number): Promise<void> {
  const grip = part(el, `.resize-handle--${name}`);
  const [x, y] = centre(grip.getBoundingClientRect());
  grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await settle();
}

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

  it("moves by its header on a wide viewport, above the bar, and then resizes like a corner panel", async () => {
    const el = mount({ "data-start-open": "" });
    await settle();
    const before = el.getBoundingClientRect();
    await dragHeader(el, -300, -100);
    const moved = el.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(before.left - 300, 0);
    expect(moved.top).toBeCloseTo(before.top - 100, 0);
    expect(moved.width).toBe(before.width);
    // Pulled far below the screen, it stops above the bar it minimises to,
    // and never past the right edge.
    await dragHeader(el, 2000, 2000);
    const low = el.getBoundingClientRect();
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    expect(low.bottom).toBeLessThanOrEqual(bar.top);
    expect(low.bottom).toBeCloseTo(bar.top - 8, 0);
    expect(low.right).toBeCloseTo(screenWidth() - 8, 0);
    // Off the dock every edge follows its grip, the bottom-right one included,
    // which a panel standing on its dock holds still.
    await dragHeader(el, -400, -150);
    const off = el.getBoundingClientRect();
    await pull(el, "bottom-right", 40, 30);
    const grown = el.getBoundingClientRect();
    expect(grown.left).toBeCloseTo(off.left, 0);
    expect(grown.top).toBeCloseTo(off.top, 0);
    expect(grown.right).toBeGreaterThan(off.right + 30);
    expect(grown.bottom).toBeGreaterThan(off.bottom + 20);
    // And no grip pulls it over the bar.
    await pull(el, "bottom-right", 0, 2000);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(bar.top - 8, 0);
  });

  it("keeps resize from the dock while it stands on it", async () => {
    const el = mount({ "data-start-open": "" });
    await settle();
    const before = el.getBoundingClientRect();
    await pull(el, "top-left", -60, -40);
    const grown = el.getBoundingClientRect();
    // The grip puts the edge under the pointer, which starts a few px inside it.
    expect(grown.width).toBeGreaterThan(before.width + 40);
    expect(grown.height).toBeGreaterThan(before.height + 20);
    expect(grown.bottom).toBeCloseTo(before.bottom, 0);
    expect(grown.right).toBeCloseTo(before.right, 0);
    // A grip on an edge the dock holds never moves the panel off it.
    await pull(el, "bottom-right", 80, 60);
    const held = el.getBoundingClientRect();
    expect(held.bottom).toBeCloseTo(before.bottom, 0);
    expect(held.right).toBeCloseTo(before.right, 0);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    // And resetSize on a panel that never left the dock drops the size alone.
    el.resetSize();
    await settle();
    const reset = el.getBoundingClientRect();
    expect([reset.left, reset.top, reset.right, reset.bottom]).toEqual([
      before.left,
      before.top,
      before.right,
      before.bottom,
    ]);
  });

  it("hands a dragged spot back when collapse-to leaves the dock, and takes it up on return", async () => {
    const el = mount({ id: "switching", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -500, -120);
    const moved = el.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 500, 0);
    // From one dock to the other the spot stays: it is still a docked panel.
    el.setAttribute("collapse-to", "none");
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
    // The corner surface owns its own position, and starts from its corner.
    el.setAttribute("collapse-to", "auto");
    await settle();
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.getBoundingClientRect().right).toBeCloseTo(screenWidth() - GUTTER, 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(screenHeight() - GUTTER, 0);
    // Back on the bar, the spot stored there comes back.
    el.setAttribute("collapse-to", "bar");
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
  });

  it.each<[string, Record<string, string>]>([
    ["data-launcher-drag=false", { "data-launcher-drag": "false" }],
    ["a placement that owns its position", { placement: "side" }],
  ])("leaves a stored spot unused under %s", async (_name, attrs) => {
    // A host that turns the drag off after its users dragged, or docks a
    // column, gets the dock and not the spot they left.
    const first = mount({ id: "stored", "data-start-open": "" });
    await settle();
    const dock = first.getBoundingClientRect();
    await dragHeader(first, -500, -120);
    expect(first.getBoundingClientRect().left).toBeCloseTo(dock.left - 500, 0);
    first.remove();
    const second = mount({ id: "stored", ...attrs });
    await settle();
    expect(second.style.getPropertyValue("--ag-ui-inset")).toBe("");
    const panel = second.getBoundingClientRect();
    const bar = part(second, ".dock-bar").getBoundingClientRect();
    const gutter = attrs["placement"] === "side" ? 0 : GUTTER;
    expect(panel.right).toBeCloseTo(screenWidth() - gutter, 0);
    expect(panel.bottom).toBeCloseTo(bar.top - gutter, 0);
  });

  it("drops a dragged spot for a column, so a resize there cannot store one", async () => {
    const el = mount({ id: "column", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -500, -120);
    const moved = el.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 500, 0);
    el.setAttribute("placement", "side");
    await settle();
    // The column's free edge, which a docked column resizes by.
    await pull(el, "left", -40, 0);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    // Back in the corner, the spot the user dragged to is the one that returns.
    el.removeAttribute("placement");
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
  });

  it("opens at the dock from a stored spot that is not one", async () => {
    for (const store of [localStorage, sessionStorage]) {
      store.setItem("ag-ui-chat:dock:corrupt", "{not json");
    }
    const el = mount({ id: "corrupt", "data-start-open": "" });
    await settle();
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    expect(el.getBoundingClientRect().right).toBeCloseTo(screenWidth() - GUTTER, 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(bar.top - GUTTER, 0);
  });

  it("reopens and reloads where it was dragged, until resetSize returns it to the dock", async () => {
    const first = mount({ id: "dragged", "data-start-open": "" });
    await settle();
    const dock = first.getBoundingClientRect();
    await dragHeader(first, -500, -120);
    const moved = first.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 500, 0);
    first.setCollapsed(true);
    await settle();
    first.setCollapsed(false);
    await settle();
    expect(first.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(first.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
    // A reload: the same chat mounted again over the same storage.
    first.remove();
    const second = mount({ id: "dragged" });
    await settle();
    expect(second.collapsed).toBe(false);
    expect(second.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(second.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
    second.resetSize();
    await settle();
    expect(second.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
    expect(second.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
    second.remove();
    const third = mount({ id: "dragged" });
    await settle();
    expect(third.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
    expect(third.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
  });

  it("opens at the dock when the only spot stored is one dragged under auto", async () => {
    // A host that switched to the bar after its users had dragged their corner
    // panels: the corner's record describes another surface.
    const corner = mount({ id: "switched", "collapse-to": "auto", "data-start-open": "" });
    await settle();
    await dragHeader(corner, -500, -200);
    corner.remove();
    const docked = mount({ id: "switched" });
    await settle();
    const panel = docked.getBoundingClientRect();
    const bar = part(docked, ".dock-bar").getBoundingClientRect();
    expect(panel.right).toBeCloseTo(screenWidth() - GUTTER, 0);
    expect(panel.bottom).toBeCloseTo(bar.top - GUTTER, 0);
  });

  it("moves to a corner on moveTo, its bottom corners above the bar", async () => {
    const el = mount({ "data-start-open": "" });
    await settle();
    const report = el.describeSurface();
    expect(report.movable).toBe(true);
    expect(report.draggable).toBe(true);
    expect(el.moveTo("top-left")).toBe(true);
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(GUTTER, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(GUTTER, 0);
    expect(el.moveTo("bottom-left")).toBe(true);
    await settle();
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    expect(el.getBoundingClientRect().left).toBeCloseTo(GUTTER, 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(bar.top - GUTTER, 0);
  });

  it("puts the dock back on undo, after the agent moved the panel", async () => {
    const el = mount({ id: "undone", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    const tools = createChatSurfaceTools(el);
    const move = tools.find((tool) => tool.name === "move_chat");
    expect(await move?.handler({ corner: "top-left" })).toEqual({
      moved: true,
      corner: "top-left",
    });
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(GUTTER, 0);
    part<HTMLButtonElement>(el, ".run-notice-undo").click();
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
    // And the undo is remembered: a reload opens at the dock.
    el.remove();
    const again = mount({ id: "undone" });
    await settle();
    expect(again.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
  });

  it("holds a dragged spot above a bar that grew, through a reopen and a reload", async () => {
    const el = mount({ id: "grown", "data-start-open": "" });
    await settle();
    await dragHeader(el, -300, 2000);
    const low = el.getBoundingClientRect();
    // A larger font is a taller bar; the panel's box is in px and keeps its size.
    el.style.fontSize = "32px";
    await settle();
    const bar = part(el, ".dock-bar").getBoundingClientRect();
    expect(screenHeight() - bar.top).toBeGreaterThan(screenHeight() - low.bottom);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(bar.top - 8, 0);
    expect(el.getBoundingClientRect().left).toBeCloseTo(low.left, 0);
    el.setCollapsed(true);
    await settle();
    el.setCollapsed(false);
    await settle();
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(bar.top - 8, 0);
    el.remove();
    const again = mount({ id: "grown" });
    again.style.fontSize = "32px";
    await settle();
    const barAgain = part(again, ".dock-bar").getBoundingClientRect();
    expect(again.getBoundingClientRect().bottom).toBeCloseTo(barAgain.top - 8, 0);
    expect(again.getBoundingClientRect().left).toBeCloseTo(low.left, 0);
  });

  it("holds a dragged spot inside a viewport that shrank, through a reopen and a reload", async () => {
    const el = mount({ id: "shrunk", "data-start-open": "" });
    await settle();
    await dragHeader(el, -300, 2000);
    const low = el.getBoundingClientRect();
    await page.viewport(DESKTOP.width, 700);
    await settle();
    const inside = (chat: AgUiChat): void => {
      const panel = chat.getBoundingClientRect();
      const bar = part(chat, ".dock-bar").getBoundingClientRect();
      expect(panel.top).toBeGreaterThanOrEqual(0);
      expect(panel.bottom).toBeCloseTo(bar.top - 8, 0);
      expect(panel.left).toBeCloseTo(low.left, 0);
    };
    inside(el);
    el.setCollapsed(true);
    await settle();
    el.setCollapsed(false);
    await settle();
    inside(el);
    el.remove();
    const again = mount({ id: "shrunk" });
    await settle();
    inside(again);
  });

  it("goes full-bleed on a phone and does not move there, then takes its spot back", async () => {
    const el = mount({ id: "phone", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -500, -120);
    const moved = el.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 500, 0);
    await page.viewport(PHONE.width, PHONE.height);
    await settle();
    const full = (): void => {
      const panel = el.getBoundingClientRect();
      expect(panel.left).toBe(0);
      expect(panel.top).toBe(0);
      expect(panel.width).toBe(screenWidth());
      expect(panel.height).toBe(screenHeight());
    };
    full();
    expect(el.describeSurface().movable).toBe(false);
    expect(el.moveTo("top-left")).toBe(false);
    await dragHeader(el, 60, 80);
    full();
    el.setCollapsed(true);
    await settle();
    el.setCollapsed(false);
    await settle();
    full();
    await page.viewport(DESKTOP.width, DESKTOP.height);
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
  });

  it("stays on the dock under data-launcher-drag=false", async () => {
    const el = mount({ "data-launcher-drag": "false", "data-start-open": "" });
    await settle();
    const before = el.getBoundingClientRect();
    expect(el.moveTo("top-left")).toBe(false);
    await dragHeader(el, -300, -100);
    expect(el.getBoundingClientRect().left).toBe(before.left);
    expect(el.getBoundingClientRect().top).toBe(before.top);
  });

  it("keeps resetSize to the size alone under auto, and the dragged corner spot with it", async () => {
    const el = mount({ "collapse-to": "auto", "data-start-open": "" });
    await settle();
    const before = el.getBoundingClientRect();
    await dragHeader(el, -300, -100);
    await pull(el, "top-left", -60, -40);
    const moved = el.getBoundingClientRect();
    expect(moved.width).toBeGreaterThan(before.width + 40);
    el.resetSize();
    await settle();
    const reset = el.getBoundingClientRect();
    expect(reset.width).toBe(before.width);
    expect(reset.height).toBe(before.height);
    // Off its old corner: the size went, the dragged position stayed.
    expect(reset.right).toBeCloseTo(moved.right, 0);
    expect(reset.bottom).toBeCloseTo(moved.bottom, 0);
    expect(reset.right).toBeLessThan(before.right - 200);
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

  const screens = [
    ["a wide viewport", DESKTOP],
    ["a phone", PHONE],
  ] as const;

  it.each(screens)(
    "opens and closes the popover at once on %s, with nothing sliding inside it",
    async (_screen, size) => {
      await page.viewport(size.width, size.height);
      const el = mount();
      // Real motion: at 0s a close in two stages and one in a single step look
      // the same, which is how the slide reached a phone.
      el.style.setProperty("--ag-ui-motion", "1s");
      await settle();
      const drawer = part(el, ".drawer");
      part<HTMLButtonElement>(el, ".bar-history").click();
      await settle();
      // Open: the list fills the popover's box from the first frames, rather
      // than rising inside a box already drawn.
      expect(getComputedStyle(drawer).visibility).toBe("visible");
      const box = drawer.getBoundingClientRect();
      const list = part(el, ".drawer-panel").getBoundingClientRect();
      expect(list.top).toBeCloseTo(box.top, 0);
      expect(list.bottom).toBeCloseTo(box.bottom, 0);
      // Closed: gone a frame later, not held on screen while the list moves.
      part<HTMLButtonElement>(el, ".drawer-close").click();
      await settle();
      expect(getComputedStyle(drawer).visibility).toBe("hidden");
    },
  );

  it.each(screens)(
    "closes the popover on %s from the button that opened it",
    async (_screen, size) => {
      await page.viewport(size.width, size.height);
      const el = mount();
      await settle();
      const button = part<HTMLButtonElement>(el, ".bar-history");
      const drawer = part(el, ".drawer");
      // Real presses, so the press-outside check sees the pointerdown first.
      await userEvent.click(button);
      await settle();
      expect(drawer.hidden).toBe(false);
      await userEvent.click(button);
      await settle();
      expect(drawer.hidden).toBe(true);
      expect(el.collapsed).toBe(true);
      await userEvent.click(button);
      await settle();
      expect(drawer.hidden).toBe(false);
    },
  );

  const expandRoutes = [
    [
      "the bar's title button",
      (el: AgUiChat) => userEvent.click(part(el, ".dock-bar > .launcher")),
    ],
    ["toggleCollapsed()", (el: AgUiChat) => el.toggleCollapsed()],
    [
      "collapsed = false",
      (el: AgUiChat) => {
        el.collapsed = false;
      },
    ],
    [
      "the restore_chat page action",
      async (el: AgUiChat) => {
        const restore = createChatSurfaceTools(el).find((tool) => tool.name === "restore_chat");
        await restore?.handler({});
      },
    ],
  ] as const;

  describe.each(screens)("expanding with the popover open, on %s", (_screen, size) => {
    it.each(expandRoutes)("closes the list when %s opens the panel", async (_route, expand) => {
      await page.viewport(size.width, size.height);
      const el = mount();
      // Real motion, so a list closed only in name, still drawn while its
      // visibility waits out a transition, would be seen.
      el.style.setProperty("--ag-ui-motion", "1s");
      await settle();
      const drawer = part(el, ".drawer");
      part<HTMLButtonElement>(el, ".bar-history").click();
      await settle();
      expect(drawer.hidden).toBe(false);
      await expand(el);
      await settle();
      expect(el.collapsed).toBe(false);
      expect(drawer.parentElement?.className).toBe("chat");
      expect(drawer.hidden).toBe(true);
      expect(getComputedStyle(drawer).visibility).toBe("hidden");
      // The panel's own history still opens the list, in the panel.
      part<HTMLButtonElement>(el, ".header-btn--history").click();
      await settle();
      expect(drawer.hidden).toBe(false);
      expect(drawer.parentElement?.className).toBe("chat");
    });
  });
});

describe("resetSize on a dragged docked panel", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("stays at the dock through a reopen after resetSize", async () => {
    const el = mount({ id: "reset-reopen", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -500, -120);
    expect(el.getBoundingClientRect().left).toBeCloseTo(dock.left - 500, 0);
    el.resetSize();
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
    el.setCollapsed(true);
    await settle();
    el.setCollapsed(false);
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(dock.left, 0);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
  });

  it("pins the dock's edges again after resetSize, and stores no spot", async () => {
    const first = mount({ id: "reset-pull", "data-start-open": "" });
    await settle();
    const dock = first.getBoundingClientRect();
    await dragHeader(first, -500, -120);
    first.resetSize();
    await settle();
    await pull(first, "bottom-right", 40, 30);
    expect(first.getBoundingClientRect().right).toBeCloseTo(dock.right, 0);
    expect(first.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
    first.remove();
    const second = mount({ id: "reset-pull" });
    await settle();
    expect(second.getBoundingClientRect().right).toBeCloseTo(dock.right, 0);
    expect(second.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
  });

  it("remembers the corner a grip moved on a dragged panel, through a reopen and a reload", async () => {
    const first = mount({ id: "grip-spot", "data-start-open": "" });
    await settle();
    await dragHeader(first, -500, -120);
    await pull(first, "top-left", -60, -40);
    const grown = first.getBoundingClientRect();
    first.setCollapsed(true);
    await settle();
    first.setCollapsed(false);
    await settle();
    expect(first.getBoundingClientRect().left).toBeCloseTo(grown.left, 0);
    expect(first.getBoundingClientRect().top).toBeCloseTo(grown.top, 0);
    first.remove();
    const second = mount({ id: "grip-spot" });
    await settle();
    expect(second.getBoundingClientRect().left).toBeCloseTo(grown.left, 0);
    expect(second.getBoundingClientRect().top).toBeCloseTo(grown.top, 0);
  });
});

describe("the place beside the bar title (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  const LONG = `${"A very long page name ".repeat(20)}end`;
  const barPlace = (el: AgUiChat): HTMLElement => part(el, ".dock-bar .bar-place");

  it("shows the label and detail through the place parts, and nothing without a place", async () => {
    const el = mount();
    await settle();
    expect(barPlace(el).hidden).toBe(true);
    expect(barPlace(el).getBoundingClientRect().width).toBe(0);
    el.getPlace = () => ({ label: "Order #4821", detail: "Billing" });
    el.refreshPlace();
    await settle();
    expect(barPlace(el).hidden).toBe(false);
    expect(part(el, ".dock-bar .place-label").textContent).toBe("Order #4821");
    expect(part(el, ".dock-bar .place-detail").textContent).toBe("Billing");
    expect(part(el, ".dock-bar .place-label").getAttribute("part")).toBe("place-label");
    el.getPlace = () => null;
    el.refreshPlace();
    await settle();
    expect(barPlace(el).hidden).toBe(true);
  });

  it("truncates a long label and keeps the history button inside the bar", async () => {
    for (const size of [DESKTOP, PHONE]) {
      await page.viewport(size.width, size.height);
      const el = mount();
      el.getPlace = () => ({ label: LONG, detail: LONG });
      await settle();
      el.refreshPlace();
      await settle();
      const bar = part(el, ".dock-bar").getBoundingClientRect();
      const place = barPlace(el).getBoundingClientRect();
      const history = part(el, ".bar-history").getBoundingClientRect();
      expect(place.width).toBeGreaterThan(0);
      expect(place.right).toBeLessThanOrEqual(history.left + 0.5);
      expect(history.right).toBeLessThanOrEqual(bar.right + 0.5);
      expect(history.left).toBeGreaterThanOrEqual(bar.left);
      expect(bar.height).toBeLessThan(60);
      el.remove();
    }
  });

  it("draws an excluded place dashed and struck through, as the chip does", async () => {
    const el = mount({ "data-start-open": "" });
    el.getPlace = () => ({ label: "Order #4821" });
    await settle();
    el.refreshPlace();
    part(el, ".place-toggle").click();
    await settle();
    const label = part(el, ".dock-bar .place-label");
    expect(getComputedStyle(label).textDecorationLine).toBe("line-through");
    expect(getComputedStyle(barPlace(el)).borderBottomStyle).toBe("dashed");
    part(el, ".place-toggle").click();
    await settle();
    expect(getComputedStyle(label).textDecorationLine).toBe("none");
  });

  it("follows popstate as the chip does", async () => {
    let label = "One";
    const el = mount();
    el.getPlace = () => ({ label });
    await settle();
    el.refreshPlace();
    label = "Two";
    window.dispatchEvent(new PopStateEvent("popstate"));
    await settle();
    expect(part(el, ".dock-bar .place-label").textContent).toBe("Two");
  });
});
