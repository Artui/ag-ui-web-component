import { beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The claims about following the transcript that need a real layout.
 *
 * `tests/stick_to_bottom.test.ts` and `tests/ag_ui_chat_scroll.test.ts` cover
 * the arithmetic and the wiring, but both have to *fake* `scrollHeight` and
 * `clientHeight`: happy-dom lays nothing out, so every element is trivially at
 * the bottom and the scrolled-away branch does not exist. A green run there is
 * compatible with an element that never scrolls at all.
 *
 * It also cannot decide whether the button is visible. Showing it is an
 * attribute selector over a `display` swap, and happy-dom resolves neither the
 * selector nor the cascade -- the same reason the sanitisation and host-theming
 * tests live here.
 */

function mountTall(): { el: AgUiChat; messages: HTMLElement } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  // Embedded placement lays the panel out in flow and fills its host box, so a
  // fixed-height wrapper is what makes the list actually overflow. Without a
  // constrained height nothing scrolls and every assertion below is vacuous --
  // which the first case guards against.
  el.setAttribute("placement", "embedded");
  const wrapper = document.createElement("div");
  wrapper.style.setProperty("height", "300px");
  wrapper.append(el);
  document.body.append(wrapper);
  const messages = el.shadowRoot?.querySelector<HTMLElement>(".messages");
  if (!messages) {
    throw new Error("expected a message list");
  }
  for (let i = 0; i < 40; i += 1) {
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, `message ${i}`);
  }
  return { el, messages };
}

function jumpButton(el: AgUiChat): HTMLButtonElement {
  const button = el.shadowRoot?.querySelector<HTMLButtonElement>(".jump-latest");
  if (!button) {
    throw new Error("expected a jump button");
  }
  return button;
}

/** Scroll and wait for the event, which a real engine dispatches async. */
async function scrollTo(messages: HTMLElement, top: number): Promise<void> {
  messages.scrollTop = top;
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

describe("the transcript under a real layout", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  it("actually overflows, so the rest of these assertions mean something", () => {
    const { messages } = mountTall();

    expect(messages.scrollHeight).toBeGreaterThan(messages.clientHeight);
  });

  it("holds the reader's position when content arrives", async () => {
    const { el, messages } = mountTall();
    await scrollTo(messages, 0);

    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "arriving mid-read");

    expect(messages.scrollTop).toBe(0);
  });

  it("keeps the jump button out of the layout until something is missed", async () => {
    const { el, messages } = mountTall();
    await scrollTo(messages, 0);

    // Scrolled away, but nothing missed yet.
    expect(getComputedStyle(jumpButton(el)).display).toBe("none");

    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "arriving mid-read");

    expect(getComputedStyle(jumpButton(el)).display).not.toBe("none");
  });

  it("returns to the foot when the button is pressed", async () => {
    const { el, messages } = mountTall();
    await scrollTo(messages, 0);
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "arriving mid-read");

    jumpButton(el).click();

    expect(messages.scrollHeight - messages.scrollTop - messages.clientHeight).toBeLessThanOrEqual(
      4,
    );
    expect(getComputedStyle(jumpButton(el)).display).toBe("none");
  });

  it("disables the browser's own scroll anchoring, which competes for the job", () => {
    const { messages } = mountTall();

    // Chromium implements overflow-anchor and would otherwise hold the view
    // still exactly when the scroller wants to follow.
    expect(getComputedStyle(messages).overflowAnchor).toBe("none");
  });
});
