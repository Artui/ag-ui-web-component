import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { BAR_HEIGHT_EVENT, ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A host that writes the bar's height into the inset it reserves.
 *
 * The inset shortens the usable box, so a panel that fills the shorter box takes the
 * bar away, the height says 0, the host writes that, the box grows by what the bar
 * took, and the panel no longer fills it. Unheld, that brings the bar back and goes
 * round again every frame without end, with the header jumping each time. The band
 * this happens in is as wide as the bar, not a pixel: anything that covers the box
 * with the inset and not without it.
 *
 * Real frames and a real listener, because the order they run in is the subject.
 */

const DESKTOP = { width: 1280, height: 800 };
const BAR = 41;
const ID = "feedback";
const KEYS = [`ag-ui-chat:launcher:${ID}`, `ag-ui-chat:dock:${ID}`, `ag-ui-chat:size:${ID}`];
const FRAMES_TO_SETTLE = 10;
const FRAMES_WATCHED = 60;

const nextFrame = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const frames = async (count: number): Promise<void> => {
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame();
  }
};

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector<HTMLElement>(selector);
  if (found === null || found === undefined) {
    throw new Error(`no ${selector}`);
  }
  return found;
}

interface Host {
  readonly el: AgUiChat;
  /** How many times the bar's height has been announced. */
  readonly events: () => number;
}

/** Mount a docked panel, with or without a host answering its bar's height. */
function mount(feeds: boolean): Host {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("data-start-open", "");
  el.setAttribute("collapse-to", "bar");
  el.style.setProperty("--ag-ui-motion", "0s");
  let count = 0;
  el.addEventListener(BAR_HEIGHT_EVENT, (event) => {
    count += 1;
    if (feeds) {
      const { height } = (event as CustomEvent<{ height: number }>).detail;
      el.style.setProperty("--ag-ui-viewport-inset-bottom", `${height}px`);
    }
  });
  document.body.appendChild(el);
  return { el, events: () => count };
}

function size(el: AgUiChat, height: string): void {
  el.style.setProperty("--ag-ui-width", "100vw");
  el.style.setProperty("--ag-ui-max-width", "100vw");
  el.style.setProperty("--ag-ui-height", height);
  el.style.setProperty("--ag-ui-max-height", "none");
}

/** What a reader would see change, once per frame. */
function watch(host: Host): () => {
  readonly events: number;
  readonly stamps: readonly boolean[];
  readonly headers: readonly string[];
} {
  const before = host.events();
  const stamps = new Set<boolean>();
  const headers = new Set<string>();
  const sample = (): void => {
    const box = part(host.el, ".header").getBoundingClientRect();
    stamps.add(host.el.hasAttribute("data-fills-window"));
    headers.add(`${Math.round(box.left)},${Math.round(box.top)}`);
  };
  sample();
  return () => {
    sample();
    return { events: host.events() - before, stamps: [...stamps], headers: [...headers] };
  };
}

/** Watch a settled host for a second, sampling every frame. */
async function watchSecond(host: Host): Promise<ReturnType<ReturnType<typeof watch>>> {
  const read = watch(host);
  for (let frame = 0; frame < FRAMES_WATCHED; frame += 1) {
    await nextFrame();
    read();
  }
  return read();
}

describe("a host that writes the bar's height into its own inset", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
    for (const key of KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  describe.each([
    { width: 1280, height: 800 },
    { width: 1024, height: 700 },
    { width: 1600, height: 1000 },
  ])("on a window $width by $height", (window) => {
    // The two edges of the band and three points inside it, each as an offset from the
    // window's height, so the band is the same one on every window.
    it.each([
      [BAR + 1, "its low edge"],
      [BAR, "the box exactly"],
      [30, "inside the band"],
      [10, "inside the band"],
      [2, "its high edge"],
    ])("settles a panel %ipx short of the window, %s", async (short) => {
      await page.viewport(window.width, window.height);
      const host = mount(true);
      await frames(4);
      size(host.el, `calc(100vh - ${short}px)`);
      await frames(FRAMES_TO_SETTLE);

      const seen = await watchSecond(host);

      expect(seen.events).toBe(0);
      expect(seen.stamps).toEqual([true]);
      expect(seen.headers).toHaveLength(1);
      // It settles on the fill's side of the flip: the bar it would otherwise cover
      // is gone, and the header stands on the screen.
      expect(part(host.el, ".dock-bar").getBoundingClientRect().height).toBe(0);
      expect(host.el.barHeight).toBe(0);
      expect(host.el.getBoundingClientRect().top).toBeGreaterThanOrEqual(0);
      expect(host.el.getBoundingClientRect().left).toBeGreaterThanOrEqual(0);
      expect(host.el.style.getPropertyValue("--ag-ui-viewport-inset-bottom")).toBe("0px");
    });
  });

  it("stays out of it just past either end of the band", async () => {
    const below = mount(true);
    await frames(4);
    size(below.el, `calc(100vh - ${BAR + 2}px)`);
    await frames(FRAMES_TO_SETTLE);
    const short = await watchSecond(below);
    expect(short.events).toBe(0);
    expect(short.stamps).toEqual([false]);
    expect(below.el.barHeight).toBe(BAR);
    below.el.remove();

    const above = mount(true);
    await frames(4);
    size(above.el, "calc(100vh - 1px)");
    await frames(FRAMES_TO_SETTLE);
    const tall = await watchSecond(above);
    expect(tall.events).toBe(0);
    expect(tall.stamps).toEqual([true]);
    expect(above.el.barHeight).toBe(0);
  });

  it("says the same thing about the panel everywhere while it holds", async () => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    const report = host.el.describeSurface();

    expect(report.fullBleed).toBe(true);
    expect(report.movable).toBe(false);
    expect(host.el.moveTo("top-left")).toBe(false);
    expect(part(host.el, ".header").hasAttribute("data-fills-screen")).toBe(true);
    // The window really is taller than the panel; only the judgement holds.
    expect(report.viewport.height).toBe(DESKTOP.height);
    expect(report.box.height).toBe(DESKTOP.height - BAR);
  });

  it("gives the bar back when the host's size stops filling", async () => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    size(host.el, "400px");
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(host.el.barHeight).toBe(BAR);
    expect(part(host.el, ".dock-bar").getBoundingClientRect().height).toBe(BAR);
    expect(host.el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect((await watchSecond(host)).events).toBe(0);
  });

  it("settles again through a collapse and a reopen", async () => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    host.el.setCollapsed(true);
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.barHeight).toBe(BAR);
    expect((await watchSecond(host)).events).toBe(0);

    host.el.setCollapsed(false);
    await frames(FRAMES_TO_SETTLE);
    const seen = await watchSecond(host);

    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(seen.headers).toHaveLength(1);
    expect(host.el.barHeight).toBe(0);
  });

  it.each([
    ["taller", { width: 1280, height: 900 }],
    ["shorter", { width: 1280, height: 700 }],
    ["taller by the bar's own height", { width: 1280, height: 800 + BAR }],
  ])("settles again when the window gets %s", async (_name, window) => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    await page.viewport(window.width, window.height);
    await frames(FRAMES_TO_SETTLE);
    const seen = await watchSecond(host);

    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(seen.headers).toHaveLength(1);
  });

  it("settles a host that rounds the height up", async () => {
    const host = mount(false);
    host.el.addEventListener(BAR_HEIGHT_EVENT, (event) => {
      const { height } = (event as CustomEvent<{ height: number }>).detail;
      // What a fractional bar and Math.ceil come to.
      host.el.style.setProperty(
        "--ag-ui-viewport-inset-bottom",
        `${height === 0 ? 0 : height + 0.5}px`,
      );
    });
    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", `${BAR + 0.5}px`);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    const seen = await watchSecond(host);

    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(seen.headers).toHaveLength(1);
  });

  it("lets go when the panel changes to a surface with no bar", async () => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    host.el.setAttribute("collapse-to", "launcher");
    await frames(FRAMES_TO_SETTLE);
    const seen = await watchSecond(host);

    expect(host.el.barHeight).toBe(0);
    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([false]);
  });

  it("settles a panel the user moved first", async () => {
    const host = mount(true);
    await frames(4);
    const header = part(host.el, ".header");
    const box = header.getBoundingClientRect();
    const from = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
    header.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ...from }));
    window.dispatchEvent(
      new PointerEvent("pointermove", { clientX: from.clientX - 200, clientY: from.clientY - 50 }),
    );
    window.dispatchEvent(
      new PointerEvent("pointerup", { clientX: from.clientX - 200, clientY: from.clientY - 50 }),
    );
    await frames(4);
    expect(localStorage.getItem(`ag-ui-chat:dock:${ID}`)).not.toBeNull();

    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);
    const seen = await watchSecond(host);

    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(seen.headers).toHaveLength(1);
    // At the start of the box, not back at a spot it no longer has the room for.
    expect(host.el.getBoundingClientRect().left).toBe(0);
    expect(host.el.getBoundingClientRect().top).toBe(0);
  });

  it("takes a fill that comes straight back for one that never went", async () => {
    const host = mount(true);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);
    const read = watch(host);

    // The size stops filling, this frame's observers ask for the stamp to go next
    // frame, and this callback, queued ahead of them, puts the size back before it runs.
    size(host.el, "400px");
    await nextFrame();
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    const seen = read();
    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(host.el.barHeight).toBe(0);
  });
});

/**
 * The same sizes on hosts that do not answer the bar. The hold is for a box that grew by
 * what the bar took, on the same window: a fill that stops for any other reason stops.
 */
describe("the bar for a host that does not answer it", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
    for (const key of KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  afterAll(async () => {
    await page.viewport(DESKTOP.width, DESKTOP.height);
  });

  it("brings it back as soon as a size inside the band stops filling", async () => {
    const host = mount(false);
    await frames(4);
    size(host.el, "100vh");
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    size(host.el, "calc(100vh - 20px)");
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(host.el.barHeight).toBe(BAR);
  });

  it("brings it back when a fixed size stops filling a window taller by the bar's height", async () => {
    const host = mount(false);
    await frames(4);
    size(host.el, `${DESKTOP.height}px`);
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    await page.viewport(DESKTOP.width, DESKTOP.height + BAR);
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(host.el.barHeight).toBe(BAR);
  });

  it("brings it back when a host's own inset goes by some other amount", async () => {
    const host = mount(false);
    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", "100px");
    await frames(4);
    size(host.el, "calc(100vh - 100px)");
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", "0px");
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(host.el.barHeight).toBe(BAR);
  });

  it("keeps the stamp while a panel follows a host's inset growing", async () => {
    const host = mount(false);
    await frames(4);
    size(host.el, "calc(100vh - var(--ag-ui-viewport-inset-bottom, 0px))");
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    const before = host.events();

    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", "100px");
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.getBoundingClientRect().height).toBe(DESKTOP.height - 100);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);
    // Never out and back in: the bar would have flashed, and said so.
    expect(host.events() - before).toBe(0);
    // Still placed as the fill it is: judged against a box it no longer has, it would
    // lose the inset that stands it at the start, and hang off the top.
    expect(host.el.getBoundingClientRect().top).toBe(0);
    expect(part(host.el, ".header").hasAttribute("data-fills-screen")).toBe(true);
  });

  it("forgets the box the bar left once the fill has stopped", async () => {
    const host = mount(false);
    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", `${BAR}px`);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(true);

    size(host.el, "400px");
    await frames(FRAMES_TO_SETTLE);
    expect(host.el.hasAttribute("data-fills-window")).toBe(false);

    const before = host.events();

    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", "0px");
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(part(host.el, ".header").hasAttribute("data-fills-screen")).toBe(false);
    expect(host.el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(host.events() - before).toBe(0);
  });

  it("gives a size inside the band its bar from the start", async () => {
    const host = mount(false);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    expect(host.el.hasAttribute("data-fills-window")).toBe(false);
    expect(host.el.barHeight).toBe(BAR);
  });

  it("keeps the stamp where a host's fixed inset never moved", async () => {
    const host = mount(false);
    host.el.style.setProperty("--ag-ui-viewport-inset-bottom", `${BAR}px`);
    await frames(4);
    size(host.el, `calc(100vh - ${BAR}px)`);
    await frames(FRAMES_TO_SETTLE);

    const seen = await watchSecond(host);

    expect(seen.events).toBe(0);
    expect(seen.stamps).toEqual([true]);
    expect(host.el.barHeight).toBe(0);
  });
});
