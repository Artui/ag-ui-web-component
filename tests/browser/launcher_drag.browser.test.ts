/**
 * Dragging the launcher, against a real layout engine.
 *
 * Everything here is a question happy-dom cannot answer. It computes no
 * geometry, so the unit tests hand the element a stubbed rect and prove the
 * arithmetic; what is left is whether the properties the element writes
 * actually move anything, and whether the stamped corner beats the placement
 * rule that sets the same property earlier in the stylesheet.
 *
 * The transform-origin half matters more than it looks. If it loses that
 * cascade the panel still opens in the right place, but it scales out of the
 * corner the placement guessed -- so it visibly leaps across the screen first,
 * and every assertion about position still passes.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const settle = (ms = 450): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function launcherOf(el: AgUiChat): HTMLElement {
  const launcher = el.shadowRoot?.querySelector(".launcher");
  if (!(launcher instanceof HTMLElement)) {
    throw new Error("expected a .launcher in the shadow root");
  }
  return launcher;
}

function panelOf(el: AgUiChat): HTMLElement {
  const chat = el.shadowRoot?.querySelector(".chat");
  if (!(chat instanceof HTMLElement)) {
    throw new Error("expected a .chat in the shadow root");
  }
  return chat;
}

/** A real drag: press on the launcher's centre, travel, release. */
async function dragTo(el: AgUiChat, x: number, y: number): Promise<void> {
  const launcher = launcherOf(el);
  const rect = launcher.getBoundingClientRect();
  launcher.dispatchEvent(
    new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  );
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x, clientY: y }));
  await settle(60);
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("dragging the launcher in a browser", () => {
  it("puts the launcher where it was dropped and opens the panel away from it", async () => {
    const el = mount({ id: "drag-real" });
    await settle();
    el.setCollapsed(true);
    await settle();

    const size = launcherOf(el).offsetWidth;
    // Drop it near the top-left, where the room is down and to the right.
    await dragTo(el, 120, 120);

    const dropped = launcherOf(el).getBoundingClientRect();
    expect(dropped.left).toBeCloseTo(120 - size / 2, 0);
    expect(dropped.top).toBeCloseTo(120 - size / 2, 0);
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");

    el.setCollapsed(false);
    await settle();

    const panel = el.getBoundingClientRect();
    // It runs down and right from the launcher, and stays on screen.
    expect(panel.right).toBeGreaterThan(dropped.right);
    expect(panel.bottom).toBeGreaterThan(dropped.bottom);
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(window.innerWidth);

    // On the axis with room to spare, the panel starts at the launcher's own
    // edge exactly. On the other it may be held back by the viewport -- this
    // test viewport is narrower than the panel plus the drop point, which is
    // the ordinary case on a phone and the reason the clamp exists.
    expect(panel.top).toBeCloseTo(dropped.top, 0);
    expect(panel.left).toBeLessThanOrEqual(dropped.left + 0.5);
  });

  it("grows the morph out of the corner it opens from, beating the placement rule", async () => {
    const el = mount({ id: "origin" });
    await settle();
    el.setCollapsed(true);
    await settle();

    // The stylesheet's own rule for this placement asks for bottom left, and
    // sets it earlier in the file, so only source order makes the stamp win.
    el.setAttribute("placement", "bottom-left");
    await dragTo(el, 120, 120);

    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
    expect(getComputedStyle(panelOf(el)).transformOrigin).toBe("0px 0px");
  });

  it("keeps the launcher clickable after it has been moved", async () => {
    const el = mount({ id: "clickable" });
    await settle();
    el.setCollapsed(true);
    await settle();
    await dragTo(el, 150, 150);

    // Hit-test where it now sits: a moved launcher that the page swallows is a
    // conversation with no way back into it.
    const rect = launcherOf(el).getBoundingClientRect();
    const hit = el.shadowRoot?.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    expect(hit?.closest(".launcher")).not.toBeNull();

    // And the drag's own click does not count as one.
    expect(el.collapsed).toBe(true);
    launcherOf(el).click();
    expect(el.collapsed).toBe(false);
  });

  it("holds the panel on screen from a launcher with room for it on neither side", async () => {
    const el = mount({ id: "clamped" });
    await settle();
    el.setCollapsed(true);
    await settle();

    // The vertical middle: a 560px panel fits neither above nor below.
    const middle = Math.round(window.innerHeight / 2);
    await dragTo(el, 120, middle);
    el.setCollapsed(false);
    await settle();

    const panel = el.getBoundingClientRect();
    expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(window.innerHeight);
    // And the launcher stayed at the height it was dropped at regardless.
    el.setCollapsed(true);
    await settle();
    expect(launcherOf(el).getBoundingClientRect().top).toBeCloseTo(
      middle - launcherOf(el).offsetHeight / 2,
      0,
    );
  });
});
