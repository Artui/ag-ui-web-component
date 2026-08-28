import { beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The two claims about the announcer that only a real engine can decide.
 *
 * `tests/ag_ui_chat_announcer.test.ts` covers which statuses land and when,
 * which is ordinary logic. What it cannot cover is whether the announcer is
 * *reachable by assistive technology at all* -- happy-dom will cheerfully
 * confirm that a class is set and that `getComputedStyle` returns something,
 * which is exactly the thing not in question.
 *
 * ⚠ The classic way this pattern is written wrong is hiding the live region
 * with `display: none` or `visibility: hidden`. Both take the element out of
 * the accessibility tree entirely, so the region announces nothing and every
 * attribute assertion still passes. A green happy-dom run is compatible with
 * the announcer being completely inert, which is the same trap the sanitisation
 * and host-theming tests document.
 *
 * The second claim is the transcript's: `role="log"` implies
 * `aria-live="polite"`, and only a real engine resolves an explicit `off` as an
 * override of an implicit role value rather than as two attributes sitting
 * beside each other in a DOM shim.
 */

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  document.body.append(el);
  return el;
}

function announcerOf(el: AgUiChat): HTMLElement {
  const node = el.shadowRoot?.querySelector<HTMLElement>(".sr-only");
  if (!node) {
    throw new Error("expected an announcer");
  }
  return node;
}

describe("the screen-reader announcer", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  it("is hidden without leaving the accessibility tree", () => {
    const announcer = announcerOf(mount());
    const style = getComputedStyle(announcer);

    // The two ways to make a live region silent by accident.
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
  });

  it("occupies no visible space", () => {
    // Hidden means off-screen, not merely transparent: a region that still laid
    // out would push the panel's own content around.
    const announcer = announcerOf(mount());
    const box = announcer.getBoundingClientRect();

    expect(box.width).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(1);
  });

  it("is a polite, atomic status region", () => {
    const announcer = announcerOf(mount());

    expect(announcer.getAttribute("role")).toBe("status");
    expect(announcer.getAttribute("aria-live")).toBe("polite");
    // Without atomic a reader may announce only the words that differ between
    // two consecutive statuses, which is worse than either whole sentence.
    expect(announcer.getAttribute("aria-atomic")).toBe("true");
  });

  it("leaves the transcript navigable as a log but silent", () => {
    const messages = mount().shadowRoot?.querySelector(".messages");

    expect(messages?.getAttribute("role")).toBe("log");
    expect(messages?.getAttribute("aria-live")).toBe("off");
    // The transcript must not be the announcer: one element cannot both be
    // rewritten every animation frame and be read aloud on change.
    expect(messages?.classList.contains("sr-only")).toBe(false);
  });
});
