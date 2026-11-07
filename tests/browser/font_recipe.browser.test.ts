import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * How a host gives the widget its page's font, as the README documents it.
 *
 * The docs used to advise --ag-ui-font: inherit. A CSS-wide keyword in a
 * custom property applies to the custom property itself: it takes the
 * --ag-ui-font of the parent, which nothing above the element sets, so the
 * token reads as unset and the theme's own stack wins. The recipe that works
 * names the family, literally or through a page token.
 *
 * Read on a probe in the shadow root, which inherits from the host as the
 * transcript does, and on the greeting, which reads the font through its own
 * alias. The width of a run of narrow glyphs proves the font rendered, not
 * only the declaration.
 */

const PAGE_FONT = "monospace";
const NARROW = "iiiiiiiiiiiiiiiiiiii";

function mount(wrapperStyle = "", chatStyle = ""): AgUiChat {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `font-family: ${PAGE_FONT}; ${wrapperStyle}`;
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-greeting", "Hello");
  el.style.cssText = chatStyle;
  wrapper.appendChild(el);
  document.body.appendChild(wrapper);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected an open shadow root");
  }
  return el.shadowRoot;
}

/** The font a run of text in the chat is drawn in, and how wide it comes out. */
function rendered(el: AgUiChat): { family: string; width: number; greeting: string } {
  const probe = document.createElement("span");
  probe.textContent = NARROW;
  shadow(el).appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  const width = probe.getBoundingClientRect().width;
  probe.remove();
  const greeting = shadow(el).querySelector(".greeting");
  if (!(greeting instanceof HTMLElement)) {
    throw new Error("no greeting");
  }
  return { family, width, greeting: getComputedStyle(greeting).fontFamily };
}

describe("the page's font in the widget (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps the theme's stack under the old --ag-ui-font: inherit advice", () => {
    const theme = rendered(mount());
    const advised = rendered(mount("--ag-ui-font: inherit", "--ag-ui-font: inherit"));

    expect(theme.family).toContain("Inter");
    expect(advised.family).toBe(theme.family);
    expect(advised.greeting).toBe(theme.greeting);
    expect(advised.width).toBe(theme.width);
  });

  it("takes the page's family when --ag-ui-font names it", () => {
    const theme = rendered(mount());
    const named = rendered(mount("", `--ag-ui-font: ${PAGE_FONT}`));

    expect(named.family).toBe(PAGE_FONT);
    expect(named.greeting).toBe(PAGE_FONT);
    // A monospace i is as wide as an m; in the theme's sans it is a sliver.
    expect(named.width).toBeGreaterThan(theme.width * 1.5);
  });

  it("takes the page's family through a page token", () => {
    const named = rendered(mount(`--page-font: ${PAGE_FONT}`, "--ag-ui-font: var(--page-font)"));

    expect(named.family).toBe(PAGE_FONT);
    expect(named.greeting).toBe(PAGE_FONT);
  });

  it("takes the page's family from a wrapper above the chat, as any token does", () => {
    const named = rendered(mount(`--ag-ui-font: ${PAGE_FONT}`));

    expect(named.family).toBe(PAGE_FONT);
  });
});
