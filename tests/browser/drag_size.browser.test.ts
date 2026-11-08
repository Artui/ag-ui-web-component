import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A dragged size lives in private properties, so it stays out of the host's
 * tokens and out of the phone shape.
 *
 * The drag used to write the public --ag-ui-width / --ag-ui-height inline on
 * the element. That outranked every host rule, and the small-viewport block
 * reads the same tokens, so a size dragged in a wide window left the panel at
 * min(dragged, viewport) after the window narrowed instead of full-bleed. These
 * really narrow the viewport, because a media query is the subject.
 */

const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 500, height: 720 };
const ID = "drag-size";
const SIZE_KEY = `ag-ui-chat:size:${ID}`;
const LAUNCHER_KEY = `ag-ui-chat:launcher:${ID}`;

function mount(attrs: Record<string, string> = {}, style = ""): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.style.cssText = style;
  document.body.appendChild(el);
  return el;
}

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

beforeAll(() => {
  defineAgUiChat();
});

afterEach(async () => {
  document.body.innerHTML = "";
  document.head.querySelectorAll("style[data-drag-size]").forEach((style) => {
    style.remove();
  });
  localStorage.removeItem(SIZE_KEY);
  sessionStorage.removeItem(SIZE_KEY);
  localStorage.removeItem(LAUNCHER_KEY);
  sessionStorage.removeItem(LAUNCHER_KEY);
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterAll(async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

describe("a dragged size and the phone shape (real browser)", () => {
  it("stays full-bleed at 600px or less with a persisted size", async () => {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    await page.viewport(PHONE.width, PHONE.height);
    const el = mount();
    await settle();

    const box = el.getBoundingClientRect();
    expect(box.width).toBeCloseTo(window.innerWidth, 0);
    expect(box.height).toBeCloseTo(window.innerHeight, 0);
  });

  it("goes full-bleed when the window narrows after the size was applied", async () => {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    const el = mount();
    await settle();
    expect(el.getBoundingClientRect().width).toBeCloseTo(300, 0);

    await page.viewport(PHONE.width, PHONE.height);
    await settle();
    expect(el.getBoundingClientRect().width).toBeCloseTo(window.innerWidth, 0);
  });

  it("keeps a persisted size above the breakpoint, and the host's tokens out of its way", async () => {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    const el = mount({}, "--ag-ui-width: 700px; --ag-ui-height: 650px");
    await settle();

    // The user's drag beats the host's tokens.
    const box = el.getBoundingClientRect();
    expect(box.width).toBeCloseTo(300, 0);
    expect(box.height).toBeCloseTo(400, 0);
    // And the public tokens are the host's own, untouched.
    expect(el.style.getPropertyValue("--ag-ui-width")).toBe("700px");
    expect(el.style.getPropertyValue("--_drag-width")).toBe("300px");
  });

  it("resetSize drops the dragged size and its stored copy, and host tokens apply again", async () => {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    sessionStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    const el = mount({}, "--ag-ui-width: 700px; --ag-ui-height: 650px");
    await settle();
    expect(el.getBoundingClientRect().width).toBeCloseTo(300, 0);

    el.resetSize();
    await settle();

    expect(el.style.getPropertyValue("--_drag-width")).toBe("");
    expect(el.style.getPropertyValue("--_drag-height")).toBe("");
    expect(localStorage.getItem(SIZE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SIZE_KEY)).toBeNull();
    const box = el.getBoundingClientRect();
    expect(box.width).toBeCloseTo(700, 0);
    expect(box.height).toBeCloseTo(650, 0);
  });
});

describe("a dragged size and a host's !important token (real browser)", () => {
  it("beats the token until resetSize hands control back", async () => {
    localStorage.setItem(SIZE_KEY, JSON.stringify({ width: 300, height: 400 }));
    // A sized state written for a release where the drag was inline on the
    // public token, and so needed !important to be outranked.
    const style = document.createElement("style");
    style.dataset["dragSize"] = "";
    style.textContent = "ag-ui-chat.expanded { --ag-ui-width: 900px !important; }";
    document.head.appendChild(style);
    const el = mount();
    await settle();

    el.classList.add("expanded");
    await settle();
    // offsetWidth, not the rect: the host is scaled in some states.
    expect(el.offsetWidth).toBeCloseTo(300, 0);

    el.resetSize();
    await settle();
    expect(el.offsetWidth).toBeCloseTo(900, 0);
  });
});

describe("resetSize and the resize anchor (real browser)", () => {
  function grip(el: AgUiChat, name: string): HTMLElement {
    const found = el.shadowRoot?.querySelector<HTMLElement>(`.resize-handle--${name}`);
    if (found === null || found === undefined) {
      throw new Error(`expected a .resize-handle--${name} in the shadow root`);
    }
    return found;
  }

  function tabStop(el: AgUiChat): string | undefined {
    const stops = [
      ...(el.shadowRoot?.querySelectorAll<HTMLElement>(".resize-handle") ?? []),
    ].filter((handle) => handle.tabIndex === 0);
    expect(stops).toHaveLength(1);
    return stops[0]?.className.match(/resize-handle--([a-z-]+)/)?.[1];
  }

  it("re-reads the pinned edges against the restored box, not the dragged one", async () => {
    // A host that, in a sized state of its own, pins the panel to the opposite
    // corner. That is the case the resync exists for: the anchor stamped at the
    // end of the drag describes the box the user left, and resetSize hands the
    // box back to the host.
    const style = document.createElement("style");
    style.dataset["dragSize"] = "";
    style.textContent = "ag-ui-chat.relocated { inset: 24px auto auto 24px; }";
    document.head.appendChild(style);
    const el = mount();
    await settle();
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");

    // Drag the top-left grip, the free edge of a panel pinned bottom-right, so
    // the drag writes a size and leaves the position to the layout.
    const handle = grip(el, "top-left");
    const grab = handle.getBoundingClientRect();
    const x = grab.left + grab.width / 2;
    const y = grab.top + grab.height / 2;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x - 80, clientY: y - 60 }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x - 80, clientY: y - 60 }));
    await settle();
    expect(el.style.getPropertyValue("--_drag-width")).not.toBe("");
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");

    // The layout changes underneath the stamp; nothing re-reads it by itself.
    el.classList.add("relocated");
    await settle();
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
    expect(tabStop(el)).toBe("top-left");

    el.resetSize();
    await settle();

    expect(el.getAttribute("data-resize-anchor")).toBe("top-left");
    // The tab stop sits on the corner opposite the pinned one, and the grip
    // there is the one that grows the panel without moving it.
    expect(tabStop(el)).toBe("bottom-right");
    const edge = el.getBoundingClientRect();
    expect(edge.left).toBeCloseTo(24, 0);
    expect(edge.top).toBeCloseTo(24, 0);
  });
});

describe("a grip on a dragged corner panel (real browser)", () => {
  const part = (el: AgUiChat, selector: string): HTMLElement => {
    const found = el.shadowRoot?.querySelector<HTMLElement>(selector);
    if (found === null || found === undefined) {
      throw new Error(`expected ${selector} in the shadow root`);
    }
    return found;
  };

  const frames = async (): Promise<void> => {
    for (let frame = 0; frame < 3; frame += 1) {
      await settle();
    }
  };

  async function drag(handle: HTMLElement, dx: number, dy: number): Promise<void> {
    const rect = handle.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    handle.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }),
    );
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
    await frames();
  }

  /** Motion off, so a rect read after a frame is the resting one. */
  function chat(attrs: Record<string, string> = {}): AgUiChat {
    return mount(attrs, "--ag-ui-motion: 0s");
  }

  /**
   * The panel dragged by its header to [376, 96]. The launcher rides at its
   * bottom-right and the corner is re-picked from there, so bottom-right is
   * what the layout holds still and the top and left grips are the free ones.
   */
  async function placed(): Promise<AgUiChat> {
    const el = chat();
    await frames();
    const box = el.getBoundingClientRect();
    await drag(part(el, ".header"), 376 - box.left, 96 - box.top);
    expect(el.getAttribute("data-resize-anchor")).toBe("bottom-right");
    return el;
  }

  /** The launcher's centre, the one point a centred scale cannot move. */
  function bubbleCentre(el: AgUiChat): { x: number; y: number } {
    const rect = part(el, ".launcher").getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  it.each([
    ["top-left", -52, -32],
    ["top", 0, -32],
    ["left", -52, 0],
  ])(
    "remembers the corner the %s grip moved, through a reopen and a reload",
    async (name, dx, dy) => {
      const first = await placed();
      const before = first.getBoundingClientRect();
      await drag(part(first, `.resize-handle--${name}`), dx, dy);
      const grown = first.getBoundingClientRect();
      // Read off the box rather than summed from the pull: the grip sets the edge
      // where the pointer is, and the press lands inside the grip's own strip.
      expect(grown.left < before.left).toBe(dx !== 0);
      expect(grown.top < before.top).toBe(dy !== 0);
      expect(grown.right).toBeCloseTo(before.right, 0);
      expect(grown.bottom).toBeCloseTo(before.bottom, 0);

      first.setCollapsed(true);
      await frames();
      first.setCollapsed(false);
      await frames();
      const reopened = first.getBoundingClientRect();
      expect(reopened.left).toBeCloseTo(grown.left, 0);
      expect(reopened.top).toBeCloseTo(grown.top, 0);
      expect(reopened.width).toBeCloseTo(grown.width, 0);
      expect(reopened.height).toBeCloseTo(grown.height, 0);

      first.remove();
      const second = chat();
      await frames();
      const reloaded = second.getBoundingClientRect();
      expect(reloaded.left).toBeCloseTo(grown.left, 0);
      expect(reloaded.top).toBeCloseTo(grown.top, 0);
      expect(reloaded.width).toBeCloseTo(grown.width, 0);
      expect(reloaded.height).toBeCloseTo(grown.height, 0);
    },
  );

  it("leaves the launcher at the corner the panel collapses into", async () => {
    const el = await placed();
    await drag(part(el, ".resize-handle--top-left"), -52, -32);
    const grown = el.getBoundingClientRect();
    const size = part(el, ".launcher").offsetWidth;

    el.setCollapsed(true);
    await frames();
    expect(bubbleCentre(el).x).toBeCloseTo(grown.right - size / 2, 0);
    expect(bubbleCentre(el).y).toBeCloseTo(grown.bottom - size / 2, 0);

    el.setCollapsed(false);
    await frames();
    el.setCollapsed(true);
    await frames();
    expect(bubbleCentre(el).x).toBeCloseTo(grown.right - size / 2, 0);
    expect(bubbleCentre(el).y).toBeCloseTo(grown.bottom - size / 2, 0);
  });

  it("holds the panel where resetSize left it, through a reopen and a reload", async () => {
    // A size coming off shrinks the panel toward the corner the layout holds
    // still, so the top-left the spot is kept as moves with it. Keeping the
    // grown one would swing the panel away from its launcher on the next
    // restore.
    const first = await placed();
    await drag(part(first, ".resize-handle--top-left"), -52, -32);
    const grown = first.getBoundingClientRect();
    first.resetSize();
    await frames();
    const reset = first.getBoundingClientRect();
    expect(reset.right).toBeCloseTo(grown.right, 0);
    expect(reset.bottom).toBeCloseTo(grown.bottom, 0);
    expect(reset.left).toBeGreaterThan(grown.left);

    first.setCollapsed(true);
    await frames();
    first.setCollapsed(false);
    await frames();
    expect(first.getBoundingClientRect().left).toBeCloseTo(reset.left, 0);
    expect(first.getBoundingClientRect().top).toBeCloseTo(reset.top, 0);

    first.remove();
    const second = chat();
    await frames();
    expect(second.getBoundingClientRect().left).toBeCloseTo(reset.left, 0);
    expect(second.getBoundingClientRect().top).toBeCloseTo(reset.top, 0);
  });

  it("states no panel spot when resetSize runs on a panel only its launcher placed", async () => {
    // A launcher drag leaves the panel to be derived from it, so the panel opens
    // into whatever room a later viewport has. resetSize must not turn that into
    // a position nobody stated.
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    await drag(part(el, ".launcher"), -300, -200);
    const stored = localStorage.getItem(LAUNCHER_KEY);
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored as string)).not.toHaveProperty("panel");
    el.resetSize();
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
  });

  it("leaves the stated spot alone when resetSize runs on a phone", async () => {
    // Full-bleed, there is no panel top-left to take as the spot: the screen's
    // origin is not where the user put it.
    const el = await placed();
    await page.viewport(390, 844);
    await frames();
    el.resetSize();
    await frames();
    await page.viewport(DESKTOP.width, DESKTOP.height);
    await frames();
    expect(el.getBoundingClientRect().left).toBeCloseTo(376, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(96, 0);
  });

  async function reopen(el: AgUiChat): Promise<void> {
    el.setCollapsed(true);
    await frames();
    el.setCollapsed(false);
    await frames();
  }

  function expectAt(el: AgUiChat, box: { left: number; top: number }): void {
    expect(el.getBoundingClientRect().left).toBeCloseTo(box.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(box.top, 0);
  }

  const setHostSize = (el: AgUiChat): void => {
    el.style.setProperty("--ag-ui-width", "720px");
    el.style.setProperty("--ag-ui-height", "700px");
  };
  const dropHostSize = (el: AgUiChat): void => {
    el.style.removeProperty("--ag-ui-width");
    el.style.removeProperty("--ag-ui-height");
  };

  it("keeps the spot when a host enters a sized state of its own with resetSize", async () => {
    // The README's recipe for an "expanded" mode. The panel is the host's while
    // it lasts, and no gesture stated anything, so leaving it finds the spot.
    const first = await placed();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    setHostSize(first);
    first.resetSize();
    await frames();
    expect(first.getBoundingClientRect().width).toBeCloseTo(720, 0);
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);

    dropHostSize(first);
    await frames();
    await reopen(first);
    expectAt(first, { left: 376, top: 96 });

    first.remove();
    const second = chat();
    await frames();
    expectAt(second, { left: 376, top: 96 });
  });

  it.each([
    ["width", "--ag-ui-width"],
    ["height", "--ag-ui-height"],
  ])("does not shift the spot by a host %s in force at resetSize", async (_axis, token) => {
    // Which part of that change is the dragged size coming off and which is the
    // host's own cannot be told apart, and the host's would throw the spot off
    // by as much as it is bigger. So the top-left stays where the grip left it.
    const el = await placed();
    await drag(part(el, ".resize-handle--top-left"), -52, -32);
    const grown = el.getBoundingClientRect();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    el.style.setProperty(token, "700px");
    el.resetSize();
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);

    el.style.removeProperty(token);
    await frames();
    await reopen(el);
    expectAt(el, grown);
  });

  it('leaves the stored spot byte for byte when resetSize runs under data-launcher-drag="false"', async () => {
    // Only the record changes, and only matters if the attribute comes off: then
    // the panel would return to a top-left nobody stated.
    const el = await placed();
    await drag(part(el, ".resize-handle--top-left"), -52, -32);
    const grown = el.getBoundingClientRect();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    el.setAttribute("data-launcher-drag", "false");
    el.resetSize();
    await frames();
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);

    el.removeAttribute("data-launcher-drag");
    await reopen(el);
    expectAt(el, grown);
  });

  it("carries the same spot when resetSize runs during the open animation", async () => {
    // The animation is the panel's, inside the host, so the box the delta is read
    // from does not move with it. If it ever did, this reads a scaled box.
    const el = await placed();
    await drag(part(el, ".resize-handle--top-left"), -52, -32);
    el.setCollapsed(true);
    await frames();
    el.style.setProperty("--ag-ui-motion", "400ms");
    el.setCollapsed(false);
    expect(part(el, ".chat").getAnimations().length).toBeGreaterThan(0);
    el.resetSize();
    const { panel } = JSON.parse(localStorage.getItem(LAUNCHER_KEY) ?? "{}") as {
      panel: { left: number; top: number };
    };
    expect(panel.left).toBeCloseTo(376, 0);
    expect(panel.top).toBeCloseTo(96, 0);
  });

  it("keeps a resetSize's spot when the host sizes the panel only afterwards", async () => {
    const el = await placed();
    await drag(part(el, ".resize-handle--top-left"), -52, -32);
    el.resetSize();
    await frames();
    const reset = el.getBoundingClientRect();
    setHostSize(el);
    await frames();
    dropHostSize(el);
    await frames();
    await reopen(el);
    expectAt(el, reset);
  });

  it("moves a spot read from storage when resetSize runs on a fresh mount", async () => {
    const first = await placed();
    await drag(part(first, ".resize-handle--top-left"), -52, -32);
    first.remove();
    const second = chat();
    await frames();
    second.resetSize();
    await frames();
    const reset = second.getBoundingClientRect();
    expect(reset.left).toBeCloseTo(376, 0);
    await reopen(second);
    expectAt(second, reset);
  });

  it("carries the spot in memory where storage refuses it", async () => {
    const refused = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("refused");
    });
    try {
      const el = await placed();
      await drag(part(el, ".resize-handle--top-left"), -52, -32);
      el.resetSize();
      await frames();
      const reset = el.getBoundingClientRect();
      await reopen(el);
      expectAt(el, reset);
    } finally {
      refused.mockRestore();
    }
  });

  it("gives a stated spot back after a resetSize in a narrower window", async () => {
    // Held inside that window, the panel stands short of the spot, and nothing
    // about a size coming off, or there being none, states a new one.
    const el = chat();
    await frames();
    const box = el.getBoundingClientRect();
    await drag(part(el, ".header"), 800 - box.left, 96 - box.top);
    await page.viewport(900, 620);
    await frames();
    expect(el.getBoundingClientRect().left).toBeLessThan(800);
    expect(el.getBoundingClientRect().top).toBeLessThan(96);
    el.resetSize();
    await frames();
    await page.viewport(DESKTOP.width, DESKTOP.height);
    await frames();
    expectAt(el, { left: 800, top: 96 });
  });

  it.each([
    ["top-left", -200, -60],
    ["left", -200, 0],
    ["bottom-right", 200, 60],
  ])("comes back as drawn after the %s grip pulled past a host's maximum", async (name, dx, dy) => {
    const style = "--ag-ui-motion: 0s; --ag-ui-max-width: 420px; --ag-ui-max-height: 600px";
    const first = mount({}, style);
    await frames();
    const box = first.getBoundingClientRect();
    await drag(part(first, ".header"), 500 - box.left, 96 - box.top);
    await drag(part(first, `.resize-handle--${name}`), dx, dy);
    const drawn = first.getBoundingClientRect();
    expect(drawn.width).toBeCloseTo(420, 0);
    await reopen(first);
    expectAt(first, drawn);

    first.remove();
    const second = mount({}, style);
    await frames();
    expectAt(second, drawn);
  });

  it("does not take a grip on a dragged-off docked panel as the corner's spot", async () => {
    // An undo under the dock is what leaves a corner position standing there.
    const el = await placed();
    el.moveTo("top-left", { announce: true });
    await frames();
    el.setAttribute("collapse-to", "bar");
    await frames();
    part(el, ".run-notice-undo").click();
    await frames();
    await drag(part(el, ".header"), -100, -100);
    await drag(part(el, ".resize-handle--top-left"), -30, -30);

    el.removeAttribute("collapse-to");
    await frames();
    await page.viewport(1270, 800);
    await frames();
    expectAt(el, { left: 376, top: 96 });
  });

  /** A host size that makes the panel the window, as a host's "fill" state does. */
  const fillWindow = (el: AgUiChat): void => {
    for (const [token, value] of [
      ["--ag-ui-width", "100vw"],
      ["--ag-ui-height", "100vh"],
      ["--ag-ui-max-width", "100vw"],
      ["--ag-ui-max-height", "100vh"],
    ] as const) {
      el.style.setProperty(token, value);
    }
  };
  const dropFill = (el: AgUiChat): void => {
    for (const token of [
      "--ag-ui-width",
      "--ag-ui-height",
      "--ag-ui-max-width",
      "--ag-ui-max-height",
    ]) {
      el.style.removeProperty(token);
    }
  };

  it("stands at the stored spot when a host's size drops after a reopen under it", async () => {
    // Reopening under the size holds the box on the screen and writes that held
    // box from the corner re-picked for it. The size dropping fires no event, so
    // nothing but the box's own change can put the panel back.
    const el = await placed();
    const stored = localStorage.getItem(LAUNCHER_KEY);
    setHostSize(el);
    el.resetSize();
    await frames();
    await reopen(el);
    expect(el.getBoundingClientRect().width).toBeCloseTo(720, 0);

    dropHostSize(el);
    await frames();
    expectAt(el, { left: 376, top: 96 });
    expect(localStorage.getItem(LAUNCHER_KEY)).toBe(stored);
  });

  it("opens at the stored spot when a host's size drops while it is collapsed", async () => {
    const el = await placed();
    setHostSize(el);
    el.resetSize();
    await frames();
    el.setCollapsed(true);
    await frames();
    dropHostSize(el);
    await frames();
    el.setCollapsed(false);
    await frames();
    expectAt(el, { left: 376, top: 96 });
  });

  it("gives the launcher back with the panel when a host's size drops", async () => {
    // The launcher is carried by the clamp under the size, and the way back has
    // to bring it along or the panel opens away from its bubble.
    const el = await placed();
    const stored = JSON.parse(localStorage.getItem(LAUNCHER_KEY) as string);
    const size = part(el, ".launcher").offsetWidth;
    setHostSize(el);
    el.resetSize();
    await frames();
    await reopen(el);
    dropHostSize(el);
    await frames();
    el.setCollapsed(true);
    await frames();
    expect(bubbleCentre(el).x).toBeCloseTo(stored.left + size / 2, 0);
    expect(bubbleCentre(el).y).toBeCloseTo(stored.top + size / 2, 0);
  });

  it("holds the panel on the screen when a host sizes it up with no event", async () => {
    const el = await placed();
    setHostSize(el);
    await frames();
    const box = el.getBoundingClientRect();
    expect(box.width).toBeCloseTo(720, 0);
    expect(box.top).toBeGreaterThanOrEqual(8);
    expect(box.left).toBeCloseTo(376, 0);
  });

  it("returns a panel from a host's fill to its spot once the fill drops", async () => {
    // The start of the window is where a filled panel stands after a resize; it
    // says nothing about where the panel goes when the fill is gone.
    const el = await placed();
    fillWindow(el);
    await frames();
    await page.viewport(1200, 760);
    await frames();
    expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);

    dropFill(el);
    await frames();
    expectAt(el, { left: 376, top: 96 });
  });

  it("stands a moved panel at the start of the window as soon as a host fills it", async () => {
    const el = await placed();
    fillWindow(el);
    await frames();
    expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });

  it("keeps a filled panel with no spot where a grip on its free edges left it", async () => {
    // The release is a change of size like any other, so the panel must not leave
    // the pointer for the resting corner as the fill's inset comes off.
    const el = chat();
    await frames();
    fillWindow(el);
    await frames();
    await drag(part(el, ".resize-handle--bottom-right"), -300, -200);
    await frames();
    const box = el.getBoundingClientRect();
    expect([box.left, box.top]).toEqual([0, 0]);
    expect(box.width).toBeLessThan(1000);

    await page.viewport(PHONE.width, PHONE.height);
    await frames();
    await page.viewport(DESKTOP.width, DESKTOP.height);
    await frames();
    expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);

    await reopen(el);
    expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });

  it("leaves a key gesture on a grip alone until the key comes up", async () => {
    // A held arrow resizes per key and only states the spot when the key comes
    // up, and the box changes on every one of those keys. Answering that from the
    // old spot would swing the panel away from its launcher mid-gesture.
    const el = await placed();
    const grip = part(el, ".resize-handle--top-left");
    const key = (type: string): void => {
      grip.dispatchEvent(new KeyboardEvent(type, { key: "ArrowUp", bubbles: true }));
    };
    const before = el.getBoundingClientRect();
    key("keydown");
    await frames();
    key("keydown");
    await frames();
    const held = el.getBoundingClientRect();
    expect(held.top).toBeLessThan(before.top);
    expect(held.bottom).toBeCloseTo(before.bottom, 0);

    key("keyup");
    await frames();
    const after = el.getBoundingClientRect();
    expect(after.top).toBeCloseTo(held.top, 0);
    expect(after.bottom).toBeCloseTo(before.bottom, 0);
    await reopen(el);
    expect(el.getBoundingClientRect().top).toBeCloseTo(held.top, 0);
  });

  it("answers the window again after it is taken out in the middle of a key gesture", async () => {
    const el = await placed();
    const grip = part(el, ".resize-handle--top-left");
    grip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
    await frames();
    el.remove();
    document.body.appendChild(el);
    await frames();
    await page.viewport(PHONE.width, PHONE.height);
    await frames();
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.getBoundingClientRect().left).toBeCloseTo(0, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });

  it("keeps the launcher at its place when a host's size drops while it is collapsed", async () => {
    const el = await placed();
    const stored = JSON.parse(localStorage.getItem(LAUNCHER_KEY) as string);
    const size = part(el, ".launcher").offsetWidth;
    setHostSize(el);
    el.resetSize();
    await frames();
    el.setCollapsed(true);
    await frames();
    dropHostSize(el);
    await frames();
    expect(bubbleCentre(el).x).toBeCloseTo(stored.left + size / 2, 0);
    expect(bubbleCentre(el).y).toBeCloseTo(stored.top + size / 2, 0);
  });

  it("leaves a panel only its launcher placed where a grip left it", async () => {
    // With no stated panel the restore derives the box from the launcher, and the
    // grip's release is now a change of size that reaches it.
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    await drag(part(el, ".launcher"), -500, -300);
    el.setCollapsed(false);
    await frames();
    await drag(part(el, ".resize-handle--top-left"), -40, -30);
    const drawn = el.getBoundingClientRect();
    await frames();
    expect(el.getBoundingClientRect().left).toBeCloseTo(drawn.left, 0);
    expect(el.getBoundingClientRect().top).toBeCloseTo(drawn.top, 0);
  });

  it("leaves a grip gesture alone when the window resizes under it", async () => {
    // A tablet's viewport changes mid-gesture. Re-applying the last stated spot
    // here would put the launcher back where the gesture already moved it from.
    const el = await placed();
    const grip = part(el, ".resize-handle--bottom-right");
    const rect = grip.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    grip.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + 60, clientY: y + 60 }));
    window.dispatchEvent(new Event("resize"));
    await settle();
    window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + 60, clientY: y + 60 }));
    await frames();

    const stored = JSON.parse(localStorage.getItem(LAUNCHER_KEY) as string);
    const size = part(el, ".launcher").offsetWidth;
    el.setCollapsed(true);
    await frames();
    expect(bubbleCentre(el).x).toBeCloseTo(stored.left + size / 2, 0);
    expect(bubbleCentre(el).y).toBeCloseTo(stored.top + size / 2, 0);
  });
});
