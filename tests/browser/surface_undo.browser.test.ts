import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Undoing a move after the surface changed under it.
 *
 * A move records two things, where the panel stands and what is stored, and the
 * surface may be a different one by the time the reader presses undo. Each of
 * these reads the two records as a reader would meet them: the live element for
 * the one in memory, and a fresh mount for the one in storage.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
const ID = "undo";
const LAUNCHER_KEY = `ag-ui-chat:launcher:${ID}`;
const DOCK_KEY = `ag-ui-chat:dock:${ID}`;
const SPOT = { left: 376, top: 96 };

function chat(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("data-start-open", "");
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
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

async function dragHeaderTo(el: AgUiChat, to: { left: number; top: number }): Promise<void> {
  const box = el.getBoundingClientRect();
  const header = part(el, ".header").getBoundingClientRect();
  const x = header.left + header.width / 2;
  const y = header.top + header.height / 2;
  const dx = to.left - box.left;
  const dy = to.top - box.top;
  part(el, ".header").dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
  );
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await frames();
}

/** A grip pulled by a pointer: press, travel, release. */
async function pullGrip(el: AgUiChat, grip: string, dx: number, dy: number): Promise<void> {
  const handle = part(el, `.resize-handle--${grip}`);
  const rect = handle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await frames();
}

/** The launcher dragged by a pointer while the panel is collapsed, by its centre. */
async function dragLauncherTo(el: AgUiChat, to: { left: number; top: number }): Promise<void> {
  const rect = part(el, ".launcher").getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const dx = to.left - x;
  const dy = to.top - y;
  part(el, ".launcher").dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
  );
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await frames();
}

function expectAt(el: AgUiChat, at: { left: number; top: number }): void {
  expect(el.getBoundingClientRect().left).toBeCloseTo(at.left, 0);
  expect(el.getBoundingClientRect().top).toBeCloseTo(at.top, 0);
}

/** Every edge inside the window: what a position pinned from another surface breaks. */
function expectOnScreen(el: AgUiChat): void {
  const box = el.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.top).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(DESKTOP.width);
  expect(box.bottom).toBeLessThanOrEqual(DESKTOP.height);
}

describe("undoing a move across a surface change (real browser)", () => {
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

  describe("a corner panel moved, then given another surface", () => {
    it.each([
      ["sidebar", { placement: "sidebar" }],
      ["side", { placement: "side" }],
      ["page", { placement: "page" }],
      ["bottom-left", { placement: "bottom-left" }],
      ["the bar", { "collapse-to": "bar" }],
      ["a host's own control", { "collapse-to": "none" }],
    ])("leaves memory, storage and the panel in agreement under %s", async (_name, surface) => {
      const el = chat();
      await frames();
      await dragHeaderTo(el, SPOT);
      const stored = localStorage.getItem(LAUNCHER_KEY);
      expect(el.moveTo("top-left", { announce: true })).toBe(true);
      await frames();
      expect(localStorage.getItem(LAUNCHER_KEY)).not.toBe(stored);

      for (const [name, value] of Object.entries(surface)) {
        el.setAttribute(name, value);
      }
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();

      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
      expectOnScreen(el);

      // The one in memory: back on the corner surface with nothing re-read.
      for (const name of Object.keys(surface)) {
        el.removeAttribute(name);
      }
      await frames();
      el.setCollapsed(true);
      await frames();
      el.setCollapsed(false);
      await frames();
      expectAt(el, SPOT);

      // The one in storage.
      el.remove();
      const again = chat();
      await frames();
      expectAt(again, SPOT);
    });

    it("leaves a sidebar exactly where its own layout puts it", async () => {
      const el = chat();
      await frames();
      await dragHeaderTo(el, SPOT);
      el.moveTo("top-left", { announce: true });
      await frames();
      el.setAttribute("placement", "sidebar");
      await frames();
      const docked = el.getBoundingClientRect();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
      expect(el.hasAttribute("data-expand-corner")).toBe(false);
      expect(el.getBoundingClientRect().left).toBeCloseTo(docked.left, 0);
      expect(el.getBoundingClientRect().top).toBeCloseTo(docked.top, 0);
    });

    it("stands a docked panel on its dock when nothing had been stated there", async () => {
      const el = chat();
      await frames();
      await dragHeaderTo(el, SPOT);
      el.moveTo("top-left", { announce: true });
      await frames();
      el.setAttribute("collapse-to", "bar");
      await frames();
      const dock = el.getBoundingClientRect();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expectAt(el, dock);
      expect(localStorage.getItem(DOCK_KEY)).toBeNull();
    });

    it("forgets a first move undone from another surface, in both places", async () => {
      const el = chat();
      await frames();
      const home = el.getBoundingClientRect();
      el.moveTo("top-left", { announce: true });
      await frames();
      el.setAttribute("placement", "sidebar");
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      el.removeAttribute("placement");
      await frames();
      el.setCollapsed(true);
      await frames();
      el.setCollapsed(false);
      await frames();
      expectAt(el, home);
    });
  });

  describe("a first move undone on the surface it was made on", () => {
    it("puts back no place at all: no inset, no corner, the anchor the layout had", async () => {
      const el = chat();
      await frames();
      const home = el.getBoundingClientRect();
      const anchor = el.getAttribute("data-resize-anchor");
      expect(el.hasAttribute("data-expand-corner")).toBe(false);

      expect(el.moveTo("top-left", { announce: true })).toBe(true);
      await frames();
      expect(el.getAttribute("data-resize-anchor")).not.toBe(anchor);
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).not.toBe("");

      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
      expect(el.hasAttribute("data-expand-corner")).toBe(false);
      expect(el.getAttribute("data-resize-anchor")).toBe(anchor);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      expectAt(el, home);
    });

    it("leaves a grip to say what it wrote, so a phone still takes the panel full-bleed", async () => {
      const el = chat();
      await frames();
      el.moveTo("top-left", { announce: true });
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();

      // The memory is what a grip reads: it states an inset only for a panel with no
      // position of its own, and a move left undone in memory would make it a claim.
      await pullGrip(el, "bottom-right", -40, -30);
      const pulled = el.style.getPropertyValue("--ag-ui-inset");
      expect(pulled).not.toBe("");
      const place = el.getBoundingClientRect();
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();

      await page.viewport(PHONE.width, PHONE.height);
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      await page.viewport(DESKTOP.width, DESKTOP.height);
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(pulled);
      expectAt(el, place);
    });

    it("puts back the corner and both insets a launcher dragged elsewhere had", async () => {
      const el = chat();
      await frames();
      await dragHeaderTo(el, { left: 700, top: 400 });
      const dragged = el.getBoundingClientRect();
      const corner = el.getAttribute("data-expand-corner");
      const anchor = el.getAttribute("data-resize-anchor");
      const inset = el.style.getPropertyValue("--ag-ui-inset");
      const launcherInset = el.style.getPropertyValue("--ag-ui-launcher-inset");
      expect(corner).not.toBeNull();
      const stored = localStorage.getItem(LAUNCHER_KEY);

      el.moveTo("top-left", { announce: true });
      await frames();
      expect(el.getAttribute("data-expand-corner")).not.toBe(corner);
      part(el, ".run-notice-undo").click();
      await frames();

      expect(el.getAttribute("data-expand-corner")).toBe(corner);
      expect(el.getAttribute("data-resize-anchor")).toBe(anchor);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(inset);
      expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe(launcherInset);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
      expectAt(el, dragged);
    });

    it("keeps a launcher dragged on its own from taking the move's panel half", async () => {
      const el = chat();
      await frames();
      el.setCollapsed(true);
      await frames();
      await dragLauncherTo(el, { left: 600, top: 300 });
      const stored = localStorage.getItem(LAUNCHER_KEY);
      expect(JSON.parse(stored as string)).not.toHaveProperty("panel");
      el.setCollapsed(false);
      await frames();

      el.moveTo("top-left", { announce: true });
      await frames();
      expect(JSON.parse(localStorage.getItem(LAUNCHER_KEY) as string)).toHaveProperty("panel");
      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);

      // A grip commits the record again, from what the memory holds.
      await pullGrip(el, el.getAttribute("data-resize-anchor") as string, 10, 10);
      expect(JSON.parse(localStorage.getItem(LAUNCHER_KEY) as string)).not.toHaveProperty("panel");
    });
  });

  describe("a corner panel with no spot, undone back to what a grip or a fill left", () => {
    it("keeps a grip's inset the grip's, so a phone still takes the panel full-bleed", async () => {
      const el = chat();
      await frames();
      await pullGrip(el, "bottom-right", -40, -30);
      const left = el.style.getPropertyValue("--ag-ui-inset");
      expect(left).not.toBe("");

      expect(el.moveTo("top-left", { announce: true })).toBe(true);
      await frames();
      // The edge the move left pinned: a grip on a free one writes no inset, and
      // this path is the one where a grip on a moved panel forgets the first.
      const moved = el.style.getPropertyValue("--ag-ui-inset");
      await pullGrip(el, el.getAttribute("data-resize-anchor") as string, 10, 10);
      expect(el.style.getPropertyValue("--ag-ui-inset")).not.toBe(moved);

      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(left);
      const place = el.getBoundingClientRect();
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();

      await page.viewport(PHONE.width, PHONE.height);
      await frames();
      const full = el.getBoundingClientRect();
      expect([full.left, full.top, full.width, full.height]).toEqual([
        0,
        0,
        PHONE.width,
        PHONE.height,
      ]);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");

      await page.viewport(DESKTOP.width, DESKTOP.height);
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(left);
      expectAt(el, place);
    });

    it("keeps a fill's inset the fill's, so the panel rests once the fill has gone", async () => {
      const el = chat();
      await frames();
      const home = el.getBoundingClientRect();
      const fill = {
        "--ag-ui-width": "100vw",
        "--ag-ui-height": "100vh",
        "--ag-ui-max-width": "100vw",
        "--ag-ui-max-height": "100vh",
      };
      for (const [token, value] of Object.entries(fill)) {
        el.style.setProperty(token, value);
      }
      await frames();
      expectAt(el, { left: 0, top: 0 });
      const standing = el.style.getPropertyValue("--ag-ui-inset");
      expect(standing).not.toBe("");

      // In one task, so the move is made before anything has seen the fill go.
      for (const token of Object.keys(fill)) {
        el.style.removeProperty(token);
      }
      expect(el.moveTo("top-left", { announce: true })).toBe(true);
      await frames();

      // Handing the position back is what forgets the fill while the move stands.
      el.setAttribute("data-launcher-drag", "false");
      await page.viewport(DESKTOP.width - 10, DESKTOP.height);
      await frames();
      el.removeAttribute("data-launcher-drag");
      await page.viewport(DESKTOP.width, DESKTOP.height);
      await frames();

      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expectAt(el, home);
    });
  });

  describe("a docked panel moved, then undone on the dock it was moved on", () => {
    it("puts the spot it had back in memory as well as in storage", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      await dragHeaderTo(el, SPOT);
      const stored = localStorage.getItem(DOCK_KEY);
      el.moveTo("top-left", { announce: true });
      await frames();
      expect(el.getBoundingClientRect().left).not.toBeCloseTo(SPOT.left, 0);

      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
      expectAt(el, SPOT);
    });

    it("stands a panel that had no spot back on its bar", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      const dock = el.getBoundingClientRect();
      el.moveTo("top-left", { announce: true });
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(DOCK_KEY)).toBeNull();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expectAt(el, dock);
    });
  });

  describe("a docked panel moved, then given a placement that owns its place", () => {
    it("leaves a sidebar where its own layout puts it, and keeps the dock's spot", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      await dragHeaderTo(el, SPOT);
      const stored = localStorage.getItem(DOCK_KEY);
      el.moveTo("top-left", { announce: true });
      await frames();

      el.removeAttribute("collapse-to");
      el.setAttribute("placement", "sidebar");
      await frames();
      const side = el.getBoundingClientRect();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expectAt(el, side);
      expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
    });
  });

  describe("moveTo on a docked panel", () => {
    it("stands the panel at the corner before it returns, above its bar", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      const before = el.getBoundingClientRect();
      expect(el.moveTo("top-left")).toBe(true);
      const top = el.getBoundingClientRect();
      expect(top.left).toBeLessThan(before.left);
      expect(top.top).toBeLessThan(before.top);

      expect(el.moveTo("bottom-left")).toBe(true);
      const bottom = el.getBoundingClientRect();
      expect(bottom.left).toBeCloseTo(top.left, 0);
      expect(bottom.bottom).toBeLessThanOrEqual(part(el, ".dock-bar").getBoundingClientRect().top);
      await frames();
      expect(el.getBoundingClientRect().top).toBeCloseTo(bottom.top, 0);
    });
  });

  describe("moveTo where the panel is not the reader's to move", () => {
    it.each([
      ["a sidebar", { placement: "sidebar" }],
      ["a side panel", { placement: "side" }],
      ["a page", { placement: "page" }],
      ["a panel the host pinned", { "data-launcher-drag": "false" }],
      ["a docked panel the host pinned", { "collapse-to": "bar", "data-launcher-drag": "false" }],
    ])("refuses %s and writes nothing", async (_name, attrs) => {
      const el = chat(attrs);
      await frames();
      const before = el.getBoundingClientRect();
      expect(el.moveTo("top-left", { announce: true })).toBe(false);
      await frames();
      expectAt(el, before);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      expect(localStorage.getItem(DOCK_KEY)).toBeNull();
    });
  });

  describe("a docked panel moved, then given another surface", () => {
    it("keeps the dock's spot for the dock, and the corner panel on the screen", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      await dragHeaderTo(el, SPOT);
      const stored = localStorage.getItem(DOCK_KEY);
      expect(stored).not.toBeNull();
      el.moveTo("top-left", { announce: true });
      await frames();
      expect(localStorage.getItem(DOCK_KEY)).not.toBe(stored);

      el.removeAttribute("collapse-to");
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
      expect(localStorage.getItem(LAUNCHER_KEY)).toBeNull();
      expectOnScreen(el);
      expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");

      el.setAttribute("collapse-to", "bar");
      await frames();
      expectAt(el, SPOT);

      el.remove();
      const again = chat({ "collapse-to": "bar" });
      await frames();
      expectAt(again, SPOT);
    });

    it("does not clear a dock's stored spot for a corner move undone", async () => {
      const first = chat({ "collapse-to": "bar" });
      await frames();
      await dragHeaderTo(first, SPOT);
      const stored = localStorage.getItem(DOCK_KEY);
      first.remove();

      const el = chat();
      await frames();
      el.moveTo("top-left", { announce: true });
      await frames();
      part(el, ".run-notice-undo").click();
      await frames();
      expect(localStorage.getItem(DOCK_KEY)).toBe(stored);
    });
  });
});
