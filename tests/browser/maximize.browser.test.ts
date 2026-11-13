import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const DESKTOP = { width: 1280, height: 800 };
const ID = "maximize";
const SIZE_KEY = `ag-ui-chat:size:${ID}`;
const LAUNCHER_KEY = `ag-ui-chat:launcher:${ID}`;
const MAXIMIZED = "--ag-ui-maximized-width: 900px; --ag-ui-maximized-height: 700px;";

function mount(attrs: Record<string, string> = {}, style = ""): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = ID;
  el.setAttribute("data-start-open", "");
  el.setAttribute("endpoint", "/agent");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.style.cssText = style;
  document.body.appendChild(el);
  return el;
}

const settle = (ms = 450): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function inShadow<T extends Element>(el: AgUiChat, selector: string): T | null {
  return el.shadowRoot?.querySelector<T>(selector) ?? null;
}

/** The panel's used width; its offsetWidth adds the frame's border. */
function panelWidth(el: AgUiChat): number {
  const panel = inShadow<HTMLElement>(el, '[part="panel"]');
  if (panel === null) {
    throw new Error("expected the panel part");
  }
  return Number.parseFloat(getComputedStyle(panel).width);
}

function panelHeight(el: AgUiChat): number {
  return inShadow<HTMLElement>(el, '[part="panel"]')?.offsetHeight ?? 0;
}

/** Size from offset, place from the rect's centre: the host is scaled in some states. */
function boxOf(el: AgUiChat): { width: number; height: number; x: number; y: number } {
  const rect = el.getBoundingClientRect();
  return {
    width: el.offsetWidth,
    height: el.offsetHeight,
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

async function pull(from: HTMLElement, dx: number, dy: number): Promise<void> {
  const rect = from.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const down = { pointerId: 1, bubbles: true, composed: true, button: 0 };
  from.dispatchEvent(new PointerEvent("pointerdown", { ...down, clientX: x, clientY: y }));
  window.dispatchEvent(
    new PointerEvent("pointermove", { ...down, clientX: x + dx, clientY: y + dy }),
  );
  window.dispatchEvent(
    new PointerEvent("pointerup", { ...down, clientX: x + dx, clientY: y + dy }),
  );
  await settle();
}

function control(el: AgUiChat): HTMLButtonElement | null {
  return inShadow<HTMLButtonElement>(el, ".header-btn--maximize");
}

beforeAll(async () => {
  defineAgUiChat();
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterEach(async () => {
  document.body.innerHTML = "";
  for (const key of [SIZE_KEY, LAUNCHER_KEY]) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  }
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

afterAll(async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height);
});

describe("maximize over a dragged corner panel (real browser)", () => {
  it("takes the maximized tokens over a drag, and restore and reopen give the drag back", async () => {
    const el = mount({}, MAXIMIZED);
    await settle();
    const grip = inShadow<HTMLElement>(el, ".resize-handle--top-left");
    if (grip === null) {
      throw new Error("expected the top-left grip");
    }
    await pull(grip, -80, -60);
    const header = inShadow<HTMLElement>(el, ".header");
    if (header === null) {
      throw new Error("expected the header");
    }
    await pull(header, -120, -40);
    const dragged = boxOf(el);
    expect(dragged.width).toBeGreaterThan(400);
    const stored = localStorage.getItem(SIZE_KEY) ?? sessionStorage.getItem(SIZE_KEY);
    expect(stored).not.toBeNull();

    el.setAttribute("maximized", "");
    await settle();
    expect(el.offsetWidth).toBeCloseTo(900, 0);
    expect(el.offsetHeight).toBeCloseTo(700, 0);
    const rect = el.getBoundingClientRect();
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(window.innerWidth);
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight);
    expect(getComputedStyle(grip).display).toBe("none");
    expect(localStorage.getItem(SIZE_KEY) ?? sessionStorage.getItem(SIZE_KEY)).toBe(stored);

    el.removeAttribute("maximized");
    await settle();
    expect(boxOf(el)).toEqual(dragged);

    el.setAttribute("maximized", "");
    await settle();
    expect(el.offsetWidth).toBeCloseTo(900, 0);
    el.setCollapsed(true);
    await settle();
    expect(el.hasAttribute("maximized")).toBe(false);
    el.setCollapsed(false);
    await settle();
    expect(boxOf(el)).toEqual(dragged);
  });

  it("refuses a resize while maximized", async () => {
    const el = mount({}, MAXIMIZED);
    await settle();
    el.setAttribute("maximized", "");
    await settle();
    const grip = inShadow<HTMLElement>(el, ".resize-handle--top-left");
    if (grip === null) {
      throw new Error("expected the top-left grip");
    }
    await pull(grip, -40, -40);
    expect(el.offsetWidth).toBeCloseTo(900, 0);
    expect(el.style.getPropertyValue("--_drag-width")).toBe("");
  });

  it("grows a docked panel on both axes and a sidebar in width only", async () => {
    const docked = mount({ "collapse-to": "bar" }, MAXIMIZED);
    await settle();
    docked.setAttribute("maximized", "");
    await settle();
    expect(docked.offsetWidth).toBeCloseTo(900, 0);
    expect(docked.offsetHeight).toBeCloseTo(700, 0);
    docked.remove();

    const sidebar = mount({ placement: "sidebar" }, MAXIMIZED);
    await settle();
    const height = panelHeight(sidebar);
    sidebar.setAttribute("maximized", "");
    await settle();
    expect(panelWidth(sidebar)).toBeCloseTo(900, 0);
    expect(panelHeight(sidebar)).toBe(height);
  });
});

describe("--ag-ui-min-page-width caps a sidebar (real browser)", () => {
  it("stops a maximized sidebar at the viewport less the page width", async () => {
    const el = mount(
      { placement: "sidebar" },
      "--ag-ui-maximized-width: 2000px; --ag-ui-min-page-width: 400px;",
    );
    await settle();
    el.setAttribute("maximized", "");
    await settle();
    expect(panelWidth(el)).toBeCloseTo(DESKTOP.width - 400, 0);
  });

  it("caps a token width and a dragged width the same way, on side as well", async () => {
    const token = mount(
      { placement: "side" },
      "--ag-ui-width: 1100px; --ag-ui-min-page-width: 400px;",
    );
    await settle();
    // The side column is the host itself, not a panel absolutely placed inside it.
    expect(token.offsetWidth).toBeCloseTo(DESKTOP.width - 400, 0);
    token.remove();

    localStorage.setItem(
      SIZE_KEY,
      JSON.stringify({ v: 2, placements: { sidebar: { width: 1100 } } }),
    );
    const dragged = mount({ placement: "sidebar" }, "--ag-ui-min-page-width: 400px;");
    await settle();
    expect(panelWidth(dragged)).toBeCloseTo(DESKTOP.width - 400, 0);
  });

  it("changes nothing while unset", async () => {
    const el = mount({ placement: "sidebar" }, "--ag-ui-width: 1200px;");
    await settle();
    expect(panelWidth(el)).toBeCloseTo(1200, 0);
    el.remove();
    const plain = mount({ placement: "sidebar" });
    await settle();
    expect(panelWidth(plain)).toBeCloseTo(420, 0);
  });
});

describe("where the control is (real browser)", () => {
  it.each([
    [{}],
    [{ placement: "bottom-left" }],
    [{ placement: "sidebar" }],
    [{ placement: "side" }],
    [{ "collapse-to": "bar" }],
    [{ "collapse-to": "none" }],
  ])("is offered under %o", async (attrs) => {
    const el = mount(attrs);
    await settle(50);
    expect(control(el)).not.toBeNull();
  });

  it.each([[{ placement: "page" }], [{ placement: "full" }], [{ placement: "embedded" }]])(
    "is absent under %o, and the attribute is refused",
    async (attrs) => {
      const el = mount(attrs);
      await settle(50);
      expect(control(el)).toBeNull();
      el.setAttribute("maximized", "");
      expect(el.hasAttribute("maximized")).toBe(false);
    },
  );

  it("is absent at 600px and below, and comes back above it", async () => {
    await page.viewport(600, 800);
    const el = mount({ "data-small-viewport": "off" });
    await settle();
    expect(control(el)).toBeNull();
    el.setAttribute("maximized", "");
    expect(el.hasAttribute("maximized")).toBe(false);

    await page.viewport(601, 800);
    await settle();
    expect(control(el)).not.toBeNull();
    el.setAttribute("maximized", "");
    await page.viewport(600, 800);
    await settle();
    expect(control(el)).toBeNull();
    expect(el.hasAttribute("maximized")).toBe(false);
  });

  it("leaves when the placement switches to one without it, and returns with it", async () => {
    const el = mount();
    await settle(50);
    el.setAttribute("maximized", "");
    el.setAttribute("placement", "page");
    expect(el.hasAttribute("maximized")).toBe(false);
    expect(control(el)).toBeNull();
    el.setAttribute("placement", "side");
    expect(control(el)).not.toBeNull();
  });

  it("sits inside the header row at the narrowest width that has it", async () => {
    await page.viewport(601, 800);
    const el = mount({ "data-small-viewport": "off" });
    await settle();
    const controls = inShadow<HTMLElement>(el, ".header-controls");
    const header = inShadow<HTMLElement>(el, ".header");
    if (controls === null || header === null) {
      throw new Error("expected the header row");
    }
    const row = controls.getBoundingClientRect();
    const bar = header.getBoundingClientRect();
    expect(row.right).toBeLessThanOrEqual(bar.right + 0.5);
    for (const button of controls.querySelectorAll<HTMLElement>(".header-btn")) {
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(row.left - 0.5);
      expect(box.right).toBeLessThanOrEqual(row.right + 0.5);
      expect(box.top).toBeGreaterThanOrEqual(bar.top - 0.5);
      expect(box.bottom).toBeLessThanOrEqual(bar.bottom + 0.5);
    }
    const order = [...controls.querySelectorAll<HTMLElement>(".header-btn")].map(
      (button) => button.className.match(/header-btn--([a-z]+)/)?.[1],
    );
    expect(order.slice(-2)).toEqual(["maximize", "collapse"]);
  });

  it("names itself apart from the launcher and the rail", async () => {
    const el = mount({ placement: "sidebar" });
    await settle(50);
    const name = control(el)?.getAttribute("aria-label");
    const launcher = inShadow<HTMLElement>(el, '[part~="launcher"]')?.getAttribute("aria-label");
    expect(name).toBe("Maximize");
    expect(launcher).toBeTruthy();
    expect(launcher).not.toBe(name);
    el.collapsed = true;
    await settle(50);
    const rail = inShadow<HTMLElement>(el, '[part~="launcher"]')?.getAttribute("aria-label");
    expect(rail).not.toBe(name);
    el.collapsed = false;
    el.setAttribute("maximized", "");
    expect(control(el)?.getAttribute("aria-label")).toBe("Restore");
    expect(control(el)?.getAttribute("aria-label")).not.toBe(launcher);
  });
});
