import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The conversation list beside the conversation, rather than over it.
 *
 * A full-page chat is the one surface with width to spare, and covering the
 * transcript to show the list of transcripts is the wrong trade there: it hides
 * the thing the user is trying to get back to. Everywhere else the panel is a
 * few hundred pixels wide and a docked list would leave a column of transcript
 * narrower than the messages in it.
 *
 * Chromium because both halves are used values -- which of two layouts applied,
 * and whether the transcript really starts clear of the rail. The a11y half is
 * asserted here too rather than in happy-dom, because it is decided by the same
 * measurement: only a panel wide enough to dock stops being a dialog.
 */

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function mount(placement: string, width?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", placement);
  el.setAttribute("data-start-open", "");
  if (width !== undefined) {
    el.style.setProperty("--ag-ui-width", width);
    el.style.setProperty("--ag-ui-max-width", width);
  }
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

describe("docked conversation list (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it("docks beside the transcript on a wide full-page chat", async () => {
    const el = mount("page");
    el.openThreads();
    await settle();

    const rail = part(el, ".drawer-panel").getBoundingClientRect();
    const messages = part(el, ".messages");
    const pad = Number.parseFloat(getComputedStyle(messages).paddingInlineStart);

    expect(el.hasAttribute("data-threads-docked")).toBe(true);
    expect(getComputedStyle(part(el, ".drawer-backdrop")).display).toBe("none");
    // The transcript starts clear of the rail rather than under it, which is
    // the whole difference between a rail and an overlay.
    expect(messages.getBoundingClientRect().left + pad).toBeGreaterThanOrEqual(rail.right - 1);
  });

  it("stops being a dialog once it stops covering anything", async () => {
    // aria-modal tells assistive technology to ignore the rest of the
    // document. That is true of a slide-over and a lie about a rail sitting in
    // the page beside the conversation it belongs to.
    const el = mount("page");
    el.openThreads();
    await settle();

    const panel = part(el, ".drawer-panel");
    expect(panel.getAttribute("aria-modal")).toBeNull();
    expect(panel.getAttribute("role")).toBe("region");
  });

  it("keeps the overlay where a page is too narrow to dock", async () => {
    const el = mount("page", "700px");
    el.openThreads();
    await settle();

    expect(el.hasAttribute("data-threads-docked")).toBe(false);
    expect(part(el, ".drawer-panel").getAttribute("aria-modal")).toBe("true");
    expect(getComputedStyle(part(el, ".drawer-backdrop")).display).not.toBe("none");
  });

  it("never docks under a placement that is not a dedicated route", async () => {
    // Width alone is not the test: an app shell can give an embedded panel a
    // page-sized box, and that box is still a column of somebody's layout.
    const el = mount("embedded");
    el.openThreads();
    await settle();

    expect(el.hasAttribute("data-threads-docked")).toBe(false);
    expect(part(el, ".drawer-panel").getAttribute("aria-modal")).toBe("true");
  });

  it("clears the shift however the list was dismissed", async () => {
    // Five ways out and only two go through the host, so the transcript would
    // otherwise stay shifted around nothing.
    const el = mount("page");
    el.openThreads();
    await settle();
    expect(el.hasAttribute("data-threads-docked")).toBe(true);

    part(el, ".drawer-close").click();
    await settle();
    expect(el.hasAttribute("data-threads-docked")).toBe(false);

    el.openThreads();
    await settle();
    part(el, ".drawer-new").click();
    await settle();
    expect(el.hasAttribute("data-threads-docked")).toBe(false);

    // ...and through the host's own method, which is the fifth way.
    el.openThreads();
    await settle();
    expect(el.hasAttribute("data-threads-docked")).toBe(true);
    el.closeThreads();
    await settle();
    expect(el.hasAttribute("data-threads-docked")).toBe(false);
    expect(part(el, ".drawer").hidden).toBe(true);
  });

  it("lets the keyboard leave a docked list for the conversation", async () => {
    // A focus trap is a modal convention. Trapping Tab inside a list that sits
    // beside the transcript would make the transcript unreachable by keyboard.
    const el = mount("page");
    el.openThreads();
    await settle();

    const panel = part(el, ".drawer-panel");
    const composer = part(el, ".input");
    composer.focus();
    panel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true, composed: true }),
    );

    // Not pulled back into the list.
    expect(el.shadowRoot?.activeElement).toBe(composer);
  });
});

/**
 * Docking is a width decision, so a change of width has to re-take it.
 *
 * The drawer can be open across the threshold in either direction, and the
 * three things docking decides -- the attribute the layout keys off, the focus
 * trap, and whether there is a backdrop to dismiss it with -- are all wrong
 * afterwards if the decision is only taken on the way in.
 */
describe("docking across a resize (real browser)", () => {
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

  it("undocks a list left open when the panel narrows past the threshold", async () => {
    const el = mount("page");
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(el.hasAttribute("data-threads-docked")).toBe(true);

    // Narrowed under the panel rather than by resizing the browser, which
    // would leak a viewport into every file that runs after this one. The
    // element measures its own box, so this is the same crossing.
    el.style.setProperty("--ag-ui-max-width", "600px");
    el.style.setProperty("--ag-ui-width", "600px");
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    expect(el.hasAttribute("data-threads-docked")).toBe(false);
    // The modal half of the same decision: a drawer floating over a narrow
    // panel needs the trap and the backdrop that a docked rail does not.
    const panel = part(el, ".drawer-panel");
    expect(panel.getAttribute("role")).toBe("dialog");
    expect(panel.getAttribute("aria-modal")).toBe("true");
  });

  it("leaves a closed drawer alone across the same resize", async () => {
    const el = mount("page");
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    el.style.setProperty("--ag-ui-max-width", "600px");
    window.dispatchEvent(new Event("resize"));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    // Nothing to fix when it is not open, and opening re-decides anyway.
    expect(el.hasAttribute("data-threads-docked")).toBe(false);
  });
});
