import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A host with fixed chrome -- a sticky nav bar, a docked toolbar, a device's
 * safe area -- has already spent some of the viewport, and a fixed placement
 * knows nothing about it. Before these tokens the host reserved that space by
 * restating `--ag-ui-inset` once per placement family, because the inset is one
 * four-value shorthand and every placement has a different default, and then
 * kept `--ag-ui-height` and `--ag-ui-max-height` in step by hand. Forgetting the
 * height half overflowed the panel past the bottom of the screen silently.
 *
 * These belong in the Chromium project for the same reason the sidebar push
 * tests do: the subject is a used value produced by arithmetic across several
 * declarations, and a string match on the stylesheet cannot evaluate `calc`.
 *
 * The two halves are asserted separately on purpose -- that the panel starts
 * below the reserved edge, and that it still ends inside the viewport. A change
 * that offsets the position and forgets the height passes the first and fails
 * the second, which is precisely the mistake the tokens exist to make
 * impossible.
 */

const RESERVED_TOP_PX = 120;
const RESERVED_BOTTOM_PX = 40;

/** The floating placement's own margin, which is added to a reserved edge. */
const FLOATING_MARGIN_PX = 24;

function mount(placement: string, reserve: boolean): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", placement);
  if (reserve) {
    el.style.setProperty("--ag-ui-viewport-inset-top", `${RESERVED_TOP_PX}px`);
    el.style.setProperty("--ag-ui-viewport-inset-bottom", `${RESERVED_BOTTOM_PX}px`);
  }
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  for (const el of document.querySelectorAll(ELEMENT_TAG)) {
    el.remove();
  }
});

describe("host chrome reserved from the viewport (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  it.each(["page", "full", "sidebar", "side"])(
    "keeps the %s placement inside what the host left it",
    async (placement) => {
      const el = mount(placement, true);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const box = el.getBoundingClientRect();

      expect(box.top).toBeCloseTo(RESERVED_TOP_PX, 0);
      // The half a host used to have to remember separately.
      expect(box.bottom).toBeCloseTo(window.innerHeight - RESERVED_BOTTOM_PX, 0);
    },
  );

  it.each(["floating", "bottom-left"])(
    "adds the reserved edge to the %s placement's own margin",
    async (placement) => {
      const el = mount(placement, true);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const box = el.getBoundingClientRect();

      // Bottom-anchored, so the reserved bottom edge pushes it up rather than
      // moving its top; the top edge only has to stop it growing behind the
      // chrome.
      expect(box.bottom).toBeCloseTo(
        window.innerHeight - RESERVED_BOTTOM_PX - FLOATING_MARGIN_PX,
        0,
      );
      expect(box.top).toBeGreaterThanOrEqual(RESERVED_TOP_PX - 1);
    },
  );

  it("leaves every placement where it was when nothing is reserved", async () => {
    // The tokens default to 0px, so this is what says the arithmetic did not
    // move the common case: every host that reserves nothing sees no change.
    for (const placement of ["page", "full", "sidebar", "side"]) {
      const el = mount(placement, false);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const box = el.getBoundingClientRect();
      expect(box.top).toBe(0);
      expect(box.height).toBe(window.innerHeight);
      el.remove();
    }
  });

  it("lets a host state the usable height outright", async () => {
    // The escape hatch the mobile work needs: an on-screen keyboard changes no
    // viewport-percentage length, so a phone has to be told the height rather
    // than have it derived from one.
    const el = mount("page", false);
    el.style.setProperty("--ag-ui-viewport-height", "300px");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.getBoundingClientRect().height).toBeCloseTo(300, 0);
  });
});
