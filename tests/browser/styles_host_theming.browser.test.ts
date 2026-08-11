import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * "Theme it from your page" — asserted against a real cascade.
 *
 * The shadow styles used to declare every --ag-ui-* token on :host. That sets
 * the property *on the host element*, and a value on an element always beats
 * one inherited from an ancestor, so the documented pattern (put the tokens on
 * a wrapper) had no effect at all. Only a rule aimed at the element itself
 * worked. The defaults block now reads each public token into a private alias
 * with the default as a var() fallback, leaving the public name undeclared on
 * the element so an ancestor's value reaches it.
 *
 * These live in the Chromium project rather than under happy-dom because
 * happy-dom cannot evaluate the assertions: it does not resolve a chained
 * var() fallback (a token derived from another token comes back empty), does
 * not resolve `font-family: inherit`, and does not normalise a hex colour to
 * rgb(). A green happy-dom run would therefore be compatible with the cascade
 * being broken — the same reason the sanitisation tests live here.
 *
 * Assertions are on resolved colours and lengths, never on visibility:
 * getComputedStyle on a child of a display:none parent still reports its own
 * computed value and would agree with a broken cascade.
 */

const ANCESTOR_GREEN = "rgb(31, 71, 57)";
const PAGE_RULE_CREAM = "rgb(255, 253, 240)";
const ELEMENT_PLUM = "rgb(90, 20, 70)";
const DEFAULT_INDIGO = "rgb(79, 70, 229)";
const DARK_PANEL = "rgb(21, 21, 31)";

/** Mount the element inside a wrapper, the way a host page would nest it. */
function mountInWrapper(
  wrapperTokens: Record<string, string> = {},
  attrs: Record<string, string> = {},
): { el: AgUiChat; wrapper: HTMLElement } {
  const wrapper = document.createElement("aside");
  for (const [name, value] of Object.entries(wrapperTokens)) {
    wrapper.style.setProperty(name, value);
  }
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  wrapper.appendChild(el);
  document.body.appendChild(wrapper);
  return { el, wrapper };
}

function shadowPart(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector} in the shadow root`);
  }
  return found;
}

function bg(el: AgUiChat, selector: string): string {
  return getComputedStyle(shadowPart(el, selector)).backgroundColor;
}

/** Add a page-level (outer-tree) stylesheet rule, as a host page's CSS would. */
function addPageRule(css: string): void {
  const style = document.createElement("style");
  style.dataset["testPageRule"] = "";
  style.textContent = css;
  document.head.appendChild(style);
}

describe("theming from the host page (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    for (const style of document.head.querySelectorAll("style[data-test-page-rule]")) {
      style.remove();
    }
  });

  it("keeps the built-in defaults when the page sets nothing", () => {
    const { el } = mountInWrapper();
    expect(bg(el, ".header")).toBe(DEFAULT_INDIGO);
    expect(bg(el, ".chat")).toBe("rgb(255, 255, 255)");
  });

  // The original defect in one assertion: this is the pattern the README
  // teaches, and it used to have no effect whatsoever.
  it("picks up a token set on an ancestor element", () => {
    const { el } = mountInWrapper({ "--ag-ui-header-bg": ANCESTOR_GREEN });
    expect(bg(el, ".header")).toBe(ANCESTOR_GREEN);
  });

  it("follows an ancestor token through a derived token", () => {
    // --ag-ui-header-bg is unset, so the header falls through to the accent;
    // the accent has to be read from the ancestor for that chain to work.
    const { el } = mountInWrapper({ "--ag-ui-accent": ANCESTOR_GREEN });
    expect(bg(el, ".header")).toBe(ANCESTOR_GREEN);
    expect(bg(el, ".send")).toBe(ANCESTOR_GREEN);
  });

  it("lets a rule aimed at the element beat one inherited from an ancestor", () => {
    addPageRule(`${ELEMENT_TAG} { --ag-ui-header-bg: ${ELEMENT_PLUM}; }`);
    const { el } = mountInWrapper({ "--ag-ui-header-bg": ANCESTOR_GREEN });
    expect(bg(el, ".header")).toBe(ELEMENT_PLUM);
  });

  it("lets an inline style on the element beat both", () => {
    addPageRule(`${ELEMENT_TAG} { --ag-ui-header-bg: ${PAGE_RULE_CREAM}; }`);
    const { el } = mountInWrapper({ "--ag-ui-header-bg": ANCESTOR_GREEN });
    el.style.setProperty("--ag-ui-header-bg", ELEMENT_PLUM);
    expect(bg(el, ".header")).toBe(ELEMENT_PLUM);
  });

  it("applies a built-in theme preset when the page overrides nothing", () => {
    const { el } = mountInWrapper({}, { theme: "dark" });
    expect(bg(el, ".chat")).toBe(DARK_PANEL);
  });

  it("lets an explicit page rule beat a built-in theme preset", () => {
    // Shadow-tree :host rules lose to outer-tree rules for normal declarations
    // regardless of specificity, so a page rule beat theme="dark" before this
    // change and has to keep doing so. Routing the preset blocks through the
    // public name is what preserves it: setting the private alias directly
    // would put the built-in theme above the page, the wrong way round.
    addPageRule(`${ELEMENT_TAG} { --ag-ui-bg: ${PAGE_RULE_CREAM}; }`);
    const { el } = mountInWrapper({}, { theme: "dark" });
    expect(bg(el, ".chat")).toBe(PAGE_RULE_CREAM);
  });

  it("lets an ancestor token beat a built-in theme preset", () => {
    const { el } = mountInWrapper({ "--ag-ui-bg": ANCESTOR_GREEN }, { theme: "dark" });
    expect(bg(el, ".chat")).toBe(ANCESTOR_GREEN);
  });

  it("resolves the code theme's font, the one preset that reads another token", () => {
    // theme="code" sets the font stack to --ag-ui-code-font, so its alias reads
    // a public token whose own alias reads a second public token. That two-hop
    // chain is the shape most likely to be broken by a bad conversion.
    const { el } = mountInWrapper({}, { theme: "code" });
    expect(getComputedStyle(el).fontFamily).toContain("ui-monospace");
    expect(bg(el, ".chat")).toBe("rgb(13, 17, 23)");

    const themed = mountInWrapper({ "--ag-ui-code-font": "Courier" }, { theme: "code" });
    expect(getComputedStyle(themed.el).fontFamily).toBe("Courier");
  });

  it("applies a density preset the page has not claimed, and yields when it does", () => {
    const { el } = mountInWrapper({}, { density: "compact" });
    expect(getComputedStyle(el).fontSize).toBe("13px");
    const themed = mountInWrapper({ "--ag-ui-font-size": "19px" }, { density: "compact" });
    expect(getComputedStyle(themed.el).fontSize).toBe("19px");
  });

  it("applies a placement preset the page has not claimed, and yields when it does", () => {
    const { el } = mountInWrapper({ "--ag-ui-max-width": "none" }, { placement: "side" });
    expect(getComputedStyle(el).width).toBe("420px");
    const themed = mountInWrapper(
      { "--ag-ui-max-width": "none", "--ag-ui-width": "300px" },
      { placement: "side" },
    );
    expect(getComputedStyle(themed.el).width).toBe("300px");
  });

  it("keeps the resize drag's inline width above the placement preset", () => {
    // resize_handle writes --ag-ui-width on the host as an inline style. That
    // has to outrank the placement preset's 420px and the ancestor's value,
    // or a drag would be undone by the page's own theming.
    const { el } = mountInWrapper(
      { "--ag-ui-max-width": "none", "--ag-ui-width": "300px" },
      { placement: "side" },
    );
    el.style.setProperty("--ag-ui-width", "640px");
    expect(getComputedStyle(el).width).toBe("640px");
  });

  it("keeps typography inheriting from the page by default", () => {
    // --ag-ui-font's default is the CSS-wide keyword `inherit`; it survives
    // being moved into a var() fallback only because a substituted CSS-wide
    // keyword is still honoured.
    const { el, wrapper } = mountInWrapper();
    wrapper.style.fontFamily = "Georgia";
    expect(getComputedStyle(el).fontFamily).toBe("Georgia");
  });

  it("lets an ancestor override the font stack outright", () => {
    const { el, wrapper } = mountInWrapper({ "--ag-ui-font": "Courier" });
    wrapper.style.fontFamily = "Georgia";
    expect(getComputedStyle(el).fontFamily).toBe("Courier");
  });

  it("reaches tokens that only a preset block declares", () => {
    // --ag-ui-rail-width is read solely under placement="sidebar"; it is one of
    // the tokens that was never in the defaults block at all.
    const { el } = mountInWrapper(
      { "--ag-ui-rail-width": "80px" },
      {
        placement: "sidebar",
        collapsed: "",
      },
    );
    expect(getComputedStyle(el).width).toBe("80px");
  });

  it("themes a message bubble and the list spacing from an ancestor", () => {
    const { el } = mountInWrapper({
      "--ag-ui-assistant-bg": ANCESTOR_GREEN,
      "--ag-ui-pad": "31px",
    });
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
    expect(getComputedStyle(shadowPart(el, ".messages")).padding).toBe("31px");
    expect(bg(el, ".message--assistant")).toBe(ANCESTOR_GREEN);
  });
});
