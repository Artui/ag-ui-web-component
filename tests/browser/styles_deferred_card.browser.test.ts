import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { requestApproval } from "../../src/ui/approval_card.js";
import { ToolCallCard } from "../../src/ui/tool_call_card.js";

/**
 * A gated call's card, with the question about it inside.
 *
 * The prompt moved from the answer group into the card of the call it gates,
 * which makes the card's own arguments the thing that says *which* call is being
 * asked about. That only works if they are on screen: three copies of "Add this
 * event to the board?" are told apart by what is above each of them. So the
 * assertions here are about boxes -- the arguments visible in every display mode,
 * the prompt inside the card and inside its bounds, and no empty gap on the cards
 * nobody is being asked about.
 *
 * A browser test because happy-dom lays out nothing and computes no cascade: it
 * answers the same whether a rule hides the arguments, collapses the slot, or
 * overflows the panel.
 */

/** The panel width the checkpoint and tool-card findings were measured at. */
const PANEL = "470px";

function mount(display?: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (display !== undefined) {
    el.setAttribute("data-tool-display", display);
  }
  el.style.width = PANEL;
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/** A deferred card in the real transcript, asking about its own call. */
function deferredCard(el: AgUiChat, title: string): HTMLElement {
  const card = new ToolCallCard("create_event", { title, day: "2026-08-14" }, "Create event");
  part(shadow(el), ".messages").appendChild(card.element);
  card.mark("deferred");
  void requestApproval(card.approvalSlot, { message: "Add this event to the board?" });
  return card.element;
}

describe("a deferred tool card (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("shows the arguments that say which call this is", () => {
    const el = mount();
    const card = deferredCard(el, "Design sync");
    const args = part(card, ".tool-call-args");

    expect(args.getBoundingClientRect().height).toBeGreaterThan(0);
    expect(args.textContent).toContain("Design sync");
  });

  it("still shows them in the densest display mode", () => {
    // A density setting must not be able to hide the answer to "which one is
    // this" while a question about it is on screen.
    for (const display of ["minimal", "compact", "inline"]) {
      document.body.innerHTML = "";
      const card = deferredCard(mount(display), "Design sync");

      expect(part(card, ".tool-call-args").getBoundingClientRect().height).toBeGreaterThan(0);
      // And nothing more than that. Revealing every section instead of the
      // arguments overrides the `hidden` on a result that does not exist yet, so
      // an empty RESULT heading frames itself under the question — seen on the
      // demo page in compact mode, which no unit test could have reported.
      expect(part(card, ".tool-call-section--result").getBoundingClientRect().height).toBe(0);
    }
  });

  it("keeps the prompt and both buttons inside the card", () => {
    const el = mount();
    const card = deferredCard(el, "Design sync");
    const approval = part(card, ".approval");
    const buttons = [...card.querySelectorAll(".approval-btn")] as HTMLElement[];

    expect(buttons).toHaveLength(2);
    const bounds = card.getBoundingClientRect();
    expect(approval.getBoundingClientRect().right).toBeLessThanOrEqual(bounds.right);
    for (const button of buttons) {
      const box = button.getBoundingClientRect();
      expect(box.width).toBeGreaterThan(0);
      expect(box.right).toBeLessThanOrEqual(bounds.right);
      expect(box.bottom).toBeLessThanOrEqual(bounds.bottom + 1);
    }
  });

  it("puts each question under the call it is about", () => {
    const el = mount();
    const first = deferredCard(el, "Design sync");
    const second = deferredCard(el, "Retro");

    // The defect was three prompts in a row at the bottom, three cards below the
    // calls they gated. Interleaved is the fix, and it is a geometric claim.
    const firstPrompt = part(first, ".approval").getBoundingClientRect();
    const secondCard = second.getBoundingClientRect();
    expect(firstPrompt.bottom).toBeLessThanOrEqual(secondCard.top + 1);
    expect(part(first, ".tool-call-args").getBoundingClientRect().bottom).toBeLessThanOrEqual(
      firstPrompt.top + 1,
    );
  });

  it("adds no gap to a card nobody is being asked about", () => {
    const el = mount();
    const card = new ToolCallCard("list_events", {}, "List events");
    part(shadow(el), ".messages").appendChild(card.element);

    // Every card carries the slot; an empty one must collapse, or every tool card
    // in the transcript grows a blank strip.
    expect(card.approvalSlot.getBoundingClientRect().height).toBe(0);
    expect(getComputedStyle(card.approvalSlot).display).toBe("none");
  });

  it("draws no spinner while nothing is running", () => {
    // The pending card spins; a deferred one is waiting on a person, and a
    // spinner is the visual half of the "running…" claim.
    const el = mount();
    const card = deferredCard(el, "Design sync");
    const icon = part(card, ".tool-call-icon");

    expect(getComputedStyle(icon).animationName).toBe("none");
    expect(part(card, ".tool-call-status").textContent).toBe("waiting for you");
  });
});
