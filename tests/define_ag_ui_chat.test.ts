import { beforeEach, describe, expect, it } from "vitest";
import { AgUiChat } from "../src/ag_ui_chat.js";
import { ELEMENT_TAG } from "../src/constants.js";
import { defineAgUiChat } from "../src/define_ag_ui_chat.js";

describe("defineAgUiChat", () => {
  beforeEach(() => {
    // happy-dom gives each test file a fresh window, but within this file the
    // registry persists across tests — that is exactly what we want to assert.
  });

  it("registers the element on first call and is idempotent", () => {
    expect(customElements.get(ELEMENT_TAG)).toBeUndefined();

    defineAgUiChat();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);

    // Second call must be a no-op (does not throw on re-definition).
    expect(() => defineAgUiChat()).not.toThrow();
    expect(customElements.get(ELEMENT_TAG)).toBe(AgUiChat);
  });
});
