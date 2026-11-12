import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The place chip, measured.
 *
 * It sits in the composer's tool row between the attach control and Send, and
 * a long place has to truncate rather than push Send off the row. That is
 * layout, so Chromium: happy-dom lays out no boxes, and a check that the chip
 * is displayed passes for a chip standing outside its own row.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

interface PlaceShape {
  readonly label: string;
  readonly detail?: string;
  readonly href?: string;
}

const LONG: PlaceShape = {
  label:
    "Purchase order #48213 for Northwind Traders International Holdings, shipping to the Rotterdam distribution centre",
  detail: "Procurement, purchase orders awaiting approval from the regional finance lead",
  href: "/procurement/orders/48213/",
};

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

async function frames(): Promise<void> {
  for (let frame = 0; frame < 3; frame += 1) {
    await settle();
  }
}

function mount(
  attrs: Record<string, string>,
  place: () => PlaceShape | null = () => LONG,
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  // The paperclip and the mic are shown only when uploads and transcription
  // are configured; both here, so the row carries everything that competes
  // with the chip for width.
  el.setAttribute("data-attachments-url", "/upload/");
  el.setAttribute("data-transcribe-url", "/transcribe/");
  el.style.setProperty("--ag-ui-motion", "0s");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.getPlace = place;
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

function rect(el: AgUiChat, selector: string): DOMRect {
  return part(el, selector).getBoundingClientRect();
}

/** Every edge of `inner` within `outer`, to half a pixel. */
function expectInside(inner: DOMRect, outer: DOMRect): void {
  expect(inner.left).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right).toBeLessThanOrEqual(outer.right + 0.5);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom + 0.5);
}

function expectRowHolds(el: AgUiChat): void {
  const composer = rect(el, ".composer");
  const tools = rect(el, ".composer-tools");
  const chip = rect(el, ".place");
  const send = part(el, ".send");
  expect(chip.width).toBeGreaterThan(0);
  expectInside(chip, composer);
  expectInside(chip, tools);
  // Send keeps its full size and its place at the end of the row: offsetWidth,
  // because the button scales on hover and press.
  expect(send.offsetWidth).toBeGreaterThan(20);
  expectInside(send.getBoundingClientRect(), tools);
  expect(chip.right).toBeLessThanOrEqual(send.getBoundingClientRect().left + 0.5);
  // The icon buttons keep their size, square at rest, rather than giving up
  // width to a long place.
  for (const selector of [".attach-btn", ".voice-btn"]) {
    const button = part(el, selector);
    expect(button.offsetWidth).toBeGreaterThan(20);
    expect(button.offsetWidth).toBe(button.offsetHeight);
    expectInside(button.getBoundingClientRect(), tools);
    expect(button.getBoundingClientRect().right).toBeLessThanOrEqual(chip.left + 0.5);
  }
  // Truncated, not wrapped: one line, its overflow clipped behind an ellipsis.
  const label = part(el, ".place-label");
  expect(label.scrollWidth).toBeGreaterThan(label.clientWidth);
  expect(getComputedStyle(label).textOverflow).toBe("ellipsis");
  expect(chip.height).toBeLessThanOrEqual(tools.height + 0.5);
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  for (const el of document.querySelectorAll(ELEMENT_TAG)) {
    el.remove();
  }
});

const PLACEMENTS: readonly [string, Record<string, string>, boolean][] = [
  ["floating", { placement: "floating" }, true],
  ["sidebar", { placement: "sidebar" }, true],
  ["page", { placement: "page" }, true],
  ["page, in the greeting layout", { placement: "page" }, false],
];

describe("a long place in the tool row", () => {
  for (const [name, attrs, withTurn] of PLACEMENTS) {
    it(`truncates inside the composer and keeps Send in the row: ${name}`, async () => {
      const el = mount(attrs);
      if (withTurn) {
        el.appendMessage(MESSAGE_ROLE.USER, "a turn, so the layout is not the empty one");
      }
      await frames();
      expect(el.hasAttribute("data-empty")).toBe(!withTurn);
      expectRowHolds(el);
    });
  }
});

describe("a long place on a phone", () => {
  beforeAll(async () => {
    await page.viewport(PHONE.width, PHONE.height);
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  for (const [name, attrs, withTurn] of PLACEMENTS) {
    it(`truncates inside the composer and keeps Send in the row at 390px: ${name}`, async () => {
      const el = mount(attrs);
      if (withTurn) {
        el.appendMessage(MESSAGE_ROLE.USER, "a turn");
      }
      await frames();
      expect(rect(el, ".composer").right).toBeLessThanOrEqual(PHONE.width + 0.5);
      expectRowHolds(el);
    });
  }
});

describe("the chip's states", () => {
  it("takes no space in the row when there is no place", async () => {
    const el = mount({ placement: "floating" }, () => null);
    await frames();
    const chip = part(el, ".place");
    expect(chip.hidden).toBe(true);
    expect(getComputedStyle(chip).display).toBe("none");
    expect(chip.getBoundingClientRect().width).toBe(0);
  });

  it("is dashed and struck through while withheld", async () => {
    const el = mount({ placement: "floating" });
    await frames();
    const chip = part(el, ".place");
    expect(getComputedStyle(chip).borderTopStyle).toBe("solid");
    part(el, ".place-toggle").click();
    expect(getComputedStyle(chip).borderTopStyle).toBe("dashed");
    expect(getComputedStyle(part(el, ".place-label")).textDecorationLine).toBe("line-through");
    expect(getComputedStyle(part(el, ".place-detail")).textDecorationLine).toBe("line-through");
  });

  it("hides the detail with no space when the place has none", async () => {
    const el = mount({ placement: "floating" }, () => ({ label: "Orders", href: "/orders/" }));
    await frames();
    expect(getComputedStyle(part(el, ".place-detail")).display).toBe("none");
  });
});
