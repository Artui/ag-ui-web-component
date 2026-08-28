import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

/**
 * Quoting a selection into the composer.
 *
 * Geometry is not asserted here -- happy-dom lays out no boxes, so every rect
 * is zero and every placement claim would pass whatever the code did. Where the
 * offer *lands* is measured in Chromium; what it says and what it sends is here.
 */

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function offer(el: AgUiChat): HTMLButtonElement {
  const button = shadow(el).querySelector<HTMLButtonElement>(".quote-selection");
  if (button === null) {
    throw new Error("expected the quote offer to be built");
  }
  return button;
}

function composer(el: AgUiChat): HTMLTextAreaElement {
  return shadow(el).querySelector<HTMLTextAreaElement>(".input") as HTMLTextAreaElement;
}

/** An assistant answer in the transcript, and its text node. */
function answer(el: AgUiChat, text = "the second paragraph of the answer"): Text {
  const bubble = el.appendMessage("assistant", text);
  return bubble.firstChild as Text;
}

/** Select part of the transcript and settle the gesture, as a drag does. */
function drag(el: AgUiChat, node: Node, start: number, end: number): void {
  const messages = shadow(el).querySelector(".messages") as HTMLElement;
  messages.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  messages.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("quoting a transcript selection", () => {
  it("offers to quote what was selected", () => {
    const el = mount();
    const text = answer(el);

    drag(el, text, 4, 10);

    expect(offer(el).hidden).toBe(false);
    expect(offer(el).textContent).toBe(DEFAULT_UI_STRINGS.quoteSelection);
  });

  it("is hidden until something is selected", () => {
    const el = mount();
    answer(el);

    expect(offer(el).hidden).toBe(true);
  });

  it("puts the selection into the composer as a quotation, and does not send", () => {
    const el = mount();
    const text = answer(el);
    drag(el, text, 4, 10);

    offer(el).click();

    expect(composer(el).value).toBe("> second\n\n");
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(0);
  });

  it("retires the offer once it is taken", () => {
    const el = mount();
    const text = answer(el);
    drag(el, text, 4, 10);

    offer(el).click();

    expect(offer(el).hidden).toBe(true);
    expect(window.getSelection()?.rangeCount).toBe(0);
  });

  it("retires the offer when the next gesture starts", () => {
    const el = mount();
    const text = answer(el);
    drag(el, text, 4, 10);

    (shadow(el).querySelector(".messages") as HTMLElement).dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );

    expect(offer(el).hidden).toBe(true);
  });

  it("retires the offer when a gesture selects nothing", () => {
    const el = mount();
    const text = answer(el);
    drag(el, text, 4, 10);

    drag(el, text, 4, 4);

    expect(offer(el).hidden).toBe(true);
  });

  it("offers on a keyboard selection too", () => {
    const el = mount();
    const text = answer(el);
    const messages = shadow(el).querySelector(".messages") as HTMLElement;
    const range = document.createRange();
    range.setStart(text, 4);
    range.setEnd(text, 10);
    window.getSelection()?.addRange(range);

    messages.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "ArrowRight" }));

    expect(offer(el).hidden).toBe(false);
  });

  it("keeps its selection to itself when the offer is pressed", () => {
    const el = mount();
    const text = answer(el);
    drag(el, text, 4, 10);
    const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });

    offer(el).dispatchEvent(press);

    // Without this the press collapses the selection before the click reads it.
    expect(press.defaultPrevented).toBe(true);
  });

  it("never offers where the host opted out", () => {
    const el = mount({ "data-quote-selection": "false" });
    const text = answer(el);

    drag(el, text, 4, 10);

    expect(offer(el).hidden).toBe(true);
  });
});

describe("quote()", () => {
  it("appends after what is already typed, on its own paragraph", () => {
    const el = mount();
    composer(el).value = "about this:";

    el.quote("one\ntwo");

    expect(composer(el).value).toBe("about this:\n\n> one\n> two\n\n");
  });

  it("does not accumulate blank lines when quoting twice", () => {
    const el = mount();

    el.quote("one");
    el.quote("two");

    expect(composer(el).value).toBe("> one\n\n> two\n\n");
  });

  it("leaves the caret after the quotation", () => {
    const el = mount();

    el.quote("one");

    expect(composer(el).selectionStart).toBe(composer(el).value.length);
  });

  it("ignores text with nothing in it", () => {
    const el = mount();

    el.quote("   ");

    expect(composer(el).value).toBe("");
  });
});
