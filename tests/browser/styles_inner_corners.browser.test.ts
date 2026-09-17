import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { renderRunNotice } from "../../src/ui/progress/run_notice.js";

/**
 * Corners inside the panel keep their radius when the panel's own frame is square.
 *
 * The page, sidebar and side placements sit flush against the viewport, so their
 * frame is square. They used to square it by setting the theme's radius to 0,
 * and the answer well, the conversation list's New chat button and filter field,
 * and the run notice's Undo button all read the theme's radius, so they went
 * square with the frame, while the message bubbles and the composer beside them,
 * which have radii of their own, stayed round. Nothing inside the panel touches
 * the viewport edge, so the placements now square the frame's own radius and
 * leave the theme's alone.
 *
 * Measured in Chromium because the radius is a var() chain resolved through a
 * placement override, and happy-dom does not resolve a chained fallback.
 */

/** Below the small-viewport breakpoint, where every placement but embedded is full-bleed. */
const PHONE = { width: 400, height: 720 };
/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

const INNER = [".answer", ".drawer-new", ".drawer-filter", ".run-notice-undo"] as const;

function mount(placement: string, wrapperTokens: Record<string, string> = {}): AgUiChat {
  const wrapper = document.createElement("div");
  for (const [name, value] of Object.entries(wrapperTokens)) {
    wrapper.style.setProperty(name, value);
  }
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", placement);
  el.setAttribute("data-answer-well", "");
  wrapper.appendChild(el);
  document.body.appendChild(wrapper);
  el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
  const undo = { label: "Undo", onActivate: () => {} };
  shadowPart(el, ".messages").appendChild(renderRunNotice("", "Moved the panel", "moved", undo));
  return el;
}

function shadowPart(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found;
}

function radius(el: AgUiChat, selector: string): string {
  return getComputedStyle(shadowPart(el, selector)).borderTopLeftRadius;
}

describe("corners inside the panel (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const placement of ["page", "sidebar", "side", "full"]) {
    it(`keeps them round in the ${placement} placement, whose frame is square`, () => {
      const el = mount(placement);
      // The frame stays flush: this is not a change to the panel's own corners.
      expect(radius(el, ".chat")).toBe("0px");
      for (const selector of INNER) {
        expect(radius(el, selector), selector).toBe("12px");
      }
    });
  }

  it("leaves the floating panel as it was, frame and inside alike", () => {
    const el = mount("floating");
    expect(radius(el, ".chat")).toBe("12px");
    for (const selector of INNER) {
      expect(radius(el, selector), selector).toBe("12px");
    }
  });

  it("gives the inside a radius the host states, and squares everything at 0", () => {
    // The frame of a flush placement stays square: --ag-ui-radius is the theme's
    // corner, and the viewport edge is not part of the theme.
    const rounded = mount("page", { "--ag-ui-radius": "4px" });
    expect(radius(rounded, ".chat")).toBe("0px");
    for (const selector of INNER) {
      expect(radius(rounded, selector), selector).toBe("4px");
    }
    document.body.innerHTML = "";

    const floating = mount("floating", { "--ag-ui-radius": "4px" });
    expect(radius(floating, ".chat")).toBe("4px");
    document.body.innerHTML = "";

    const square = mount("floating", { "--ag-ui-radius": "0px" });
    expect(radius(square, ".chat")).toBe("0px");
    for (const selector of INNER) {
      expect(radius(square, selector), selector).toBe("0px");
    }
  });

  it("rounds the frame alone when the host asks for it", () => {
    const el = mount("page", { "--ag-ui-panel-radius": "8px" });
    expect(radius(el, ".chat")).toBe("8px");
    for (const selector of INNER) {
      expect(radius(el, selector), selector).toBe("12px");
    }
  });

  it("gives the well a radius of its own that moves nothing else", () => {
    const el = mount("sidebar", { "--ag-ui-well-radius": "20px" });
    expect(radius(el, ".answer")).toBe("20px");
    expect(radius(el, ".drawer-new")).toBe("12px");
    expect(radius(el, ".chat")).toBe("0px");
  });
});

describe("corners inside the panel on a small viewport (real browser)", () => {
  beforeAll(async () => {
    defineAgUiChat();
    await page.viewport(PHONE.width, PHONE.height);
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps them round when a floating panel becomes the whole screen", () => {
    const el = mount("floating");
    expect(radius(el, ".chat")).toBe("0px");
    for (const selector of INNER) {
      expect(radius(el, selector), selector).toBe("12px");
    }
  });
});
