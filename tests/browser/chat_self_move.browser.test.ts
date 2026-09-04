import { page } from "@vitest/browser/context";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The panel moving itself: the half of the agent's self-control that is
 * geometry rather than decision-making.
 *
 * A third claimant on axes a placement and a user drag already share, so what
 * these check is that it claims them the same way the drag does -- the launcher
 * travels with the panel, the corner it opens from is re-picked -- and that it
 * declines rather than lying wherever the position is not its to take.
 */

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

/** The launcher's centre, which is the only point a scaled element keeps still. */
function launcherCentre(el: AgUiChat): { x: number; y: number } {
  const launcher = el.shadowRoot?.querySelector(".launcher");
  if (!(launcher instanceof HTMLElement)) {
    throw new Error("no launcher in the shadow root");
  }
  const box = launcher.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

describe("the panel moving itself (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("describes where it is and what can be done to it", async () => {
    const el = mount();
    await settle();
    const report = el.describeSurface();

    expect(report).toMatchObject({ placement: null, collapsed: false, collapsible: true });
    expect(report.movable).toBe(true);
    expect(report.fullBleed).toBe(false);
    expect(report.box.width).toBeGreaterThan(0);
    expect(report.viewport.width).toBe(window.innerWidth);
  });

  it.each([
    ["top-left", "left", "top"],
    ["bottom-right", "right", "bottom"],
  ] as const)("sends the panel to %s", async (corner, edgeX, edgeY) => {
    const el = mount();
    await settle();
    expect(el.moveTo(corner)).toBe(true);
    await settle();

    const box = el.getBoundingClientRect();
    if (edgeX === "left") {
      expect(box.left).toBeCloseTo(24, 0);
    } else {
      expect(window.innerWidth - box.right).toBeCloseTo(24, 0);
    }
    if (edgeY === "top") {
      expect(box.top).toBeCloseTo(24, 0);
    } else {
      expect(window.innerHeight - box.bottom).toBeCloseTo(24, 0);
    }
  });

  it("takes the launcher with it, so collapsing lands where the panel went", async () => {
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();
    const panel = el.getBoundingClientRect();

    el.setCollapsed(true);
    await settle();
    const centre = launcherCentre(el);

    // The launcher lives at a corner of the panel. If it stayed behind, the
    // next expand would re-derive the panel's position from a bubble standing
    // where the panel used to be and undo the move.
    expect(centre.x).toBeLessThan(panel.left + panel.width / 2);
    expect(centre.y).toBeLessThan(panel.top + panel.height / 2);
  });

  it("survives a reload, like any other stated position", async () => {
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();
    el.remove();

    const again = mount();
    await settle();
    expect(again.getBoundingClientRect().left).toBeCloseTo(24, 0);
  });

  it("declines where the placement owns the position, rather than lying", async () => {
    const el = mount({ placement: "sidebar" });
    await settle();
    const before = el.getBoundingClientRect().left;

    expect(el.moveTo("top-left")).toBe(false);
    expect(el.describeSurface().movable).toBe(false);
    await settle();
    // And it really did not move, which is the claim the boolean is making.
    expect(el.getBoundingClientRect().left).toBeCloseTo(before, 0);
  });

  it("declines when it fills the screen, because there is nowhere to go", async () => {
    const el = mount({ placement: "full" });
    await settle();

    const report = el.describeSurface();
    expect(report.fullBleed).toBe(true);
    expect(report.movable).toBe(false);
    expect(el.moveTo("top-left")).toBe(false);
  });

  it("declines on a phone, where a corner placement is the whole screen", async () => {
    // The case the mobile layout and this tool could not be designed apart.
    // "full" declines because that placement never moves; a floating widget
    // below the breakpoint declines for the other reason -- it is genuinely
    // movable and there is genuinely nowhere to move it to -- and the agent
    // has to be told which, since only one of them suggests minimising.
    await page.viewport(420, 720);
    try {
      const el = mount({ placement: "floating" });
      await settle();

      const report = el.describeSurface();
      expect(report.fullBleed).toBe(true);
      expect(report.movable).toBe(false);
      // Still collapsible, which is what makes minimise the honest fallback.
      expect(report.collapsible).toBe(true);
      expect(el.moveTo("top-left")).toBe(false);
    } finally {
      await page.viewport(1280, 800);
    }
  });

  it("reports a page placement as having no collapsed state", async () => {
    const el = mount({ placement: "page" });
    await settle();

    expect(el.describeSurface().collapsible).toBe(false);
  });

  it("hands the axes back when the placement changes", async () => {
    // The same ownership rule the drag follows: a position stated under one
    // placement must not outrank the next one.
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();

    el.setAttribute("placement", "sidebar");
    await settle();
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });
});
