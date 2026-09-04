import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The row of controls in the header.
 *
 * They were sized by their contents, so each came out as wide as the glyph
 * inside it -- five buttons of four different widths, two pixels apart, which
 * reads as one smudge rather than five controls. Chromium because that is a
 * used width: happy-dom lays nothing out and reports the same agreeable answer
 * whether the row is even, crowded or overflowing.
 */

function mount(width?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  // Every button the header can carry, so the row is measured at its fullest.
  el.setAttribute("data-theme-toggle", "");
  el.setAttribute("data-runs-url", "/runs/");
  if (width !== undefined) {
    el.style.setProperty("--ag-ui-width", width);
  }
  document.body.appendChild(el);
  return el;
}

function buttons(el: AgUiChat): HTMLElement[] {
  return [...(el.shadowRoot?.querySelectorAll(".header-btn") ?? [])] as HTMLElement[];
}

describe("header controls (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it.each(["380px", "300px", "240px"])("keeps them even and apart at %s", (width) => {
    const el = mount(width);
    const boxes = buttons(el).map((b) => b.getBoundingClientRect());
    expect(boxes.length).toBeGreaterThan(3);

    // One size, whatever glyph is in them.
    const widths = new Set(boxes.map((b) => Math.round(b.width)));
    expect(widths.size).toBe(1);
    // Square, so a round hover state is round.
    expect(Math.round(boxes[0]?.width ?? 0)).toBe(Math.round(boxes[0]?.height ?? 0));

    // And a gap that reads as a gap.
    for (let i = 1; i < boxes.length; i += 1) {
      const gap = (boxes[i]?.left ?? 0) - (boxes[i - 1]?.right ?? 0);
      expect(gap).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the whole row inside the header at a narrow width", () => {
    const el = mount("240px");
    const header = el.shadowRoot?.querySelector(".header") as HTMLElement;
    const box = header.getBoundingClientRect();

    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);
    for (const button of buttons(el)) {
      const rect = button.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(box.left - 1);
      expect(rect.right).toBeLessThanOrEqual(box.right + 1);
    }
  });

  it("takes a host's size for them", () => {
    const el = mount();
    el.style.setProperty("--ag-ui-header-btn-size", "40px");

    expect(Math.round(buttons(el)[0]?.getBoundingClientRect().width ?? 0)).toBe(40);
  });
});
