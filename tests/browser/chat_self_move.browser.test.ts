import { page } from "@vitest/browser/context";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The panel moving itself: the half of the agent's self-control that is
 * geometry rather than decision-making.
 *
 * A third claimant on axes a placement and a user drag already share, so what
 * these check is that it claims them the same way the drag does -- the launcher
 * travels with the panel, the corner it opens from is re-picked -- and that it
 * declines rather than lying wherever the position is not its to take.
 */

function undoButton(el: AgUiChat): HTMLButtonElement {
  const found = el.shadowRoot?.querySelector(".run-notice-undo");
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error("no undo control on the notice");
  }
  return found;
}

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

/** The launcher's centre, which is the only point a scaled element keeps still. */
function launcherCentre(el: AgUiChat): { x: number; y: number } {
  const launcher = el.shadowRoot?.querySelector(".launcher");
  if (!(launcher instanceof HTMLElement)) {
    throw new Error("no launcher in the shadow root");
  }
  const box = launcher.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

describe("the panel moving itself (real browser)", () => {
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

  it("describes where it is and what can be done to it", async () => {
    const el = mount();
    await settle();
    const report = el.describeSurface();

    expect(report).toMatchObject({ placement: null, collapsed: false, collapsible: true });
    expect(report.movable).toBe(true);
    expect(report.fullBleed).toBe(false);
    expect(report.box.width).toBeGreaterThan(0);
    expect(report.viewport.width).toBe(window.innerWidth);
  });

  it.each([
    ["top-left", "left", "top"],
    ["bottom-right", "right", "bottom"],
  ] as const)("sends the panel to %s", async (corner, edgeX, edgeY) => {
    const el = mount();
    await settle();
    expect(el.moveTo(corner)).toBe(true);
    await settle();

    const box = el.getBoundingClientRect();
    if (edgeX === "left") {
      expect(box.left).toBeCloseTo(24, 0);
    } else {
      expect(window.innerWidth - box.right).toBeCloseTo(24, 0);
    }
    if (edgeY === "top") {
      expect(box.top).toBeCloseTo(24, 0);
    } else {
      expect(window.innerHeight - box.bottom).toBeCloseTo(24, 0);
    }
  });

  it("takes the launcher with it, so collapsing lands where the panel went", async () => {
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();
    const panel = el.getBoundingClientRect();

    el.setCollapsed(true);
    await settle();
    const centre = launcherCentre(el);

    // The launcher lives at a corner of the panel. If it stayed behind, the
    // next expand would re-derive the panel's position from a bubble standing
    // where the panel used to be and undo the move.
    expect(centre.x).toBeLessThan(panel.left + panel.width / 2);
    expect(centre.y).toBeLessThan(panel.top + panel.height / 2);
  });

  it("survives a reload, like any other stated position", async () => {
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();
    el.remove();

    const again = mount();
    await settle();
    expect(again.getBoundingClientRect().left).toBeCloseTo(24, 0);
  });

  it("declines where the placement owns the position, rather than lying", async () => {
    const el = mount({ placement: "sidebar" });
    await settle();
    const before = el.getBoundingClientRect().left;

    expect(el.moveTo("top-left")).toBe(false);
    expect(el.describeSurface().movable).toBe(false);
    await settle();
    // And it really did not move, which is the claim the boolean is making.
    expect(el.getBoundingClientRect().left).toBeCloseTo(before, 0);
  });

  it("declines when it fills the screen, because there is nowhere to go", async () => {
    const el = mount({ placement: "full" });
    await settle();

    const report = el.describeSurface();
    expect(report.fullBleed).toBe(true);
    expect(report.movable).toBe(false);
    expect(el.moveTo("top-left")).toBe(false);
  });

  it("declines on a phone, where a corner placement is the whole screen", async () => {
    // The case the mobile layout and this tool could not be designed apart.
    // "full" declines because that placement never moves; a floating widget
    // below the breakpoint declines for the other reason -- it is genuinely
    // movable and there is genuinely nowhere to move it to -- and the agent
    // has to be told which, since only one of them suggests minimising.
    await page.viewport(420, 720);
    try {
      const el = mount({ placement: "floating" });
      await settle();

      const report = el.describeSurface();
      expect(report.fullBleed).toBe(true);
      expect(report.movable).toBe(false);
      // Still collapsible, which is what makes minimise the honest fallback.
      expect(report.collapsible).toBe(true);
      expect(el.moveTo("top-left")).toBe(false);
    } finally {
      await page.viewport(1280, 800);
    }
  });

  it("reports a page placement as having no collapsed state", async () => {
    const el = mount({ placement: "page" });
    await settle();

    expect(el.describeSurface().collapsible).toBe(false);
  });

  it("says so when the agent moves the panel, and offers the way back", async () => {
    // A panel that rearranges itself mid-conversation has to be both visible
    // and reversible. The notice is the surface that already reports what the
    // run did, so it carries the one control it is allowed to carry.
    const el = mount();
    await settle();
    const before = el.getBoundingClientRect();

    el.moveTo("top-left", { announce: true });
    await settle();
    expect(el.getBoundingClientRect().left).not.toBeCloseTo(before.left, 0);

    const undo = undoButton(el);
    undo.click();
    await settle();
    expect(el.getBoundingClientRect().left).toBeCloseTo(before.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(before.top, 0);
    // One use: what it restores is the state as it was when the notice was
    // written, so offering it again would put back something already moved on.
    expect(undo.disabled).toBe(true);
  });

  it("puts back a position that was itself stated, not just the default", async () => {
    // Undoing from a pristine panel only ever has to clear what the move
    // wrote. The case that actually restores something is the second move: the
    // panel already had a stated inset and an expand corner, and both have to
    // come back or the box lands right and animates out of the wrong side.
    const el = mount();
    await settle();
    el.moveTo("bottom-left");
    await settle();
    const stated = {
      box: el.getBoundingClientRect(),
      inset: el.style.getPropertyValue("--ag-ui-inset"),
      corner: el.getAttribute("data-expand-corner"),
    };
    expect(stated.inset).not.toBe("");
    expect(stated.corner).not.toBeNull();

    el.moveTo("top-right", { announce: true });
    await settle();
    undoButton(el).click();
    await settle();

    expect(el.getBoundingClientRect().left).toBeCloseTo(stated.box.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(stated.box.top, 0);
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(stated.inset);
    expect(el.getAttribute("data-expand-corner")).toBe(stated.corner);
  });

  it("stays quiet when the host moves its own panel", async () => {
    // A host arranging its own page does not need telling what it just did.
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();

    expect(el.shadowRoot?.querySelector(".run-notice-undo")).toBeNull();
  });

  it("says the agent minimised it, and offers no undo beside the saying", async () => {
    const el = mount();
    await settle();
    el.setCollapsed(true, { announce: true });
    await settle();
    expect(el.collapsed).toBe(true);

    // The notice is written, because a panel that leaves on its own has to say
    // so and the user will read it when they open the panel again.
    const notice = el.shadowRoot?.querySelector(".run-notice--surface");
    expect(notice).not.toBeNull();

    // But no undo, and this is the point: the notice lives in the transcript,
    // and the collapse it describes is what hides the transcript. The only way
    // to read it is to expand -- which is exactly what the undo would have
    // done, so by the time the control can be seen it is a guaranteed no-op.
    // The launcher is the way back, and it is the one thing still on screen.
    expect(notice?.querySelector(".run-notice-undo")).toBeNull();
    // The structural half of that argument, asserted rather than described:
    // the notice is inside the panel, and the panel is what the collapse takes
    // away. Checked as containment rather than as a computed visibility,
    // because the collapse is animated and the end state is a frame away --
    // which would make this a race rather than a statement.
    const panel = el.shadowRoot?.querySelector(".chat");
    expect(panel?.contains(notice ?? null)).toBe(true);
  });

  it("hands the axes back when the placement changes", async () => {
    // The same ownership rule the drag follows: a position stated under one
    // placement must not outrank the next one.
    const el = mount();
    await settle();
    el.moveTo("top-left");
    await settle();

    el.setAttribute("placement", "sidebar");
    await settle();
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });
});

/**
 * The frames the agent's move has to speak, which are two and are not the same.
 *
 * A host can reserve the edges its own chrome occupies. The usable box that
 * leaves has an origin, and every coordinate `moveTo` computes is an absolute
 * screen one -- so a margin applied to the box's *extents* alone sends the
 * panel under the very chrome the reservation exists to keep it out of.
 */
describe("the agent's move and the edges a host reserved (real browser)", () => {
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

  it("keeps a corner move out of the reserved edges", async () => {
    const RESERVED = 120;
    const el = mount({ placement: "floating" });
    el.style.setProperty("--ag-ui-viewport-inset-top", `${RESERVED}px`);
    el.style.setProperty("--ag-ui-viewport-inset-left", `${RESERVED}px`);
    await settle();

    expect(el.moveTo("top-left")).toBe(true);
    await settle();

    const box = el.getBoundingClientRect();
    // Inside the reservation, not measured from the screen: a top of 24 would
    // be the panel sitting a hundred pixels up inside the host's header.
    expect(box.top).toBeGreaterThanOrEqual(RESERVED);
    expect(box.left).toBeGreaterThanOrEqual(RESERVED);
  });

  it("reaches the far edges of the usable box, not its width", async () => {
    // Reserved on the *near* side, which is what separates the two readings. A
    // reservation on the far side is taken out of the extent either way, so it
    // cannot tell a right edge of `viewport.width` from one of `viewport.left
    // + viewport.width`; a near-side one leaves the panel short by exactly the
    // reserved inset, and the move looks like it stopped halfway.
    // Sized so the panel still fits in what is left. A reservation deep enough
    // to make the usable box shorter than the panel is a different rule --
    // the near edge wins and the far one overflows, exactly as the clamp does
    // for an oversized panel -- and it would hide this one.
    const LEFT = 200;
    const TOP = 100;
    const el = mount({ placement: "floating" });
    el.style.setProperty("--ag-ui-viewport-inset-left", `${LEFT}px`);
    el.style.setProperty("--ag-ui-viewport-inset-top", `${TOP}px`);
    await settle();

    expect(el.moveTo("bottom-right")).toBe(true);
    await settle();

    const box = el.getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
    expect(box.bottom).toBeLessThanOrEqual(window.innerHeight);
    // Within a margin of the real far edge, not the reserved inset short of it.
    expect(box.right).toBeGreaterThan(window.innerWidth - LEFT);
    expect(box.bottom).toBeGreaterThan(window.innerHeight - TOP);
  });

  it("erases the stored position when the undo is back to having none", async () => {
    const el = mount({ placement: "floating" });
    await settle();
    // Nothing dragged, so there is nothing stored -- which is the state whose
    // restore has no value to write and therefore has to remove one.
    expect(localStorage.getItem("ag-ui-chat:launcher")).toBeNull();

    el.moveTo("top-left", { announce: true });
    await settle();
    expect(localStorage.getItem("ag-ui-chat:launcher")).not.toBeNull();

    undoButton(el).click();
    await settle();

    // The panel goes back either way; what this holds is that the move does
    // not survive the undo in storage, where it would be re-applied by the
    // next resize or reload and outlive the tab it was undone in.
    expect(localStorage.getItem("ag-ui-chat:launcher")).toBeNull();
  });
});
