import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Two composer rows that set the hidden property and used to keep laying out.
 *
 * The shadow sheet has no generic rule for the hidden attribute, and an author
 * display declaration beats the user-agent rule that would otherwise collapse
 * a hidden element. So every class that declares its own display needs its own
 * hidden rule, and these two had none: the slash-command palette, which is
 * mounted on every element and closed almost all of the time, and the row of
 * messages waiting for a run to finish, which is empty almost all of the time.
 *
 * A closed palette painted its margin, its 2px of border and its shadow as a
 * line above the composer, an empty queued row kept its bottom padding, and an
 * empty skill row kept 20px of it -- a band of panel background between the
 * transcript and the composer, on every element and every placement, whether
 * or not the host offers any skills. All three read as nothing over a
 * transcript, which is how they survived.
 *
 * happy-dom lays out no boxes and answers 0 for every height, so it reports
 * the leaking row and the collapsed one identically. Each case also shows the
 * same row with the attribute removed has a box, so a zero here is the rule
 * working rather than an element that never renders.
 */

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.style.height = "480px";
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a hidden composer row takes no space", () => {
  it("collapses the closed slash-command palette", () => {
    const palette = part(mount(), ".skill-palette");

    expect(palette.hidden).toBe(true);
    expect(palette.getBoundingClientRect().height).toBe(0);
    expect(getComputedStyle(palette).display).toBe("none");

    palette.hidden = false;
    expect(palette.getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it("collapses the empty row of queued messages", () => {
    const queued = part(mount(), ".queued");

    expect(queued.hidden).toBe(true);
    expect(queued.getBoundingClientRect().height).toBe(0);
    expect(getComputedStyle(queued).display).toBe("none");

    queued.hidden = false;
    expect(queued.getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it("collapses the empty row of skill chips", () => {
    const el = mount();
    const chips = part(el, ".skill-chips");

    expect(chips.hidden).toBe(true);
    expect(chips.getBoundingClientRect().height).toBe(0);
    expect(getComputedStyle(chips).display).toBe("none");

    chips.hidden = false;
    expect(chips.getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it("leaves nothing between the transcript and the composer", () => {
    // What the three of them added up to, measured where it shows: the row
    // above the composer is the one the eye reads as the gap under the last
    // thing in the transcript.
    const el = mount();

    const transcript = part(el, ".messages-wrap").getBoundingClientRect();
    const composer = part(el, ".input-row").getBoundingClientRect();
    expect(composer.top - transcript.bottom).toBeLessThanOrEqual(1);
  });
});
