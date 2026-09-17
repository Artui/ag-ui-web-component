import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * A new chat focuses the composer without moving the host page.
 *
 * Both of the element's own New chat buttons sit inside the panel, so the
 * composer they focus is already on screen and scrolling would never arise
 * from them. A host calling `newChat()` from its own code is the case this
 * holds: an embedded chat further down a long page, reset by a route change or
 * a sign-in, would otherwise drag the page down to it -- and on a phone open
 * the on-screen keyboard over whatever the user was reading.
 *
 * A browser test because happy-dom lays out no page and scrolls nothing, so it
 * reports the same scroll position whether `focus()` was told to keep still or
 * not.
 */

const SPACER_HEIGHT = 2400;

function mountBelowTheFold(): AgUiChat {
  const spacer = document.createElement("div");
  spacer.style.height = `${SPACER_HEIGHT}px`;
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.style.height = "400px";
  document.body.append(spacer, el);
  return el;
}

describe("focus on a new chat", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.replaceChildren();
    window.scrollTo(0, 0);
  });

  it("does not scroll the page to a composer below the fold", () => {
    const el = mountBelowTheFold();
    window.scrollTo(0, 0);
    // Sized so the composer is out of view: otherwise focusing it would not
    // scroll either way and this would pass without testing anything.
    expect(el.getBoundingClientRect().top).toBeGreaterThan(window.innerHeight);

    el.newChat();

    expect(el.shadowRoot?.activeElement?.classList.contains("input")).toBe(true);
    expect(window.scrollY).toBe(0);
  });
});
