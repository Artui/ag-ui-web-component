import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { DOCK_WIDTH_EVENT, ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import type { DockWidthDetail } from "../../src/core/events/dock_width_detail.js";

const DESKTOP = { width: 1280, height: 800 };
const ID = "dock-width";
const KEYS = [`ag-ui-chat:launcher:${ID}`, `ag-ui-chat:dock:${ID}`, `ag-ui-chat:size:${ID}`];

const nextFrame = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const frames = async (count: number): Promise<void> => {
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame();
  }
};

interface Host {
  readonly el: AgUiChat;
  readonly seen: DockWidthDetail[];
}

function mount(attributes: Record<string, string> = {}): Host {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("placement", "sidebar");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.style.setProperty("--ag-ui-motion", "0s");
  const seen: DockWidthDetail[] = [];
  el.addEventListener(DOCK_WIDTH_EVENT, (event) => {
    seen.push((event as CustomEvent<DockWidthDetail>).detail);
  });
  document.body.appendChild(el);
  return { el, seen };
}

describe("dockWidth and ag-ui-dock-width", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
    for (const key of KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it("reports the open panel, the rail, and nothing once hidden", async () => {
    const host = mount();
    await frames(3);
    expect(host.el.dockWidth).toBe(420);
    host.el.setCollapsed(true);
    await frames(3);
    expect(host.el.dockWidth).toBe(52);
    host.el.setAttribute("collapse-to", "none");
    await frames(3);
    expect(host.el.dockWidth).toBe(0);
    expect(host.seen.map((detail) => detail.width)).toEqual([420, 52, 0]);
    expect(host.seen[0]?.side).toBe("right");
  });

  it("is 0 on a phone while open, and the rail is still the rail", async () => {
    await page.viewport(500, 800);
    const host = mount();
    await frames(3);
    expect(host.el.dockWidth).toBe(0);
    host.el.setCollapsed(true);
    await frames(3);
    expect(host.el.dockWidth).toBe(52);
  });

  it("is 0 under every non-docked placement and under a static position", async () => {
    for (const placement of ["floating", "embedded", "page", "full"]) {
      const host = mount({ placement });
      await frames(3);
      expect(host.el.dockWidth, placement).toBe(0);
      host.el.remove();
    }
    const pushed = mount();
    pushed.el.style.setProperty("--ag-ui-position", "static");
    await frames(3);
    expect(pushed.el.dockWidth).toBe(0);
  });

  it("follows data-side and the side placement's launcher", async () => {
    const host = mount({ "data-side": "left" });
    await frames(3);
    expect(host.seen[0]).toEqual({ width: 420, side: "left" });
    host.el.setAttribute("data-side", "right");
    await frames(3);
    expect(host.seen.at(-1)).toEqual({ width: 420, side: "right" });
    host.el.setAttribute("placement", "side");
    host.el.setCollapsed(true);
    await frames(3);
    expect(host.el.dockWidth).toBe(0);
  });

  it("takes a width the host writes at runtime, one event per resting change", async () => {
    const host = mount();
    await frames(3);
    host.el.style.setProperty("--ag-ui-width", "500px");
    await frames(3);
    expect(host.el.dockWidth).toBe(500);
    expect(host.seen.map((detail) => detail.width)).toEqual([420, 500]);
  });

  it("announces a resize drag once, at its end, and a reset", async () => {
    const host = mount();
    await frames(3);
    const grip = host.el.shadowRoot?.querySelector<HTMLElement>(".resize-handle--left");
    const box = grip?.getBoundingClientRect();
    if (grip === null || grip === undefined || box === undefined) {
      throw new Error("no grip");
    }
    const down = { pointerId: 1, bubbles: true, composed: true, button: 0 };
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    grip.dispatchEvent(new PointerEvent("pointerdown", { ...down, clientX: x, clientY: y }));
    for (const step of [20, 40, 60]) {
      window.dispatchEvent(
        new PointerEvent("pointermove", { ...down, clientX: x - step, clientY: y }),
      );
      await nextFrame();
    }
    expect(host.seen).toHaveLength(1);
    window.dispatchEvent(new PointerEvent("pointerup", { ...down, clientX: x - 60, clientY: y }));
    await frames(3);
    expect(host.seen).toHaveLength(2);
    expect(host.seen[1]?.width).toBe(host.el.dockWidth);
    expect(host.el.dockWidth).toBeGreaterThan(460);
    expect(host.el.dockWidth).toBe(Math.round(host.el.getBoundingClientRect().width));
    host.el.resetSize();
    expect(host.el.dockWidth).toBe(420);
  });
});
