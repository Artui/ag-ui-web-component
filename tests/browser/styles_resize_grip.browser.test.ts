import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Where the resize grips are, and what the panel does at its size clamps.
 *
 * Both halves are cascade and layout questions, which is why they are in the
 * Chromium project: happy-dom resolves computed styles well enough to agree
 * with a broken stylesheet, and computes no box at all.
 *
 * The grips used to be one grip, placed on the corner opposite whichever edges
 * the layout pinned. Two defects made that untrue for a year of releases and
 * were invisible to the suite -- the position rules were written with the ~=
 * operator against a single hyphenated token, so they could never match, and a
 * duplicate of the whole block sat earlier in the file behind a selector welded
 * to the previous rule by a stray comment. There are now eight grips at fixed
 * places, so that whole class of defect is gone with the rules that carried it.
 *
 * What remains is the measurement, which still decides what a drag on a pinned
 * edge costs in position and which grip carries the tab stop.
 */

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("where the grips sit (real browser)", () => {
  /** Which sides of the panel a grip is pinned to, per the resolved cascade. */
  function sides(el: AgUiChat, name: string): string[] {
    const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`);
    if (!(handle instanceof HTMLElement)) {
      throw new Error(`expected a .resize-handle--${name} in the shadow root`);
    }
    const style = getComputedStyle(handle);
    // getComputedStyle resolves `auto` to a *used* pixel value, so a pinned
    // side cannot be found by looking for the string "auto" -- it is the one
    // that computes to 0px. Reading it the other way round is how an earlier
    // version of this file reported every case as failing while the stylesheet
    // was correct.
    return (["top", "right", "bottom", "left"] as const).filter((side) => style[side] === "0px");
  }

  it("pins each grip to the edges it is named for", () => {
    const el = mount();

    expect(sides(el, "top")).toEqual(["top"]);
    expect(sides(el, "bottom")).toEqual(["bottom"]);
    expect(sides(el, "left")).toEqual(["left"]);
    expect(sides(el, "right")).toEqual(["right"]);
    expect(sides(el, "top-left").sort()).toEqual(["left", "top"]);
    expect(sides(el, "top-right").sort()).toEqual(["right", "top"]);
    expect(sides(el, "bottom-left").sort()).toEqual(["bottom", "left"]);
    expect(sides(el, "bottom-right").sort()).toEqual(["bottom", "right"]);
  });

  it("points each cursor along the direction that grip actually travels", () => {
    const el = mount();
    const cursor = (name: string): string => {
      const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`) as HTMLElement;
      return getComputedStyle(handle).cursor;
    };

    expect(cursor("left")).toBe("ew-resize");
    expect(cursor("right")).toBe("ew-resize");
    expect(cursor("top")).toBe("ns-resize");
    expect(cursor("bottom")).toBe("ns-resize");
    // The corners run along the two diagonals.
    expect(cursor("top-left")).toBe("nwse-resize");
    expect(cursor("bottom-right")).toBe("nwse-resize");
    expect(cursor("top-right")).toBe("nesw-resize");
    expect(cursor("bottom-left")).toBe("nesw-resize");
  });

  it("keeps the edge strips clear of the corners at both ends", () => {
    const el = mount();
    const box = (name: string): DOMRect => {
      const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`);
      if (!(handle instanceof HTMLElement)) {
        throw new Error(`expected a .resize-handle--${name} in the shadow root`);
      }
      return handle.getBoundingClientRect();
    };

    const panel = el.getBoundingClientRect();
    const left = box("left");
    // An edge strip that ran the full height would swallow the corner drags at
    // either end of it, and a corner is the only grip that moves both axes.
    expect(left.top).toBeGreaterThan(panel.top);
    expect(left.bottom).toBeLessThan(panel.bottom);
    expect(box("top").left).toBeGreaterThan(panel.left);
    expect(box("top").right).toBeLessThan(panel.right);
  });

  it("leaves a docked panel only the two vertical edges", () => {
    const el = mount({ placement: "sidebar" });
    const shown = (name: string): boolean => {
      const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`) as HTMLElement;
      return getComputedStyle(handle).display !== "none";
    };

    // The placement owns the height, so a horizontal edge and every corner
    // would advertise a drag that does nothing.
    expect(shown("left")).toBe(true);
    expect(shown("right")).toBe(true);
    expect(shown("top")).toBe(false);
    expect(shown("bottom")).toBe(false);
    expect(shown("bottom-right")).toBe(false);
  });

  it("gives a full-bleed panel none at all", () => {
    const el = mount({ placement: "full" });

    for (const name of ["left", "right", "top", "bottom", "bottom-right"]) {
      const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`) as HTMLElement;
      expect(getComputedStyle(handle).display, name).toBe("none");
    }
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

/**
 * The measurement itself, at the sizes where it used to invert.
 *
 * The element learns which edges its layout holds still by changing its own
 * size by a pixel and seeing what moved. Growing was the original probe and
 * cannot answer the question at a size already resting against max-width or
 * max-height: nothing moves, so every clamped axis reported the edge that did
 * not move -- which is the free one -- and the grip rendered on the corner the
 * drag travels by, with the direction inverted.
 *
 * It needed no unusual setup to reach. The default panel is 380px wide against
 * a max-width of 100vw minus 48, so any viewport under 428px is born clamped.
 */
describe("the anchor measurement, against the size clamps", () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60));

  it("reads the pinned edges of a panel clamped on both axes", async () => {
    const el = mount();
    // Far past both clamps, so growing by a pixel changes nothing at all.
    el.style.setProperty("--ag-ui-width", "5000px");
    el.style.setProperty("--ag-ui-height", "5000px");
    await settle();

    // The floating default is inset: auto 24px 24px auto -- pinned bottom
    // right, whatever the clamps do to its size.
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
  });

  it("reads them for a panel clamped on one axis only", async () => {
    const el = mount();
    el.style.setProperty("--ag-ui-width", "5000px");
    el.style.setProperty("--ag-ui-height", "200px");
    await settle();

    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
  });

  it("still reads a panel that is nowhere near its clamps", async () => {
    const el = mount();
    el.style.setProperty("--ag-ui-width", "200px");
    el.style.setProperty("--ag-ui-height", "200px");
    await settle();

    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
  });

  it("reads the opposite corner for a placement pinned there", async () => {
    const el = mount({ placement: "bottom-left" });
    el.style.setProperty("--ag-ui-width", "5000px");
    await settle();

    // Clamped, and still measured rather than guessed: this one is pinned left.
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-left");
  });

  it("leaves the panel exactly the size it found it", async () => {
    const el = mount();
    el.style.setProperty("--ag-ui-width", "300px");
    await settle();
    const width = el.getBoundingClientRect().width;

    // The probe writes and restores the size properties; a value left behind
    // would pin a panel that had been sizing itself.
    el.setAttribute("placement", "bottom-left");
    await settle();

    expect(el.style.getPropertyValue("--ag-ui-width")).toBe("300px");
    expect(el.getBoundingClientRect().width).toBe(width);
  });
});

/**
 * What a grip looks like, which is a different question from where it is.
 *
 * The drag state used to fill the whole handle with the accent. On the single
 * 14px corner grip that was invisible; on a strip running the length of an edge
 * it is a square-ended bar stopping short of the panel's corner radius at both
 * ends, which reads as a border the panel grew rather than as something to
 * grab. It was reported as one, which is the strongest evidence a piece of
 * feedback is saying the wrong thing.
 */
describe("the mark on a grip", () => {
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 260));

  function mark(el: AgUiChat, name: string): CSSStyleDeclaration {
    const handle = el.shadowRoot?.querySelector(`.resize-handle--${name}`);
    if (!(handle instanceof HTMLElement)) {
      throw new Error(`expected a .resize-handle--${name} in the shadow root`);
    }
    return getComputedStyle(handle, "::after");
  }

  function handle(el: AgUiChat, name: string): HTMLElement {
    const found = el.shadowRoot?.querySelector(`.resize-handle--${name}`);
    if (!(found instanceof HTMLElement)) {
      throw new Error(`expected a .resize-handle--${name} in the shadow root`);
    }
    return found;
  }

  it("draws nothing at rest", async () => {
    const el = mount();
    await settle();

    expect(mark(el, "bottom").opacity).toBe("0");
    expect(mark(el, "bottom-right").opacity).toBe("0");
  });

  it("never fills the strip itself, whatever state it is in", async () => {
    const el = mount();
    handle(el, "bottom").setAttribute("data-dragging", "true");
    await settle();

    // The fill is what was mistaken for a border. The mark lives in ::after so
    // the hit area can stay the full strip without looking like one.
    const strip = getComputedStyle(handle(el, "bottom"));
    expect(strip.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(strip.opacity).toBe("1");
  });

  it("shows a pill along an edge and a dot in a corner", async () => {
    const el = mount();
    handle(el, "bottom").setAttribute("data-dragging", "true");
    handle(el, "left").setAttribute("data-dragging", "true");
    handle(el, "bottom-right").setAttribute("data-dragging", "true");
    await settle();

    // Wide and short on a horizontal edge, tall and narrow on a vertical one.
    expect(mark(el, "bottom").width).toBe("28px");
    expect(mark(el, "bottom").height).toBe("3px");
    expect(mark(el, "left").width).toBe("3px");
    expect(mark(el, "left").height).toBe("28px");
    // A corner has no length to run along.
    expect(mark(el, "bottom-right").width).toBe("3px");
    expect(mark(el, "bottom-right").height).toBe("3px");
  });

  it("makes the drag the strongest state it has", async () => {
    const el = mount();
    handle(el, "bottom").setAttribute("data-dragging", "true");
    await settle();

    expect(Number.parseFloat(mark(el, "bottom").opacity)).toBeGreaterThan(0.8);
  });

  it("keeps the mark clear of the panel's rounded corners", async () => {
    const el = mount();
    const panel = el.getBoundingClientRect();
    const strip = handle(el, "bottom").getBoundingClientRect();
    const radius = Number.parseFloat(getComputedStyle(el).borderRadius) || 12;

    // The mark is centred in a strip that is already inset past the corners, so
    // the nearest it comes to a corner is half the strip minus half the mark.
    const clearance = (strip.width - 28) / 2;
    expect(strip.left - panel.left).toBeGreaterThanOrEqual(radius - 2);
    expect(clearance).toBeGreaterThan(radius);
  });
});
