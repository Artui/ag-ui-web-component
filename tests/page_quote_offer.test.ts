import { afterEach, describe, expect, it } from "vitest";
import { attachQuoteOffer, type PageQuoteOffer } from "../src/ui/page_quote_offer.js";

/**
 * The page-side offer, and the three reasons it is not a recipe.
 *
 * Geometry lives in the Chromium file next door; what is here is *when* the
 * offer appears, which is the whole of the bug this replaced. The recipe it
 * replaced quoted on every settled selection, including the user's own
 * half-typed form field, and shipped that way in the README.
 */

let live: PageQuoteOffer | null = null;
let quoted: string[] = [];

interface Page {
  /** The region the offer watches. */
  within: HTMLElement;
  /** Ordinary prose in it. */
  prose: Text;
  /** A form field in it -- the trap. */
  field: HTMLInputElement;
  /** A stand-in for the widget, which owns its own gesture. */
  widget: HTMLElement;
  /** Text inside the widget. */
  inside: Text;
}

function page(watch?: HTMLElement): Page {
  const region = document.createElement("div");
  const within = watch ?? region;
  const p = document.createElement("p");
  p.textContent = "the quarterly report says revenue fell";
  const field = document.createElement("input");
  field.value = "half-typed article title";
  const widget = document.createElement("div");
  const answer = document.createElement("p");
  answer.textContent = "the widget's own transcript";
  widget.append(answer);
  region.append(p, field, widget);
  document.body.append(region);

  quoted = [];
  live = attachQuoteOffer({
    within,
    label: "Quote",
    exclude: widget,
    onQuote: (text) => quoted.push(text),
  });

  return { within, prose: p.firstChild as Text, field, widget, inside: answer.firstChild as Text };
}

function offer(): HTMLButtonElement {
  return (live as PageQuoteOffer).element;
}

/** Select `[start, end)` of a text node and settle the gesture on `target`. */
function drag(target: EventTarget, node: Node, start: number, end: number): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, composed: true }));
}

afterEach(() => {
  live?.detach();
  live = null;
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("attachQuoteOffer", () => {
  it("offers to quote a selection in the page", () => {
    const { prose } = page();

    drag(prose, prose, 4, 13);

    expect(offer().hidden).toBe(false);
    expect(offer().textContent).toBe("Quote");
  });

  it("quotes what was selected, once taken", () => {
    const { prose } = page();
    drag(prose, prose, 4, 13);

    offer().click();

    expect(quoted).toEqual(["quarterly"]);
    expect(offer().hidden).toBe(true);
  });

  /**
   * The defect this module exists for. Chrome reports a field's internal
   * selection as an ordinary range over the field's *wrapper*, so the text
   * reads back and the range says nothing -- which is how the first version of
   * this shipped quoting the user's own half-typed input back at them.
   */
  it("stays out of the way while the user is selecting in a form field", () => {
    const { within, prose, field } = page();
    field.focus();

    drag(within, prose, 4, 13);

    expect(offer().hidden).toBe(true);
    expect(quoted).toEqual([]);
  });

  it("stays out of the way while the user is selecting in a textarea", () => {
    const { within, prose } = page();
    const box = document.createElement("textarea");
    within.append(box);
    box.focus();

    drag(within, prose, 4, 13);

    expect(offer().hidden).toBe(true);
  });

  it("offers where the document reports nothing focused at all", () => {
    const { prose } = page();
    // `activeElement` is nullable, and a document that answers `null` must not
    // read as "the user is typing" -- the whole guard is about a *field* having
    // focus, and nothing having focus is the ordinary case for a fresh page.
    const original = Object.getOwnPropertyDescriptor(Document.prototype, "activeElement");
    Object.defineProperty(document, "activeElement", { configurable: true, value: null });

    try {
      drag(prose, prose, 4, 13);
      expect(offer().hidden).toBe(false);
    } finally {
      delete (document as unknown as Record<string, unknown>)["activeElement"];
      if (original !== undefined) {
        Object.defineProperty(Document.prototype, "activeElement", original);
      }
    }
  });

  it("stays out of the way in a contenteditable", () => {
    const { within, prose } = page();
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    within.append(editor);
    editor.focus();

    drag(within, prose, 4, 13);

    expect(offer().hidden).toBe(true);
  });

  it("leaves the widget's own transcript to the widget", () => {
    const { widget, inside } = page();

    drag(inside, inside, 4, 10);

    expect(offer().hidden).toBe(true);
    expect(widget.isConnected).toBe(true);
  });

  it("retires a standing offer when the gesture moves into the widget", () => {
    const { prose, inside } = page();
    drag(prose, prose, 4, 13);

    drag(inside, inside, 4, 10);

    expect(offer().hidden).toBe(true);
  });

  it("retires the offer when the selection goes away", () => {
    const { prose } = page();
    drag(prose, prose, 4, 13);

    drag(prose, prose, 4, 4);

    expect(offer().hidden).toBe(true);
  });

  it("offers on a keyboard selection too", () => {
    const { within, prose } = page();
    const range = document.createRange();
    range.setStart(prose, 4);
    range.setEnd(prose, 13);
    window.getSelection()?.addRange(range);

    within.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));

    expect(offer().hidden).toBe(false);
  });

  it("retires the offer when the next gesture starts", () => {
    const { within, prose } = page();
    drag(prose, prose, 4, 13);

    within.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(offer().hidden).toBe(true);
  });

  /**
   * Two separate reasons the offer would otherwise die on its own press: the
   * browser collapses the selection, and the press is also the "next gesture"
   * that retires a standing offer. The second only bites when the offer is
   * inside the watched region -- which is the default, since the offer lands in
   * `document.body` and `offerQuoteInPage()` watches the whole page.
   */
  it("survives its own press, which would otherwise collapse the selection", () => {
    const { prose } = page(document.body);
    drag(prose, prose, 4, 13);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

    offer().dispatchEvent(press);

    expect(press.defaultPrevented).toBe(true);
    expect(offer().hidden).toBe(false);
  });

  it("still retires on a press anywhere else in the watched region", () => {
    const { prose } = page(document.body);
    drag(prose, prose, 4, 13);

    prose.parentElement?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

    expect(offer().hidden).toBe(true);
  });

  /**
   * The offer is positioned in viewport coordinates, so anything that moves the
   * words out from under it leaves it pointing at the wrong thing. Capture,
   * because a scrolling pane does not bubble a scroll event.
   */
  it("retires the offer when the page scrolls", () => {
    const { within, prose } = page();
    drag(prose, prose, 4, 13);

    within.dispatchEvent(new Event("scroll", { bubbles: false }));

    expect(offer().hidden).toBe(true);
  });

  it("retires the offer when the window resizes", () => {
    const { prose } = page();
    drag(prose, prose, 4, 13);

    window.dispatchEvent(new Event("resize"));

    expect(offer().hidden).toBe(true);
  });

  it("takes its listeners and its styles with it when detached", () => {
    const { prose } = page();
    const sheets = document.adoptedStyleSheets.length;

    (live as PageQuoteOffer).detach();
    drag(prose, prose, 4, 13);

    expect(offer().isConnected).toBe(false);
    expect(document.adoptedStyleSheets).toHaveLength(sheets - 1);
    expect(quoted).toEqual([]);
  });
});
