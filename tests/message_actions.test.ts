import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachMessageActions, messageActionBar } from "../src/ui/message_actions.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

let written: string[] = [];

beforeEach(() => {
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.useRealTimers();
});

/** A finished assistant bubble, in a parent, as the element always has one. */
function bubble(text = "the answer"): HTMLElement {
  const group = document.createElement("div");
  const el = document.createElement("div");
  el.className = "message message--assistant";
  el.textContent = text;
  group.appendChild(el);
  document.body.appendChild(group);
  return el;
}

describe("attachMessageActions", () => {
  it("puts the row beside the bubble, never inside it", () => {
    const el = bubble();

    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => el.textContent ?? "" });

    // Inside, the buttons join the bubble's textContent -- which is what Copy
    // reads, what history persists, and what every assertion about a message's
    // text compares against. An answer would be copied back carrying the glyphs
    // of the buttons that copied it.
    expect(el.textContent).toBe("the answer");
    expect(el.querySelector(".message-actions")).toBeNull();
    expect(el.nextElementSibling?.className).toBe("message-actions");
  });

  it("copies the bubble's text and says so on the button", async () => {
    const el = bubble();
    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => el.textContent ?? "" });
    const copy = el.nextElementSibling?.querySelector<HTMLButtonElement>(".message-action--copy");

    copy?.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(written).toEqual(["the answer"]);
    expect(copy?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.copied);
  });

  it("says so on the button when the clipboard refuses", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
    const el = bubble();
    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => "x" });
    const copy = el.nextElementSibling?.querySelector<HTMLButtonElement>(".message-action--copy");

    copy?.click();
    await Promise.resolve();
    await Promise.resolve();

    // A denied clipboard permission is the common case, not an exception: it
    // belongs on the button rather than in an unhandled rejection.
    expect(copy?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.copyFailed);
  });

  it("offers no feedback buttons when nothing can receive a rating", () => {
    const el = bubble();

    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => "x" });

    expect(el.nextElementSibling?.querySelectorAll(".message-action")).toHaveLength(1);
  });

  it("reports a rating and shows it as pressed", () => {
    const el = bubble();
    const seen: string[] = [];
    attachMessageActions(el, {
      strings: DEFAULT_UI_STRINGS,
      text: () => "x",
      onFeedback: (rating) => seen.push(rating),
    });
    const down = el.nextElementSibling?.querySelector<HTMLButtonElement>(".message-action--down");

    down?.click();

    expect(seen).toEqual(["down"]);
    // Pressed rather than removed: a rating is a standing statement about the
    // message, and a control that vanishes leaves no record of what was said.
    expect(down?.getAttribute("aria-pressed")).toBe("true");
  });

  it("lets a rating be taken back", () => {
    const el = bubble();
    const seen: string[] = [];
    attachMessageActions(el, {
      strings: DEFAULT_UI_STRINGS,
      text: () => "x",
      onFeedback: (rating) => seen.push(rating),
    });
    const up = el.nextElementSibling?.querySelector<HTMLButtonElement>(".message-action--up");

    up?.click();
    up?.click();

    // The press toggles. A rating that could only ever be given, never
    // withdrawn, is a control that punishes a misclick.
    expect(up?.getAttribute("aria-pressed")).toBe("false");
    expect(seen).toEqual(["up", "up"]);
  });

  it("does not stack rows on a second call", () => {
    const el = bubble();
    const options = { strings: DEFAULT_UI_STRINGS, text: () => "x" };

    attachMessageActions(el, options);
    attachMessageActions(el, options);

    expect(document.querySelectorAll(".message-actions")).toHaveLength(1);
  });
});

describe("messageActionBar", () => {
  it("returns the row a bubble already has rather than adding a second", () => {
    const el = bubble();
    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => "x" });

    const bar = messageActionBar(el, DEFAULT_UI_STRINGS);

    expect(bar).toBe(el.nextElementSibling);
    expect(document.querySelectorAll(".message-actions")).toHaveLength(1);
  });

  it("gives a bubble with no row an empty one", () => {
    const el = bubble();

    const bar = messageActionBar(el, DEFAULT_UI_STRINGS);

    // The failed-run path wants the row and none of its usual contents: nothing
    // worth copying, nothing to rate, only a way back.
    expect(bar.children).toHaveLength(0);
    expect(bar.getAttribute("role")).toBe("group");
  });
});

describe("the copy confirmation", () => {
  it("puts the button's label back after the flash", async () => {
    vi.useFakeTimers();
    const el = bubble();
    attachMessageActions(el, { strings: DEFAULT_UI_STRINGS, text: () => "x" });
    const copy = el.nextElementSibling?.querySelector<HTMLButtonElement>(".message-action--copy");

    copy?.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(copy?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.copied);

    await vi.advanceTimersByTimeAsync(2000);

    // A button left reading "Copied" is a button that looks like it is still
    // doing something.
    expect(copy?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.copyMessage);
    expect(copy?.classList.contains("message-action--confirmed")).toBe(false);
  });
});
