import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { attachMessageActions, messageActionButton } from "../../src/ui/message_actions.js";
import { DEFAULT_UI_STRINGS } from "../../src/ui/ui_strings.js";

/**
 * The message action row, measured rather than inspected.
 *
 * Four buttons under an assistant bubble, in a panel whose width the host
 * chooses. The lesson from the confirmation card one release earlier: a new
 * control in an existing row is a layout change, not an addition, and an
 * overflowing flex line leaves a button rendered, styled and reporting its
 * label just outside the box the user can see and hit.
 *
 * happy-dom lays out no boxes and answers 0 for every width, so it cannot tell
 * the overflowing row from the fitting one -- and a `display !== "none"` check
 * passes for either.
 *
 * **These pass with `flex-wrap` removed**, because the buttons are glyph-only
 * and fit on one line at every width tried. That is worth stating rather than
 * implying otherwise: the containment cases are a standing guard for the day a
 * button gains a text label, not a falsification of today's stylesheet.
 */

/** The width the gallery embeds the panel at. */
const PANEL = "470px";
/** Narrower than any documented placement, to find the row's floor. */
const CRAMPED = "240px";

function mount(width: string): ShadowRoot {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.style.width = width;
  document.body.appendChild(el);
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

/** A finished assistant bubble with the full row, plus Retry as the element adds it. */
function withActions(width: string): { root: ShadowRoot; bubble: HTMLElement } {
  const root = mount(width);
  const bubble = root.querySelector(".messages")?.appendChild(document.createElement("div")) as
    | HTMLElement
    | undefined;
  if (bubble === undefined) {
    throw new Error("expected a message list");
  }
  bubble.className = "message message--assistant";
  bubble.textContent = "A reasonably ordinary answer to a reasonably ordinary question.";
  attachMessageActions(bubble, {
    strings: DEFAULT_UI_STRINGS,
    text: () => bubble.textContent as string,
    onFeedback: () => {},
  });
  const bar = bubble.nextElementSibling as HTMLElement;
  bar.prepend(messageActionButton("retry", DEFAULT_UI_STRINGS.retryMessage, "↻"));
  return { root, bubble };
}

function actions(root: ShadowRoot): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".message-action")];
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the message action row", () => {
  it("gives all four buttons a real box at the embedded width", () => {
    const { root } = withActions(PANEL);

    const widths = actions(root).map((b) => b.getBoundingClientRect().width);
    expect(widths).toHaveLength(4);
    for (const width of widths) {
      expect(width).toBeGreaterThan(0);
    }
  });

  it.each([
    ["embedded", PANEL],
    ["cramped", CRAMPED],
  ])("keeps every button inside the transcript when %s", (_label, width) => {
    const { root } = withActions(width);
    const list = (root.querySelector(".messages") as HTMLElement).getBoundingClientRect();

    for (const button of actions(root)) {
      const box = button.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(list.left - 1);
      expect(box.right).toBeLessThanOrEqual(list.right + 1);
    }
  });

  it("sits under the bubble rather than inside its text", () => {
    const { root, bubble } = withActions(PANEL);
    const bar = root.querySelector(".message-actions") as HTMLElement;

    // The structural half is asserted in the unit tests; this is the visual
    // half: a row that overlapped the answer would read as part of it.
    expect(bar.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      bubble.getBoundingClientRect().bottom - 1,
    );
  });

  it("keeps the actions quieter than the answer they belong to", () => {
    const { root, bubble } = withActions(PANEL);
    const [retry] = actions(root);

    // They are always on screen, under every answer. At full strength they
    // would compete with the text for attention on every single turn.
    expect(Number(getComputedStyle(retry as HTMLElement).opacity)).toBeLessThan(
      Number(getComputedStyle(bubble).opacity),
    );
  });
});
