import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { ToolCallCard } from "../../src/ui/tool_call_card.js";

/**
 * A card body a host formatter took over, measured rather than inspected.
 *
 * Two claims, and they pull in opposite directions. The region gives up its
 * preformatted whitespace, because that is what a table inherits as mangled cell
 * spacing. It keeps everything else the card decides -- the face, the frame, the
 * scroll cap -- so a payload the host sized for a wide page is contained rather
 * than allowed to push the card, or the transcript, past the panel edge. The
 * pair is the point: a rule written a little too wide would satisfy the first
 * claim and quietly give up the second.
 *
 * A browser test because happy-dom computes no cascade and lays out no boxes: it
 * answers the same whether the marker rule applies, is overridden, or was never
 * written, and the same whether the host's content sits inside the card or hangs
 * out of it.
 */

/** The narrow end: a docked sidebar, the width earlier card findings were measured at. */
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

/**
 * A table wider than any sidebar, as a host formatter that sized for a full-width
 * page would return one. Explicitly wide: left to itself a table shrinks its
 * columns to fit, which would prove containment by never testing it.
 */
function ordersTable(): HTMLTableElement {
  const table = document.createElement("table");
  table.style.width = "800px";
  const body = document.createElement("tbody");
  for (let row = 0; row < 3; row += 1) {
    const tr = document.createElement("tr");
    for (const cell of ["ORD-100248", "Amsterdam warehouse", "awaiting pick", "EUR 1 240.00"]) {
      const td = document.createElement("td");
      td.textContent = cell;
      tr.appendChild(td);
    }
    body.appendChild(tr);
  }
  table.appendChild(body);
  return table;
}

/** A settled card in the real transcript, so it inherits the shadow cascade. */
function settledCard(el: AgUiChat, format: ConstructorParameters<typeof ToolCallCard>[4]) {
  const card = new ToolCallCard(
    "list_orders",
    { status: "open" },
    "List orders",
    undefined,
    format,
  );
  part(shadow(el), ".messages").appendChild(card.element);
  card.settle("done", '{"count":3}');
  // The result region lives behind the details toggle in the default mode.
  part(card.element, ".tool-call-toggle").click();
  return card.element;
}

describe("a tool-card region a host formatter drew", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("relaxes the preformatted whitespace, and only that", () => {
    const el = mount();
    const plainCard = settledCard(el, undefined);
    const plain = part(plainCard, ".tool-call-result");
    const formattedCard = settledCard(el, {
      formatPayload: () => "3 orders are awaiting pick.",
    });
    const formatted = part(formattedCard, ".tool-call-result");

    expect(getComputedStyle(plain).whiteSpace).toBe("pre-wrap");
    expect(getComputedStyle(formatted).whiteSpace).toBe("normal");
    // Everything else the card decided still holds. Two regions of one card
    // that disagreed about the face or the height cap would read as one of them
    // having been pasted in from somewhere else.
    expect(getComputedStyle(formatted).fontFamily).toBe(getComputedStyle(plain).fontFamily);
    expect(getComputedStyle(formatted).maxHeight).toBe(getComputedStyle(plain).maxHeight);
    expect(getComputedStyle(formatted).borderTopWidth).toBe(getComputedStyle(plain).borderTopWidth);
  });

  it("keeps a host's own content inside the panel", () => {
    // The region gives up its whitespace, not its frame: a table sized for a
    // wide page must still scroll inside the card rather than push the card --
    // or the transcript -- past the panel edge.
    const el = mount();
    const card = settledCard(el, { formatPayload: () => ordersTable() });
    const region = part(card, ".tool-call-result");
    const table = part(region, "table");

    expect(table.getBoundingClientRect().width).toBeGreaterThan(
      region.getBoundingClientRect().width,
    );
    // Contained by scrolling inside the region, which is the card's own answer
    // to a long payload and applies to a host's just the same. Driven rather
    // than measured: scrollWidth exceeds clientWidth on a box that merely
    // overflows, and says nothing about whether a reader can reach the far
    // column. Only a box that actually scrolls keeps an assigned scrollLeft.
    expect(region.scrollWidth).toBeGreaterThan(region.clientWidth);
    region.scrollLeft = 200;
    expect(region.scrollLeft).toBe(200);
    expect(Math.round(region.getBoundingClientRect().right)).toBeLessThanOrEqual(
      Math.round(el.getBoundingClientRect().right),
    );
    expect(Math.round(card.getBoundingClientRect().right)).toBeLessThanOrEqual(
      Math.round(el.getBoundingClientRect().right),
    );
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      document.documentElement.clientWidth,
    );
    // The transcript is the box a leak would show up in first: nothing about a
    // card's own payload should make the conversation scroll sideways.
    const transcript = part(shadow(el), ".messages");
    expect(transcript.scrollWidth).toBeLessThanOrEqual(transcript.clientWidth);
  });
});
