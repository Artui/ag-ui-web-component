import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The resize grip belongs on the corner that moves, and only a measurement
 * knows which one that is.
 *
 * The element measures the edges its host's layout holds still and stamps them
 * as data-resize-anchor="<y>-<x>". The stylesheet then places the grip on the
 * opposite corner. Two defects made that untrue for a year of releases, and
 * both were invisible to the existing suite:
 *
 * - the position rules were written as [data-resize-anchor~="left"], and `~=`
 *   matches whitespace-separated words while the stamped value is one
 *   hyphenated token, so they could never match. The grip stayed wherever
 *   `placement` had guessed while the *cursor* rules (written with `=`) did
 *   follow the measurement, so the pointer promised a diagonal the grip was not
 *   on;
 * - and a duplicated copy of the whole block sat earlier in the file behind a
 *   selector welded to the previous rule by a stray comment.
 *
 * These assertions are in the Chromium project because they are cascade
 * questions: two rule sets of equal specificity where source order decides, and
 * `auto` versus `0` on a side. happy-dom resolves computed styles well enough
 * to agree with a broken stylesheet, which is exactly the failure mode being
 * guarded.
 *
 * Note that getComputedStyle resolves `auto` to a *used* pixel value, so the
 * pinned side cannot be found by looking for the string "auto" -- the pinned
 * side is the one that computes to 0px. Reading it the other way is how an
 * earlier version of this test reported every case as failing while the
 * stylesheet was correct.
 */

/** The corner a grip belongs on: diagonally opposite the anchored one. */
function freeCorner(anchor: string): string {
  const [y, x] = anchor.split("-");
  return `${y === "top" ? "bottom" : "top"}-${x === "left" ? "right" : "left"}`;
}

/** Which corner the grip is actually pinned to, per the resolved cascade. */
function gripCorner(el: AgUiChat): string {
  const handle = el.shadowRoot?.querySelector(".resize-handle");
  if (!(handle instanceof HTMLElement)) {
    throw new Error("expected a .resize-handle in the shadow root");
  }
  const style = getComputedStyle(handle);
  return `${style.top === "0px" ? "top" : "bottom"}-${style.left === "0px" ? "left" : "right"}`;
}

function grip(el: AgUiChat): CSSStyleDeclaration {
  const handle = el.shadowRoot?.querySelector(".resize-handle");
  if (!(handle instanceof HTMLElement)) {
    throw new Error("expected a .resize-handle in the shadow root");
  }
  return getComputedStyle(handle);
}

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

const ANCHORS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;

describe("the resize grip follows the measured anchor (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(ANCHORS)("puts the grip opposite a measured %s anchor", (anchor) => {
    const el = mount();
    el.setAttribute("data-resize-anchor", anchor);

    expect(gripCorner(el)).toBe(freeCorner(anchor));
  });

  it.each(ANCHORS)("points the cursor along the drag diagonal for %s", (anchor) => {
    const el = mount();
    el.setAttribute("data-resize-anchor", anchor);

    const diagonal =
      anchor === "top-left" || anchor === "bottom-right" ? "nwse-resize" : "nesw-resize";
    expect(grip(el).cursor).toBe(diagonal);
  });

  it.each(ANCHORS)("overrides the placement guess when the measurement is %s", (anchor) => {
    // placement="embedded" guesses bottom-right, which is right only for a host
    // that left-aligns the panel. The measurement has to win in every direction,
    // which is why each rule sets both sides of its axis rather than only the
    // side it moves -- a one-way rule cannot undo the guess.
    const el = mount({ placement: "embedded" });
    el.setAttribute("data-resize-anchor", anchor);

    expect(gripCorner(el)).toBe(freeCorner(anchor));
  });

  it("keeps the placement guess until a measurement arrives", () => {
    // No anchor stamped yet: the panel is pinned bottom-right by default, so
    // the grip opens top-left. A wrong first guess costs a grip in the wrong
    // corner for a frame and never a wrong resize.
    const el = mount();

    expect(el.hasAttribute("data-resize-anchor")).toBe(false);
    expect(gripCorner(el)).toBe("top-left");
  });

  it("gives a docked panel an edge grip, whatever was measured", () => {
    // Docked placements own the height, so the grip is an edge rather than a
    // corner and the measured anchor must not turn it back into one.
    const el = mount({ placement: "side" });
    el.setAttribute("data-resize-anchor", "top-right");

    const style = grip(el);
    expect(style.cursor).toBe("ew-resize");
    expect(style.width).toBe("8px");
  });

  it.each(["full", "page"])("has no grip at all in %s", (placement) => {
    const el = mount({ placement });
    el.setAttribute("data-resize-anchor", "top-left");

    expect(grip(el).display).toBe("none");
  });

  it("cannot express the anchor with a ~= selector", () => {
    // The regression in one line: the stamped value is a single hyphenated
    // token, so the word-matching operator never fires against it. This is a
    // property of the value format rather than of the stylesheet, so it stays
    // true no matter how the rules are rewritten -- which is the point.
    const probe = document.createElement("div");
    probe.setAttribute("data-resize-anchor", "bottom-left");

    expect(probe.matches('[data-resize-anchor~="left"]')).toBe(false);
    expect(probe.matches('[data-resize-anchor$="-left"]')).toBe(true);
  });
});

describe("the page placement's reading column reaches the composer", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("gutters the composer to the same column as the messages", () => {
    // The gutter rule was unscoped, which put it at the same specificity as the
    // base .input-row rule that sets the `padding` shorthand later in the file.
    // Source order decided, the shorthand won, and no placement ever got the
    // gutter -- least of all the one it was written for.
    const el = mount({ placement: "page" });
    // Both, because the page placement caps the width at 100vw -- setting only
    // --ag-ui-width leaves the panel clamped to whatever the runner's viewport
    // happens to be, and the gutter formula then collapses to its floor and the
    // test passes for the wrong reason.
    el.style.setProperty("--ag-ui-width", "1280px");
    el.style.setProperty("--ag-ui-max-width", "1280px");
    el.style.setProperty("--ag-ui-content-max-width", "820px");

    const messages = el.shadowRoot?.querySelector(".messages");
    const inputRow = el.shadowRoot?.querySelector(".input-row");
    if (!(messages instanceof HTMLElement) || !(inputRow instanceof HTMLElement)) {
      throw new Error("expected .messages and .input-row in the shadow root");
    }

    expect(el.getBoundingClientRect().width).toBe(1280);
    // The invariant is that the composer sits in the same column as the
    // messages, not any particular pixel: both resolve
    // max(floor, (100% - 820px) / 2) against the panel's content box, which is
    // a couple of pixels narrower than the panel itself.
    const gutter = getComputedStyle(inputRow).paddingInlineStart;
    expect(gutter).toBe(getComputedStyle(messages).paddingInlineStart);
    // And comfortably above the 12px floor, so a collapsed formula cannot pass.
    expect(Number.parseFloat(gutter)).toBeGreaterThan(200);
  });

  it("leaves every other placement on the plain padding", () => {
    const el = mount({ placement: "embedded" });
    el.style.setProperty("--ag-ui-width", "1280px");

    const inputRow = el.shadowRoot?.querySelector(".input-row");
    if (!(inputRow instanceof HTMLElement)) {
      throw new Error("expected .input-row in the shadow root");
    }
    expect(getComputedStyle(inputRow).paddingInlineStart).toBe("12px");
  });
});
