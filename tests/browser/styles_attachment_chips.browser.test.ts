import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { AttachmentRef } from "../../src/core/attachment.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { renderAttachmentChips } from "../../src/ui/attachment_chips.js";

/**
 * Attachment chips, asserted against a real cascade.
 *
 * Two defects lived here and neither was visible to happy-dom. A chip carries
 * the assistant surface as its background but sits inside a user bubble, whose
 * foreground is white on the stock light theme, so the filename rendered at
 * 1.13:1 against its own chip -- a real accessibility failure that survived
 * because the demoed themes are dark, where the same rule happens to pass.
 *
 * The composer tray sets the hidden property while empty but declared an
 * author display, which beats the UA stylesheet's rule for it, so the tray
 * never collapsed and its padding was permanent dead space above the composer.
 *
 * Both are cascade-and-layout questions: happy-dom reports its own agreeable
 * answer for a computed colour and does not lay boxes out at all, so a green
 * happy-dom run was compatible with either defect. The assertions below are on
 * resolved colours and measured geometry for that reason.
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

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
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

  it("collapses the empty tray instead of holding dead space above the composer", () => {
    const el = mount();
    const tray = part(shadow(el), ".attachment-tray");
    expect(tray.hidden).toBe(true);
    expect(getComputedStyle(tray).display).toBe("none");
    expect(tray.offsetHeight).toBe(0);
  });

  it("pads a populated tray on both sides so a chip clears the composer", () => {
    const el = mount();
    const tray = part(shadow(el), ".attachment-tray");
    tray.hidden = false;
    const style = getComputedStyle(tray);
    expect(style.display).toBe("flex");
    expect(style.paddingTop).toBe("8px");
    expect(style.paddingBottom).toBe("8px");
  });

  it("keeps the page placement's reading-column gutter on the tray", () => {
    // The tray's padding is a shorthand and the placement rule overrides only
    // its inline axis; this is the assertion that a rewrite of the shorthand
    // has not taken the gutter with it.
    const el = mount({ placement: "page" });
    el.style.setProperty("--ag-ui-content-max-width", "100px");
    const tray = part(shadow(el), ".attachment-tray");
    tray.hidden = false;
    const style = getComputedStyle(tray);
    expect(Number.parseFloat(style.paddingLeft)).toBeGreaterThan(12);
    expect(style.paddingLeft).toBe(style.paddingRight);
  });
});
