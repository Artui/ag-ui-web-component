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

  it("collapses to a launcher on the corner the panel was dragged to", async () => {
    const el = mount();
    await settle(50);

    await dragBy(el, -300, -100);
    const panel = el.getBoundingClientRect();
    el.setCollapsed(true);
    await settle();

    // Dragged up and to the left, the panel now has its room down and to the
    // right, so it is pinned by its top-left corner -- and that is the corner
    // the launcher has to be on, or the next expand would re-derive the old
    // position from it and undo the drag.
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    // The size from the layout metric and the position from the rect's centre:
    // the launcher is scaled in several states and a centred scale leaves only
    // the centre where it is.
    expect(box.left + box.width / 2).toBeCloseTo(panel.left + launcher.offsetWidth / 2, 0);
    expect(box.top + box.height / 2).toBeCloseTo(panel.top + launcher.offsetHeight / 2, 0);
  });
});
