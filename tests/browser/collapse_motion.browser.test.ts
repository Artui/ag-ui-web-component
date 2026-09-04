import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Collapse, expand and the slide-overs are transitions, and a transition either
 * *starts* or it does not — a string assertion on the stylesheet cannot tell
 * the two apart. Both of the mechanisms here fail silently when they are wrong:
 *
 * - an element hidden with `display: none` has no before-change style to
 *   animate *from* and cannot animate *to* none, so every one of these
 *   surfaces stays laid out and hides with `visibility` instead. Get that
 *   wrong and the panel simply appears and disappears, which reads as "the
 *   animation didn't fire";
 * - and the cost of staying laid out is that an invisible launcher now sits
 *   over the expanded panel's bottom corner. `visibility: hidden` is what
 *   keeps it out of hit testing, so the composer underneath still takes
 *   clicks.
 *
 * `getAnimations()` answers the question directly: it lists the transitions the
 * browser actually started for that state change. That is deterministic —
 * unlike sampling a computed transform mid-flight, which races the compositor.
 *
 * These belong in the Chromium project because happy-dom runs no transitions
 * whatsoever: every assertion here would pass vacuously (an empty list) or fail
 * on a stylesheet that is perfectly correct.
 */

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found;
}

/**
 * Resolve an element's current style, so the next change has something to
 * transition *from*. A test mounts and toggles within one task; a user's
 * click always lands long after the resting style was resolved.
 */
function settle(element: Element): void {
  getComputedStyle(element).transform;
}

/** The properties the browser is currently transitioning on an element. */
function transitioning(element: Element): string[] {
  return element
    .getAnimations()
    .filter((animation): animation is CSSTransition => animation instanceof CSSTransition)
    .map((animation) => animation.transitionProperty)
    .sort();
}

describe("collapse and slide-over motion (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    // Layout preferences are durable on purpose, so the per-tab clear no longer
    // reaches all of them. Without this a dragged position leaks into the next
    // test, which reads as a drag that travelled the wrong distance.
    localStorage.clear();
  });

  it("morphs the panel out and the launcher in when the widget collapses", () => {
    const el = mount();
    settle(part(el, ".chat"));
    settle(part(el, ".launcher"));

    el.setCollapsed(true);

    expect(transitioning(part(el, ".chat"))).toEqual(["opacity", "transform", "visibility"]);
    expect(transitioning(part(el, ".launcher"))).toEqual(["opacity", "transform", "visibility"]);
  });

  it("leaves the composer clickable under the resting launcher", () => {
    const el = mount();
    const send = part(el, ".send");
    const box = send.getBoundingClientRect();

    // The launcher's box overlaps this corner while the widget is expanded.
    // The hit lands on the button's glyph, which is the button being clickable.
    const hit = el.shadowRoot?.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
    expect(hit === send || send.contains(hit ?? null)).toBe(true);
  });

  it("keeps the collapsed panel out of the tab order once it has gone", async () => {
    const el = mount();
    el.setCollapsed(true);
    await Promise.all(
      part(el, ".chat")
        .getAnimations()
        .map((a) => a.finished),
    );

    expect(getComputedStyle(part(el, ".chat")).visibility).toBe("hidden");
    // The host box stops swallowing clicks; the launcher takes them instead.
    expect(getComputedStyle(el).pointerEvents).toBe("none");
    expect(getComputedStyle(part(el, ".launcher")).pointerEvents).toBe("auto");
  });

  it("sizes the settled launcher to the token, at the widget's own corner", async () => {
    const el = mount();
    el.setCollapsed(true);
    const launcher = part(el, ".launcher");
    await Promise.all(launcher.getAnimations().map((a) => a.finished));

    const host = el.getBoundingClientRect();
    const box = launcher.getBoundingClientRect();
    expect(box.width).toBe(56);
    expect(box.height).toBe(56);
    expect(box.right).toBeCloseTo(host.right, 0);
    expect(box.bottom).toBeCloseTo(host.bottom, 0);
  });

  it("slides the chat-history drawer in from its hidden attribute", () => {
    const el = mount();
    settle(part(el, ".drawer-panel"));

    el.openThreads();

    expect(transitioning(part(el, ".drawer-panel"))).toEqual(["transform"]);
    expect(transitioning(part(el, ".drawer-backdrop"))).toEqual(["opacity"]);
  });

  it("keeps the drawer displayed for the whole of its exit", async () => {
    const el = mount();
    const drawer = part(el, ".drawer");
    settle(part(el, ".drawer-panel"));
    el.openThreads();
    await Promise.all(
      part(el, ".drawer-panel")
        .getAnimations()
        .map((a) => a.finished),
    );

    // The user's own close route, so the assertion covers what the backdrop
    // actually does rather than a test-only seam.
    part(el, ".drawer-backdrop").click();

    // Still visible while the panel slides out; hidden only once it has.
    expect(getComputedStyle(drawer).visibility).toBe("visible");
    expect(transitioning(part(el, ".drawer-panel"))).toEqual(["transform"]);
    await Promise.all(
      part(el, ".drawer-panel")
        .getAnimations()
        .map((a) => a.finished),
    );
    expect(getComputedStyle(drawer).visibility).toBe("hidden");
  });

  it("slides the sidebar panel out through the edge it docks against", () => {
    const el = mount({ placement: "sidebar" });
    settle(part(el, ".chat"));

    el.setCollapsed(true);

    expect(transitioning(part(el, ".chat"))).toContain("transform");
  });

  it("shapes the collapsed sidebar into a full-height edge rail", async () => {
    const el = mount({ placement: "sidebar" });
    el.setCollapsed(true);
    const rail = part(el, ".launcher");
    await Promise.all(rail.getAnimations().map((a) => a.finished));

    // Same element as the floating launcher, shaped by placement: square, and
    // filling the host, which has itself shrunk to the rail width.
    expect(getComputedStyle(rail).borderRadius).toBe("0px");
    const box = rail.getBoundingClientRect();
    expect(box.width).toBe(52);
    expect(box.height).toBe(window.innerHeight);
  });

  it("keeps embedded collapsing to its header bar", async () => {
    const el = mount({ placement: "embedded" });
    el.setCollapsed(true);
    const chat = part(el, ".chat");
    await Promise.all(chat.getAnimations().map((a) => a.finished));

    // The panel stays put and the body is what goes; no circle joins it.
    expect(getComputedStyle(chat).visibility).toBe("visible");
    expect(getComputedStyle(part(el, ".messages")).display).toBe("none");
    expect(getComputedStyle(part(el, ".input-row")).display).toBe("none");
    expect(getComputedStyle(part(el, ".launcher")).visibility).toBe("hidden");
    // ...and the widget still takes clicks, since it is part of the page flow.
    expect(getComputedStyle(el).pointerEvents).toBe("auto");
  });

  it("refuses to collapse the page placement through any reachable path", async () => {
    const el = mount({ placement: "page" });
    // The control is not offered.
    expect(getComputedStyle(part(el, ".header-btn--collapse")).display).toBe("none");
    // ...and the state is refused rather than merely unreachable.
    el.setCollapsed(true);
    expect(el.collapsed).toBe(false);
    el.toggleCollapsed();
    expect(el.collapsed).toBe(false);
  });

  it("renders a page panel in full even if the attribute is forced on", async () => {
    // The one path no guard sees: an attribute written straight onto the
    // element. Without the stylesheet neutralising it, this is the generic
    // collapse -- panel scaled away, pointer events dropped -- under the single
    // placement that also hides the launcher, so nothing would remain on screen
    // and there would be no control left to undo it.
    const el = mount({ placement: "page" });
    el.setAttribute("collapsed", "");
    const chat = part(el, ".chat");
    await Promise.all(chat.getAnimations().map((a) => a.finished));

    expect(getComputedStyle(chat).visibility).toBe("visible");
    expect(getComputedStyle(chat).opacity).toBe("1");
    expect(getComputedStyle(part(el, ".messages")).display).not.toBe("none");
    expect(getComputedStyle(part(el, ".input-row")).display).not.toBe("none");
    expect(getComputedStyle(el).pointerEvents).toBe("auto");
  });

  it("releases a collapsed panel when the placement changes to page", async () => {
    // Collapsed under a placement that has the state, then moved to one that
    // does not: the header control disappears with the attribute change, so
    // holding the state would strand the panel.
    const el = mount({ placement: "floating" });
    el.setCollapsed(true);
    expect(el.collapsed).toBe(true);

    el.setAttribute("placement", "page");
    expect(el.collapsed).toBe(false);
  });
});
