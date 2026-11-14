import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, ICON_MAXIMIZE, ICON_RESTORE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The header controls' marks are drawn SVG glyphs, not typed characters.
 *
 * Chromium, because each assertion is on a laid-out box or a resolved paint:
 * a typed glyph's ink exceeds the box measured for it, and happy-dom lays out
 * nothing and resolves no `currentColor`.
 */

const MODIFIERS = ["history", "checkpoints", "new", "theme", "maximize", "collapse"] as const;

const THEMES = ["", "dark", "soft", "soft dark", "ledger", "ledger dark", "classic", "code"];

function mount(theme = "", children: readonly Element[] = []): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-theme-toggle", "");
  el.setAttribute("data-runs-url", "/runs/");
  if (theme !== "") {
    el.setAttribute("theme", theme);
  }
  el.append(...children);
  document.body.appendChild(el);
  return el;
}

function button(el: AgUiChat, modifier: string): HTMLButtonElement {
  const found = el.shadowRoot?.querySelector<HTMLButtonElement>(`.header-btn--${modifier}`);
  if (found === null || found === undefined) {
    throw new Error(`expected the ${modifier} control`);
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

/** The path data, which is what tells two marks apart. */
function shape(markup: string): string {
  const holder = document.createElement("div");
  holder.innerHTML = markup;
  return [...holder.querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|");
}

function shown(control: HTMLElement): string {
  return [...glyph(control).querySelectorAll("path")].map((p) => p.getAttribute("d")).join("|");
}

function expectInside(control: HTMLElement): void {
  const outer = control.getBoundingClientRect();
  const inner = glyph(control).getBoundingClientRect();
  expect(inner.width).toBeGreaterThan(8);
  expect(inner.height).toBeGreaterThan(8);
  expect(inner.left).toBeGreaterThanOrEqual(outer.left);
  expect(inner.right).toBeLessThanOrEqual(outer.right);
  expect(inner.top).toBeGreaterThanOrEqual(outer.top);
  expect(inner.bottom).toBeLessThanOrEqual(outer.bottom);
}

describe("header control icons (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    for (const style of document.head.querySelectorAll("style[data-test-page-rule]")) {
      style.remove();
    }
  });

  it.each(MODIFIERS)("draws %s as a glyph that fits inside its button", (modifier) => {
    const control = button(mount(), modifier);

    expectInside(control);
    // One size for the row, the theme toggle's holder included.
    expect(glyph(control).getBoundingClientRect().width).toBeCloseTo(
      glyph(
        button(document.querySelector(ELEMENT_TAG) as AgUiChat, "history"),
      ).getBoundingClientRect().width,
      1,
    );
  });

  it("swaps the maximize control to the restore mark and back", () => {
    const el = mount();
    const control = button(el, "maximize");
    expect(shown(control)).toBe(shape(ICON_MAXIMIZE));

    control.click();
    expect(el.maximized).toBe(true);
    expect(shown(control)).toBe(shape(ICON_RESTORE));
    expect(control.querySelectorAll("svg")).toHaveLength(1);
    expectInside(control);

    control.click();
    expect(el.maximized).toBe(false);
    expect(shown(control)).toBe(shape(ICON_MAXIMIZE));
  });

  it("lets a host's slotted icon replace the built-in one, through a maximize swap", () => {
    const maximize = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    maximize.setAttribute("slot", "icon-maximize");
    const history = document.createElement("span");
    history.setAttribute("slot", "icon-history");
    history.textContent = "H";
    const el = mount("", [maximize, history]);

    for (const [modifier, host] of [
      ["maximize", maximize],
      ["history", history],
    ] as const) {
      const control = button(el, modifier);
      expect(control.querySelector("slot")?.assignedElements()).toEqual([host]);
      // The fallback is not rendered once a host fills the slot.
      expect(glyph(control).getBoundingClientRect().width).toBe(0);
    }

    el.setMaximized(true);
    const control = button(el, "maximize");
    expect(control.querySelector("slot")?.assignedElements()).toEqual([maximize]);
    expect(glyph(control).getBoundingClientRect().width).toBe(0);
  });

  it.each(
    THEMES.flatMap((theme) => [
      { theme, accent: false },
      { theme, accent: true },
    ]),
  )(
    "paints the glyphs in the button's colour under $theme (accent $accent)",
    ({ theme, accent }) => {
      if (accent) {
        const style = document.createElement("style");
        style.dataset["testPageRule"] = "";
        style.textContent = `${ELEMENT_TAG} { --ag-ui-header-bg: #3d5afe; --ag-ui-header-fg: #ffffff; }`;
        document.head.appendChild(style);
      }
      const el = mount(theme);
      for (const modifier of MODIFIERS) {
        const control = button(el, modifier);
        const ink = getComputedStyle(control).color;
        const path = glyph(control).querySelector("path, circle") as SVGElement;
        expect(getComputedStyle(path).stroke).toBe(ink);
        if (accent) {
          expect(ink).toBe("rgb(255, 255, 255)");
        }
      }
    },
  );
});
