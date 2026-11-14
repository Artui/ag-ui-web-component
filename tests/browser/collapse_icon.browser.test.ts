import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The collapse control's mark follows the placement, and data-collapse-icon
 * chooses it outright.
 *
 * Chromium, because a slotted host icon hiding the fallback is a rendering
 * fact, and the drawn mark is asserted to fit its button. The marks are the
 * owner's approved path data, written out here rather than imported, so the
 * file runs against a tree that has none of them.
 */

const PANEL_RIGHT = "M15 4v16|M8 9.5l2.5 2.5L8 14.5";
const PANEL_LEFT = "M9 4v16|M16 9.5L13.5 12l2.5 2.5";
const DOWN = "M6 9.5l6 6 6-6";
const UP = "M6 14.5l6-6 6 6";
const RIGHT = "M9.5 6l6 6-6 6";
const LEFT = "M14.5 6l-6 6 6 6";

function mount(attributes: Readonly<Record<string, string>>, children: Element[] = []): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  el.append(...children);
  document.body.appendChild(el);
  return el;
}

function collapse(el: AgUiChat): HTMLButtonElement {
  const found = el.shadowRoot?.querySelector<HTMLButtonElement>(".header-btn--collapse");
  if (found === null || found === undefined) {
    throw new Error("expected the collapse control");
  }
  return found;
}

function glyph(control: HTMLElement): SVGSVGElement {
  const found = control.querySelector<SVGSVGElement>("svg.glyph");
  if (found === null) {
    throw new Error("expected a drawn glyph");
  }
  return found;
}

/** The path data, which is what tells the marks apart. */
function shown(el: AgUiChat): string {
  return [...glyph(collapse(el)).querySelectorAll("path")]
    .map((p) => p.getAttribute("d"))
    .join("|");
}

describe("the collapse control's mark (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it.each([
    [{ placement: "sidebar" }, PANEL_RIGHT],
    [{ placement: "sidebar", "data-side": "right" }, PANEL_RIGHT],
    [{ placement: "sidebar", "data-side": "left" }, PANEL_LEFT],
    // The undocumented docked column has no left variant: it always docks right.
    [{ placement: "side" }, PANEL_RIGHT],
    [{ placement: "side", "data-side": "left" }, PANEL_RIGHT],
    [{ placement: "sidebar", "collapse-to": "none" }, PANEL_RIGHT],
    [{}, DOWN],
    [{ placement: "floating" }, DOWN],
    [{ placement: "floating", "data-side": "left" }, DOWN],
    [{ placement: "bottom-left" }, DOWN],
    [{ placement: "floating", "collapse-to": "bar" }, DOWN],
    [{ placement: "full" }, DOWN],
    [{ placement: "embedded" }, DOWN],
    [{ placement: "nonsense" }, DOWN],
  ] as const)("defaults %o to its placement's mark", (attributes, expected) => {
    expect(shown(mount(attributes))).toBe(expected);
  });

  it("draws the panel mark as a window with a docked pane, inside its button", () => {
    const control = collapse(mount({ placement: "sidebar" }));
    const rect = glyph(control).querySelector("rect");
    expect(["x", "y", "width", "height", "rx"].map((name) => rect?.getAttribute(name))).toEqual([
      "3",
      "4",
      "18",
      "16",
      "2.5",
    ]);
    const outer = control.getBoundingClientRect();
    const inner = glyph(control).getBoundingClientRect();
    expect(inner.width).toBeGreaterThan(8);
    expect(inner.left).toBeGreaterThanOrEqual(outer.left);
    expect(inner.right).toBeLessThanOrEqual(outer.right);
    expect(inner.top).toBeGreaterThanOrEqual(outer.top);
    expect(inner.bottom).toBeLessThanOrEqual(outer.bottom);
    expect(control.querySelectorAll("svg")).toHaveLength(1);
    // A rect fills black by default; the glyph rule must reach it as it does a path.
    const paint = getComputedStyle(rect as SVGRectElement);
    expect(paint.fill).toBe("none");
    expect(paint.stroke).toBe(getComputedStyle(control).color);
  });

  it("follows a placement and side change live", () => {
    const el = mount({ placement: "floating" });
    expect(shown(el)).toBe(DOWN);

    el.setAttribute("placement", "sidebar");
    expect(shown(el)).toBe(PANEL_RIGHT);

    el.setAttribute("data-side", "left");
    expect(shown(el)).toBe(PANEL_LEFT);

    el.removeAttribute("data-side");
    expect(shown(el)).toBe(PANEL_RIGHT);

    el.setAttribute("placement", "floating");
    expect(shown(el)).toBe(DOWN);
  });

  it.each([
    ["chevron-up", UP, UP, UP],
    ["chevron-down", DOWN, DOWN, DOWN],
    ["chevron-left", LEFT, LEFT, LEFT],
    ["chevron-right", RIGHT, RIGHT, RIGHT],
    // The panel mark points into the edge the panel docks to.
    ["panel-close", PANEL_RIGHT, PANEL_RIGHT, PANEL_LEFT],
  ] as const)(
    "draws %s and keeps it through a placement change",
    (value, floating, sidebar, left) => {
      const el = mount({ placement: "floating", "data-collapse-icon": value });
      expect(shown(el)).toBe(floating);

      el.setAttribute("placement", "sidebar");
      expect(shown(el)).toBe(sidebar);

      el.setAttribute("data-side", "left");
      expect(shown(el)).toBe(left);

      el.setAttribute("placement", "floating");
      expect(shown(el)).toBe(floating);
    },
  );

  it("changes the mark live, and falls back to the placement's for an unknown value", () => {
    const el = mount({ placement: "sidebar" });
    expect(shown(el)).toBe(PANEL_RIGHT);

    el.setAttribute("data-collapse-icon", "chevron-down");
    expect(shown(el)).toBe(DOWN);

    el.setAttribute("data-collapse-icon", "arrow-sideways");
    expect(shown(el)).toBe(PANEL_RIGHT);

    el.setAttribute("placement", "floating");
    expect(shown(el)).toBe(DOWN);

    el.setAttribute("data-collapse-icon", "chevron-up");
    expect(shown(el)).toBe(UP);

    el.removeAttribute("data-collapse-icon");
    expect(shown(el)).toBe(DOWN);
  });

  it("lets a host's slotted icon win over the attribute and the placement", () => {
    const own = document.createElement("span");
    own.setAttribute("slot", "icon-collapse");
    own.textContent = "x";
    const el = mount({ placement: "sidebar", "data-collapse-icon": "chevron-up" }, [own]);
    const control = collapse(el);

    expect(control.querySelector("slot")?.assignedElements()).toEqual([own]);
    // The fallback is not rendered once a host fills the slot.
    expect(glyph(control).getBoundingClientRect().width).toBe(0);
    expect(own.getBoundingClientRect().width).toBeGreaterThan(0);

    el.setAttribute("data-collapse-icon", "chevron-left");
    el.setAttribute("placement", "floating");
    expect(control.querySelector("slot")?.assignedElements()).toEqual([own]);
    expect(glyph(control).getBoundingClientRect().width).toBe(0);
    expect(own.getBoundingClientRect().width).toBeGreaterThan(0);
  });
});
