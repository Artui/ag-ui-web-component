/**
 * Dragging the panel by its header, against a real layout engine.
 *
 * The unit tests prove the arithmetic against a stubbed rect. What is left is
 * whether the properties the element writes actually move the panel -- an
 * inset written from the wrong pair of edges still passes every assertion
 * about the string and leaves the panel where it was.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const settle = (ms = 450): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  document.body.appendChild(el);
  return el;
}

function headerOf(el: AgUiChat): HTMLElement {
  const header = el.shadowRoot?.querySelector(".header");
  if (!(header instanceof HTMLElement)) {
    throw new Error("expected a .header in the shadow root");
  }
  return header;
}

/** A real drag: press on a point in the header, travel, release. */
async function dragBy(el: AgUiChat, dx: number, dy: number): Promise<void> {
  const header = headerOf(el);
  const rect = header.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await settle();
}

beforeAll(async () => {
  defineAgUiChat();
  await page.viewport(1280, 800);
});

afterAll(async () => {
  await page.viewport(414, 896);
});

beforeEach(() => {
  // A dragged position is remembered per tab, and every test in this file
  // shares one -- so without this each drag would start where the last one
  // finished and the panel would walk into the margin.
  sessionStorage.clear();
  // Layout preferences are durable on purpose, so the per-tab clear no longer
  // reaches all of them. Without this a dragged position leaks into the next
  // test, which reads as a drag that travelled the wrong distance.
  localStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("dragging the panel by its header", () => {
  it("moves the panel by what the pointer travelled", async () => {
    const el = mount();
    await settle(50);
    const before = el.getBoundingClientRect();

    await dragBy(el, -300, -100);

    const after = el.getBoundingClientRect();
    // Within a pixel: the inset is written rounded.
    expect(after.left - before.left).toBeCloseTo(-300, 0);
    expect(after.top - before.top).toBeCloseTo(-100, 0);
  });

  it("says it is a handle before anyone presses it", async () => {
    const el = mount();
    await settle(50);

    // The affordance is a static rule keyed on placement, and a rule listing
    // placements is exactly the kind that goes quietly wrong.
    expect(getComputedStyle(headerOf(el)).cursor).toBe("move");
  });

  it("keeps the header a plain header where the placement owns the position", async () => {
    const el = mount();
    el.setAttribute("placement", "sidebar");
    await settle(50);

    expect(getComputedStyle(headerOf(el)).cursor).not.toBe("move");
  });

  it("says it is being dragged while it is", async () => {
    const el = mount();
    await settle(50);
    const header = headerOf(el);
    const rect = header.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    header.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 60, clientY: y - 20 }));

    // The stamped state has to outrank the placement rule that set the resting
    // cursor, and it does not by class count alone -- a selector this loses to
    // fails invisibly, since the drag itself still works.
    expect(getComputedStyle(header).cursor).toBe("grabbing");
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 60, clientY: y - 20 }));
    await settle();
  });

  it("moves the panel without resizing it", async () => {
    const el = mount();
    await settle(50);
    const before = el.getBoundingClientRect();

    await dragBy(el, -300, -100);

    const after = el.getBoundingClientRect();
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(after.height).toBeCloseTo(before.height, 0);
  });

  it("leaves the panel where it was when a header control is pressed", async () => {
    const el = mount();
    await settle(50);
    const before = el.getBoundingClientRect();
    const button = el.shadowRoot?.querySelector(".header-btn") as HTMLElement;
    const rect = button.getBoundingClientRect();

    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }),
    );
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: rect.left - 200, clientY: rect.top }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", { clientX: rect.left - 200, clientY: rect.top }),
    );
    await settle();

    expect(el.getBoundingClientRect().left).toBeCloseTo(before.left, 0);
  });

  it("carries the launcher exactly as far as the panel went", async () => {
    const el = mount();
    await settle(50);
    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    // The centre, because the launcher is scaled behind an open panel and a
    // centred scale leaves only the centre where it is.
    const centre = (): { x: number; y: number } => {
      const box = launcher.getBoundingClientRect();
      return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    };
    const before = centre();

    await dragBy(el, -300, -100);

    // The bubble a collapsed widget shrinks to is where the panel was, so a
    // panel dragged 300 left and 100 up leaves it 300 left and 100 up. Glued
    // to the panel's pinned corner it leapt across the panel instead, whenever
    // the drag re-picked that corner.
    const after = centre();
    expect(after.x - before.x).toBeCloseTo(-300, 0);
    expect(after.y - before.y).toBeCloseTo(-100, 0);
  });

  it("collapses to where the launcher was carried", async () => {
    const el = mount();
    await settle(50);

    await dragBy(el, -300, -100);
    const panel = el.getBoundingClientRect();
    el.setCollapsed(true);
    await settle();

    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    // Still on the corner of the panel it was resting on, now that the panel
    // has moved: bottom-right, at full size once the widget is collapsed.
    expect(box.right).toBeCloseTo(panel.right, 0);
    expect(box.bottom).toBeCloseTo(panel.bottom, 0);
  });

  it("reopens where it was dragged to", async () => {
    const el = mount();
    await settle(50);

    await dragBy(el, -300, -100);
    const moved = el.getBoundingClientRect();
    el.setCollapsed(true);
    await settle();
    el.setCollapsed(false);
    await settle();

    // The expand re-derives the widget's layout, and a panel whose position
    // the user stated has to survive that -- deriving it from the launcher
    // would move it by the width of the panel.
    const reopened = el.getBoundingClientRect();
    expect(reopened.left).toBeCloseTo(moved.left, 0);
    expect(reopened.top).toBeCloseTo(moved.top, 0);
  });
});
