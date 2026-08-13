import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { ToolCallCard } from "../../src/ui/tool_call_card.js";

/**
 * The tool card's head row, measured rather than inspected.
 *
 * The head is a flex row of four children, and only the name is flexible. Give
 * the row one more fixed badge than it has room for and the name is what pays:
 * measured in a 470px embedded panel, a card whose call was approved left the
 * name 37px wide, so `word-break: break-word` split "Create event" into
 * "Creat / e / event" across three lines.
 *
 * The decision badge only exists on the server-side approval path, which is why
 * a pass over four host apps never saw it -- nothing was gated server-side. It is
 * also why this is a browser test: happy-dom lays out no boxes, so it reports the
 * same agreeable answer whether the row wraps, crushes, or overflows.
 */

/** The panel width the defect was measured at: a sidebar, not a phone. */
const PANEL = "470px";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.style.width = PANEL;
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/** An approved call's card, appended into the real transcript so it inherits the cascade. */
function approvedCard(el: AgUiChat, name = "create_event", summary = "Create event"): HTMLElement {
  const card = new ToolCallCard(
    name,
    { title: "Design sync", day: "2026-08-14", start_hour: 14 },
    summary,
  );
  card.recordDecision("approved");
  part(shadow(el), ".messages").appendChild(card.element);
  return card.element;
}

/** One line of the name's own text, measured by removing everything that competes with it. */
function singleLineHeight(head: HTMLElement, nameSelector = ".tool-call-name"): number {
  const probe = part(head, nameSelector).cloneNode(true) as HTMLElement;
  probe.style.position = "absolute";
  probe.style.whiteSpace = "nowrap";
  head.appendChild(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  return height;
}

describe("tool card head (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // The defect in one assertion: the label rendered three lines tall.
  it("keeps an approved call's name on one line", () => {
    const el = mount();
    const head = part(approvedCard(el), ".tool-call-head");
    const name = part(head, ".tool-call-name");

    expect(name.getBoundingClientRect().height).toBeCloseTo(singleLineHeight(head), 0);
  });

  it("wraps the decision badge onto its own row rather than squeezing the name", () => {
    const el = mount();
    const head = part(approvedCard(el), ".tool-call-head");
    const name = part(head, ".tool-call-name");
    const decision = part(head, ".tool-call-decision");

    expect(decision.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      name.getBoundingClientRect().bottom,
    );
  });

  it("gives the name more room than the badges it shares the row with", () => {
    const el = mount();
    const head = part(approvedCard(el), ".tool-call-head");
    const name = part(head, ".tool-call-name").getBoundingClientRect().width;
    const status = part(head, ".tool-call-status").getBoundingClientRect().width;

    expect(name).toBeGreaterThan(status);
  });

  it("breaks a name that genuinely cannot fit, instead of overflowing the card", () => {
    const el = mount();
    const card = approvedCard(el, "x".repeat(120), "x".repeat(120));
    const head = part(card, ".tool-call-head");
    const name = part(head, ".tool-call-name");

    expect(name.getBoundingClientRect().right).toBeLessThanOrEqual(
      card.getBoundingClientRect().right,
    );
    expect(name.getBoundingClientRect().height).toBeGreaterThan(singleLineHeight(head));
  });

  it("leaves an ungated call's head on a single row", () => {
    const el = mount();
    const card = new ToolCallCard("list_events", {}, "List events");
    part(shadow(el), ".messages").appendChild(card.element);
    const head = part(card.element, ".tool-call-head");

    // The row, not the label: the badges are a pixel taller than the text they
    // sit beside, so this asks that nothing wrapped rather than that it matches.
    expect(head.getBoundingClientRect().height).toBeLessThan(singleLineHeight(head) * 2);
  });
});
