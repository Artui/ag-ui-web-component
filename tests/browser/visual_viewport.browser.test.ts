import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Sizing a full-bleed panel to the part of the screen the user can see.
 *
 * The case is the on-screen keyboard, and it needs measuring because no CSS
 * length describes it. An on-screen keyboard has no effect on any
 * viewport-percentage unit -- `100vh`, `100dvh` and `100svh` are the same
 * number with it up as without -- so a panel sized from one of them puts its
 * own composer behind the keyboard being typed into. Only `visualViewport`
 * reports it.
 *
 * A real keyboard cannot be opened from a test, so these drive the same API the
 * browser drives: a stand-in `visualViewport` that is a real `EventTarget`, so
 * the element's own listeners are exercised rather than its handler being
 * called directly. That is the difference between testing the wiring and
 * testing the arithmetic.
 */

/** How much shorter the "keyboard" makes the visible area. */
const KEYBOARD_PX = 260;

/** A keyboard shallow enough to leave a band taller than the default panel. */
const SHALLOW_KEYBOARD_PX = 180;

/** How far the browser pans the page down to bring the focused field into view. */
const PAN_PX = 140;

/** A phone in portrait: below the 600px width where a floating panel becomes the screen. */
const PHONE = { width: 375, height: 812 } as const;

class FakeVisualViewport extends EventTarget {
  width: number;
  height: number;
  /**
   * How far the visual viewport has been panned down the layout one.
   *
   * Carried because the element reads it, and a double that leaves out a
   * property its subject uses does not stand in for the thing -- it stands in
   * for a browser that does not exist. Without it the measured gap came out
   * `NaN`, the element wrote `--ag-ui-visual-viewport-inset-bottom: NaNpx`,
   * every `calc()` reading it was invalid at computed-value time, and the
   * panel fell to its static position -- which happened to satisfy the
   * assertion below and hid the whole thing.
   *
   * The element carries no `?? 0` for this. Every browser with a
   * `visualViewport` has an `offsetTop` on it, so such a guard would defend
   * only against a double like the one this used to be -- and the honest fix
   * for that is here, in the double, rather than a permanently unreachable
   * branch in the thing being tested.
   */
  offsetTop = 0;
  offsetLeft = 0;

  constructor(width: number, height: number) {
    super();
    this.width = width;
    this.height = height;
  }

  resizeTo(height: number): void {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
  }

  /**
   * Shrink the visible area and pan it down the layout viewport together, which
   * is what iOS Safari does when a keyboard opens under a field it has to scroll
   * into view. It reports the two as separate events.
   */
  panTo(offsetTop: number, height: number): void {
    this.height = height;
    this.dispatchEvent(new Event("resize"));
    this.offsetTop = offsetTop;
    this.dispatchEvent(new Event("scroll"));
  }
}

let original: PropertyDescriptor | undefined;
let fake: FakeVisualViewport;

function installFakeViewport(): FakeVisualViewport {
  original = Object.getOwnPropertyDescriptor(window, "visualViewport");
  fake = new FakeVisualViewport(window.innerWidth, window.innerHeight);
  Object.defineProperty(window, "visualViewport", { configurable: true, get: () => fake });
  return fake;
}

function mount(placement: string | null): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  if (placement !== null) {
    el.setAttribute("placement", placement);
  }
  document.body.appendChild(el);
  return el;
}

describe("visual viewport tracking (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    if (original !== undefined) {
      Object.defineProperty(window, "visualViewport", original);
    }
  });

  it("shrinks a full-bleed panel to the visible area when the keyboard opens", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.getBoundingClientRect().height).toBeCloseTo(window.innerHeight, 0);

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // The composer is the reason: at the layout height it sits behind the
    // keyboard, which is the one control the user is trying to reach.
    expect(el.getBoundingClientRect().height).toBeCloseTo(window.innerHeight - KEYBOARD_PX, 0);
  });

  it("writes no override while the two viewports agree", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Nothing inline on a desktop that never diverges, so the declared
    // fallback stays in charge rather than being frozen to a measurement.
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).toBe("");

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).not.toBe("");

    // ...and it is given back, not left pinned at the keyboard's height.
    viewport.resizeTo(window.innerHeight);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-height")).toBe("");
  });

  it("lets a host's stated height outrank the measurement", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    el.style.setProperty("--ag-ui-viewport-height", "400px");
    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Both are inline, so this is decided by the token chain rather than by
    // the cascade: the host's value is read first and the measurement is only
    // its fallback.
    expect(el.getBoundingClientRect().height).toBeCloseTo(400, 0);
  });

  it("lifts a bottom-anchored panel clear of what is hiding it", async () => {
    // The half a shorter panel does not solve. A floating widget is positioned
    // against the layout viewport, so its bottom edge stays behind the
    // keyboard however tall it is; only the measured gap moves it.
    const viewport = installFakeViewport();
    const el = mount("floating");
    el.setAttribute("data-start-open", "");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Written as a measurement rather than a bound: the panel is lifted to sit
    // on the gutter above the keyboard, and `<=` alone was also true of the
    // panel having collapsed to the top of the screen.
    const lifted = el.getBoundingClientRect();
    expect(lifted.bottom).toBeLessThanOrEqual(window.innerHeight - KEYBOARD_PX);
    expect(lifted.bottom).toBeGreaterThan(window.innerHeight - KEYBOARD_PX - 64);
    // And the value it was lifted by is a number, not NaN wearing a unit.
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-bottom")).toBe(
      `${KEYBOARD_PX}px`,
    );
  });

  it("takes the launcher up with it, since that corner is the panel's", async () => {
    const viewport = installFakeViewport();
    const el = mount("floating");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const launcher = el.shadowRoot?.querySelector(".launcher") as HTMLElement;
    const box = launcher.getBoundingClientRect();
    // Measured from the centre: the launcher is scaled in several states and a
    // rect edge is adrift in every one of them, while a centred scale leaves
    // the centre where it is.
    expect(box.top + box.height / 2).toBeLessThanOrEqual(window.innerHeight - KEYBOARD_PX);
  });
});

/**
 * Which viewport a CSS `inset` is measured from, which is not the one the
 * widget is clamped into.
 *
 * The clamp is the visual viewport, because that is what the user can see and
 * reach. The denominator of the inset that expresses the result is the
 * *layout* viewport, because that is what the browser resolves a fixed
 * element's inset against. Reading one where the other belongs is the same
 * class of mistake as clamping against the whole screen instead of the box the
 * host left free -- one level up, and with the same symptom: the widget is
 * held somewhere the arithmetic agrees is correct and painted somewhere else.
 */
describe("the frame an inset is written in (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    if (original !== undefined) {
      Object.defineProperty(window, "visualViewport", original);
    } else {
      Reflect.deleteProperty(window, "visualViewport");
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("lets a host outrank the measured keyboard lift", async () => {
    const viewport = installFakeViewport();
    const el = mount("floating");
    el.setAttribute("data-start-open", "");
    // The opt-out. The element writes its measurement inline, so a host that
    // states the same token is simply overwritten by the next write -- which
    // is why the lift has the two-token shape the height already had.
    el.style.setProperty("--ag-ui-keyboard-inset", "0px");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    viewport.resizeTo(window.innerHeight - KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Measured and published as before -- the element does not stop measuring
    // because a host declined to use it.
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-bottom")).toBe(
      `${KEYBOARD_PX}px`,
    );
    // ...and ignored, so the panel keeps the plain gutter it would have had.
    expect(el.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight - 24, 0);
  });

  it("keeps a stated position inside the visible band, not the layout one", async () => {
    const viewport = installFakeViewport();
    const el = mount("floating");
    el.setAttribute("data-start-open", "");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // A shallower keyboard than the cases above, so the band it leaves is
    // taller than the panel. A panel that cannot fit inside the band with its
    // margins pins to the near edge and overflows the far one by design --
    // the same rule the clamp applies to an oversized panel -- and that would
    // account for the overflow instead of the frame under test.
    viewport.resizeTo(window.innerHeight - SHALLOW_KEYBOARD_PX);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // A stated position: this is the path that writes `--ag-ui-inset` inline,
    // where the measured lift the stylesheet applies is overridden and the
    // arithmetic is on its own.
    expect(el.moveTo("bottom-right")).toBe(true);
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const visible = window.innerHeight - SHALLOW_KEYBOARD_PX;
    // Expressed against the layout viewport, the clamp's answer lands where
    // the clamp put it. Expressed against the visual one it is short by the
    // keyboard's whole height, and the panel is painted behind it.
    const b = el.getBoundingClientRect();

    expect(b.bottom).toBeLessThanOrEqual(visible);
    // And it is held near that edge rather than having fallen to the top of
    // the screen, which a bare upper bound would also accept.
    expect(b.bottom).toBeGreaterThan(visible - 64);
  });
});

/**
 * A visible area the browser has panned down the layout viewport.
 *
 * Shrinking is half of what a keyboard does. To show a field the keyboard would
 * cover, iOS Safari also pans the visual viewport down (its `offsetTop` goes
 * above zero), while a fixed element stays placed against the top of the layout
 * viewport. A full-height panel sized to the visible area but anchored at the
 * layout top then shows only its lower part, from `offsetTop` down, with page
 * background under it. That is the header and greeting off the top of the
 * screen and an empty band above the keyboard.
 *
 * Only a top-anchored panel needs this. A bottom-anchored one already rises by
 * the band hidden below, which subtracts `offsetTop`.
 */
describe("a visible area the browser has panned (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    if (original !== undefined) {
      Object.defineProperty(window, "visualViewport", original);
    }
    await page.viewport(1280, 800);
  });

  const frame = (): Promise<unknown> =>
    new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

  const expectOnTheVisibleBand = (el: AgUiChat, visible: number): void => {
    const box = el.getBoundingClientRect();
    expect(box.top).toBeCloseTo(PAN_PX, 0);
    expect(box.bottom).toBeCloseTo(PAN_PX + visible, 0);
    // The composer is what the user is typing into, so it is the part that
    // has to be on screen.
    const composer = el.shadowRoot?.querySelector(".input-row") as HTMLElement;
    expect(composer.getBoundingClientRect().bottom).toBeLessThanOrEqual(PAN_PX + visible + 0.5);
  };

  // Every placement anchored at the top of the screen at desktop width.
  for (const placement of ["page", "full", "side", "sidebar"]) {
    it(`moves a ${placement} panel down with the pan`, async () => {
      const viewport = installFakeViewport();
      const el = mount(placement);
      await frame();

      const visible = window.innerHeight - KEYBOARD_PX;
      viewport.panTo(PAN_PX, visible);
      await frame();

      expectOnTheVisibleBand(el, visible);
    });
  }

  it("moves a sidebar docked left down with the pan", async () => {
    // Its own inset rule, so its own case.
    const viewport = installFakeViewport();
    const el = mount("sidebar");
    el.setAttribute("data-side", "left");
    await frame();

    const visible = window.innerHeight - KEYBOARD_PX;
    viewport.panTo(PAN_PX, visible);
    await frame();

    expectOnTheVisibleBand(el, visible);
  });

  // At phone width every placement but embedded becomes the whole screen,
  // anchored at the top. Its bottom inset was the keyboard lift, but a box
  // with top, height and bottom all set ignores bottom, so the lift never
  // moved it.
  for (const placement of ["floating", "bottom-left", "side", "sidebar", null]) {
    it(`moves a ${placement ?? "placement-less"} panel down with the pan on a phone`, async () => {
      await page.viewport(PHONE.width, PHONE.height);
      const viewport = installFakeViewport();
      const el = mount(placement);
      el.setAttribute("data-start-open", "");
      await frame();

      const visible = window.innerHeight - KEYBOARD_PX;
      viewport.panTo(PAN_PX, visible);
      await frame();

      expectOnTheVisibleBand(el, visible);
    });
  }

  // A host that reserves a bar at the top, as the README shows for a sticky
  // header. The bar is in the page, so a pan takes it off the screen with
  // everything else: the panel belongs below whichever is lower, the bar or the
  // top of the visible area, and must end where the visible area ends. Adding
  // the two put the panel a whole bar below the band, with its composer behind
  // the keyboard.
  const BAR_PX = 100;

  for (const [label, pan] of [
    ["deeper than the bar", PAN_PX],
    ["shallower than the bar", 60],
    ["absent", 0],
  ] as const) {
    it(`fits the band below a reserved bar when the pan is ${label}`, async () => {
      const viewport = installFakeViewport();
      const el = mount("page");
      el.style.setProperty("--ag-ui-viewport-inset-top", `${BAR_PX}px`);
      await frame();

      const visible = window.innerHeight - KEYBOARD_PX;
      viewport.panTo(pan, visible);
      await frame();

      const box = el.getBoundingClientRect();
      expect(box.top).toBeCloseTo(Math.max(BAR_PX, pan), 0);
      expect(box.bottom).toBeCloseTo(pan + visible, 0);
    });
  }

  it("fits the band below a reserved bar on a phone", async () => {
    await page.viewport(PHONE.width, PHONE.height);
    const viewport = installFakeViewport();
    const el = mount("floating");
    el.setAttribute("data-start-open", "");
    el.style.setProperty("--ag-ui-viewport-inset-top", `${BAR_PX}px`);
    await frame();

    const visible = window.innerHeight - KEYBOARD_PX;
    viewport.panTo(PAN_PX, visible);
    await frame();

    const box = el.getBoundingClientRect();
    expect(box.top).toBeCloseTo(PAN_PX, 0);
    expect(box.bottom).toBeCloseTo(PAN_PX + visible, 0);
  });

  it("publishes the band above as a number and gives it back", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    await frame();
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-top")).toBe("");

    viewport.panTo(PAN_PX, window.innerHeight - KEYBOARD_PX);
    await frame();
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-top")).toBe(`${PAN_PX}px`);

    // Keyboard closed: nothing left inline, as with the height and the lift.
    viewport.panTo(0, window.innerHeight);
    await frame();
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-top")).toBe("");
  });

  it("lets a host outrank the measured band above", async () => {
    const viewport = installFakeViewport();
    const el = mount("page");
    el.style.setProperty("--ag-ui-keyboard-inset-top", "0px");
    await frame();

    viewport.panTo(PAN_PX, window.innerHeight - KEYBOARD_PX);
    await frame();

    // Measured and published regardless, and ignored because the host said so.
    expect(el.style.getPropertyValue("--ag-ui-visual-viewport-inset-top")).toBe(`${PAN_PX}px`);
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });
});
