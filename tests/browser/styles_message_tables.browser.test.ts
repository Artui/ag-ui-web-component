/**
 * A markdown table in an answer, measured rather than described.
 *
 * The stylesheet already says a wide table should scroll inside its own box,
 * and for a long time it could not. `.message` set `word-break: break-word`,
 * which is the legacy spelling of "break anywhere", and breaking anywhere drops
 * the min-content width of every descendant to a single character. A table's
 * column algorithm takes min-content as an input, so the table always fitted
 * `max-width: 100%`, the `overflow-x: auto` never had anything to scroll, and
 * the columns absorbed the pressure by rendering one letter per line: a
 * seven-column header row came out 162px tall.
 *
 * These are in the Chromium project because every one of them is a used value
 * from a real layout. happy-dom computes no box at all, which is exactly how a
 * table could shred in every release without a test noticing.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/** A realistic wide answer: seven columns of report data. */
const WIDE_TABLE =
  "<table><thead><tr><th>Line item</th><th>Draw request</th><th>Condition</th>" +
  "<th>Status</th><th>Amount requested</th><th>Amount approved</th><th>Inspector</th></tr></thead>" +
  "<tbody><tr><td>Foundation waterproofing</td><td>DR-2026-0184</td><td>Pending lien waiver</td>" +
  "<td>Awaiting inspection</td><td>$184,500.00</td><td>$172,300.00</td><td>M. Okonkwo</td></tr></tbody></table>";

/** One token with nowhere to break, which is what the declaration is for. */
const LONG_TOKEN =
  "<p>https://example.com/a/very/long/unbroken/path/that/would/blow/out/the/bubble</p>";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  // Open, because the corner placements now rest collapsed on a first visit
  // and a collapsed panel is scaled to 0.94 with visibility:hidden. Every
  // measurement below would come back 6% short of what a user sees, which is
  // small enough to keep passing while the real target shrank underneath it.
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

/** An assistant bubble holding `html`, where the element puts one. */
function answer(el: AgUiChat, html: string): HTMLElement {
  const root = el.shadowRoot as ShadowRoot;
  const messages = root.querySelector(".messages") as HTMLElement;
  messages.replaceChildren();
  const group = document.createElement("div");
  group.className = "answer";
  const bubble = document.createElement("div");
  bubble.className = "message message--assistant";
  bubble.innerHTML = html;
  group.appendChild(bubble);
  messages.appendChild(group);
  return bubble;
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("a wide table in an answer", () => {
  it("scrolls inside its own box rather than shredding its columns", () => {
    const bubble = answer(mount(), WIDE_TABLE);
    const table = bubble.querySelector("table") as HTMLElement;

    // The assertion the stylesheet's own comment already promised.
    expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
  });

  it("keeps a header cell to a single line of text", () => {
    const bubble = answer(mount(), WIDE_TABLE);
    const header = bubble.querySelector("th") as HTMLElement;

    // One letter per line took this to 162px. A line of text is well under 60.
    expect(header.getBoundingClientRect().height).toBeLessThan(60);
  });

  it("leaves cells free to size themselves to their content", () => {
    const bubble = answer(mount(), WIDE_TABLE);
    const cells = [...bubble.querySelectorAll("th")];

    // The narrowest column collapsed to 36px when min-content was one
    // character. Nothing here is narrower than a short word plus its padding.
    const narrowest = Math.min(...cells.map((c) => c.getBoundingClientRect().width));
    expect(narrowest).toBeGreaterThan(50);
  });

  it("does not let a cell break inside a word", () => {
    const bubble = answer(mount(), WIDE_TABLE);
    const header = bubble.querySelector("th") as HTMLElement;

    // The property that caused it, read as the cell computes it. break-word
    // here is the legacy "break anywhere", and it is what min-content follows.
    expect(getComputedStyle(header).wordBreak).toBe("normal");
  });
});

describe("what the declaration was there for", () => {
  it("still breaks a token that has nowhere else to break", () => {
    const bubble = answer(mount(), LONG_TOKEN);
    const paragraph = bubble.querySelector("p") as HTMLElement;

    // The bubble is width-constrained, so an unbroken URL must wrap inside it
    // rather than push the layout sideways. Fixing the table must not cost this.
    expect(paragraph.scrollWidth).toBeLessThanOrEqual(paragraph.clientWidth + 1);
    expect(getComputedStyle(paragraph).overflowWrap).toBe("break-word");
  });
});
