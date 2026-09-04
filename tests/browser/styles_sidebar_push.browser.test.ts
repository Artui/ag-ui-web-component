import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The sidebar's panel is taken out of flow so its collapse can slide it out at
 * full width, which makes the host its containing block. The host is one by
 * default only because it is `position: fixed` -- and the documented way to get
 * a pushed layout instead of an overlay is to set `--ag-ui-position: static`,
 * which establishes nothing at all.
 *
 * These belong in the Chromium project because the failure is a *used* value.
 * The stylesheet is asserted elsewhere by string match, and a string match
 * cannot see this: every declaration involved was already present and correct,
 * and it was their composition that was wrong. Only a layout engine resolving
 * an absolutely-positioned box against a containing block can answer it, so
 * this file measures rects rather than reading rules.
 *
 * The host is deliberately offset from every viewport edge and the page is
 * scrolled. Without both, the broken and the correct answers coincide: a
 * full-height column at the top of an unscrolled document is exactly where the
 * initial containing block and the host's own box agree, which is why the
 * recipe looked right wherever it was first tried.
 */

/** The panel's 1px borders sit outside the host's box on each side. */
const BORDER_SLACK_PX = 2;

/**
 * Narrower than the slot the host is given, and narrow enough to clear the
 * default max-width at any viewport the runner picks. Left to its default the
 * host clamps to `100vw - 48px` on a narrow runner while the panel keeps the
 * full `--_width`, so the panel overhangs its own host by the difference and
 * the measurement below stops being about containment at all.
 */
const PANEL_WIDTH_PX = 240;

function mountInFlowSlot(attrs: Record<string, string>, cssText: string): AgUiChat {
  // A plain in-flow box with no positioning of its own, pushed well clear of
  // the viewport origin on both axes.
  const slot = document.createElement("div");
  slot.className = "host-slot";
  slot.style.cssText = "margin:140px 0 0 300px;width:420px;height:420px";
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.style.cssText = cssText;
  slot.appendChild(el);
  document.body.appendChild(slot);
  return el;
}

function panelOf(el: AgUiChat): HTMLElement {
  const found = el.shadowRoot?.querySelector(".chat");
  if (found === null || found === undefined) {
    throw new Error("no .chat in the shadow root");
  }
  return found as HTMLElement;
}

describe("sidebar push layout (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const slot of document.querySelectorAll(".host-slot")) {
      slot.remove();
    }
    window.scrollTo(0, 0);
  });

  it.each([
    ["docked right", {}],
    ["docked left", { "data-side": "left" }],
  ])("keeps the panel inside the host's own box when pushed, %s", async (_label, extra) => {
    const el = mountInFlowSlot(
      { placement: "sidebar", ...extra },
      `--ag-ui-position: static; --ag-ui-width: ${PANEL_WIDTH_PX}px`,
    );
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const host = el.getBoundingClientRect();
    const panel = panelOf(el).getBoundingClientRect();

    // Compare the edge the placement actually pins -- inset is `0 0 0 auto`
    // docked right and `0 auto 0 0` docked left -- so the assertion measures
    // what the rule states rather than what the box width happens to leave.
    const dockedEdgeDrift =
      "data-side" in extra ? panel.left - host.left : panel.right - host.right;

    // Before containment the panel resolved against the initial containing
    // block: it landed at the document origin, hundreds of pixels from its
    // host on both axes, and docked left it pinned to the document's left edge
    // rather than the host's.
    expect(Math.abs(dockedEdgeDrift)).toBeLessThanOrEqual(BORDER_SLACK_PX);
    expect(Math.abs(panel.top - host.top)).toBeLessThanOrEqual(BORDER_SLACK_PX);
  });

  it("moves the pushed panel with the page, since it is in the host's flow", async () => {
    const el = mountInFlowSlot(
      { placement: "sidebar" },
      `--ag-ui-position: static; --ag-ui-width: ${PANEL_WIDTH_PX}px`,
    );
    // The runner's page is short, so give it something to scroll through --
    // otherwise scrollBy silently moves less than it was asked for and the
    // assertion fails on the harness rather than on the component.
    const filler = document.createElement("div");
    filler.className = "host-slot";
    filler.style.cssText = "height:3000px";
    document.body.appendChild(filler);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    const panel = panelOf(el);

    const before = panel.getBoundingClientRect().top;
    window.scrollBy(0, 200);
    const after = panel.getBoundingClientRect().top;

    // An in-flow host scrolls, so its panel has to scroll with it. The broken
    // version scrolled too -- absolute against the initial containing block --
    // which is why scrolling alone does not distinguish them and the test above
    // measures the offset instead.
    expect(before - after).toBeCloseTo(200, 0);
  });

  it("leaves the default overlay untouched, where the host already contains", async () => {
    // Containment is a no-op for a fixed host, and this is what says so: the
    // fix must not have moved the placement everybody actually uses.
    const el = mountInFlowSlot({ placement: "sidebar" }, `--ag-ui-width: ${PANEL_WIDTH_PX}px`);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const host = el.getBoundingClientRect();
    const panel = panelOf(el).getBoundingClientRect();

    expect(getComputedStyle(el).position).toBe("fixed");
    expect(host.top).toBe(0);
    expect(host.height).toBe(window.innerHeight);
    expect(Math.abs(panel.right - host.right)).toBeLessThanOrEqual(BORDER_SLACK_PX);
    expect(Math.abs(panel.top - host.top)).toBeLessThanOrEqual(BORDER_SLACK_PX);
  });
});
