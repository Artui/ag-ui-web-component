/**
 * Dragging the collapsed launcher, and what the panel does about it.
 *
 * The geometry itself is settled in launcher_placement.test.ts; what is left
 * here is the wiring that makes it real: which properties get written, what is
 * remembered, and -- the part that has no equivalent anywhere else in the
 * element -- what gets *given back* when the position stops being this
 * element's to own.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

const VIEWPORT = { width: 1000, height: 800 };
/** The panel's resting size, which the host box keeps while collapsed. */
const PANEL = { width: 380, height: 560 };

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/**
 * Mount a widget with the geometry happy-dom does not compute.
 *
 * The launcher is given a real 56px layout size and a rect scaled by 0.94, the
 * value the press state applies -- so a test that read the launcher's corner
 * from its rect would measure a box 3px off, which is the thing the element
 * divides back out.
 */
function mount(attrs: Record<string, string> = {}): { el: AgUiChat; launcher: HTMLElement } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);

  const host = { left: 604, top: 216, width: PANEL.width, height: PANEL.height };
  el.getBoundingClientRect = (() => ({ ...host, right: 984, bottom: 776 })) as never;

  const launcher = shadow(el).querySelector(".launcher") as HTMLElement;
  Object.defineProperty(launcher, "offsetWidth", { value: 56, configurable: true });
  Object.defineProperty(launcher, "offsetHeight", { value: 56, configurable: true });
  // Resting at the host box's bottom-right corner: (928, 720) to (984, 776),
  // reported through the 0.94 press scale about its own centre.
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

/** The frame the element defers its restore to, so the host's CSS has applied. */
function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function pointer(type: string, x: number, y: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { clientX: x, clientY: y });
  return event;
}

function drag(launcher: HTMLElement, from: [number, number], to: [number, number]): void {
  launcher.dispatchEvent(pointer("pointerdown", from[0], from[1]));
  window.dispatchEvent(pointer("pointermove", to[0], to[1]));
  window.dispatchEvent(pointer("pointerup", to[0], to[1]));
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

describe("dragging the collapsed launcher", () => {
  it("places the panel and the launcher from the corner with the most room", () => {
    const { el, launcher } = mount({ id: "one" });
    el.setCollapsed(true);

    // From the bottom-right corner to near the top-left.
    drag(launcher, [956, 748], [156, 148]);

    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
    // The launcher lands at (128, 120) and the panel opens down-right from it.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("120px auto auto 128px");
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("0px auto auto 0px");
  });

  it("divides the press scale back out, so the drag starts where the launcher looks", () => {
    const { el, launcher } = mount({ id: "scale" });
    el.setCollapsed(true);

    // No travel beyond the threshold in the second axis: a pure -100px move.
    drag(launcher, [956, 748], [856, 748]);

    // 928 - 100 = 828. Reading the scaled rect's own left edge instead would
    // have started from 929.68 and landed on 830.
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("auto 0px 0px auto");
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 116px 24px auto");
  });

  it("points the resize grip away from the corner the panel opens from", () => {
    const { el, launcher } = mount({ id: "grip" });
    el.setCollapsed(true);

    drag(launcher, [956, 748], [156, 148]);

    // Stamped from the corner the element chose, not from a probe -- which at a
    // size resting against max-width would report the wrong edge entirely.
    expect(el.getAttribute("data-resize-anchor")).toBe("top-left");
  });

  it("remembers the position for the next mount, per tab", async () => {
    const first = mount({ id: "memory" });
    first.el.setCollapsed(true);
    drag(first.launcher, [956, 748], [156, 148]);
    document.body.innerHTML = "";

    const { el } = mount({ id: "memory" });
    await frame();

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("120px auto auto 128px");
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
  });

  it("ignores a corrupt stored position rather than failing the mount", async () => {
    sessionStorage.setItem("ag-ui-chat:launcher:corrupt", "{not json");
    const { el } = mount({ id: "corrupt" });
    await frame();

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.hasAttribute("data-expand-corner")).toBe(false);
  });

  it("ignores a stored position that is not a pair of numbers", async () => {
    sessionStorage.setItem("ag-ui-chat:launcher:shapeless", JSON.stringify({ left: "12" }));
    const { el } = mount({ id: "shapeless" });
    await frame();

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("re-decides which way to open when the window has changed underneath it", () => {
    const { el, launcher } = mount({ id: "resized" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");

    // A viewport with less room to the launcher's right than to its left.
    Object.defineProperty(window, "innerWidth", { value: 300, configurable: true });
    window.dispatchEvent(new Event("resize"));

    // The horizontal half flips; the vertical half still has room below.
    expect(el.getAttribute("data-expand-corner")).toBe("top-right");
  });

  it("pulls a launcher stranded off-screen back into reach", async () => {
    sessionStorage.setItem(
      "ag-ui-chat:launcher:stranded",
      JSON.stringify({ left: 5000, top: 5000 }),
    );
    const { el } = mount({ id: "stranded" });
    await frame();

    // Clamped to (944, 744), hard against the corner, so it opens up and left.
    expect(el.getAttribute("data-expand-corner")).toBe("bottom-right");
    // The panel still keeps its margin from the viewport edge...
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 24px 24px auto");
    // ...which leaves the launcher sitting 24px outside its own host box, on
    // both axes. Nothing clips it there, and that is what lets a launcher be
    // flush to the corner while the panel it opens is not.
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("auto -24px -24px auto");
  });

  it("hands the position back to a placement that owns it", () => {
    const { el, launcher } = mount({ id: "release" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);
    expect(el.style.getPropertyValue("--ag-ui-inset")).not.toBe("");

    el.setAttribute("placement", "sidebar");

    // A stale inline inset would pin the rail wherever the circle had been.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.style.getPropertyValue("--ag-ui-launcher-inset")).toBe("");
    expect(el.hasAttribute("data-expand-corner")).toBe(false);
  });

  it("leaves a remembered position unapplied where the placement places itself", async () => {
    // A host that moved the widget to a sidebar between visits: the position is
    // still in storage, and must stay there rather than pinning the rail.
    sessionStorage.setItem(
      "ag-ui-chat:launcher:docked-memory",
      JSON.stringify({ left: 40, top: 40 }),
    );
    const { el } = mount({ id: "docked-memory", placement: "sidebar" });
    await frame();

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
    expect(el.hasAttribute("data-expand-corner")).toBe(false);
  });

  it("ignores a stored value that is not an object at all", async () => {
    sessionStorage.setItem("ag-ui-chat:launcher:scalar", "42");
    const { el } = mount({ id: "scalar" });
    await frame();

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("keeps a dragged position across two placements that both allow it", () => {
    const { el, launcher } = mount({ id: "kept" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);

    el.setAttribute("placement", "bottom-left");

    // Both float, so neither is placing the launcher and the drag survives.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("120px auto auto 128px");
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
  });

  it("refuses to move a launcher a non-floating placement is placing", () => {
    const { el, launcher } = mount({ id: "docked", placement: "sidebar" });
    el.setCollapsed(true);

    drag(launcher, [956, 748], [156, 148]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("lets a host opt out and keep the launcher where its own CSS puts it", () => {
    const { el, launcher } = mount({ id: "optout", "data-launcher-drag": "false" });
    el.setCollapsed(true);

    drag(launcher, [956, 748], [156, 148]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("does not move a launcher that is not on screen to be moved", () => {
    const { el, launcher } = mount({ id: "expanded" });

    // Expanded: the launcher is scaled away behind the open panel.
    drag(launcher, [956, 748], [156, 148]);

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("");
  });

  it("still expands on a click that was not a drag", () => {
    const { el, launcher } = mount({ id: "click" });
    el.setCollapsed(true);

    launcher.dispatchEvent(pointer("pointerdown", 956, 748));
    window.dispatchEvent(pointer("pointerup", 956, 748));
    launcher.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

    expect(el.collapsed).toBe(false);
  });

  it("does not expand on the click that ends a drag", () => {
    const { el, launcher } = mount({ id: "dragclick" });
    el.setCollapsed(true);

    drag(launcher, [956, 748], [156, 148]);
    launcher.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));

    expect(el.collapsed).toBe(true);
  });

  it("takes the launcher along when a resize moves the panel's pinned corner", () => {
    const { el, launcher } = mount({ id: "resized-panel" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);
    el.setCollapsed(false);

    // The launcher was dropped near the top-left, so that is the corner the
    // panel is now pinned by -- and the top-left grip drags the very edges the
    // layout is holding still, which moves the panel as well as resizing it.
    const grip = shadow(el).querySelector(".resize-handle--top-left") as HTMLElement;
    grip.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 100, 100));
    window.dispatchEvent(pointer("pointerup", 100, 100));

    // Without this the next expand would re-derive the panel's position from a
    // launcher still standing where the panel used to be, undoing the resize.
    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("100px auto auto 100px");
    expect(sessionStorage.getItem("ag-ui-chat:launcher:resized-panel")).toBe(
      JSON.stringify({ left: 100, top: 100 }),
    );
  });

  it("takes the launcher along from the opposite corner too", () => {
    const { el, launcher } = mount({ id: "resized-br" });
    el.setCollapsed(true);
    // A short drag that keeps it in the bottom-right, so the panel stays pinned
    // there and the grip on that corner is the one dragging the pinned edges.
    drag(launcher, [956, 748], [940, 730]);
    expect(el.getAttribute("data-expand-corner")).toBe("bottom-right");
    el.setCollapsed(false);

    const grip = shadow(el).querySelector(".resize-handle--bottom-right") as HTMLElement;
    grip.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 1000, 800));
    window.dispatchEvent(pointer("pointerup", 1000, 800));

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe("auto 0px 0px auto");
    expect(sessionStorage.getItem("ag-ui-chat:launcher:resized-br")).toBe(
      JSON.stringify({ left: 944, top: 744 }),
    );
  });

  it("leaves the position alone when a resize only moves a free edge", () => {
    const { el, launcher } = mount({ id: "free-edge" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);
    const placed = el.style.getPropertyValue("--ag-ui-inset");
    el.setCollapsed(false);

    // Pinned top-left, so the right edge is a free one: this is a resize and
    // nothing more, and the panel must not take ownership of a position it was
    // not asked to move.
    const grip = shadow(el).querySelector(".resize-handle--right") as HTMLElement;
    grip.dispatchEvent(pointer("pointerdown", 0, 0));
    window.dispatchEvent(pointer("pointermove", 700, 400));
    window.dispatchEvent(pointer("pointerup", 700, 400));

    expect(el.style.getPropertyValue("--ag-ui-inset")).toBe(placed);
  });

  it("stops listening to the window once it leaves the document", () => {
    const { el, launcher } = mount({ id: "gone" });
    el.setCollapsed(true);
    drag(launcher, [956, 748], [156, 148]);
    el.remove();

    Object.defineProperty(window, "innerWidth", { value: 300, configurable: true });

    // The listener is gone, so nothing re-reads the corner for a detached node.
    expect(() => window.dispatchEvent(new Event("resize"))).not.toThrow();
    expect(el.getAttribute("data-expand-corner")).toBe("top-left");
  });
});
