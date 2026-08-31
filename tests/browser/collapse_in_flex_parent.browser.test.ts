import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A collapsed host has to actually shrink, in the layout hosts really use.
 *
 * Every collapse path works by letting the host size to its content: the in-flow
 * placements set `height: auto` and keep the header bar, the floating one leaves
 * only the launcher. All of it is overridden by a flex or grid parent whose
 * `align-items` is the default `stretch` -- so the panel hides and the box it
 * occupied stays behind, a header bar over several hundred pixels of nothing.
 *
 * Putting the element in a flex row beside the page content is the obvious way to
 * embed it, which is why every known consumer had this: four gallery frontends
 * and an admin sidebar.
 *
 * A browser test because there is nothing here happy-dom can answer. It computes
 * no cascade and lays out no boxes, so it reports the same height whether the
 * rule applies, is overridden, or was never written.
 */

const PARENT_HEIGHT = 600;

function mountInStretchingParent(placement: string | null): AgUiChat {
  const parent = document.createElement("div");
  // The shape all four gallery apps and the admin sidebar use, reduced: a flex
  // row, default align-items, the element told to fill the free space.
  parent.style.cssText = `display: flex; height: ${PARENT_HEIGHT}px; width: 900px;`;
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (placement !== null) {
    el.setAttribute("placement", placement);
  }
  el.style.flex = "1";
  parent.appendChild(el);
  document.body.appendChild(parent);
  return el;
}

describe("collapsing inside a stretching parent", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.replaceChildren();
  });

  // `embedded` only, and the other two placements are worth naming so the scope
  // does not read as an oversight. `page` sizes itself to the viewport, so a
  // parent never stretches it and this cannot arise. `floating` -- the default --
  // is documented as never reflowing the page, and hides its panel with
  // `visibility` so the transition has something to animate; a visibility-hidden
  // box still occupies its space, so a floating widget cannot shrink an in-flow
  // parent and is not meant to be in one. A host docking a full-height panel
  // should say so with a placement rather than take the floating default.
  for (const placement of ["embedded"]) {
    it(`shrinks the host when collapsed with placement=${placement}`, async () => {
      const el = mountInStretchingParent(placement);
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const expanded = el.getBoundingClientRect().height;
      expect(Math.round(expanded)).toBe(PARENT_HEIGHT);

      el.setAttribute("collapsed", "");
      await new Promise((r) => setTimeout(r, 400));
      const collapsed = el.getBoundingClientRect().height;

      // Not "smaller" -- a host that gave up only its padding would pass that.
      // It has to stop occupying the space its body used, which is most of it.
      expect(collapsed).toBeLessThan(PARENT_HEIGHT / 2);
    });
  }

  it("gives the space back to the page rather than merely hiding the panel", async () => {
    const el = mountInStretchingParent("embedded");
    const sibling = document.createElement("div");
    sibling.style.cssText = "height: 40px;";
    el.parentElement?.appendChild(sibling);
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    el.setAttribute("collapsed", "");
    await new Promise((r) => setTimeout(r, 400));

    // The failure this pins: the panel disappears, the box does not, and the
    // page sees no space returned.
    expect(el.getBoundingClientRect().bottom).toBeLessThan(PARENT_HEIGHT / 2);
  });
});
