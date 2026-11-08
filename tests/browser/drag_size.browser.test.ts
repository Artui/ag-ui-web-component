import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
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
});
