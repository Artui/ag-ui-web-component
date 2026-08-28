import { afterEach, describe, expect, it } from "vitest";
import { attachQuoteOffer, type PageQuoteOffer } from "../../src/ui/page_quote_offer.js";

/**
 * Where the page-side offer lands, measured.
 *
 * The transcript's offer is positioned against the transcript's own box; this
 * one is `position: fixed` against the viewport, so it is a different set of
 * sums with the same two failure modes -- clipped off the top of the window, or
 * pushed off its side. happy-dom answers 0 for every rect, so neither shows up
 * there: an offer rendered outside the viewport passes exactly as a correct one
 * does.
 */

/** How far the offer is asked to sit from the selection. */
const GAP = 6;
/** Rounding slack: rects are fractional, the assertions are about placement. */
const SLACK = 1;

let live: PageQuoteOffer | null = null;

/** Prose pinned somewhere in the viewport, watched by an offer. */
function page(css: string, text = "the quarterly report says revenue fell again"): Text {
  const within = document.createElement("div");
  within.style.cssText = `position: fixed; ${css}`;
  const p = document.createElement("p");
  p.style.margin = "0";
  p.textContent = text;
  within.append(p);
  document.body.append(within);
  live = attachQuoteOffer({
    within,
    label: "Quote",
    exclude: document.createElement("div"),
    onQuote: () => {},
  });
  return p.firstChild as Text;
}

function offer(): HTMLButtonElement {
  return (live as PageQuoteOffer).element;
}

/** Select `[start, end)` and settle the gesture. */
function drag(node: Text, start: number, end: number): DOMRect {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  node.parentElement?.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
  return range.getBoundingClientRect();
}

afterEach(() => {
  live?.detach();
  live = null;
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("where the page offer lands", () => {
  it("sits just above the selection", () => {
    const prose = page("top: 300px; left: 200px; width: 220px;");

    const rect = drag(prose, 4, 13);

    const placed = offer().getBoundingClientRect();
    expect(placed.height).toBeGreaterThan(0);
    expect(rect.top - placed.bottom).toBeCloseTo(GAP, 0);
  });

  it("flips below the selection at the top of the window", () => {
    const prose = page("top: 0; left: 200px; width: 220px;");

    const rect = drag(prose, 4, 13);

    const placed = offer().getBoundingClientRect();
    expect(offer().dataset["below"]).toBe("true");
    expect(placed.top - rect.bottom).toBeCloseTo(GAP, 0);
    expect(placed.top).toBeGreaterThanOrEqual(-SLACK);
  });

  it("stays inside the window at the left edge", () => {
    const prose = page("top: 300px; left: 0; width: 220px;");

    drag(prose, 0, 1);

    expect(offer().getBoundingClientRect().left).toBeGreaterThanOrEqual(-SLACK);
  });

  it("stays inside the window at the right edge", () => {
    // Pinned to the right edge and not wrapped, so the last character really is
    // the last pixel -- a selection anywhere short of that leaves the offer's
    // own half-width of room and the clamp has nothing to do.
    const prose = page("top: 300px; right: 0; white-space: nowrap;", "revenue fell again");
    const width = document.documentElement.clientWidth;

    drag(prose, prose.length - 1, prose.length);

    expect(offer().getBoundingClientRect().right).toBeLessThanOrEqual(width + SLACK);
  });
});
