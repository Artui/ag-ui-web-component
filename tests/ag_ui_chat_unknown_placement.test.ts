/**
 * What the element does with a `placement` value no surface record names.
 *
 * surface_for.test.ts pins the record itself. What it cannot pin is that the
 * element reads it: a record can say an unknown value mounts open, keeps a
 * fixed launcher and resizes both ways while the element ignores all three.
 * So these mount the element and look at what a visitor would get.
 *
 * The stylesheet lays an unknown value out as the default corner, but the
 * script has never treated it as one -- a typo in a host's markup must not
 * start moving or hiding a panel the host meant to show. The empty string is
 * the opposite case and the one place the two could be confused: it IS the
 * default corner, so it has to behave like one.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 380, height: 560 };

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/**
 * Mount with nothing but a placement: no `data-start-open`, because the
 * first-mount default is exactly what is under test.
 *
 * Geometry is the resting bottom-right corner, given to the pieces happy-dom
 * does not lay out. The launcher is reported through the 0.94 press scale, as
 * a real one is while it is being dragged.
 */
function mount(placement: string | null): { el: AgUiChat; launcher: HTMLElement } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  if (placement !== null) {
    el.setAttribute("placement", placement);
  }
  document.body.appendChild(el);

  el.getBoundingClientRect = (() => ({
    left: 604,
    top: 216,
    width: PANEL.width,
    height: PANEL.height,
    right: 984,
    bottom: 776,
  })) as never;

  const launcher = shadow(el).querySelector(".launcher") as HTMLElement;
  Object.defineProperty(launcher, "offsetWidth", { value: 56, configurable: true });
  Object.defineProperty(launcher, "offsetHeight", { value: 56, configurable: true });
  launcher.getBoundingClientRect = (() => ({
    left: 929.68,
    top: 721.68,
    width: 52.64,
    height: 52.64,
    right: 982.32,
    bottom: 774.32,
  })) as never;
  return { el, launcher };
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.assign(event, { clientX: x, clientY: y, button: 0 });
  return event;
}

/** Press, travel and release: the same gesture whatever it is pressed on. */
function drag(target: HTMLElement, from: [number, number], to: [number, number]): void {
  target.dispatchEvent(pointer("pointerdown", from[0], from[1]));
  window.dispatchEvent(pointer("pointermove", to[0], to[1]));
  window.dispatchEvent(pointer("pointerup", to[0], to[1]));
}

/** Drag the launcher from the bottom-right corner to near the top-left. */
function dragLauncher(launcher: HTMLElement): void {
  drag(launcher, [956, 748], [156, 148]);
}

/** Drag the grip at one panel corner 40px outwards, as a visitor resizing would. */
function dragGrip(el: AgUiChat, name: string, from: [number, number], to: [number, number]): void {
  drag(shadow(el).querySelector(`.resize-handle--${name}`) as HTMLElement, from, to);
}

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: VIEWPORT.width, configurable: true });
  Object.defineProperty(window, "innerHeight", { value: VIEWPORT.height, configurable: true });
  sessionStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("an unrecognised placement", () => {
  it("mounts open, because a typo must not hide a panel the host meant to show", () => {
    const { el } = mount("bottom-right");

    expect(el.hasAttribute("collapsed")).toBe(false);
    expect(el.collapsed).toBe(false);
  });

  it("keeps its launcher where it is when the launcher is dragged", () => {
    const { el, launcher } = mount("bottom-right");
    el.setCollapsed(true);

    dragLauncher(launcher);

    // A drag that took would write the position it landed on and the corner
    // the panel opens from; neither exists for a launcher that did not move.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
    expect(el.hasAttribute("data-expand-corner")).toBe(false);
  });

  it("resizes on both axes from a corner grip", () => {
    const { el } = mount("bottom-right");

    // The top-left grip drags the left edge (width) and the top edge (height)
    // of a panel resting on the bottom-right: 80px further out on each.
    dragGrip(el, "top-left", [604, 216], [524, 136]);

    expect(el.style.getPropertyValue("--ag-ui-width")).toBe("460px");
    expect(el.style.getPropertyValue("--ag-ui-height")).toBe("640px");
  });
});

describe("the placements an unrecognised value is not", () => {
  it("treats the empty string as the default corner: collapsed, with a launcher that drags", () => {
    const { el, launcher } = mount("");

    expect(el.hasAttribute("collapsed")).toBe(true);

    dragLauncher(launcher);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("120px auto auto 128px");
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
  });

  it("treats an absent placement the same way", () => {
    const { el, launcher } = mount(null);

    expect(el.hasAttribute("collapsed")).toBe(true);

    dragLauncher(launcher);

    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
  });

  it("mounts a full-bleed panel open, because it is the page the visitor came for", () => {
    const { el } = mount("full");

    expect(el.hasAttribute("collapsed")).toBe(false);
    expect(el.collapsed).toBe(false);
  });
});
