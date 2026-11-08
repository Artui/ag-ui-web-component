import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The header's cursor says what the header does.
 *
 * A resting rule gives the move cursor by placement, and no selector can see that a
 * host has sized the panel to the window. Every case here tries the drag as well as
 * reading the cursor, so the assertion is that the two agree rather than that a
 * stamp was written.
 */

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 390, height: 844 };
const ID = "header-cursor";

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const frames = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame += 1) {
    await settle();
  }
};

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

const cursor = (el: AgUiChat): string => getComputedStyle(part(el, ".header")).cursor;

/**
 * Whether pulling the header moves the panel, the drag's own answer. Pulled toward
 * the middle of the window, so a panel already against an edge can still answer.
 */
async function headerDragMoves(el: AgUiChat): Promise<boolean> {
  const header = part(el, ".header");
  const before = el.getBoundingClientRect();
  const rect = header.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const toX = x + (x < window.innerWidth / 2 ? 30 : -30);
  const toY = y + (y < window.innerHeight / 2 ? 30 : -30);
  header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: toX, clientY: toY }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: toX, clientY: toY }));
  await frames();
  const after = el.getBoundingClientRect();
  return after.left !== before.left || after.top !== before.top;
}

const fill = (el: AgUiChat): void => {
  for (const [token, value] of [
    ["--ag-ui-width", "100vw"],
    ["--ag-ui-height", "100vh"],
    ["--ag-ui-max-width", "100vw"],
    ["--ag-ui-max-height", "100vh"],
  ] as const) {
    el.style.setProperty(token, value);
  }
};

const dropFill = (el: AgUiChat): void => {
  for (const token of [
    "--ag-ui-width",
    "--ag-ui-height",
    "--ag-ui-max-width",
    "--ag-ui-max-height",
  ]) {
    el.style.removeProperty(token);
  }
};

const CORNER_SURFACES: readonly [string, Record<string, string>][] = [
  ["the default corner", {}],
  ['placement="floating"', { placement: "floating" }],
  ['placement="bottom-left"', { placement: "bottom-left" }],
  ['collapse-to="bar"', { "collapse-to": "bar" }],
  ['collapse-to="none"', { "collapse-to": "none" }],
];

beforeAll(() => {
  defineAgUiChat();
});

afterEach(async () => {
  document.body.innerHTML = "";
  localStorage.clear();
  sessionStorage.clear();
  await page.viewport(WIDE.width, WIDE.height);
});

afterAll(async () => {
  await page.viewport(WIDE.width, WIDE.height);
});

describe("the header's cursor where the drag is refused (real browser)", () => {
  it.each(CORNER_SURFACES)("follows the window's width under %s", async (_name, attrs) => {
    const el = chat(attrs);
    await frames();
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);

    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(await headerDragMoves(el)).toBe(false);
    expect(cursor(el)).not.toBe("move");

    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);
  });

  it.each(CORNER_SURFACES)(
    "says so from the first frame on a narrow window under %s",
    async (_name, attrs) => {
      await page.viewport(NARROW.width, NARROW.height);
      const el = chat(attrs);
      await frames();
      expect(cursor(el)).not.toBe("move");
    },
  );

  it("says so again when the element comes back on a narrow window", async () => {
    const el = chat();
    await frames();
    el.remove();
    await page.viewport(NARROW.width, NARROW.height);
    document.body.appendChild(el);
    await frames();
    expect(cursor(el)).not.toBe("move");
  });

  it.each(CORNER_SURFACES)(
    "follows a host's size on a wide window under %s",
    async (_name, attrs) => {
      const el = chat(attrs);
      await frames();
      fill(el);
      await frames();
      expect(await headerDragMoves(el)).toBe(false);
      expect(cursor(el)).not.toBe("move");

      dropFill(el);
      await frames();
      expect(cursor(el)).toBe("move");
      expect(await headerDragMoves(el)).toBe(true);
    },
  );

  it("says the drag is back as soon as a grip takes a filled panel off the screen's shape", async () => {
    // The sizes the grip passes through are answered while it holds the gesture,
    // and nothing changes size after it lets go, so its end has to answer too.
    const el = chat();
    await frames();
    fill(el);
    await frames();
    const grip = part(el, ".resize-handle--bottom-right");
    const rect = grip.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 300, clientY: y - 200 }));
    await frames();
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 300, clientY: y - 200 }));
    await frames();
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);
  });

  it('keeps the move cursor at a narrow width data-small-viewport="off" leaves room in', async () => {
    await page.viewport(700, 800);
    const el = chat({ "data-small-viewport": "off" });
    await frames();
    expect(cursor(el)).toBe("move");
    await page.viewport(500, 800);
    await frames();
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);
  });

  it('agrees with data-launcher-drag="false" as it goes on and comes off', async () => {
    // The attribute is not watched, so a stamp that took it in would stay stale
    // until the next restore and refuse in the cursor a drag the header would take.
    const el = chat();
    await frames();
    el.setAttribute("data-launcher-drag", "false");
    expect(cursor(el)).toBe("auto");
    expect(await headerDragMoves(el)).toBe(false);

    await page.viewport(WIDE.width - 40, WIDE.height);
    await frames();
    el.removeAttribute("data-launcher-drag");
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);
  });

  it.each(["sidebar", "side", "full", "page", "embedded"])(
    "never shows the move cursor on %s, whose position is its own",
    async (placement) => {
      const el = chat({ placement });
      await frames();
      expect(cursor(el)).not.toBe("move");
      expect(await headerDragMoves(el)).toBe(false);
    },
  );

  it("takes the move cursor when a filled placement switches to a corner", async () => {
    const el = chat({ placement: "page" });
    await frames();
    el.setAttribute("placement", "floating");
    await frames();
    expect(cursor(el)).toBe("move");
    expect(await headerDragMoves(el)).toBe(true);
  });

  it("shows grabbing through a drag the header allows", async () => {
    const el = chat();
    await frames();
    const header = part(el, ".header");
    const rect = header.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    header.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 30, clientY: y }));
    expect(cursor(el)).toBe("grabbing");
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 30, clientY: y }));
    await frames();
    expect(cursor(el)).toBe("move");
  });
});
