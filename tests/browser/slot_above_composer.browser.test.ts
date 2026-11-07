import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The `above-composer` slot, measured.
 *
 * The only light-DOM region near the composer used to be `footer`, below it, so
 * a host wanting content against the input moved the footer up by reordering
 * the panel's flex column, which depends on the internal layout. The slot sits
 * after the composer stack and directly above the composer, in every placement
 * and in the greeting layout, where an empty conversation moves the composer
 * and the slot has to move with it. Layout, so Chromium: happy-dom lays out no
 * boxes.
 */

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

/** What a host puts in the slot: a fixed-height row, so its box is not empty. */
const SLOTTED_HEIGHT = 24;

function mount(attrs: Record<string, string>, slotted: boolean): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  // Open from the first frame: a corner panel mounts collapsed, and a collapsed
  // panel lays every box out at zero.
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  if (slotted) {
    const row = document.createElement("div");
    row.slot = "above-composer";
    row.className = "host-row";
    row.style.height = `${SLOTTED_HEIGHT}px`;
    el.append(row);
  }
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

function hostRow(el: AgUiChat): DOMRect {
  const row = el.querySelector(".host-row");
  if (!(row instanceof HTMLElement)) {
    throw new Error("no slotted row");
  }
  return row.getBoundingClientRect();
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
  ["page, with a conversation", { placement: "page" }, true],
  ["page, in the greeting layout", { placement: "page" }, false],
];

describe("slotted content above the composer", () => {
  for (const [name, attrs, withTurn] of PLACEMENTS) {
    it(`sits between the transcript and the composer: ${name}`, async () => {
      const el = mount(attrs, true);
      if (withTurn) {
        el.appendMessage(MESSAGE_ROLE.USER, "a turn, so the layout is not the empty one");
      }
      await settle();
      expect(el.hasAttribute("data-empty")).toBe(!withTurn);

      const row = hostRow(el);
      const transcript = part(el, ".messages-wrap").getBoundingClientRect();
      const composer = part(el, ".input-row").getBoundingClientRect();
      expect(row.height).toBe(SLOTTED_HEIGHT);
      expect(row.top).toBeGreaterThanOrEqual(transcript.bottom - 0.5);
      // Against the input, with nothing of the panel's between them.
      expect(row.bottom).toBeLessThanOrEqual(composer.top + 0.5);
      expect(composer.top - row.bottom).toBeLessThan(1);
      expect(Math.abs(row.left - composer.left)).toBeLessThan(1);
    });
  }

  it("follows the composer when the greeting layout centres it", async () => {
    // The composer sits mid-page while the conversation is empty, and moves to
    // the foot once it has something in it; the slot goes with it both times.
    const el = mount({ placement: "page" }, true);
    await settle();
    const centred = hostRow(el).top;
    const chat = part(el, ".chat").getBoundingClientRect();
    expect(centred).toBeLessThan(chat.top + chat.height * 0.75);

    el.appendMessage(MESSAGE_ROLE.USER, "now there is a conversation");
    await settle();

    const docked = hostRow(el);
    expect(docked.top).toBeGreaterThan(centred);
    expect(part(el, ".input-row").getBoundingClientRect().top - docked.bottom).toBeLessThan(1);
  });

  it("comes after the rest of the composer stack", () => {
    // Skill chips, the hint, queued turns and the attachment tray stay above
    // the host's row: they belong to the turn being written, and the row is
    // content the host keeps against the input.
    const el = mount({ placement: "page" }, true);
    const slot = part(el, 'slot[name="above-composer"]');
    expect(slot.previousElementSibling?.className).toBe("attachment-slot");
    expect(slot.nextElementSibling?.className).toContain("input-row");
  });
});

describe("an empty above-composer slot", () => {
  for (const placement of ["floating", "page"]) {
    it(`takes no space: ${placement}`, async () => {
      const el = mount({ placement }, false);
      await settle();
      const before = part(el, ".input-row").getBoundingClientRect();
      const transcript = part(el, ".messages-wrap").getBoundingClientRect().height;

      part(el, 'slot[name="above-composer"]').remove();
      await settle();

      expect(part(el, ".input-row").getBoundingClientRect()).toEqual(before);
      expect(part(el, ".messages-wrap").getBoundingClientRect().height).toBe(transcript);
    });
  }
});
