import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { requestConfirmation } from "../../src/ui/confirmation_card.js";

/**
 * The confirmation card's action row, measured rather than inspected.
 *
 * The row was built for two buttons in a `justify-content: flex-end` flex line
 * with no wrap. The session waiver makes three, and the waiver carries the
 * longest label — so the panel widths a host actually embeds at are where a
 * third button either fits, wraps, or silently pushes a sibling out of the box.
 *
 * happy-dom lays out no boxes and answers 0 for every width, so it calls the
 * overflowing row and the fitting one the same pass. Only a real engine can
 * tell them apart, which is why this lives here. A `display !== "none"` check
 * would pass for a Confirm button sitting outside its own card.
 */

/** The width the gallery embeds the panel at. */
const PANEL = "470px";
/** Narrow enough to force the row to choose between crushing and wrapping. */
const NARROW = "320px";
/**
 * Narrower than the row can hold on one line at any button size.
 *
 * Measured: the three buttons want 71 + 107 + 81 plus two 8px gaps, and the row
 * is 200 wide here. Before `flex-wrap`, `justify-content: flex-end` pushed the
 * overflow off the **left** edge -- Cancel rendered, styled, reporting its
 * label, and 41px outside the card.
 */
const CRAMPED = "260px";

function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.style.width = width;
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

/** Render a card with all three buttons into a panel of `width`. */
function openCard(width: string): ShadowRoot {
  const el = mount(width);
  const root = shadow(el);
  const list = root.querySelector(".messages") as HTMLElement;
  void requestConfirmation(
    list,
    { toolName: "delete_selected_rows", args: { count: 12 } },
    { onAlwaysAllow: () => {} },
  );
  return root;
}

function buttons(root: ShadowRoot): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".confirm-actions button")];
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the confirmation card's action row", () => {
  it("gives all three buttons a real box at the embedded width", () => {
    const root = openCard(PANEL);

    const widths = buttons(root).map((b) => b.getBoundingClientRect().width);
    expect(widths).toHaveLength(3);
    for (const width of widths) {
      expect(width).toBeGreaterThan(0);
    }
  });

  it.each([
    ["narrow", NARROW],
    ["cramped", CRAMPED],
  ])("keeps every button inside the card when the panel is %s", (_label, width) => {
    const root = openCard(width);
    const card = (root.querySelector(".confirm") as HTMLElement).getBoundingClientRect();

    // The failure this catches is not invisibility: an overflowing flex line
    // leaves the button rendered, styled and reporting its text, just outside
    // the box the user can see and hit.
    for (const button of buttons(root)) {
      const box = button.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(card.left - 1);
      expect(box.right).toBeLessThanOrEqual(card.right + 1);
    }
  });

  it("puts confirm last in reading order and rightmost on the line", () => {
    const root = openCard(PANEL);
    const [cancel, always, confirm] = buttons(root);

    // The waiver is the widest decision on the card. Where it sits is the whole
    // of its safety: put it where the eye lands for "yes" and it gets taken by
    // accident.
    expect(cancel?.className).toContain("confirm-btn--cancel");
    expect(always?.className).toContain("confirm-btn--always");
    expect(confirm?.className).toContain("confirm-btn--confirm");
    expect(confirm?.getBoundingClientRect().left).toBeGreaterThan(
      always?.getBoundingClientRect().left ?? 0,
    );
  });

  it("makes the waiver the quietest of the three", () => {
    const root = openCard(PANEL);
    const [, always, confirm] = buttons(root);

    // Reachable without being the one that reads as the recommended answer.
    const weight = (el: HTMLElement | undefined): number =>
      Number(getComputedStyle(el as HTMLElement).fontWeight);
    expect(weight(always)).toBeLessThan(weight(confirm));
  });
});
