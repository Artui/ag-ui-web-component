import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A viewport inset token that follows the page's layout changes after the window
 * resize that caused it.
 *
 * A page publishing its bar's height from a ResizeObserver hears of the new height
 * later in the frame than the window's resize event, so a restore answering that
 * event still reads the bar at its old height, and holds the panel below a bar that
 * has since shrunk. Nothing else fires. These use a real observer on a real bar, as
 * the demo does, because the ordering is the subject.
 */

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 700, height: 800 };
const PHONE = { width: 500, height: 800 };
const SHORT_BAR = 56;
const TALL_BAR = 216;
const SPOT = { left: 376, top: 189 };
const ID = "inset-follows";
const KEYS = [`ag-ui-chat:launcher:${ID}`, `ag-ui-chat:dock:${ID}`, `ag-ui-chat:size:${ID}`];

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const frames = async (): Promise<void> => {
  for (let frame = 0; frame < 4; frame += 1) {
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

async function drag(handle: HTMLElement, dx: number, dy: number): Promise<void> {
  const rect = handle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await frames();
}

async function placed(attrs: Record<string, string> = {}): Promise<AgUiChat> {
  const el = chat(attrs);
  await frames();
  const box = el.getBoundingClientRect();
  await drag(part(el, ".header"), SPOT.left - box.left, SPOT.top - box.top);
  expectAt(el, SPOT);
  return el;
}

function expectAt(el: AgUiChat, box: { left: number; top: number }): void {
  expect(el.getBoundingClientRect().left).toBeCloseTo(box.left, 0);
  expect(el.getBoundingClientRect().top).toBeCloseTo(box.top, 0);
}

/** The page's bar, `depth` elements below the body, tall below 800px wide. */
function barAtDepth(depth: number): void {
  let parent: HTMLElement = document.body;
  for (let level = 0; level < depth; level += 1) {
    parent = parent.appendChild(document.createElement("div"));
  }
  const bar = parent.appendChild(document.createElement("div"));
  bar.className = "inset-bar";
  const publish = (): void => {
    document.documentElement.style.setProperty(
      "--bar-h",
      `${Math.ceil(bar.getBoundingClientRect().height)}px`,
    );
  };
  publish();
  observer = new ResizeObserver(publish);
  observer.observe(bar);
}

let observer: ResizeObserver | null = null;
const sheet = document.createElement("style");
sheet.textContent = `
  .inset-bar { height: ${SHORT_BAR}px; }
  @media (max-width: 800px) { .inset-bar { height: ${TALL_BAR}px; } }
  ${ELEMENT_TAG} { --ag-ui-viewport-inset-top: var(--bar-h, 0px); }
`;

beforeAll(() => {
  defineAgUiChat();
  document.head.appendChild(sheet);
});

afterEach(async () => {
  observer?.disconnect();
  observer = null;
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--bar-h");
  for (const key of KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  await page.viewport(WIDE.width, WIDE.height);
});

afterAll(() => {
  sheet.remove();
});

describe("a viewport inset token that changes after the window resize (real browser)", () => {
  it.each([
    ["beside the element", 0],
    ["deep in the page", 6],
  ])("settles at the stated spot on widening, with the bar %s", async (_where, depth) => {
    barAtDepth(depth);
    await frames();
    const el = await placed();
    const stored = JSON.parse(localStorage.getItem(KEYS[0] as string) as string);

    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);

    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
    expect(JSON.parse(localStorage.getItem(KEYS[0] as string) as string)).toEqual(stored);
  });

  it("settles at the stated spot on widening from a phone", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed();
    await page.viewport(PHONE.width, PHONE.height);
    await frames();
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
  });

  it("holds the panel below a bar that grows after the window narrows", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed();
    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
  });

  it("follows a token a page writes well after the resize", async () => {
    // Not an observer at all: a framework's effect, or a font arriving. There is no
    // frame after the resize that could be waited for.
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    const el = await placed();
    document.documentElement.style.setProperty("--bar-h", `${TALL_BAR}px`);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    await frames();
    expectAt(el, SPOT);
  });

  it("settles a docked panel dragged off its bar at its spot on widening", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed({ "collapse-to": "bar" });
    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
  });

  it("settles a launcher at its stored place on widening", async () => {
    barAtDepth(0);
    await frames();
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    const launcher = part(el, ".launcher");
    const rect = launcher.getBoundingClientRect();
    await drag(launcher, 500 - rect.left, 100 - rect.top);
    const stored = JSON.parse(localStorage.getItem(KEYS[0] as string) as string);
    const size = launcher.offsetWidth;

    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    const after = launcher.getBoundingClientRect();
    expect(after.top + after.height / 2).toBeCloseTo(stored.top + size / 2, 0);
    expect(after.left + after.width / 2).toBeCloseTo(stored.left + size / 2, 0);
  });

  it("stands a panel a host fills at the start of the room the token leaves", async () => {
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    const el = chat();
    for (const [token, value] of [
      ["--ag-ui-width", "100vw"],
      ["--ag-ui-height", `calc(100vh - var(--bar-h))`],
      ["--ag-ui-max-width", "100vw"],
      ["--ag-ui-max-height", "100vh"],
    ] as const) {
      el.style.setProperty(token, value);
    }
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(SHORT_BAR, 0);
    document.documentElement.style.setProperty("--bar-h", "0px");
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });
});
