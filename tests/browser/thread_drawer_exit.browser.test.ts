import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The chat-history list has to be leaveable, and under one placement it was
 * not.
 *
 * The drawer closes when its backdrop is clicked, which is enough wherever a
 * strip of backdrop is showing. The embedded placement widens the panel to the
 * full width of the host's box on purpose -- it is a view swap in a panel the
 * host gave a column of its layout to, not a slide-over -- and that leaves no
 * backdrop to hit. What remained were Escape, which is invisible, picking a
 * row, and New chat, which replaces the conversation you were trying to get
 * back to.
 *
 * Chromium rather than happy-dom because the claim is geometric: the panel
 * covers the backdrop completely. A string assertion on the stylesheet cannot
 * evaluate `width: 100%` against a parent, and happy-dom lays nothing out.
 */

function mount(placement: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("placement", placement);
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (found === null || found === undefined) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found as HTMLElement;
}

describe("leaving the chat-history list (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
  });

  it("covers its own backdrop under the embedded placement", async () => {
    // The condition that made the exit necessary. If this ever stops being
    // true the close control is still right, but the story above is stale.
    const el = mount("embedded");
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const panel = part(el, ".drawer-panel").getBoundingClientRect();
    const backdrop = part(el, ".drawer-backdrop").getBoundingClientRect();
    expect(panel.width).toBeCloseTo(backdrop.width, 0);
  });

  it.each(["embedded", "floating"])("closes from the header under %s", async (placement) => {
    const el = mount(placement);
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    expect(part(el, ".drawer").hidden).toBe(false);

    part(el, ".drawer-close").click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(part(el, ".drawer").hidden).toBe(true);
  });

  it("leaves the conversation alone, unlike the control beside it", async () => {
    // New chat also closes the drawer, and was the only visible way out under
    // embedded -- at the cost of the conversation you opened the list to leave.
    // So the assertion that matters is not that the drawer shut, it is that
    // the thread underneath survived shutting it.
    const el = mount("embedded");
    el.appendMessage("user", "the conversation being returned to");
    const threadBefore = el.conversationStore.threadId();
    const messagesBefore = part(el, ".messages").textContent;
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    part(el, ".drawer-close").click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(el.conversationStore.threadId()).toBe(threadBefore);
    expect(part(el, ".messages").textContent).toBe(messagesBefore);
    expect(messagesBefore).toContain("the conversation being returned to");

    // And New chat, the control it sits beside, does the opposite.
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    part(el, ".drawer-new").click();
    await new Promise((resolve) => setTimeout(resolve, 350));

    expect(part(el, ".messages").textContent).not.toContain("the conversation being returned to");
  });

  it("keeps the three-control row inside the panel at a narrow width", async () => {
    // A new control in an existing row is a layout change. The header was
    // built for two and is measured here at the narrow end, where the panel is
    // capped at 85% of a small floating widget.
    const el = mount("floating");
    el.style.setProperty("--ag-ui-width", "260px");
    el.openThreads();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

    const header = part(el, ".drawer-header");
    const panel = part(el, ".drawer-panel").getBoundingClientRect();
    expect(header.scrollWidth).toBeLessThanOrEqual(header.clientWidth + 1);
    for (const selector of [".drawer-title", ".drawer-new", ".drawer-close"]) {
      const box = part(el, selector).getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(panel.left - 1);
      expect(box.right).toBeLessThanOrEqual(panel.right + 1);
    }
  });
});
