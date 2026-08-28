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

/**
 * The reported case: a drag across a stack of elements of very different
 * widths, one of them running under a panel docked at the side.
 *
 * Returns the selectable lines and the panel the offer must not land on.
 */
function stackedPage(): { lines: readonly Text[] } {
  const panel = document.createElement("div");
  panel.style.cssText =
    "position: fixed; top: 0; right: 0; width: 40%; height: 100%; background: #eee;";
  document.body.append(panel);

  const within = document.createElement("div");
  within.style.cssText = "position: fixed; top: 120px; left: 0; width: 100%;";
  const texts: Text[] = [];
  for (const [width, words] of [
    ["120px", "Status Draft"],
    ["120px", "Featured on homepage"],
    // Full width, so it runs under the panel -- which is what drags the union
    // box's centre out from under the selection and onto the panel.
    ["100%", "Try: create an article titled Hello and then save it"],
  ] as const) {
    const p = document.createElement("p");
    p.style.cssText = `margin: 0 0 8px; width: ${width};`;
    p.textContent = words;
    within.append(p);
    texts.push(p.firstChild as Text);
  }
  document.body.append(within);

  live = attachQuoteOffer({
    within,
    label: "Quote",
    exclude: panel,
    onQuote: () => {},
  });
  return { lines: texts };
}

/** Select across `lines`, releasing the pointer over `release`. */
function dragAcross(lines: readonly Text[], release: Text): void {
  const range = document.createRange();
  range.setStart(lines[0] as Text, 0);
  const last = lines[lines.length - 1] as Text;
  range.setEnd(last, last.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const at = document.createRange();
  at.setStart(release, 0);
  at.setEnd(release, 1);
  const point = at.getBoundingClientRect();
  (lines[0] as Text).parentElement?.parentElement?.dispatchEvent(
    new MouseEvent("mouseup", {
      bubbles: true,
      composed: true,
      clientX: point.left,
      clientY: point.top,
    }),
  );
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

/**
 * A selection is not a box; its *union* is.
 *
 * The reported failure: a drag from a narrow column down to a full-width line
 * that ran under the chat panel docked beside it. The union then reached from
 * the column's left edge to the far end of that wide line, and its centre
 * landed most of the way across the page -- on a line the user had not been
 * looking at, behind the panel, while the pointer had let go by the column.
 *
 * So the fix is not "keep the offer over selected text": the union's centre
 * *was* over selected text, just not over any of it the user could see. It is
 * that the offer hangs off **one line** -- the one the gesture ended on.
 */
describe("a selection spanning several elements", () => {
  it("hangs the offer off the line under the pointer, not the middle of the union", () => {
    const { lines } = stackedPage();
    const first = lines[0] as Text;

    dragAcross(lines, first);

    const placed = offer().getBoundingClientRect();
    // Within the horizontal span of the *element* the pointer was over. The
    // union of this selection is the full page width, because its last line
    // runs under the panel -- so its centre is nowhere near this 120px column.
    const column = (first.parentElement as HTMLElement).getBoundingClientRect();
    const centre = placed.left + placed.width / 2;
    expect(centre).toBeGreaterThanOrEqual(column.left - SLACK);
    expect(centre).toBeLessThanOrEqual(column.right + SLACK);
  });

  it("follows the pointer to the last line when the drag ended there", () => {
    const { lines } = stackedPage();
    const last = lines[lines.length - 1] as Text;

    dragAcross(lines, last);

    const placed = offer().getBoundingClientRect();
    // Vertically adjacent to the line the pointer let go on, which is what
    // "beside the selection" has to mean once the selection is several lines.
    expect(Math.abs(firstRectOf(last).top - placed.bottom)).toBeLessThanOrEqual(GAP + SLACK);
  });

  it("uses the first line for a keyboard selection, which has no pointer", () => {
    const { lines } = stackedPage();
    const range = document.createRange();
    range.setStart(lines[0] as Text, 0);
    const last = lines[lines.length - 1] as Text;
    range.setEnd(last, last.length);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);

    (lines[0] as Text).parentElement?.parentElement?.dispatchEvent(
      new KeyboardEvent("keyup", { bubbles: true, key: "ArrowDown" }),
    );

    const placed = offer().getBoundingClientRect();
    expect(Math.abs(firstRectOf(lines[0] as Text).top - placed.bottom)).toBeLessThanOrEqual(
      GAP + SLACK,
    );
  });
});

/** The line box of `node`'s first character. */
function firstRectOf(node: Text): DOMRect {
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 1);
  return range.getBoundingClientRect();
}
