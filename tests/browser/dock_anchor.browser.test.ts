import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * collapse-to="none": the host draws its own bar, and the panel rises from
 * the button it names. Measured, because what a host relies on is geometry:
 * that a collapsed chat leaves nothing on its page to hit, and that the open
 * panel stands on its button.
 */

const GUTTER = 24;

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("collapse-to", "none");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.style.setProperty("--ag-ui-motion", "0s");
  document.body.appendChild(el);
  return el;
}

/** A host's own bottom bar with its agent button at the right end, 120px in. */
function hostBar(): HTMLButtonElement {
  const bar = document.createElement("div");
  bar.style.cssText = "position: fixed; left: 0; right: 0; bottom: 0; height: 36px;";
  const button = document.createElement("button");
  button.id = "host-agent";
  button.textContent = "Agent";
  button.style.cssText = "position: absolute; right: 120px; top: 4px; height: 28px; width: 90px;";
  bar.append(button);
  document.body.append(bar);
  return button;
}

function centre(rect: DOMRect): [number, number] {
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

/** A header drag, as a pointer would make it: press, travel, release. */
async function dragHeader(el: AgUiChat, dx: number, dy: number): Promise<void> {
  const header = el.shadowRoot?.querySelector(".header") as HTMLElement;
  const [x, y] = centre(header.getBoundingClientRect());
  header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await settle();
}

/** Pull one resize grip by a delta, as a pointer would. */
async function pull(el: AgUiChat, name: string, dx: number, dy: number): Promise<void> {
  const grip = el.shadowRoot?.querySelector(`.resize-handle--${name}`) as HTMLElement;
  const [x, y] = centre(grip.getBoundingClientRect());
  grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await settle();
}

const settle = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

const screenHeight = (): number => document.documentElement.clientHeight;
const screenWidth = (): number => document.documentElement.clientWidth;

describe("the host's own bar (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(1280, 800);
  });

  it.each<[string, { placement?: string }]>([
    ["the corner", {}],
    ["the sidebar", { placement: "sidebar" }],
    ["the embedded chat", { placement: "embedded" }],
  ])("leaves nothing of %s to see or hit while collapsed", async (_name, attrs) => {
    const el = mount({ ...attrs, "data-start-open": "" });
    await settle();
    const open = el.getBoundingClientRect();
    el.setCollapsed(true);
    await settle();
    expect(el.getAttribute("data-collapsed-to")).toBe("none");
    // Every point the widget covered open, and the corner its launcher would
    // rest in, now hits the page.
    const points: Array<[number, number]> = [
      [open.left + open.width / 2, open.top + open.height / 2],
      [open.left + 4, open.top + 4],
      [screenWidth() - GUTTER - 20, screenHeight() - GUTTER - 20],
      [screenWidth() - 10, 20],
    ];
    for (const [x, y] of points) {
      const hit = document.elementFromPoint(x, y);
      expect(hit === el || el.contains(hit), `${x},${y}`).toBe(false);
    }
    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    expect(getComputedStyle(launcher).display).toBe("none");
    // pointer-events: none alone already hides every box from the hit test
    // above, so it passes a box that still takes room or paints. The in-flow
    // placements must leave no area in the host's layout, and no placement may
    // leave its panel visible.
    if (attrs.placement !== undefined) {
      const box = el.getBoundingClientRect();
      expect(box.width * box.height).toBe(0);
    }
    const chat = el.shadowRoot?.querySelector(".chat") as HTMLElement;
    expect(chat.checkVisibility({ visibilityProperty: true, opacityProperty: true })).toBe(false);
  });

  it("raises the panel above the anchor, right-aligned to it", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent" });
    await settle();
    el.setCollapsed(false);
    await settle();
    const anchor = button.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(el.hasAttribute("data-dock-anchored")).toBe(true);
    expect(panel.right).toBeCloseTo(anchor.right, 0);
    expect(panel.bottom).toBeCloseTo(anchor.top - 8, 0);
  });

  it("follows the anchor property, and caps the height at the room above it", async () => {
    const button = hostBar();
    const el = mount({ "data-start-open": "" });
    el.style.setProperty("--ag-ui-height", "3000px");
    el.anchor = button;
    await settle();
    const anchor = button.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(panel.bottom).toBeCloseTo(anchor.top - 8, 0);
    // The viewport less the distance to the anchor's top and one gutter.
    expect(panel.height).toBeCloseTo(screenHeight() - (screenHeight() - anchor.top) - GUTTER, 0);
  });

  it("stands the anchor gap above the anchor, so a host clears its own toolbar", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    // The button sits 4px inside a 36px toolbar; 12px of gap leaves the
    // panel's foot 8px clear of the toolbar's top edge.
    el.style.setProperty("--ag-ui-anchor-gap", "12px");
    await settle();
    const anchor = button.getBoundingClientRect();
    const toolbar = (button.parentElement as HTMLElement).getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(panel.bottom).toBeCloseTo(anchor.top - 12, 0);
    expect(panel.bottom).toBeCloseTo(toolbar.top - 8, 0);
    expect(panel.right).toBeCloseTo(anchor.right, 0);
  });

  it("keeps a panel grown to the cap on screen when the gap is wider than the gutter", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    el.style.setProperty("--ag-ui-height", "3000px");
    el.style.setProperty("--ag-ui-anchor-gap", `${GUTTER + 16}px`);
    await settle();
    const anchor = button.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(panel.bottom).toBeCloseTo(anchor.top - GUTTER - 16, 0);
    // The cap spends the gap, so the header stops at the top of the window.
    expect(panel.top).toBeCloseTo(0, 0);
  });

  it("keeps the edges the anchor holds through a resize", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    await settle();
    const anchor = button.getBoundingClientRect();
    const before = el.getBoundingClientRect();
    expect(before.bottom).toBeCloseTo(anchor.top - 8, 0);
    expect(before.right).toBeCloseTo(anchor.right, 0);
    // A grip on a free edge resizes, from the corner the anchor holds still.
    await pull(el, "top-left", -60, -40);
    const grown = el.getBoundingClientRect();
    expect(grown.width).toBeGreaterThan(before.width + 40);
    expect(grown.bottom).toBeCloseTo(before.bottom, 0);
    expect(grown.right).toBeCloseTo(before.right, 0);
    // A grip on an edge the anchor holds never moves the panel off it, and
    // writes no inline position that would outlive the anchor.
    await pull(el, "bottom-right", 80, 60);
    const held = el.getBoundingClientRect();
    expect(held.bottom).toBeCloseTo(before.bottom, 0);
    expect(held.right).toBeCloseTo(before.right, 0);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("moves by its header, never below the anchor's top, and comes back where it was dragged", async () => {
    const button = hostBar();
    const first = mount({ id: "anchored", anchor: "#host-agent", "data-start-open": "" });
    await settle();
    const dock = first.getBoundingClientRect();
    await dragHeader(first, -400, -100);
    const moved = first.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 400, 0);
    expect(moved.top).toBeCloseTo(dock.top - 100, 0);
    // The gap no longer applies once dragged, but the anchor's top still
    // bounds it: the host's own control is the way back, and stays in view.
    await dragHeader(first, 0, 2000);
    const low = first.getBoundingClientRect();
    const anchor = button.getBoundingClientRect();
    expect(low.bottom).toBeCloseTo(anchor.top - 8, 0);
    first.setCollapsed(true);
    await settle();
    first.setCollapsed(false);
    await settle();
    expect(first.getBoundingClientRect().left).toBeCloseTo(low.left, 0);
    expect(first.getBoundingClientRect().top).toBeCloseTo(low.top, 0);
    first.remove();
    const second = mount({ id: "anchored", anchor: "#host-agent" });
    await settle();
    expect(second.getBoundingClientRect().left).toBeCloseTo(low.left, 0);
    expect(second.getBoundingClientRect().top).toBeCloseTo(low.top, 0);
    second.resetSize();
    await settle();
    expect(second.getBoundingClientRect().right).toBeCloseTo(dock.right, 0);
    expect(second.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
    second.remove();
    const third = mount({ id: "anchored", anchor: "#host-agent" });
    await settle();
    expect(third.getBoundingClientRect().right).toBeCloseTo(dock.right, 0);
    expect(third.getBoundingClientRect().bottom).toBeCloseTo(dock.bottom, 0);
  });

  it("drops the anchor gap once dragged, holding only the margin above the anchor", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    // Wider than the 8px margin, so the two floors cannot be told apart by luck.
    el.style.setProperty("--ag-ui-anchor-gap", "24px");
    await settle();
    const anchor = button.getBoundingClientRect();
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(anchor.top - 24, 0);
    await dragHeader(el, -400, 2000);
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(anchor.top - 8, 0);
  });

  it("moves to a corner on moveTo, and reports itself movable", async () => {
    const button = hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    await settle();
    expect(el.describeSurface().movable).toBe(true);
    expect(el.moveTo("top-left")).toBe(true);
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(GUTTER, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(GUTTER, 0);
    expect(el.moveTo("bottom-right")).toBe(true);
    await settle();
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(
      button.getBoundingClientRect().top - GUTTER,
      0,
    );
  });

  it("moves from the plain corner with no anchor, held only by the viewport", async () => {
    const el = mount({ "data-start-open": "" });
    await settle();
    await dragHeader(el, -300, 2000);
    const panel = el.getBoundingClientRect();
    expect(panel.right).toBeCloseTo(screenWidth() - GUTTER - 300, 0);
    expect(panel.bottom).toBeCloseTo(screenHeight() - 8, 0);
  });

  it("goes full-bleed on a phone and does not move there", async () => {
    hostBar();
    const el = mount({ anchor: "#host-agent", "data-start-open": "" });
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -400, -100);
    const moved = el.getBoundingClientRect();
    expect(moved.left).toBeCloseTo(dock.left - 400, 0);
    await page.viewport(390, 844);
    await settle();
    await dragHeader(el, 50, 50);
    const panel = el.getBoundingClientRect();
    expect([panel.left, panel.top, panel.width, panel.height]).toEqual([
      0,
      0,
      screenWidth(),
      screenHeight(),
    ]);
    await page.viewport(1280, 800);
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(moved.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(moved.top, 0);
  });

  it("opens from the placement's own corner when the anchor is not there", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ anchor: "#missing" });
    await settle();
    el.setCollapsed(false);
    await settle();
    const panel = el.getBoundingClientRect();
    expect(el.hasAttribute("data-dock-anchored")).toBe(false);
    expect(panel.right).toBeCloseTo(screenWidth() - GUTTER, 0);
    expect(panel.bottom).toBeCloseTo(screenHeight() - GUTTER, 0);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

/** A host's fixed header, 56px tall, with its agent button 16px from the right edge. */
function hostHeader(button: Partial<CSSStyleDeclaration> = {}): HTMLButtonElement {
  const header = document.createElement("div");
  header.style.cssText = "position: fixed; left: 0; right: 0; top: 0; height: 56px;";
  const control = document.createElement("button");
  control.textContent = "Agent";
  control.style.cssText = "position: absolute; right: 16px; top: 12px; width: 90px; height: 32px;";
  Object.assign(control.style, button);
  header.append(control);
  document.body.append(header);
  return control;
}

describe("anchor-side (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(1280, 800);
  });

  it("opens below a header anchor, right-aligned to it, with room to show the chat", async () => {
    const button = hostHeader();
    const el = mount({ "anchor-side": "below", "data-start-open": "" });
    el.anchor = button;
    await settle();
    const anchor = button.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    expect(panel.height).toBeGreaterThan(300);
    expect(panel.top).toBeCloseTo(anchor.bottom + 8, 0);
    expect(panel.right).toBeCloseTo(anchor.right, 0);
    expect(el.getAttribute("data-dock-anchored")).toBe("below");
  });

  it("keeps a header drag below the anchor's bottom", async () => {
    const button = hostHeader();
    const el = mount({ "anchor-side": "below", "data-start-open": "" });
    el.anchor = button;
    await settle();
    await dragHeader(el, -200, 100);
    const anchor = button.getBoundingClientRect();
    const moved = el.getBoundingClientRect();
    expect(moved.top).toBeGreaterThanOrEqual(anchor.bottom);
    await dragHeader(el, 0, -2000);
    expect(el.getBoundingClientRect().top).toBeCloseTo(anchor.bottom + 8, 0);
  });

  it("holds the top and right edges through a grip, from the top-right corner", async () => {
    const button = hostHeader();
    const el = mount({ "anchor-side": "below", "data-start-open": "" });
    el.anchor = button;
    await settle();
    const before = el.getBoundingClientRect();
    expect(el.getAttribute("data-resize-anchor")).toBe("top-right");
    await pull(el, "bottom-left", -60, -40);
    const shrunk = el.getBoundingClientRect();
    expect(shrunk.width).toBeGreaterThan(before.width + 40);
    expect(shrunk.top).toBeCloseTo(before.top, 0);
    expect(shrunk.right).toBeCloseTo(before.right, 0);
    await pull(el, "bottom-right", 80, 60);
    const held = el.getBoundingClientRect();
    expect(held.top).toBeCloseTo(before.top, 0);
    expect(held.right).toBeCloseTo(before.right, 0);
    expect(el.getAttribute("data-resize-anchor")).toBe("top-right");
  });

  it("goes back under the anchor on resetSize after a drag", async () => {
    const button = hostHeader();
    const el = mount({ "anchor-side": "below", "data-start-open": "" });
    el.anchor = button;
    await settle();
    const dock = el.getBoundingClientRect();
    await dragHeader(el, -200, 100);
    el.resetSize();
    await settle();
    const panel = el.getBoundingClientRect();
    expect(panel.top).toBeCloseTo(dock.top, 0);
    expect(panel.right).toBeCloseTo(dock.right, 0);
    expect(el.getAttribute("data-resize-anchor")).toBe("top-right");
  });

  it.each<[string, () => HTMLButtonElement, string]>([
    ["a header anchor", () => hostHeader(), "below"],
    ["a bottom-bar anchor", () => hostBar(), "above"],
  ])("resolves auto to the roomier side for %s", async (_name, make, side) => {
    const button = make();
    const el = mount({ "data-start-open": "" });
    el.anchor = button;
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe(side);
    const anchor = button.getBoundingClientRect();
    const panel = el.getBoundingClientRect();
    if (side === "below") {
      expect(panel.top).toBeCloseTo(anchor.bottom + 8, 0);
    } else {
      expect(panel.bottom).toBeCloseTo(anchor.top - 8, 0);
    }
  });

  it("flips side on a window resize that crosses the line, re-clamping a dragged spot", async () => {
    const button = hostHeader({ top: "300px" });
    const el = mount({ "data-start-open": "" });
    el.anchor = button;
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("below");
    await dragHeader(el, -200, 2000);
    const low = el.getBoundingClientRect();
    expect(low.top).toBeGreaterThan(button.getBoundingClientRect().bottom);
    await page.viewport(1280, 500);
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("above");
    const anchor = button.getBoundingClientRect();
    const held = el.getBoundingClientRect();
    expect(held.bottom).toBeLessThanOrEqual(anchor.top - 8 + 0.5);
    expect(held.left).toBeCloseTo(low.left, 0);
    await page.viewport(1280, 800);
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("below");
    expect(el.getBoundingClientRect().top).toBeCloseTo(low.top, 0);
  });

  it("keeps the side through a gesture, and re-resolves once it ends", async () => {
    const button = hostHeader({ top: "300px" });
    const el = mount({ "data-start-open": "" });
    el.anchor = button;
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("below");
    const header = el.shadowRoot?.querySelector(".header") as HTMLElement;
    const [x, y] = centre(header.getBoundingClientRect());
    header.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 20, clientY: y + 20 }));
    await page.viewport(1280, 500);
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("below");
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 20, clientY: y + 20 }));
    await settle();
    expect(el.getAttribute("data-dock-anchored")).toBe("above");
  });

  it.each<[string, () => HTMLButtonElement]>([
    [
      "above",
      () => {
        const button = hostBar();
        button.style.right = "";
        button.style.left = "16px";
        return button;
      },
    ],
    ["below", () => hostHeader({ right: "", left: "16px" })],
  ])(
    "keeps the panel inside the left gutter %s an anchor near the left edge",
    async (side, make) => {
      const button = make();
      const el = mount({ "anchor-side": side, "data-start-open": "" });
      el.anchor = button;
      await settle();
      const panel = el.getBoundingClientRect();
      expect(panel.left).toBeGreaterThanOrEqual(GUTTER - 0.5);
      expect(panel.width).toBeGreaterThan(300);
      expect(el.getAttribute("data-dock-anchored")).toBe(side);
    },
  );

  it("holds the left gutter for a panel opened by the host's button after mounting collapsed", async () => {
    const button = hostHeader({ right: "", left: "16px" });
    const el = mount({ "anchor-side": "below" });
    el.anchor = button;
    await settle();
    el.setCollapsed(false);
    await settle();
    const panel = el.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(GUTTER - 0.5);
    expect(panel.top).toBeCloseTo(button.getBoundingClientRect().bottom + 8, 0);
  });

  it("goes full-bleed on a phone below its anchor", async () => {
    const button = hostHeader();
    await page.viewport(375, 812);
    const el = mount({ "anchor-side": "below", "data-start-open": "" });
    el.anchor = button;
    await settle();
    const panel = el.getBoundingClientRect();
    expect([panel.left, panel.top, panel.width, panel.height]).toEqual([
      0,
      0,
      screenWidth(),
      screenHeight(),
    ]);
  });
});
