/**
 * The message action row, measured rather than described.
 *
 * Both assertions here are about resolved CSS, which is why they are in the
 * Chromium project: happy-dom computes no box at all, so the row was free to
 * shrink under it. It had -- to roughly 20px square, below the 24px floor that
 * makes a control reliably tappable, on the one affordance in the transcript
 * that every reader eventually wants.
 *
 * The tooltip is here for the same reason and one more: a `title` never
 * appears on keyboard focus, so an icon-only button is unnamed for anyone
 * tabbing to it. The drawn one is what closes that, and it exists only in the
 * stylesheet.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { attachMessageActions } from "../../src/ui/message_actions.js";
import { DEFAULT_UI_STRINGS } from "../../src/ui/ui_strings.js";

/** The smallest target WCAG 2.2 accepts without a spacing exemption. */
const MIN_TARGET = 24;

function mountBar(): { el: AgUiChat; buttons: HTMLButtonElement[] } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  document.body.appendChild(el);
  const root = el.shadowRoot as ShadowRoot;
  // A finished bubble, inside the shadow root so the component's own styles
  // apply -- the whole question here is what the stylesheet resolves to.
  const group = document.createElement("div");
  const bubble = document.createElement("div");
  bubble.className = "message message--assistant";
  bubble.textContent = "the answer";
  group.appendChild(bubble);
  (root.querySelector(".messages") ?? root).appendChild(group);
  attachMessageActions(bubble, {
    strings: DEFAULT_UI_STRINGS,
    text: () => "the answer",
    onFeedback: () => {},
  });
  const bar = bubble.nextElementSibling as HTMLElement;
  return { el, buttons: Array.from(bar.querySelectorAll("button")) };
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the message action row, as the browser resolves it", () => {
  it("gives every control a target at least 24px on both axes", () => {
    const { buttons } = mountBar();

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThanOrEqual(MIN_TARGET);
      expect(box.height).toBeGreaterThanOrEqual(MIN_TARGET);
    }
  });

  it("draws each control's own label, hidden until it is wanted", () => {
    const { buttons } = mountBar();
    const copy = buttons.find((button) =>
      button.classList.contains("message-action--copy"),
    ) as HTMLButtonElement;

    const tooltip = getComputedStyle(copy, "::after");
    // The same string the accessible name uses, so the two cannot drift.
    expect(tooltip.content).toBe(`"${DEFAULT_UI_STRINGS.copyMessage}"`);
    expect(tooltip.opacity).toBe("0");
    expect(copy.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.copyMessage);
  });

  it("marks each control with a real icon rather than a text glyph", () => {
    const { buttons } = mountBar();

    for (const button of buttons) {
      // A text glyph is at the mercy of the system's font coverage; the copy
      // mark in particular had none and rendered as an unreadable box.
      expect(button.querySelector("svg")).not.toBeNull();
    }
  });
});
