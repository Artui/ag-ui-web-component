/**
 * Following the foot of the transcript, and stopping when the reader does not
 * want to be followed.
 *
 * Eleven separate sites assigned `scrollTop = scrollHeight` unconditionally and
 * nothing anywhere listened for a `scroll` event, so nothing knew the reader had
 * scrolled up: scrolling back through a running answer was undone by the next
 * token. These cases are the arithmetic and the state machine; whether the
 * button is actually visible is asserted against a real cascade in
 * `tests/browser/stick_to_bottom.browser.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createStickToBottom, type StickToBottom } from "../src/ui/stick_to_bottom.js";

/**
 * A scrolling element with settable metrics.
 *
 * happy-dom lays nothing out, so `scrollHeight` and `clientHeight` are both 0
 * and every position is trivially "the bottom". Defining them is what lets the
 * distance-from-bottom arithmetic be exercised at all.
 */
function makeViewport(scrollHeight = 1000, clientHeight = 400): HTMLElement {
  const el = document.createElement("div");
  Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
  Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
  let top = 0;
  Object.defineProperty(el, "scrollTop", {
    get: () => top,
    set: (value: number) => {
      top = value;
    },
    configurable: true,
  });
  document.body.append(el);
  return el;
}

function scrollTo(viewport: HTMLElement, top: number): void {
  viewport.scrollTop = top;
  viewport.dispatchEvent(new Event("scroll"));
}

describe("following new content", () => {
  let viewport: HTMLElement;
  let missed: boolean[];
  let scroller: StickToBottom;

  beforeEach(() => {
    document.body.innerHTML = "";
    viewport = makeViewport();
    missed = [];
    scroller = createStickToBottom({
      viewport,
      onMissedContent: (value) => missed.push(value),
    });
  });

  it("starts at the bottom and follows", () => {
    scroller.follow();

    expect(scroller.following()).toBe(true);
    expect(viewport.scrollTop).toBe(1000);
  });

  it("stops following once the reader scrolls away", () => {
    scrollTo(viewport, 100);

    expect(scroller.following()).toBe(false);
  });

  it("leaves the scroll position alone while the reader is away", () => {
    // The defect, stated as an assertion: content arriving used to yank the
    // view back regardless.
    scrollTo(viewport, 100);

    scroller.follow();

    expect(viewport.scrollTop).toBe(100);
  });

  it("resumes following when the reader returns to the bottom", () => {
    scrollTo(viewport, 100);
    scrollTo(viewport, 600);

    expect(scroller.following()).toBe(true);
    scroller.follow();
    expect(viewport.scrollTop).toBe(1000);
  });

  it("treats a few sub-pixel pixels short of the foot as the foot", () => {
    // scrollHeight - scrollTop - clientHeight lands on fractional values under
    // a zoom level, so an exact comparison would report "scrolled away" for a
    // transcript that is visibly pinned.
    scrollTo(viewport, 597);

    expect(scroller.following()).toBe(true);
  });

  it("does not treat a real scroll away as slack", () => {
    scrollTo(viewport, 590);

    expect(scroller.following()).toBe(false);
  });
});

describe("the missed-content signal", () => {
  let viewport: HTMLElement;
  let missed: boolean[];
  let scroller: StickToBottom;

  beforeEach(() => {
    document.body.innerHTML = "";
    viewport = makeViewport();
    missed = [];
    scroller = createStickToBottom({
      viewport,
      onMissedContent: (value) => missed.push(value),
    });
  });

  it("stays quiet while the reader is following", () => {
    scroller.follow();
    scroller.follow();

    expect(missed).toEqual([]);
  });

  it("stays quiet when the reader scrolls up through a settled transcript", () => {
    // Scrolling up to re-read something is not a reason to nag. Only missing
    // something is.
    scrollTo(viewport, 100);

    expect(missed).toEqual([]);
  });

  it("fires once when content arrives while the reader is away", () => {
    scrollTo(viewport, 100);

    scroller.follow();
    scroller.follow();
    scroller.follow();

    expect(missed).toEqual([true]);
  });

  it("clears when the reader scrolls back to the bottom", () => {
    scrollTo(viewport, 100);
    scroller.follow();

    scrollTo(viewport, 1000);

    expect(missed).toEqual([true, false]);
  });

  it("clears when the reader takes the jump button instead", () => {
    scrollTo(viewport, 100);
    scroller.follow();

    scroller.jump();

    expect(missed).toEqual([true, false]);
    expect(scroller.following()).toBe(true);
    expect(viewport.scrollTop).toBe(1000);
  });
});

describe("teardown and resize", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("re-pins when the viewport itself changes size", () => {
    // Nothing scrolled and no content arrived, but the foot moved: a panel
    // resize, or a phone keyboard opening.
    const observed: Array<() => void> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    try {
      const viewport = makeViewport();
      createStickToBottom({ viewport, onMissedContent: () => {} });
      viewport.scrollTop = 0;

      observed[0]?.();

      expect(viewport.scrollTop).toBe(1000);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("does not re-pin on resize while the reader is away", () => {
    const observed: Array<() => void> = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          observed.push(callback);
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    try {
      const viewport = makeViewport();
      const scroller = createStickToBottom({ viewport, onMissedContent: () => {} });
      scrollTo(viewport, 100);

      observed[0]?.();

      expect(viewport.scrollTop).toBe(100);
      expect(scroller.following()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("stops listening once disposed", () => {
    const viewport = makeViewport();
    const scroller = createStickToBottom({ viewport, onMissedContent: () => {} });

    scroller.dispose();
    scrollTo(viewport, 100);

    // Still following, because the scroll was never observed.
    expect(scroller.following()).toBe(true);
  });
});
