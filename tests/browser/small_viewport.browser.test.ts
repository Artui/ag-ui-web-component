import { page } from "@vitest/browser/context";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The small-viewport layout: one shape, reached from whichever placement the
 * host chose for the desktop it was designing.
 *
 * These really narrow the viewport rather than emulating it, because a media
 * query is the subject and nothing short of the real width evaluates one. The
 * project otherwise runs at a stated desktop size, so the width is put back
 * afterwards -- the browser context is shared with every file that runs after
 * this one.
 *
 * The measurements are taken from the panel rather than the host. The host is
 * the positioned box; the radius and the shadow belong to the panel inside it,
 * and asserting them on the host is how these tests passed while measuring
 * nothing at all.
 */

/** The width at and below which every placement becomes full-bleed. */
const BREAKPOINT_PX = 600;

/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

function mount(placement?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  if (placement !== undefined) {
    el.setAttribute("placement", placement);
  }
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

function panelOf(el: AgUiChat): HTMLElement {
  const found = el.shadowRoot?.querySelector(".chat");
  if (found === null || found === undefined) {
    throw new Error("no .chat in the shadow root");
  }
  return found as HTMLElement;
}

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

describe("small-viewport layout (real browser)", () => {
  beforeAll(async () => {
    defineAgUiChat();
    await page.viewport(BREAKPOINT_PX - 200, 720);
  });

  afterAll(async () => {
    // Politeness rather than the guarantee. The guarantee is in the project's
    // setup file, which gives every browser file this size to start from --
    // restoring it here alone was not enough, because the ordering that
    // decides who runs next changes with coverage on.
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it.each(["floating", "sidebar", "bottom-left", "side", undefined])(
    "collapses the %s placement onto one full-bleed shape",
    async (placement) => {
      const el = mount(placement);
      await settle();
      const box = el.getBoundingClientRect();

      // Each of these is a different shape above the breakpoint -- a corner
      // panel with a 24px margin, or a 420px dock. Below it they are the
      // screen: a 380x560 panel with a frame round it is not a smaller version
      // of the host's decision, it is most of a phone.
      expect(box.width).toBeCloseTo(window.innerWidth, 0);
      expect(box.height).toBeCloseTo(window.innerHeight, 0);
      expect(getComputedStyle(panelOf(el)).borderRadius).toBe("0px");
    },
  );

  it("leaves the embedded placement to the host that sized it", async () => {
    const el = mount("embedded");
    await settle();

    // Taking over a box the host placed in its own layout would break the app
    // shell it was embedded into, and only the host knows whether its column
    // should become the whole screen.
    expect(getComputedStyle(el).position).toBe("static");
    expect(el.getBoundingClientRect().height).not.toBeCloseTo(window.innerHeight, 0);
  });

  it("lets a host keep its desktop shape at every width", async () => {
    // Everything the breakpoint sets is a token a host can re-state, but the
    // trigger is a media query and a media query cannot read one -- so without
    // an opt-out this is the only part of the placement model a host cannot
    // reach.
    const el = mount("floating");
    el.setAttribute("data-small-viewport", "off");
    await settle();
    const box = el.getBoundingClientRect();

    expect(box.width).not.toBeCloseTo(window.innerWidth, 0);
    expect(getComputedStyle(panelOf(el)).borderRadius).not.toBe("0px");
    expect(
      getComputedStyle(el.shadowRoot?.querySelector(".resize-handle") as HTMLElement).display,
    ).not.toBe("none");
  });

  it("takes the resize grips away once the panel is the screen", async () => {
    const el = mount("floating");
    await settle();

    const grip = el.shadowRoot?.querySelector(".resize-handle") as HTMLElement;
    expect(getComputedStyle(grip).display).toBe("none");
  });

  it("keeps the transcript's scroll out of the page behind it", async () => {
    // Reaching the end of the transcript chained the scroll into the host
    // page, and on iOS bounced the whole document with it.
    const el = mount("floating");
    await settle();
    const messages = el.shadowRoot?.querySelector(".messages") as HTMLElement;

    expect(getComputedStyle(messages).overscrollBehavior).toBe("contain");
  });

  it("still rests at the launcher, which is the way back in", async () => {
    // Full-bleed and always-on would be a takeover. The launcher is what keeps
    // it a chat the user opens rather than a screen they are given.
    const el = mount("floating");
    el.removeAttribute("data-start-open");
    el.setCollapsed(true);
    await settle();

    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    expect(box.width).toBeGreaterThan(0);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });
});
