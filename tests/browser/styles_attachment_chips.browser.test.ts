import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { AttachmentRef } from "../../src/core/attachment.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { renderAttachmentChips } from "../../src/ui/attachment_chips.js";

/**
 * Attachment chips, asserted against a real cascade.
 *
 * A chip carries the assistant surface as its background but sits inside a
 * user bubble, whose foreground is white on the stock light theme, so the
 * filename rendered at 1.13:1 against its own chip -- a real accessibility
 * failure that survived because the demoed themes are dark, where the same
 * rule happens to pass.
 *
 * This is a cascade question, and happy-dom reports its own agreeable answer
 * for a computed colour, so a green happy-dom run was compatible with the
 * defect. The assertions below are on resolved colours for that reason.
 */

const BODY_TEXT = "rgb(26, 26, 46)";
const USER_FOREGROUND = "rgb(255, 255, 255)";
const DANGER = "rgb(185, 28, 28)";
const TEAL = "rgb(0, 90, 90)";

const REF: AttachmentRef = {
  id: "a1",
  name: "LQ27552-7006-EXHIBIT-A.pdf",
  mime: "application/pdf",
  size: 128_000,
};

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-attachments-url", "/agent/attachments/");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/** A sent user bubble carrying read-only chips, as sendMessage() builds it. */
function bubbleWithChips(el: AgUiChat, refs: readonly AttachmentRef[]): HTMLElement {
  const bubble = el.appendMessage(MESSAGE_ROLE.USER, "have a look");
  bubble.appendChild(renderAttachmentChips(refs));
  return bubble;
}

describe("attachment chips (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // The defect in one assertion: white on near-white, on stock defaults.
  it("paints a chip on a user bubble with the body text colour, not the user one", () => {
    const el = mount();
    const bubble = bubbleWithChips(el, [REF]);
    expect(getComputedStyle(bubble).color).toBe(USER_FOREGROUND);
    expect(getComputedStyle(part(bubble, ".attachment-chip")).color).toBe(BODY_TEXT);
    expect(getComputedStyle(part(bubble, ".attachment-chip-name")).color).toBe(BODY_TEXT);
  });

  it("follows the consumer-overridable text token rather than a fixed colour", () => {
    const el = mount();
    el.style.setProperty("--ag-ui-text", TEAL);
    expect(getComputedStyle(part(bubbleWithChips(el, [REF]), ".attachment-chip")).color).toBe(TEAL);
  });

  it("keeps an errored chip red, which sits after the rule that now sets a colour", () => {
    const el = mount();
    const bubble = bubbleWithChips(el, [REF]);
    const chip = part(bubble, ".attachment-chip");
    chip.classList.remove("attachment-chip--ready");
    chip.classList.add("attachment-chip--error");
    expect(getComputedStyle(chip).color).toBe(DANGER);
  });
});
