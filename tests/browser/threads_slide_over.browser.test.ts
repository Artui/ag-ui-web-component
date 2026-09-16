import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The conversation list slides over the conversation on a wide full page too.
 *
 * It used to dock beside the transcript there, padding the transcript, the
 * header, the composer and the centred greeting over to make room -- so opening
 * the list moved the very things on screen the user was looking at. It is the
 * same slide-over at every width and under every placement now, and this file
 * pins the one case that used to differ.
 *
 * Chromium because every half of it is a used value: where the rows really are
 * before and after, what a point over the transcript hits, and whether the
 * backdrop is laid out at all.
 */

/** Wide enough that the list used to dock (from 900px of panel), with room over. */
const WIDE = { width: 1400, height: 900 };
/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

/** What opening the list must leave exactly where it was. */
const STILL = [".header-title", ".messages", ".greeting", ".input-row", ".input"] as const;

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "page");
  el.setAttribute("data-start-open", "");
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

/** Let every transition in the shadow root run out, the drawer's slide included. */
async function still(el: AgUiChat): Promise<void> {
  await settle();
  await Promise.all((el.shadowRoot?.getAnimations() ?? []).map((a) => a.finished));
  await settle();
}

/**
 * Where each row sits and how big it is.
 *
 * The size from the offset box and the position from the rect's centre, because
 * this component scales things in transit and a centred scale is the one point
 * of a rect that cannot drift. The inline-start padding is recorded as well: the
 * docked layout moved the rows' content by padding them, which leaves the
 * padded box itself exactly where it was.
 */
function geometry(el: AgUiChat): Record<string, readonly number[]> {
  const out: Record<string, readonly number[]> = {};
  for (const selector of STILL) {
    const node = part(el, selector);
    const rect = node.getBoundingClientRect();
    out[selector] = [
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
      node.offsetWidth,
      node.offsetHeight,
      Number.parseFloat(getComputedStyle(node).paddingInlineStart),
    ];
  }
  return out;
}

describe("the conversation list on a wide full page (real browser)", () => {
  beforeAll(async () => {
    defineAgUiChat();
    await page.viewport(WIDE.width, WIDE.height);
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it("opens over the conversation without moving any of it", async () => {
    const el = mount();
    await still(el);
    // Sized so the old dock would have answered: a narrower panel was a
    // slide-over already and would pass this with the dock still in place.
    expect(el.getBoundingClientRect().width).toBeGreaterThanOrEqual(900);
    expect(part(el, ".greeting").offsetWidth).toBeGreaterThan(0);

    // "Never" rather than "not at the end": an attribute stamped on open and
    // cleared on close would pass a check made only after closing.
    const stamped: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        stamped.push(String(record.attributeName));
      }
    });
    observer.observe(el, { attributeFilter: ["data-threads-docked"] });

    const before = geometry(el);
    el.openThreads();
    await still(el);

    expect(geometry(el)).toEqual(before);

    el.closeThreads();
    await still(el);
    observer.disconnect();
    expect([...stamped, ...observer.takeRecords().map((r) => r.attributeName)]).toEqual([]);
    expect(el.hasAttribute("data-threads-docked")).toBe(false);
  });

  it("covers the transcript with the backdrop and the panel", async () => {
    const el = mount();
    await still(el);
    el.openThreads();
    await still(el);

    const root = el.shadowRoot as ShadowRoot;
    const panel = part(el, ".drawer-panel").getBoundingClientRect();
    const messages = part(el, ".messages");
    const column =
      messages.getBoundingClientRect().left +
      Number.parseFloat(getComputedStyle(messages).paddingInlineStart);

    // The panel runs into the reading column rather than stopping short of it.
    expect(panel.right).toBeGreaterThan(column);
    // And it is on top there: the point just inside its trailing edge, over
    // the transcript, hits the panel.
    const edge = root.elementFromPoint(panel.right - 2, panel.top + panel.height / 2);
    expect(part(el, ".drawer-panel").contains(edge)).toBe(true);

    // The rest of the transcript is behind a backdrop that is laid out, drawn,
    // and takes the pointer -- a click on the conversation dismisses the list
    // rather than landing in the conversation.
    const backdrop = part(el, ".drawer-backdrop");
    expect(getComputedStyle(backdrop).display).not.toBe("none");
    expect(getComputedStyle(backdrop).opacity).toBe("1");
    const greeting = part(el, ".greeting").getBoundingClientRect();
    expect(
      root.elementFromPoint(greeting.left + greeting.width / 2, greeting.top + greeting.height / 2),
    ).toBe(backdrop);
  });

  it("is a modal dialog: it traps Tab, and Escape closes it and gives focus back", async () => {
    const el = mount();
    await still(el);
    const root = el.shadowRoot as ShadowRoot;
    const composer = part(el, ".input");
    composer.focus();

    el.openThreads();
    await still(el);

    const panel = part(el, ".drawer-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");

    // Tab off the last control wraps to the first instead of leaving the list.
    part(el, ".drawer-close").focus();
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }),
    );
    expect(root.activeElement).toBe(part(el, ".drawer-new"));

    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(part(el, ".drawer").hidden).toBe(true);
    expect(root.activeElement).toBe(composer);
  });
});
