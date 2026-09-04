import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A drag has to track the pointer, the whole way.
 *
 * The failure this exists for was reported from a phone and reproduced on a
 * desktop: dragging the launcher upward, it followed the finger until it passed
 * roughly the middle of the screen and then leapt, by about the height of the
 * host's own header bar. Halfway up is where the expand corner flips -- the
 * point stops being written as a `top` and starts being written as a `bottom` --
 * and the two were being measured from different things.
 *
 * Only a rendered drag can see it. Every unit around it agreed: the corner was
 * right, the clamp was right, and each inset was correct against the box it was
 * given. What was wrong was which box, and that only shows as a position.
 *
 * The assertion is deliberately about the *step*, not the endpoint. A drag that
 * lands in the right place having jumped twice on the way is the bug being
 * reported.
 */

const STEP_PX = 25;
/** What the host reserves, which is what the bug's leap was the size of. */
const RESERVED_TOP_PX = 120;

function mount(collapsed: boolean): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", "floating");
  el.setAttribute("data-start-open", "");
  el.style.setProperty("--ag-ui-viewport-inset-top", `${RESERVED_TOP_PX}px`);
  document.body.appendChild(el);
  if (collapsed) {
    el.setCollapsed(true);
  }
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

/** The centre, which is the one point a scaled element keeps still. */
function centre(node: HTMLElement): { x: number; y: number } {
  const box = node.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

function pointer(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
    composed: true,
    pointerId: 1,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    isPrimary: true,
  });
}

/**
 * Drag `handle` straight up, and report how far the tracked element actually
 * moved on each step.
 */
function dragUp(handle: HTMLElement, tracked: HTMLElement, steps: number): number[] {
  const from = centre(handle);
  handle.dispatchEvent(pointer("pointerdown", from.x, from.y));
  const moved: number[] = [];
  let previous = centre(tracked).y;
  for (let i = 1; i <= steps; i += 1) {
    window.dispatchEvent(pointer("pointermove", from.x, from.y - i * STEP_PX));
    const now = centre(tracked).y;
    moved.push(previous - now);
    previous = now;
  }
  window.dispatchEvent(pointer("pointerup", from.x, from.y - steps * STEP_PX));
  return moved;
}

describe("dragging tracks the pointer (real browser)", () => {
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

  it.each([
    ["launcher", true],
    ["open panel", false],
  ])("moves the %s no further than the pointer, across the corner flip", (_label, collapsed) => {
    const el = mount(collapsed);
    const handle = collapsed ? part(el, ".launcher") : part(el, ".header");
    const tracked = collapsed ? part(el, ".launcher") : el;
    // Far enough to cross the middle, which is where the corner flips.
    const moved = dragUp(handle, tracked, 20);

    // The bug was a step of about 150px for a pointer that had moved 25 -- so
    // the invariant is the step, not the endpoint. Anything between zero and
    // the pointer's own distance is honest: it either follows, or it runs out
    // of room and slows to a stop against the edge the host left free. What it
    // must never do is overtake the pointer, or travel backwards.
    for (const distance of moved) {
      expect(distance).toBeGreaterThanOrEqual(0);
      expect(distance).toBeLessThanOrEqual(STEP_PX + 1);
    }
    // ...and it really did move, rather than being pinned from the first step.
    expect(moved.some((distance) => distance > 0)).toBe(true);
  });

  it("stops a resize at the edges the host left free, like a drag", () => {
    // The same restriction, because it is the same question: a panel resized
    // under a nav bar is as unreachable as one dragged there. Each edge is
    // bounded on its own rather than the box being pushed back, because a
    // resize is anchored on the opposite edge and pushing would move the edge
    // the user is not touching.
    const el = mount(false);
    const grip = part(el, ".resize-handle--top");
    const from = centre(grip);
    grip.dispatchEvent(pointer("pointerdown", from.x, from.y));

    const tops: number[] = [];
    for (let i = 1; i <= 16; i += 1) {
      window.dispatchEvent(pointer("pointermove", from.x, from.y - i * 40));
      tops.push(Math.round(el.getBoundingClientRect().top));
    }
    const beforeRelease = el.getBoundingClientRect();
    window.dispatchEvent(pointer("pointerup", from.x, from.y - 640));

    // It reaches the reserved edge and stops there -- flush, the same place a
    // drag reaches. Stopping short of it was the cap and the bound disagreeing
    // about where the limit was, which left a band the panel could be dragged
    // into but not resized into.
    expect(Math.min(...tops)).toBeGreaterThanOrEqual(RESERVED_TOP_PX - 1);
    expect(tops.at(-1)).toBeCloseTo(RESERVED_TOP_PX, 0);
    expect(tops.at(-1)).toBe(tops.at(-2));
    // ...and releasing keeps the size the panel actually had, rather than the
    // one the pointer asked for. Within a pixel, because the insets are written
    // as whole pixels on purpose -- a long gesture that accumulated fractions
    // would drift.
    expect(Math.abs(el.getBoundingClientRect().height - beforeRelease.height)).toBeLessThanOrEqual(
      1,
    );
    expect(Math.abs(el.getBoundingClientRect().top - beforeRelease.top)).toBeLessThanOrEqual(1);
  });

  it("grows to the bottom edge without taking the panel down with it", () => {
    // Reported as the panel jumping down when resized to the very bottom. The
    // floating placement is anchored bottom-right, so dragging that edge is
    // dragging the pinned one -- the grip takes the position over, and an
    // unbounded box wrote a negative bottom inset, which moved the panel off
    // the screen rather than stopping it at the edge.
    const el = mount(false);
    const grip = part(el, ".resize-handle--bottom");
    const from = centre(grip);
    const before = el.getBoundingClientRect();
    grip.dispatchEvent(pointer("pointerdown", from.x, from.y));

    const tops: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      window.dispatchEvent(pointer("pointermove", from.x, from.y + i * 30));
      tops.push(el.getBoundingClientRect().top);
    }
    window.dispatchEvent(pointer("pointerup", from.x, from.y + 360));

    // The anchored edge does not move: growing downward is the panel getting
    // taller, not the panel travelling.
    for (const top of tops) {
      expect(Math.abs(top - before.top)).toBeLessThanOrEqual(1);
    }
    // ...and the bottom stops at the screen rather than going past it.
    expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 1);
    expect(el.getBoundingClientRect().height).toBeGreaterThan(before.height);
  });

  it("does not travel when a grip is pulled on a panel that cannot grow", () => {
    // The other half of the same disagreement, and the one that was reported.
    // Once the size is capped a grip cannot make the panel bigger, so the pull
    // has to land somewhere -- and on the anchored edge it landed on the
    // position, taking the whole panel down the screen. With the cap and the
    // bound naming the same limit there is no slack left for it to land in.
    const el = mount(false);
    const top = part(el, ".resize-handle--top");
    const from = centre(top);
    top.dispatchEvent(pointer("pointerdown", from.x, from.y));
    for (let i = 1; i <= 20; i += 1) {
      window.dispatchEvent(pointer("pointermove", from.x, from.y - i * 40));
    }
    window.dispatchEvent(pointer("pointerup", from.x, from.y - 800));

    // Now at its full height, with nothing left to give.
    const grown = el.getBoundingClientRect();
    expect(grown.top).toBeCloseTo(RESERVED_TOP_PX, 0);

    const bottom = part(el, ".resize-handle--bottom");
    const at = centre(bottom);
    bottom.dispatchEvent(pointer("pointerdown", at.x, at.y));
    for (let i = 1; i <= 12; i += 1) {
      window.dispatchEvent(pointer("pointermove", at.x, at.y + i * 30));
      expect(Math.abs(el.getBoundingClientRect().top - grown.top)).toBeLessThanOrEqual(1);
    }
    window.dispatchEvent(pointer("pointerup", at.x, at.y + 360));

    expect(el.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight + 1);
  });

  it("ignores a viewport change while a gesture owns the position", () => {
    // A phone resizes its visual viewport whenever the browser's own chrome
    // collapses, which the drag itself provokes. Re-placing the widget then
    // would apply the position stored *before* the drag, and the next pointer
    // move would put it back -- the two fighting for as long as the viewport
    // kept changing.
    const el = mount(true);
    const launcher = part(el, ".launcher");
    const from = centre(launcher);
    launcher.dispatchEvent(pointer("pointerdown", from.x, from.y));
    window.dispatchEvent(pointer("pointermove", from.x, from.y - 120));
    const dragged = centre(launcher).y;

    window.dispatchEvent(new Event("resize"));
    window.visualViewport?.dispatchEvent(new Event("resize"));

    expect(centre(launcher).y).toBe(dragged);
    window.dispatchEvent(pointer("pointerup", from.x, from.y - 120));
  });

  it("stops the drag when the browser takes the pointer away", () => {
    // Routine on touch rather than exceptional: a scroll or a system gesture
    // claims the pointer and pointerup never arrives. Without this the move
    // listeners stay attached and the launcher keeps following a finger that
    // has stopped.
    const el = mount(true);
    const launcher = part(el, ".launcher");
    const from = centre(launcher);
    launcher.dispatchEvent(pointer("pointerdown", from.x, from.y));
    window.dispatchEvent(pointer("pointermove", from.x, from.y - 80));
    const afterMove = centre(launcher).y;
    window.dispatchEvent(pointer("pointercancel", from.x, from.y - 80));

    window.dispatchEvent(pointer("pointermove", from.x, from.y - 300));
    expect(centre(launcher).y).toBe(afterMove);
  });
});
