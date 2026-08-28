/**
 * The transcript's scroll behaviour, wired into the element.
 *
 * `tests/stick_to_bottom.test.ts` covers the controller itself. This is the
 * wiring: that content arriving during a run goes through it rather than
 * yanking the view back, that the button appears when something is missed, and
 * that pressing it returns to the foot.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ELEMENT_TAG, MESSAGE_ROLE } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

defineAgUiChat();

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/**
 * Mount, then give the message list real metrics.
 *
 * happy-dom lays nothing out, so every element reports `scrollHeight` and
 * `clientHeight` of 0 and is therefore always "at the bottom". Without this the
 * scrolled-away branch is unreachable and the test would agree with any
 * implementation at all.
 */
function mountScrollable(): { el: AgUiChat; messages: HTMLElement } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  document.body.append(el);
  const messages = shadow(el).querySelector<HTMLElement>(".messages");
  if (messages === null) {
    throw new Error("expected a message list");
  }
  Object.defineProperty(messages, "scrollHeight", { value: 1000, configurable: true });
  Object.defineProperty(messages, "clientHeight", { value: 400, configurable: true });
  let top = 0;
  Object.defineProperty(messages, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = value;
    },
    configurable: true,
  });
  return { el, messages };
}

function jumpButton(el: AgUiChat): HTMLButtonElement {
  const button = shadow(el).querySelector<HTMLButtonElement>(".jump-latest");
  if (button === null) {
    throw new Error("expected a jump button");
  }
  return button;
}

function scrollAway(messages: HTMLElement): void {
  messages.scrollTop = 100;
  messages.dispatchEvent(new Event("scroll"));
}

describe("reading the transcript while content arrives", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("does not yank the view back when an assistant message lands", () => {
    const { el, messages } = mountScrollable();
    scrollAway(messages);

    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "an answer");

    expect(messages.scrollTop).toBe(100);
  });

  it("still follows when the reader has not scrolled away", () => {
    const { el, messages } = mountScrollable();

    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "an answer");

    expect(messages.scrollTop).toBe(1000);
  });

  it("goes to the foot for the reader's own message, scrolled away or not", () => {
    // Pressing Send is as deliberate as pressing the jump button.
    const { el, messages } = mountScrollable();
    scrollAway(messages);

    el.appendMessage(MESSAGE_ROLE.USER, "hello");

    expect(messages.scrollTop).toBe(1000);
  });
});

describe("the jump-to-latest button", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("stays hidden while the reader is following", () => {
    const { el } = mountScrollable();

    expect(jumpButton(el).dataset["missed"]).not.toBe("true");
  });

  it("stays hidden when the reader scrolls up through a settled transcript", () => {
    const { el, messages } = mountScrollable();

    scrollAway(messages);

    expect(jumpButton(el).dataset["missed"]).not.toBe("true");
  });

  it("appears once something arrives while the reader is away", () => {
    const { el, messages } = mountScrollable();
    scrollAway(messages);

    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "you missed this");

    expect(jumpButton(el).dataset["missed"]).toBe("true");
  });

  it("returns to the foot and hides itself when pressed", () => {
    const { el, messages } = mountScrollable();
    scrollAway(messages);
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "you missed this");

    jumpButton(el).click();

    expect(messages.scrollTop).toBe(1000);
    expect(jumpButton(el).dataset["missed"]).toBe("false");
  });
});
