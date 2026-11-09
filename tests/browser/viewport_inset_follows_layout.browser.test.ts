import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { BAR_HEIGHT_EVENT, ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A viewport inset token that follows the page's layout changes after the window
 * resize that caused it.
 *
 * A page publishing its bar's height from a ResizeObserver hears of the new height
 * later in the frame than the window's resize event, so a restore answering that
 * event still reads the bar at its old height, and holds the panel below a bar that
 * has since shrunk. Nothing else fires. These use a real observer on a real bar, as
 * the demo does, because the ordering is the subject.
 */

const WIDE = { width: 1280, height: 800 };
const NARROW = { width: 700, height: 800 };
const PHONE = { width: 500, height: 800 };
const SHORT_BAR = 56;
const TALL_BAR = 216;
const SPOT = { left: 376, top: 189 };
const ID = "inset-follows";
const KEYS = [`ag-ui-chat:launcher:${ID}`, `ag-ui-chat:dock:${ID}`, `ag-ui-chat:size:${ID}`];

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

const frames = async (): Promise<void> => {
  for (let frame = 0; frame < 4; frame += 1) {
    await settle();
  }
};

function chat(attrs: Record<string, string> = {}, parent: HTMLElement = document.body): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.style.setProperty("--ag-ui-motion", "0s");
  parent.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector<HTMLElement>(selector);
  if (found === null || found === undefined) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found;
}

async function drag(handle: HTMLElement, dx: number, dy: number): Promise<void> {
  const rect = handle.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  handle.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
  window.dispatchEvent(new PointerEvent("pointermove", { clientX: x + dx, clientY: y + dy }));
  window.dispatchEvent(new PointerEvent("pointerup", { clientX: x + dx, clientY: y + dy }));
  await frames();
}

async function placed(
  attrs: Record<string, string> = {},
  parent: HTMLElement = document.body,
): Promise<AgUiChat> {
  const el = chat(attrs, parent);
  await frames();
  const box = el.getBoundingClientRect();
  await drag(part(el, ".header"), SPOT.left - box.left, SPOT.top - box.top);
  expectAt(el, SPOT);
  return el;
}

function expectAt(el: AgUiChat, box: { left: number; top: number }): void {
  expect(el.getBoundingClientRect().left).toBeCloseTo(box.left, 0);
  expect(el.getBoundingClientRect().top).toBeCloseTo(box.top, 0);
}

/** The page's bar, `depth` elements below the body, tall below 800px wide. */
function barAtDepth(depth: number): void {
  let parent: HTMLElement = document.body;
  for (let level = 0; level < depth; level += 1) {
    parent = parent.appendChild(document.createElement("div"));
  }
  const bar = parent.appendChild(document.createElement("div"));
  bar.className = "inset-bar";
  const publish = (): void => {
    document.documentElement.style.setProperty(
      "--bar-h",
      `${Math.ceil(bar.getBoundingClientRect().height)}px`,
    );
  };
  publish();
  observer = new ResizeObserver(publish);
  observer.observe(bar);
}

let observer: ResizeObserver | null = null;

/**
 * What the browser reported as a ResizeObserver loop. A page's publishing observer
 * below the element's depth makes any observation of ours that its write changes
 * into one, and a report on the window is what a host's error tracking counts.
 */
let loopReports = 0;
const countLoopReport = (event: ErrorEvent): void => {
  if (event.message.includes("ResizeObserver")) {
    loopReports += 1;
  }
};
const sheet = document.createElement("style");
sheet.textContent = `
  .inset-bar { height: ${SHORT_BAR}px; }
  @media (max-width: 800px) { .inset-bar { height: ${TALL_BAR}px; } }
  ${ELEMENT_TAG} { --ag-ui-viewport-inset-top: var(--bar-h, 0px); }
`;

beforeAll(() => {
  defineAgUiChat();
  document.head.appendChild(sheet);
  window.addEventListener("error", countLoopReport);
});

beforeEach(() => {
  loopReports = 0;
});

afterEach(async () => {
  expect(loopReports).toBe(0);
  observer?.disconnect();
  observer = null;
  document.body.innerHTML = "";
  document.documentElement.style.removeProperty("--bar-h");
  for (const key of KEYS) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  await page.viewport(WIDE.width, WIDE.height);
});

afterAll(() => {
  window.removeEventListener("error", countLoopReport);
  sheet.remove();
});

describe("a viewport inset token that changes after the window resize (real browser)", () => {
  it.each([
    ["beside the element", 0],
    ["deep in the page", 6],
  ])("settles at the stated spot on widening, with the bar %s", async (_where, depth) => {
    barAtDepth(depth);
    await frames();
    const el = await placed();
    const stored = JSON.parse(localStorage.getItem(KEYS[0] as string) as string);

    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);

    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
    expect(JSON.parse(localStorage.getItem(KEYS[0] as string) as string)).toEqual(stored);
  });

  it("settles at the stated spot on widening from a phone", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed();
    await page.viewport(PHONE.width, PHONE.height);
    await frames();
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
  });

  it("holds the panel below a bar that grows after the window narrows", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed();
    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
  });

  it("follows a token a page writes well after the resize", async () => {
    // Not an observer at all: a framework's effect, or a font arriving. There is no
    // frame after the resize that could be waited for.
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    const el = await placed();
    document.documentElement.style.setProperty("--bar-h", `${TALL_BAR}px`);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    await frames();
    expectAt(el, SPOT);
  });

  it("settles a docked panel dragged off its bar at its spot on widening", async () => {
    barAtDepth(0);
    await frames();
    const el = await placed({ "collapse-to": "bar" });
    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(TALL_BAR + 8, 0);
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    expectAt(el, SPOT);
  });

  it("settles a launcher at its stored place on widening", async () => {
    barAtDepth(0);
    await frames();
    const el = chat();
    await frames();
    el.setCollapsed(true);
    await frames();
    const launcher = part(el, ".launcher");
    const rect = launcher.getBoundingClientRect();
    await drag(launcher, 500 - rect.left, 100 - rect.top);
    const stored = JSON.parse(localStorage.getItem(KEYS[0] as string) as string);
    const size = launcher.offsetWidth;

    await page.viewport(NARROW.width, NARROW.height);
    await frames();
    await page.viewport(WIDE.width, WIDE.height);
    await frames();
    const after = launcher.getBoundingClientRect();
    expect(after.top + after.height / 2).toBeCloseTo(stored.top + size / 2, 0);
    expect(after.left + after.width / 2).toBeCloseTo(stored.left + size / 2, 0);
  });

  it.each([
    ["--ag-ui-viewport-inset-top", "top", 300],
    ["--ag-ui-viewport-inset-left", "left", 600],
    ["--ag-ui-viewport-inset-right", "right", 760],
    ["--ag-ui-viewport-inset-bottom", "bottom", 400],
  ] as const)("hears %s change, with no resize", async (token, edge, inset) => {
    const el = await placed();
    el.style.setProperty(token, `${inset}px`);
    await frames();
    const box = el.getBoundingClientRect();
    const room = {
      top: inset,
      left: inset,
      right: WIDE.width - inset,
      bottom: WIDE.height - inset,
    };
    if (edge === "top" || edge === "left") {
      expect(box[edge]).toBeGreaterThanOrEqual(room[edge] - 1);
    } else {
      expect(box[edge]).toBeLessThanOrEqual(room[edge] + 1);
    }
  });

  describe("the probe that hears them", () => {
    const TOKENS = {
      "--ag-ui-viewport-inset-top": "64px",
      "--ag-ui-viewport-inset-left": "240px",
    };

    function embeddedIn(card: { width: number; height: number }): HTMLElement {
      const holder = document.createElement("div");
      holder.style.cssText = `position:relative;overflow:auto;width:${card.width}px;height:${card.height}px`;
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.id = ID;
      el.setAttribute("placement", "embedded");
      el.setAttribute("data-start-open", "");
      for (const [token, value] of Object.entries(TOKENS)) {
        el.style.setProperty(token, value);
      }
      holder.appendChild(el);
      document.body.appendChild(holder);
      return holder;
    }

    it.each([
      [320, 400],
      [400, 400],
      [700, 100],
      [200, 400],
      [700, 40],
      [200, 40],
    ])("adds no scroll to a %ipx by %ipx card holding an embedded chat", async (width, height) => {
      const holder = embeddedIn({ width, height });
      await frames();
      expect(holder.scrollWidth).toBe(holder.clientWidth);
      expect(holder.scrollHeight).toBe(holder.clientHeight);
    });

    it("adds no scroll to the page, with tokens on both axes", async () => {
      const el = chat({ placement: "embedded" });
      el.style.setProperty("--ag-ui-viewport-inset-top", "450px");
      el.style.setProperty("--ag-ui-viewport-inset-left", "700px");
      el.style.setProperty("--ag-ui-height", "100px");
      await frames();
      expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
      expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight);
    });

    it("adds no scroll to the page, with tokens wider than the window", async () => {
      const el = chat({ placement: "embedded" });
      el.style.setProperty("--ag-ui-viewport-inset-top", `${WIDE.height + 100}px`);
      el.style.setProperty("--ag-ui-viewport-inset-left", `${WIDE.width + 100}px`);
      el.style.setProperty("--ag-ui-height", "100px");
      await frames();
      expect(document.documentElement.scrollWidth).toBe(document.documentElement.clientWidth);
      expect(document.documentElement.scrollHeight).toBe(document.documentElement.clientHeight);
    });

    it("adds no scroll with opposite tokens that together outrun the card twice", async () => {
      const holder = embeddedIn({ width: 200, height: 100 });
      const el = holder.firstElementChild as AgUiChat;
      el.style.setProperty("--ag-ui-viewport-inset-right", "240px");
      el.style.setProperty("--ag-ui-viewport-inset-bottom", "200px");
      el.style.setProperty("--ag-ui-viewport-inset-top", "100px");
      await frames();
      expect(holder.scrollWidth).toBe(holder.clientWidth);
      expect(holder.scrollHeight).toBe(holder.clientHeight);
    });

    it("adds no scroll to a card that reads right to left", async () => {
      const holder = embeddedIn({ width: 200, height: 100 });
      holder.dir = "rtl";
      await frames();
      expect(holder.scrollWidth).toBe(holder.clientWidth);
      expect(holder.scrollHeight).toBe(holder.clientHeight);
    });

    it("reads all four tokens back in px from a card narrower than one of them", async () => {
      const holder = embeddedIn({ width: 200, height: 100 });
      const el = holder.firstElementChild as AgUiChat;
      el.style.setProperty("--ag-ui-viewport-inset-top", "calc(4rem + 2px)");
      el.style.setProperty("--ag-ui-viewport-inset-right", "16rem");
      el.style.setProperty("--ag-ui-viewport-inset-bottom", "calc(10px + 20px)");
      await frames();
      const style = getComputedStyle(part(el, ".viewport-probe"));
      expect(style.paddingTop).toBe("66px");
      expect(style.paddingRight).toBe("256px");
      expect(style.paddingBottom).toBe("30px");
      expect(style.paddingLeft).toBe("240px");
    });

    it("resolves a percentage token against the same box as ever", async () => {
      // Padding resolves a percentage against its containing block, so a fix that took
      // the probe out of the host's box would change what such a token reserves.
      const el = chat();
      el.style.setProperty("--ag-ui-viewport-inset-left", "10%");
      await frames();
      const probe = part(el, ".viewport-probe");
      expect(Number.parseFloat(getComputedStyle(probe).paddingLeft)).toBeCloseTo(
        el.getBoundingClientRect().width * 0.1,
        1,
      );
    });

    it("still resolves a token in a card with a transform of its own", async () => {
      const holder = embeddedIn({ width: 200, height: 100 });
      holder.style.transform = "translateX(10px)";
      await frames();
      expect(holder.scrollWidth).toBe(holder.clientWidth);
      const el = holder.firstElementChild as AgUiChat;
      expect(getComputedStyle(part(el, ".viewport-probe")).paddingLeft).toBe("240px");
    });
  });

  describe("a panel whose host has no box", () => {
    const INSET = "--ag-ui-inset";

    /** The inset a style attribute holds, by way of an element nothing else sees. */
    function insetIn(attribute: string | null): string {
      const scratch = document.createElement("div");
      scratch.setAttribute("style", attribute ?? "");
      return scratch.style.getPropertyValue(INSET);
    }

    /**
     * Every inset the element has held from now on. From the old values of each write
     * as well as the last, so a wrong one corrected within the same task is still seen.
     */
    function watchInset(el: AgUiChat): () => string[] {
      const watcher = new MutationObserver(() => undefined);
      watcher.observe(el, {
        attributes: true,
        attributeFilter: ["style"],
        attributeOldValue: true,
      });
      return () => {
        const records = watcher.takeRecords();
        watcher.disconnect();
        return [
          ...records.map((record) => insetIn(record.oldValue)),
          el.style.getPropertyValue(INSET),
        ];
      };
    }

    it.each([
      ["a floating panel", {}],
      ["a panel docked to its bar", { "collapse-to": "bar" }],
    ])("gives %s back at its spot, hidden on the host", async (_what, attrs) => {
      const el = await placed(attrs);
      const inset = el.style.getPropertyValue(INSET);
      const stored = localStorage.getItem(KEYS[0] as string);
      const dock = localStorage.getItem(KEYS[1] as string);
      const held = watchInset(el);

      el.style.display = "none";
      await frames();
      expect(el.style.getPropertyValue(INSET)).toBe(inset);

      el.style.display = "";
      // Synchronous: nothing has had a frame to correct it.
      expectAt(el, SPOT);
      expect(new Set(held())).toEqual(new Set([inset]));
      await frames();
      expectAt(el, SPOT);
      expect(localStorage.getItem(KEYS[0] as string)).toBe(stored);
      expect(localStorage.getItem(KEYS[1] as string)).toBe(dock);
    });

    it("gives a panel back at its spot, hidden by an ancestor", async () => {
      const holder = document.createElement("div");
      document.body.appendChild(holder);
      const el = await placed({}, holder);
      const inset = el.style.getPropertyValue(INSET);
      const held = watchInset(el);

      holder.hidden = true;
      await frames();
      holder.hidden = false;
      expectAt(el, SPOT);
      expect(new Set(held())).toEqual(new Set([inset]));
    });

    it("writes no inset when the window resizes while it is hidden", async () => {
      const el = await placed();
      const inset = el.style.getPropertyValue(INSET);
      el.style.display = "none";
      await frames();
      const held = watchInset(el);
      await page.viewport(NARROW.width, NARROW.height);
      await frames();
      expect(new Set(held())).toEqual(new Set([inset]));
    });

    it("places the panel against a window that changed while it was hidden", async () => {
      const el = await placed();
      el.style.display = "none";
      await frames();
      await page.viewport(NARROW.width, NARROW.height);
      await frames();
      el.style.display = "";
      await frames();
      const box = el.getBoundingClientRect();
      expect(box.right).toBeLessThanOrEqual(NARROW.width);
      expect(box.left).toBeGreaterThanOrEqual(0);
      await page.viewport(WIDE.width, WIDE.height);
      await frames();
      expectAt(el, SPOT);
    });

    it("writes no inset from nothing when it connects hidden", async () => {
      const first = await placed();
      const spot = first.style.getPropertyValue(INSET);
      first.remove();
      await frames();

      const holder = document.createElement("div");
      holder.hidden = true;
      document.body.appendChild(holder);
      const el = chat({}, holder);
      const held = watchInset(el);
      await frames();
      for (const written of held()) {
        expect(["", spot]).toContain(written);
      }

      holder.hidden = false;
      await frames();
      expectAt(el, SPOT);
    });

    it("writes no inset from nothing when it expands hidden", async () => {
      const el = await placed();
      const spot = el.style.getPropertyValue(INSET);
      el.setCollapsed(true);
      await frames();
      el.style.display = "none";
      await frames();
      const held = watchInset(el);

      el.setCollapsed(false);
      await frames();
      for (const written of held()) {
        expect(["", spot]).toContain(written);
      }

      el.style.display = "";
      await frames();
      expectAt(el, SPOT);
    });

    it("keeps placing a launcher on a host a page has sized to nothing", async () => {
      // It has a box, of no size. That is not the same as having none: the launcher
      // hangs off it and is the only way back to the conversation.
      const el = chat();
      await frames();
      el.setCollapsed(true);
      await frames();
      const launcher = part(el, ".launcher");
      const rect = launcher.getBoundingClientRect();
      await drag(launcher, 600 - rect.left, 100 - rect.top);
      el.style.width = "0";
      el.style.height = "0";
      await frames();
      expect(el.getBoundingClientRect().width).toBe(0);

      // Past the window that follows, so only placing it again brings it back.
      await page.viewport(PHONE.width, PHONE.height);
      await frames();
      expect(launcher.getBoundingClientRect().right).toBeLessThanOrEqual(PHONE.width);
    });

    it("still tells the host its bar is gone, and back", async () => {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      el.setCollapsed(true);
      await frames();
      const heights: number[] = [];
      el.addEventListener(BAR_HEIGHT_EVENT, (event) => {
        heights.push((event as CustomEvent<{ height: number }>).detail.height);
      });
      const drawn = part(el, ".dock-bar").offsetHeight;
      expect(drawn).toBeGreaterThan(0);

      el.style.display = "none";
      await frames();
      expect(heights).toEqual([0]);
      el.style.display = "";
      await frames();
      expect(heights).toEqual([0, drawn]);
    });
  });

  it("stands a panel a host fills at the start of the room the token leaves", async () => {
    document.documentElement.style.setProperty("--bar-h", `${SHORT_BAR}px`);
    const el = chat();
    for (const [token, value] of [
      ["--ag-ui-width", "100vw"],
      ["--ag-ui-height", `calc(100vh - var(--bar-h))`],
      ["--ag-ui-max-width", "100vw"],
      ["--ag-ui-max-height", "100vh"],
    ] as const) {
      el.style.setProperty(token, value);
    }
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(SHORT_BAR, 0);
    document.documentElement.style.setProperty("--bar-h", "0px");
    await frames();
    expect(el.getBoundingClientRect().top).toBeCloseTo(0, 0);
  });
});

/**
 * What is still wired to the page, counted from the calls rather than from the
 * element's own bookkeeping: an observer is live from its observe until its
 * disconnect, and a listener from its add until its remove or its signal aborting.
 */
function trackLive(): {
  observed: () => Element[];
  listeners: () => { target: EventTarget; type: string }[];
  stop: () => void;
} {
  const NativeObserver = window.ResizeObserver;
  const observers: { targets: Set<Element> }[] = [];
  class Tracked extends NativeObserver {
    readonly targets = new Set<Element>();
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      observers.push(this);
    }
    override observe(target: Element, options?: ResizeObserverOptions): void {
      this.targets.add(target);
      super.observe(target, options);
    }
    override unobserve(target: Element): void {
      this.targets.delete(target);
      super.unobserve(target);
    }
    override disconnect(): void {
      this.targets.clear();
      super.disconnect();
    }
  }
  window.ResizeObserver = Tracked;

  const added: {
    target: EventTarget;
    type: string;
    listener: unknown;
    capture: boolean;
    signal: AbortSignal | undefined;
  }[] = [];
  const captured = (options: unknown): boolean =>
    options === true ||
    (typeof options === "object" && options !== null && "capture" in options && !!options.capture);
  // The window carries its own copies of these two, as every global object does,
  // so patching the shared prototype alone would miss the listeners that matter.
  const hosts: {
    addEventListener: EventTarget["addEventListener"];
    removeEventListener: EventTarget["removeEventListener"];
  }[] = [EventTarget.prototype, window];
  const natives = hosts.map((host) => ({
    host,
    add: host.addEventListener,
    remove: host.removeEventListener,
  }));
  for (const { host, add, remove } of natives) {
    host.addEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | AddEventListenerOptions,
    ): void {
      added.push({
        target: this,
        type,
        listener,
        capture: captured(options),
        signal: typeof options === "object" ? options.signal : undefined,
      });
      add.call(this, type, listener, options);
    };
    host.removeEventListener = function (
      this: EventTarget,
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: boolean | EventListenerOptions,
    ): void {
      const at = added.findIndex(
        (entry) =>
          entry.target === this &&
          entry.type === type &&
          entry.listener === listener &&
          entry.capture === captured(options),
      );
      if (at !== -1) {
        added.splice(at, 1);
      }
      remove.call(this, type, listener, options);
    };
  }

  return {
    observed: () => observers.flatMap((observer) => [...observer.targets]),
    listeners: () =>
      added
        .filter((entry) => entry.signal?.aborted !== true)
        .map((entry) => ({ target: entry.target, type: entry.type })),
    stop: () => {
      window.ResizeObserver = NativeObserver;
      for (const { host, add, remove } of natives) {
        host.addEventListener = add;
        host.removeEventListener = remove;
      }
    },
  };
}

describe("what a detached element leaves wired to the page (real browser)", () => {
  it("leaves no observer and no listener live after four reconnects", async () => {
    const live = trackLive();
    try {
      const el = chat({ "collapse-to": "bar" });
      await frames();
      // The count means something only if it sees what a connected element wires up.
      expect(live.observed()).toContain(part(el, ".messages"));
      expect(live.observed()).toContain(part(el, ".dock-bar"));
      expect(
        live
          .listeners()
          .filter((entry) => entry.target === window)
          .map((e) => e.type),
      ).toContain("resize");
      for (let round = 0; round < 4; round += 1) {
        el.remove();
        document.body.appendChild(el);
        await frames();
      }
      el.remove();
      await frames();

      const inside = (target: unknown): boolean => {
        const root = el.shadowRoot;
        return root !== null && target instanceof Node && (root.contains(target) || target === el);
      };
      expect(
        live
          .observed()
          .filter(inside)
          .map((t) => t.className),
      ).toEqual([]);
      const wired = live
        .listeners()
        .filter((entry) => entry.target === window || entry.target === window.visualViewport)
        .map((entry) => `${entry.target === window ? "window" : "visualViewport"}:${entry.type}`);
      expect(wired).toEqual([]);
    } finally {
      live.stop();
    }
  });
});
