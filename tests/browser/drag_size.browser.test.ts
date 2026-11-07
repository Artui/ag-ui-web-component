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
