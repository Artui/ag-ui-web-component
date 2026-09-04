import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

/**
 * Walking back through what you have already sent, on the arrow keys.
 *
 * The shape every shell and every coding agent uses, and the reason it is safe
 * is entirely in when it declines: arrows inside text are how you move the
 * caret, so taking them unconditionally would break editing to add a shortcut.
 */

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

function composer(el: AgUiChat): HTMLTextAreaElement {
  const found = el.shadowRoot?.querySelector(".input");
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("no composer");
  }
  return found;
}

/** Type and send, the way the user does, so the draft is recorded on the way. */
async function send(el: AgUiChat, text: string): Promise<void> {
  const input = composer(el);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await el.sendMessage(text);
  // sendMessage is the host route; the composer route is what records drafts.
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
  );
}

function arrow(el: AgUiChat, key: "ArrowUp" | "ArrowDown"): void {
  composer(el).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
}

describe("composer history recall", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("walks back through what was sent, newest first", async () => {
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("second");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("first");
  });

  it("stops at the oldest rather than wrapping round", async () => {
    const el = mount();
    await send(el, "only");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("only");
  });

  it("walks forward again, and out to an empty box", async () => {
    // The way out is the key that got you in, rather than sticking on the
    // newest turn with no way back to a blank composer.
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("second");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("");
  });

  it("leaves the caret alone in text the user is writing", async () => {
    // The condition that makes this safe. An arrow in a half-typed message is
    // navigation, and replacing that message would lose it without asking.
    const el = mount();
    await send(el, "sent");
    const input = composer(el);
    input.value = "half typed";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    arrow(el, "ArrowUp");
    expect(input.value).toBe("half typed");
  });

  it("does nothing before anything has been sent", async () => {
    const el = mount();
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });

  it("does not record a repeat of the last turn twice", async () => {
    // Reaching what was said, not how often it was said.
    const el = mount();
    await send(el, "same");
    await send(el, "same");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("same");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("same");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("");
  });

  it("starts the next walk from the newest turn after typing", async () => {
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("first");

    // Typing hands the composer back to the user...
    const input = composer(el);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    arrow(el, "ArrowUp");
    expect(input.value).toBe("second");
  });
});

/**
 * The history belongs to the conversation it was typed into.
 *
 * The path that makes this more than tidiness is the `user-key` rescope: it
 * purges storage and wipes the transcript precisely so one principal's words
 * are not visible to the next, and every turn they typed would otherwise be a
 * single ArrowUp away in the composer.
 */
describe("what the recall history outlives", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    // Storage is cleared by the shared setup, which is the only place that can
    // do it safely: happy-dom implements no `localStorage` at all -- the object
    // is there and every method on it is undefined -- while CI's Node provides
    // a real one, so a bare `.clear()` here passes there and throws here.
    sessionStorage.clear();
  });

  it("forgets the previous conversation's turns on a new chat", async () => {
    const el = mount();
    await send(el, "something private");

    el.newChat();
    await send(el, "after the reset");

    // Two presses, and the second is the one that matters. One press walks to
    // the newest turn either way; it is the step past it that reaches into the
    // conversation before, or finds nothing there. Sending after the reset is
    // what stops this passing by simple exhaustion -- there is a turn to walk
    // off the end of, so an empty box is a cleared history rather than a
    // history that was never recorded.
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("after the reset");

    // Walking back past the oldest turn holds there rather than emptying, so
    // what this asserts is where "there" is: this conversation's only turn,
    // and not the one typed before the reset.
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("after the reset");
    expect(composer(el).value).not.toBe("something private");
  });

  it("forgets them when the signed-in principal changes", async () => {
    const el = mount();
    el.setAttribute("user-key", "alice");
    await send(el, "alice's message");

    // The rescope that exists to stop one user seeing another's conversation.
    el.setAttribute("user-key", "bob");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });
});
