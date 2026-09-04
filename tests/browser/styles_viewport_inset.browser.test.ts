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
      // Grown until the reserved top is the only thing left to stop it, so
      // this is the constraint being read rather than 57px of slack. A panel
      // asked for more height than the screen has cannot satisfy it, and where
      // it stops is the answer: at the reserved edge, not above it.
      el.style.setProperty("--ag-ui-height", `${window.innerHeight}px`);
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      expect(el.getBoundingClientRect().top).toBeGreaterThanOrEqual(RESERVED_TOP_PX - 1);
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

/**
 * What the size cap has to know about the gutter the resting inset spends.
 *
 * A floating panel is anchored to its far corner with a gutter already taken
 * out on that side. Cap its size at the whole usable box and the *other* edge
 * lands exactly one gutter outside it -- which is not a rounding error but the
 * panel's header, and every control in it, off the top of the window.
 */
describe("the cap and the resting gutter (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("keeps a panel grown past the cap on screen, with nothing reserved", async () => {
    const el = mount("floating", false);
    el.setAttribute("data-start-open", "");
    // Far more than it can have, so the cap is what answers.
    el.style.setProperty("--ag-ui-height", `${window.innerHeight * 2}px`);
    el.style.setProperty("--ag-ui-width", `${window.innerWidth * 2}px`);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const box = el.getBoundingClientRect();
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
    // ...and it does reach those edges, rather than stopping a second gutter
    // short of them the way subtracting two did.
    expect(box.top).toBeLessThan(1);
    expect(box.left).toBeLessThan(1);
  });

  it("keeps it out of the edges a host reserved, at the cap", async () => {
    const el = mount("floating", true);
    el.setAttribute("data-start-open", "");
    el.style.setProperty("--ag-ui-height", `${window.innerHeight * 2}px`);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // The same overflow, but landing inside the host's own chrome instead of
    // off the screen -- which is the failure the reservation exists to stop.
    expect(el.getBoundingClientRect().top).toBeGreaterThanOrEqual(RESERVED_TOP_PX - 1);
  });
});

/**
 * How the reserved insets are *read*, which is not how a custom property reads.
 *
 * `getComputedStyle().getPropertyValue()` on an unregistered custom property
 * hands back the substituted token stream rather than a length. It returns
 * "4rem" verbatim, and "calc(56px + env(safe-area-inset-top))" as
 * "calc(56px + 0px)" -- so a host stating either gets four pixels reserved or
 * NaN, and NaN takes the whole inset with it.
 */
describe("reading a host's reserved insets (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it.each([
    ["a plain px length", "120px"],
    ["a length in rem", "7.5rem"],
    ["one wrapped in calc, as the safe-area advice implies", "calc(100px + 20px)"],
  ])("reserves what %s actually resolves to", async (_name, stated) => {
    const el = mount("floating", false);
    el.setAttribute("data-start-open", "");
    el.style.setProperty("--ag-ui-viewport-inset-top", stated);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Asked of the element rather than measured off the box: the stylesheet
    // resolves any of these correctly on its own, and what is under test is
    // whether the *element* agrees with it. This is the number every clamp,
    // the corner probe and the agent's own move are computed from.
    expect(el.describeSurface().viewport.top).toBe(120);
  });

  it("holds the clamps to the same reserved edge, however it was written", async () => {
    const el = mount("floating", false);
    el.setAttribute("data-start-open", "");
    el.style.setProperty("--ag-ui-viewport-inset-top", "calc(100px + 20px)");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // The consequence, rather than the reading: a NaN inset makes every clamp
    // return NaN and the inline `--ag-ui-inset` invalid at computed-value
    // time, which drops the panel to its static position.
    expect(el.moveTo("top-left")).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.getBoundingClientRect().top).toBeGreaterThanOrEqual(120);
  });
});
