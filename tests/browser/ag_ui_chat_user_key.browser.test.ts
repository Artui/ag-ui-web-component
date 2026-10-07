/**
 * A `user-key` changed while the element is out of the document, against the
 * `sessionStorage` a real browser keeps.
 *
 * The happy-dom suite covers every half of that handover -- recall, waivers,
 * shared state, the unread count, the drawer. This is the half that matters
 * most, the previous principal's words gone from the tab, checked where the
 * storage is the browser's own rather than an emulation of it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const SECRET = "alice's account balance is 12345";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("user-key", "alice");
  document.body.appendChild(el);
  return el;
}

/** Every key and value in `sessionStorage`, as one string. */
function dumpStorage(): string {
  const lines: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    lines.push(`${key}=${key === null ? "" : sessionStorage.getItem(key)}`);
  }
  return lines.join("\n");
}

/** Save one message from alice under the element's own store, and check it landed. */
function aliceSays(el: AgUiChat): void {
  const store = el.conversationStore;
  store.saveMessages(store.threadId(), [{ id: "m1", role: "user", content: SECRET }] as never);
  expect(dumpStorage()).toContain(SECRET);
}

describe("user-key changed while detached (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("purges the previous principal's conversation from the tab", () => {
    const el = mount();
    aliceSays(el);

    el.remove();
    el.setAttribute("user-key", "bob");
    document.body.appendChild(el);

    expect(dumpStorage()).not.toContain(SECRET);
  });

  it("keeps it on a move that keeps the key", () => {
    const el = mount();
    aliceSays(el);

    el.remove();
    document.body.appendChild(el);

    expect(dumpStorage()).toContain(SECRET);
  });
});
