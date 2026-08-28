import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { quotableSelection } from "../../src/ui/quote_selection.js";

/**
 * The quote offer, measured, and the shadow read done for real.
 *
 * Two things only a browser can settle. First, `getComposedRanges` exists here
 * and does not in happy-dom, so this is the only place the shadow-aware read is
 * exercised against the engine rather than against a stand-in. Second, an offer
 * that floats beside a selection is pure geometry: happy-dom answers 0 for
 * every rect, so an offer rendered outside the panel, or on top of the words it
 * points at, passes there exactly as an offer placed correctly does.
 */

/** How far the offer is asked to sit from the selection. */
const GAP = 6;
/** Rounding slack: rects are fractional, the assertions are about placement. */
const SLACK = 1;

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function mount(label?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (label !== undefined) {
    el.setAttribute("data-strings", JSON.stringify({ quoteSelection: label }));
  }
  el.style.width = "420px";
  el.style.height = "360px";
  document.body.appendChild(el);
  return el;
}

/** The first text node inside `node`, whatever the renderer wrapped it in. */
function firstText(node: Node): Text {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  const text = walker.nextNode();
  if (text === null) {
    throw new Error("expected rendered text");
  }
  return text as Text;
}

/** Select `[start, end)` of a text node and settle the gesture. */
function drag(el: AgUiChat, node: Text, start: number, end: number): DOMRect {
  const messages = shadow(el).querySelector(".messages") as HTMLElement;
  messages.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  messages.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  return range.getBoundingClientRect();
}

function offer(el: AgUiChat): HTMLButtonElement {
  return shadow(el).querySelector(".quote-selection") as HTMLButtonElement;
}

function wrapRect(el: AgUiChat): DOMRect {
  return (shadow(el).querySelector(".messages-wrap") as HTMLElement).getBoundingClientRect();
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("reading the selection through the engine's own shadow API", () => {
  it("reads a shadow selection where `getComposedRanges` is what answers", () => {
    const el = mount();
    const text = firstText(el.appendMessage("assistant", "the second paragraph"));
    const selection = window.getSelection();
    // Stated rather than assumed: without this the test would prove only that
    // the fallback works, which happy-dom already proves.
    expect(typeof (selection as unknown as Record<string, unknown>)["getComposedRanges"]).toBe(
      "function",
    );

    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const messages = shadow(el).querySelector(".messages") as HTMLElement;
    expect(quotableSelection(messages, [shadow(el)])?.text).toBe("second");
  });

  it("gets nothing back from the same call without the shadow root", () => {
    const el = mount();
    const text = firstText(el.appendMessage("assistant", "the second paragraph"));
    const selection = window.getSelection() as Selection & {
      getComposedRanges: (options: {
        shadowRoots: readonly ShadowRoot[];
      }) => readonly AbstractRange[];
    };
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    selection.removeAllRanges();
    selection.addRange(range);

    // Why the shadow root is handed over at all: withheld, the endpoints come
    // back rescoped out of the shadow tree entirely, and land outside the
    // transcript -- where the same containment test that rejects a stray drag
    // rejects them. This is the behaviour WebKit shows for an ordinary
    // `document.getSelection()`, which is the reason this API exists.
    const withheld = selection.getComposedRanges({ shadowRoots: [] })[0] as AbstractRange;

    const messages = shadow(el).querySelector(".messages") as HTMLElement;
    expect(messages.contains(withheld.startContainer)).toBe(false);
    expect(shadow(el).contains(withheld.startContainer)).toBe(false);
  });
});

describe("where the offer lands", () => {
  it("sits just above the selection, and inside the transcript", () => {
    const el = mount();
    for (let i = 0; i < 6; i += 1) {
      el.appendMessage("assistant", `answer number ${i} with words to select`);
    }
    const last = shadow(el).querySelectorAll(".message--assistant");
    const rect = drag(el, firstText(last[last.length - 1] as HTMLElement), 0, 6);

    const placed = offer(el).getBoundingClientRect();
    expect(offer(el).hidden).toBe(false);
    expect(placed.height).toBeGreaterThan(0);
    expect(rect.top - placed.bottom).toBeCloseTo(GAP, 0);
    expect(placed.left).toBeGreaterThanOrEqual(wrapRect(el).left - SLACK);
    expect(placed.right).toBeLessThanOrEqual(wrapRect(el).right + SLACK);
  });

  it("flips below the selection where there is no room above it", () => {
    const el = mount();
    const first = el.appendMessage("assistant", "the very first line of the transcript");
    const rect = drag(el, firstText(first), 0, 8);

    const placed = offer(el).getBoundingClientRect();
    expect(offer(el).dataset["below"]).toBe("true");
    expect(placed.top - rect.bottom).toBeCloseTo(GAP, 0);
    expect(placed.top).toBeGreaterThanOrEqual(wrapRect(el).top - SLACK);
  });

  /**
   * The clamp only has anything to do once the offer is wider than the margin
   * the transcript already keeps, which the English label is not -- so these
   * two localize it. That is the honest trigger rather than a contrived one: a
   * host translating "Quote" is the case the clamp exists for, and the panel
   * width is the gallery's.
   */
  const LONG = "Diesen Abschnitt zitieren";

  it("stays inside the panel for a selection at the left margin", () => {
    const el = mount(LONG);
    for (let i = 0; i < 6; i += 1) {
      el.appendMessage("assistant", `answer number ${i} with words to select`);
    }
    const last = shadow(el).querySelectorAll(".message--assistant");
    // The first character of the line, which is as far left as a selection gets.
    drag(el, firstText(last[last.length - 1] as HTMLElement), 0, 1);

    const placed = offer(el).getBoundingClientRect();
    expect(placed.width).toBeGreaterThan(wrapRect(el).width / 4);
    expect(placed.left).toBeGreaterThanOrEqual(wrapRect(el).left - SLACK);
  });

  it("stays inside the panel for a selection at the right margin", () => {
    const el = mount(LONG);
    for (let i = 0; i < 6; i += 1) {
      el.appendMessage("user", `question number ${i} with words to select`);
    }
    const last = shadow(el).querySelectorAll(".message--user");
    const text = firstText(last[last.length - 1] as HTMLElement);
    drag(el, text, text.length - 1, text.length);

    const placed = offer(el).getBoundingClientRect();
    expect(placed.right).toBeLessThanOrEqual(wrapRect(el).right + SLACK);
  });
});
