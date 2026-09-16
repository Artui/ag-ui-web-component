import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cdp, page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Opening the conversation list or the checkpoints panel moves focus into it,
 * in a browser that lays it out.
 *
 * Both panels ask for focus the moment they are unhidden, and both used to ask
 * while their own stylesheet still had them at visibility: hidden -- the
 * property they transition, so the exit can play before the panel disappears. A
 * transition starts at its first value, and a hidden element cannot take focus,
 * so the call was dropped at every placement and focus stayed wherever it had
 * been. happy-dom computes no transitions, which is why every unit test of the
 * same calls passed.
 *
 * Chromium because the whole defect is a computed style at one instant. The
 * reduced-motion case is here as well because it shortens the transition to a
 * millisecond without removing it, which leaves the same first frame.
 */

/** Wide enough for a full page to be the case that once behaved differently. */
const WIDE = { width: 1400, height: 900 };
/** The viewport the rest of the browser project expects to run at. */
const DESKTOP = { width: 1280, height: 800 };

/** How each panel is reached, where focus should land, and what hides. */
interface Panel {
  /** The public method that opens it, as a host's own chrome would call it. */
  readonly open: (el: AgUiChat) => void;
  /** The public method that closes it. */
  readonly close: (el: AgUiChat) => void;
  /** The header control a user presses instead. */
  readonly button: string;
  /** The dialog itself, which Escape is pressed inside. */
  readonly dialog: string;
  /**
   * What takes focus on open. The checkpoints panel has no rows yet at that
   * moment -- they are fetched after it opens -- so it focuses itself.
   */
  readonly target: string;
  /** The element carrying the hidden attribute and the visibility transition. */
  readonly root: string;
}

const PANELS: Record<string, Panel> = {
  "conversation list": {
    open: (el) => el.openThreads(),
    close: (el) => el.closeThreads(),
    button: ".header-btn--history",
    dialog: ".drawer-panel",
    target: ".drawer-new",
    root: ".drawer",
  },
  "checkpoints panel": {
    open: (el) => el.openCheckpoints(),
    close: (el) => el.closeCheckpoints(),
    button: ".header-btn--checkpoints",
    dialog: ".checkpoints",
    target: ".checkpoints",
    root: ".checkpoints",
  },
};

const CASES = ["page", "bottom-right"].flatMap((placement) =>
  Object.keys(PANELS).map((panel) => ({ placement, panel })),
);

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(placement: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", placement);
  el.setAttribute("data-start-open", "");
  // Without a run index the header carries no checkpoints control at all.
  el.setAttribute("data-runs-url", "/runs/");
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

/** Let every transition in the shadow root run out: the panel's own opening, the slide. */
async function still(el: AgUiChat): Promise<void> {
  await settle();
  await Promise.all((el.shadowRoot?.getAnimations() ?? []).map((a) => a.finished));
  await settle();
}

describe.each(CASES)(
  "focus in the $panel under $placement (real browser)",
  ({ placement, panel }) => {
    const spec = PANELS[panel] as Panel;
    const original = globalThis.fetch;

    /**
     * The two ways in, each returning what had focus before it.
     *
     * The header button is focused before it is clicked because a pointer click
     * does that, and it is where focus has to come back to on close.
     */
    const routes: Record<string, (el: AgUiChat) => HTMLElement> = {
      "its method": (el) => {
        const composer = part(el, ".input");
        composer.focus();
        spec.open(el);
        return composer;
      },
      "its header button": (el) => {
        const button = part(el, spec.button);
        button.focus();
        button.click();
        return button;
      },
    };

    beforeAll(async () => {
      defineAgUiChat();
      await page.viewport(WIDE.width, WIDE.height);
    });

    afterAll(async () => {
      await page.viewport(DESKTOP.width, DESKTOP.height);
    });

    beforeEach(() => {
      // The checkpoints panel fetches its rows as it opens. An empty index keeps
      // that off the network and leaves nothing to render over the focus.
      globalThis.fetch = (async () => ({
        ok: true,
        status: 200,
        json: async () => ({ runs: [] }),
      })) as unknown as typeof fetch;
    });

    afterEach(async () => {
      for (const el of document.querySelectorAll(ELEMENT_TAG)) {
        el.remove();
      }
      globalThis.fetch = original;
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });

    it.each(Object.keys(routes))(
      "moves into it when opened through %s, and back on Escape",
      async (route) => {
        const el = mount(placement);
        await still(el);
        const root = el.shadowRoot as ShadowRoot;

        const opener = (routes[route] as (el: AgUiChat) => HTMLElement)(el);
        await still(el);

        const dialog = part(el, spec.dialog);
        expect(root.activeElement).toBe(part(el, spec.target));
        expect(dialog.contains(root.activeElement)).toBe(true);

        dialog.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
        );
        expect(part(el, spec.root).hidden).toBe(true);
        expect(root.activeElement).toBe(opener);
      },
    );

    it("moves into it under reduced motion too", async () => {
      await cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }],
      });
      const el = mount(placement);
      await still(el);

      spec.open(el);
      await still(el);

      expect(el.shadowRoot?.activeElement).toBe(part(el, spec.target));
    });

    it("still plays its exit before it hides", async () => {
      // The other half of the same property. Showing at once on the way in must
      // not turn into hiding at once on the way out, which would cut the exit.
      const el = mount(placement);
      await still(el);
      spec.open(el);
      await still(el);

      spec.close(el);
      const hiding = part(el, spec.root);
      expect(hiding.hidden).toBe(true);
      expect(getComputedStyle(hiding).visibility).toBe("visible");

      await still(el);
      expect(getComputedStyle(hiding).visibility).toBe("hidden");
    });
  },
);
