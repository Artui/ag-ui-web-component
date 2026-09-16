/**
 * Where focus goes when a new conversation starts.
 *
 * Starting a conversation is a request to type one, so the composer is where
 * the next keystroke belongs -- whichever way the new chat was started: the
 * header's button, the history list's own, or a host calling `newChat()` from
 * chrome of its own. Without this a keyboard user pressed New chat and then had
 * to find their way back to the field it had just emptied.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

function composer(el: AgUiChat): HTMLTextAreaElement {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected a composer");
  }
  return input;
}

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("a new chat puts focus in the composer", () => {
  it("when a host calls newChat()", () => {
    const el = mount();
    expect(shadow(el).activeElement).not.toBe(composer(el));

    el.newChat();

    expect(shadow(el).activeElement).toBe(composer(el));
  });

  it("when the header's New chat is pressed", () => {
    const el = mount();
    const button = shadow(el).querySelector<HTMLButtonElement>(".header-btn--new");
    button?.focus();
    expect(shadow(el).activeElement).toBe(button);

    button?.click();

    expect(shadow(el).activeElement).toBe(composer(el));
  });

  it("when the history list's New chat is pressed, after the list gives focus back", () => {
    // Closing the list restores focus to whatever opened it, and that happens
    // first -- so this is the last word rather than being overwritten by it.
    const el = mount();
    el.openThreads();
    shadow(el).querySelector<HTMLButtonElement>(".drawer-new")?.click();

    expect(shadow(el).activeElement).toBe(composer(el));
  });

  it("but not while the widget is collapsed, where the composer is not on screen", () => {
    const el = mount();
    el.setCollapsed(true);

    el.newChat();

    expect(shadow(el).activeElement).not.toBe(composer(el));
  });
});
