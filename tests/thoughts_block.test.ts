import { describe, expect, it } from "vitest";
import { ThoughtsBlock } from "../src/ui/progress/thoughts_block.js";
import { DEFAULT_UI_STRINGS, mergeUiStrings } from "../src/ui/ui_strings.js";

/** A clock the test moves by hand, in milliseconds. */
function clock(start = 0): { now: () => number; at: (ms: number) => void } {
  let time = start;
  return {
    now: () => time,
    at: (ms) => {
      time = ms;
    },
  };
}

function label(block: ThoughtsBlock): string | null | undefined {
  return block.element.querySelector(".thoughts-label")?.textContent;
}

function toggle(block: ThoughtsBlock): HTMLButtonElement | null {
  return block.element.querySelector<HTMLButtonElement>(".thoughts-toggle");
}

function body(block: ThoughtsBlock): HTMLElement | null {
  return block.element.querySelector<HTMLElement>(".thoughts-body");
}

describe("ThoughtsBlock", () => {
  it("opens streaming with the thinking label, and no toggle until there is text", () => {
    const block = new ThoughtsBlock();
    expect(block.element.getAttribute("part")).toBe("thoughts");
    expect(block.element.hasAttribute("data-streaming")).toBe(true);
    expect(label(block)).toBe("Assistant is thinking…");
    expect(toggle(block)).toBeNull();
    expect(body(block)?.hidden).toBe(true);
  });

  it("turns the label into an expanded toggle once the buffer has text", () => {
    const block = new ThoughtsBlock();
    block.stream("");
    expect(toggle(block)).toBeNull();
    block.stream("Let me");
    block.stream("Let me think about this");
    expect(toggle(block)?.getAttribute("aria-expanded")).toBe("true");
    expect(toggle(block)?.querySelector(".thoughts-label")).not.toBeNull();
    expect(block.element.firstElementChild).toBe(toggle(block));
    expect(body(block)?.hidden).toBe(false);
    expect(body(block)?.textContent).toBe("Let me think about this");
  });

  it("treats a whitespace-only buffer as no text", () => {
    const block = new ThoughtsBlock();
    block.stream(" \n ");
    expect(toggle(block)).toBeNull();
    expect(body(block)?.hidden).toBe(true);
  });

  it("goes back to a plain label when a later round's buffer starts empty", () => {
    const block = new ThoughtsBlock();
    block.stream("first round");
    block.stream("");
    expect(toggle(block)).toBeNull();
    expect(block.element.firstElementChild?.className).toBe("thoughts-label");
    expect(body(block)?.hidden).toBe(true);
  });

  it("collapses to the settled label, stopping the streaming state", () => {
    const block = new ThoughtsBlock();
    block.stream("reasoning…");
    block.collapse();
    expect(block.element.hasAttribute("data-streaming")).toBe(false);
    expect(label(block)).toBe("Thoughts");
    expect(toggle(block)?.getAttribute("aria-expanded")).toBe("false");
    expect(body(block)?.hidden).toBe(true);
  });

  it("collapse is idempotent (the per-token text handler calls it repeatedly)", () => {
    const block = new ThoughtsBlock();
    block.stream("x");
    block.collapse();
    block.collapse();
    expect(toggle(block)?.getAttribute("aria-expanded")).toBe("false");
  });

  it("the header toggle reopens and refolds the body", () => {
    const block = new ThoughtsBlock();
    block.stream("x");
    block.collapse();
    const button = toggle(block);

    button?.click();
    expect(body(block)?.hidden).toBe(false);
    expect(button?.getAttribute("aria-expanded")).toBe("true");

    button?.click();
    expect(body(block)?.hidden).toBe(true);
    expect(button?.getAttribute("aria-expanded")).toBe("false");
  });

  it("an empty block settles to a label with no toggle and no body", () => {
    const time = clock();
    const block = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(4200);
    block.settle();
    block.collapse();
    expect(block.element.hasAttribute("data-streaming")).toBe(false);
    expect(label(block)).toBe("Thought for 4s");
    expect(toggle(block)).toBeNull();
    expect(body(block)?.hidden).toBe(true);
  });

  it("times the reasoning from its start to its settle, not to the answer", () => {
    const time = clock(500);
    const block = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    block.stream("x");
    time.at(3500);
    block.settle();
    time.at(9000);
    block.settle();
    block.collapse();
    expect(label(block)).toBe("Thought for 3s");
  });

  it("falls back to the untimed label under a second", () => {
    const time = clock();
    const short = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(999);
    short.settle();
    expect(label(short)).toBe("Thoughts");

    time.at(0);
    const timed = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(1000);
    timed.settle();
    expect(label(timed)).toBe("Thought for 1s");
  });

  it("adds a later round's time to the first, with the live label while it runs", () => {
    const time = clock();
    const block = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(2000);
    block.settle();
    expect(label(block)).toBe("Thought for 2s");

    time.at(10_000);
    block.begin();
    block.begin();
    expect(block.element.hasAttribute("data-streaming")).toBe(true);
    expect(label(block)).toBe("Assistant is thinking…");
    time.at(13_000);
    block.settle();
    expect(label(block)).toBe("Thought for 5s");
  });

  it("rounds the seconds to the nearest, not down", () => {
    const time = clock();
    const block = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(1500);
    block.settle();
    expect(label(block)).toBe("Thought for 2s");
  });

  it("does not restart a clock that is already running", () => {
    const time = clock();
    const block = new ThoughtsBlock(DEFAULT_UI_STRINGS, time.now);
    time.at(2000);
    block.settle();
    time.at(10_000);
    block.begin();
    time.at(11_000);
    block.begin();
    time.at(13_000);
    block.settle();
    expect(label(block)).toBe("Thought for 5s");
  });

  it("draws its labels from the string table", () => {
    const strings = mergeUiStrings({
      thinking: "denkt nach…",
      thoughts: "Gedanken",
      thoughtFor: "{seconds} s nachgedacht",
    });
    const time = clock();
    const short = new ThoughtsBlock(strings, time.now);
    expect(label(short)).toBe("denkt nach…");
    short.collapse();
    expect(label(short)).toBe("Gedanken");

    const timed = new ThoughtsBlock(strings, time.now);
    time.at(7400);
    timed.collapse();
    expect(label(timed)).toBe("7 s nachgedacht");
  });

  it("reads the real clock by default", () => {
    const block = new ThoughtsBlock();
    block.settle();
    expect(label(block)).toBe("Thoughts");
  });
});
