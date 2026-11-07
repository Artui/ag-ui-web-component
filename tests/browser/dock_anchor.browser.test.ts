import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
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

  afterEach(() => {
    document.body.innerHTML = "";
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
