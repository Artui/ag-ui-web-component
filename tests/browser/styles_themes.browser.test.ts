import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";
import { STYLES } from "../../src/ui/styles.js";

/**
 * The theme attribute, resolved against a real cascade.
 *
 * `theme` is words matched with ~=: an optional theme name and an optional
 * scheme. The colours are light-dark() seeds and color-mix() derivations, and
 * the scheme is one color-scheme property, so every assertion here is on a
 * computed colour. happy-dom resolves none of light-dark(), color-mix() or a
 * chained var() fallback, which is why this lives in the Chromium project.
 *
 * Colours are compared as sRGB bytes read back from a canvas, because Chromium
 * serialises a color-mix() result in the mixing space rather than as rgb().
 */

type Rgba = readonly [number, number, number, number];

const QUIET_LIGHT_BG: Rgba = [255, 255, 255, 1];
const QUIET_DARK_BG: Rgba = [22, 22, 24, 1];
const SOFT_LIGHT_BG: Rgba = [253, 252, 255, 1];
const SOFT_DARK_BG: Rgba = [23, 22, 29, 1];
const BRAND_ORANGE = "#c2410c";
const BRAND_ORANGE_RGB: Rgba = [194, 65, 12, 1];

function mount(
  attrs: Record<string, string> = {},
  before: (el: AgUiChat) => void = () => {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  before(el);
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

/** Any CSS colour as sRGB bytes and alpha, by painting it. */
function rgba(color: string): Rgba {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("expected a 2d context");
  }
  context.fillStyle = color;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, Math.round((a / 255) * 100) / 100];
}

/** `top` composited over the opaque `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  const alpha = top[3];
  const mix = (index: 0 | 1 | 2): number => top[index] * alpha + under[index] * (1 - alpha);
  return [mix(0), mix(1), mix(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const channel = (value: number): number => {
    const v = value / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

function background(el: AgUiChat, selector: string): Rgba {
  return rgba(getComputedStyle(part(el, selector)).backgroundColor);
}

function ink(element: Element, pseudo: string | null = null): Rgba {
  return rgba(getComputedStyle(element, pseudo).color);
}

/** A settled tool card, appended into the real transcript so it inherits the cascade. */
function doneCard(el: AgUiChat): HTMLElement {
  const card = new ToolCallCard("create_event", { title: "Design sync" }, "Create event");
  card.settle("done", "ok");
  part(el, ".messages").appendChild(card.element);
  return card.element;
}

function addPageRule(css: string): void {
  const style = document.createElement("style");
  style.dataset["testPageRule"] = "";
  style.textContent = css;
  document.head.appendChild(style);
}

function sheet(css: string): CSSStyleSheet {
  const made = new CSSStyleSheet();
  made.replaceSync(css);
  return made;
}

describe("theme resolution (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    for (const style of document.head.querySelectorAll("style[data-test-page-rule]")) {
      style.remove();
    }
    await cdp().send("Emulation.setEmulatedMedia", { features: [] });
  });

  it("is the default theme, light, when the attribute is absent", () => {
    const el = mount();
    expect(getComputedStyle(el).colorScheme).toBe("light");
    expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
    // Quiet's own structure: no rule over the composer.
    expect(getComputedStyle(part(el, ".input-row")).borderTopStyle).toBe("none");
  });

  it("reads dark alone as the default theme in the dark scheme", () => {
    const el = mount({ theme: "dark" });
    expect(getComputedStyle(el).colorScheme).toBe("dark");
    expect(background(el, ".chat")).toEqual(QUIET_DARK_BG);
  });

  it("puts a named theme in the scheme beside it, in either order", () => {
    expect(background(mount({ theme: "soft dark" }), ".chat")).toEqual(SOFT_DARK_BG);
    expect(background(mount({ theme: "dark soft" }), ".chat")).toEqual(SOFT_DARK_BG);
    expect(background(mount({ theme: "soft" }), ".chat")).toEqual(SOFT_LIGHT_BG);
  });

  it("follows the system under auto", async () => {
    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "dark" }],
    });
    const el = mount({ theme: "auto" });
    expect(background(el, ".chat")).toEqual(QUIET_DARK_BG);

    await cdp().send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: "light" }],
    });
    expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
  });

  it("resolves an unknown word to the default theme, structure included", () => {
    const el = mount({ theme: "acme" });
    expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
    expect(getComputedStyle(part(el, ".input-row")).borderTopStyle).toBe("none");
    // The header is the panel, not classic's indigo band.
    expect(background(el, ".header")).toEqual(QUIET_LIGHT_BG);
  });

  it("starts a host's own word from the built-in theme beside it", () => {
    const el = mount({ theme: "soft acme" });
    expect(background(el, ".chat")).toEqual(SOFT_LIGHT_BG);
    // Soft's structure as well as its colours.
    expect(getComputedStyle(part(el, ".composer")).borderTopLeftRadius).toBe("22px");
  });

  it("lets a host's per-theme token rule win over the theme's own value", () => {
    addPageRule(`${ELEMENT_TAG}[theme~="soft"] { --ag-ui-accent: ${BRAND_ORANGE}; }`);
    const soft = mount({ theme: "soft dark" });
    const quiet = mount();
    expect(background(soft, ".send")).toEqual(BRAND_ORANGE_RGB);
    // Scoped to the theme it names.
    expect(background(quiet, ".send")).not.toEqual(BRAND_ORANGE_RGB);
  });

  it("draws text on a mid-tone accent at 4.5:1 in the dark scheme", () => {
    // Indigo 500 is the hard case: the dark scheme's fallback, near-black, is
    // 4.2:1 on it, and white is 4.47:1. Only black clears 4.5:1. The accent
    // is set before mounting: the send button transitions its fill, so a
    // change on a rendered element reads back the old colour for a while.
    const indigo: Rgba = [99, 102, 241, 1];
    const el = mount({ theme: "dark" }, (e) => {
      e.style.setProperty("--ag-ui-accent", "#6366f1");
    });
    const send = part(el, ".send");
    expect(rgba(getComputedStyle(send).backgroundColor)).toEqual(indigo);
    expect(contrast(ink(send), indigo)).toBeGreaterThanOrEqual(4.5);
  });

  it("draws white on a dark accent, whatever the scheme", () => {
    const el = mount({ theme: "dark" }, (e) => {
      e.style.setProperty("--ag-ui-accent", "#3730a3");
    });
    expect(ink(part(el, ".send"))).toEqual([255, 255, 255, 1]);
  });

  it("draws dark text on a pale accent, whatever the scheme", () => {
    const el = mount({ theme: "light" }, (e) => {
      e.style.setProperty("--ag-ui-accent", "#fde68a");
    });
    const send = part(el, ".send");
    expect(
      contrast(ink(send), rgba(getComputedStyle(send).backgroundColor)),
    ).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps a host's own on-accent colour over the derived one", () => {
    const el = mount({ theme: "dark" });
    el.style.setProperty("--ag-ui-on-accent", "rgb(1, 2, 3)");
    expect(ink(part(el, ".send"))).toEqual([1, 2, 3, 1]);
  });
});

describe("classic's contrast fixes (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  for (const scheme of ["light", "dark"]) {
    it(`draws the status pill at 4.5:1 in the ${scheme} scheme`, () => {
      const el = mount({ theme: `classic ${scheme}` });
      const card = doneCard(el);
      const status = card.querySelector(".tool-call-status");
      if (status === null) {
        throw new Error("expected the status pill");
      }
      // The pill is a translucent wash over the card, which is opaque.
      const cardFill = rgba(getComputedStyle(card).backgroundColor);
      const pillFill = over(rgba(getComputedStyle(status).backgroundColor), cardFill);
      expect(contrast(ink(status), pillFill)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("draws the tool name at 4.5:1 on the dark card", () => {
    const el = mount({ theme: "classic dark" });
    const card = doneCard(el);
    const name = card.querySelector(".tool-call-name");
    if (name === null) {
      throw new Error("expected the tool name");
    }
    const cardFill = rgba(getComputedStyle(card).backgroundColor);
    expect(contrast(ink(name), cardFill)).toBeGreaterThanOrEqual(4.5);
    // The light scheme keeps the indigo it always had.
    el.setAttribute("theme", "classic");
    expect(ink(name)).toEqual([79, 70, 229, 1]);
  });

  it("draws the composer placeholder at 4.5:1 in the dark scheme", () => {
    const el = mount({ theme: "classic dark" });
    const field = part(el, ".input");
    const fill = rgba(getComputedStyle(part(el, ".composer")).backgroundColor);
    expect(contrast(ink(field, "::placeholder"), fill)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("text on the accent (real browser)", () => {
  const WHITE: Rgba = [255, 255, 255, 1];
  const BLACK: Rgba = [0, 0, 0, 1];
  const NEAR_BLACK: Rgba = [17, 17, 17, 1];

  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  /**
   * The built-in sheet with the relative colour block deleted, which is the
   * sheet an engine without relative colour syntax applies: Firefox 120 to
   * 127, and Safari 17.5. Deleted from a parsed sheet rather than cut out of
   * the source text, and counted, so a change to the block's condition cannot
   * leave this testing the full sheet under another name.
   */
  function withoutRelativeColour(): CSSStyleSheet {
    const stripped = sheet(STYLES);
    const blocks = [...stripped.cssRules].flatMap((rule, index) =>
      rule instanceof CSSSupportsRule && rule.conditionText.includes("color(from") ? [index] : [],
    );
    expect(blocks).toHaveLength(1);
    stripped.deleteRule(blocks[0] as number);
    return stripped;
  }

  /** The colour the element resolves for text on its accent, read from a probe. */
  function onAccent(el: AgUiChat): Rgba {
    const probe = document.createElement("span");
    probe.style.color = "var(--_on-accent)";
    el.shadowRoot?.appendChild(probe);
    return ink(probe);
  }

  // Without relative colour syntax each theme falls back to a fixed colour.
  // Quiet, Soft and Ledger take the scheme's, which is the right pick for
  // their own accents in both schemes; classic and code take white, the one
  // colour they always drew.
  it.each([
    ["", WHITE],
    ["dark", NEAR_BLACK],
    ["soft", WHITE],
    ["soft dark", NEAR_BLACK],
    ["ledger", WHITE],
    ["ledger dark", NEAR_BLACK],
    ["classic", WHITE],
    ["classic dark", WHITE],
    ["code", WHITE],
  ])("falls back for theme %j without relative colour syntax", (theme, expected) => {
    const el = mount(theme === "" ? {} : { theme });
    if (el.shadowRoot === null) {
      throw new Error("expected a shadow root");
    }
    el.shadowRoot.adoptedStyleSheets = [withoutRelativeColour()];
    expect(onAccent(el)).toEqual(expected);
  });

  // Where it can compute, the pick matches the fallback's side on every
  // built-in accent but code's green, where white measures 2.4:1 and black
  // 8.7:1.
  it.each([
    ["", WHITE],
    ["dark", BLACK],
    ["soft", WHITE],
    ["soft dark", BLACK],
    ["ledger", WHITE],
    ["ledger dark", BLACK],
    ["classic", WHITE],
    ["classic dark", WHITE],
    ["code", BLACK],
  ])("computes the pick for theme %j from its accent", (theme, expected) => {
    expect(onAccent(mount(theme === "" ? {} : { theme }))).toEqual(expected);
  });

  it("keeps the computed pick over classic's fallback on a pale host accent", () => {
    // Classic's white fallback is a seed the computed rule reads past, not a
    // value set over it, so a pale brand accent still gets dark text.
    const el = mount({ theme: "classic dark" }, (e) => {
      e.style.setProperty("--ag-ui-accent", "#fde68a");
    });
    expect(onAccent(el)).toEqual(BLACK);
  });
});

describe("which structure each theme wears (real browser)", () => {
  // Two rules stand for the two host selectors every theme module hangs off.
  // Quiet alone sets font features on the panel; every theme but classic and
  // code hides the status pill behind its icon. Each theme gets its own case,
  // so dropping any one word from either selector fails the case named for it.
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  function wears(theme: string): { quietType: boolean; iconStatus: boolean } {
    const el = mount(theme === "" ? {} : { theme });
    const status = doneCard(el).querySelector(".tool-call-status");
    if (status === null) {
      throw new Error("expected the status pill");
    }
    return {
      quietType: getComputedStyle(part(el, ".chat")).fontFeatureSettings !== "normal",
      iconStatus: getComputedStyle(status).position === "absolute",
    };
  }

  it("gives quiet its own structure and the shared one", () => {
    expect(wears("")).toEqual({ quietType: true, iconStatus: true });
  });

  it("gives soft the shared structure and none of quiet's", () => {
    expect(wears("soft")).toEqual({ quietType: false, iconStatus: true });
  });

  it("gives ledger the shared structure and none of quiet's", () => {
    expect(wears("ledger")).toEqual({ quietType: false, iconStatus: true });
  });

  it("gives classic neither", () => {
    expect(wears("classic")).toEqual({ quietType: false, iconStatus: false });
  });

  it("gives code neither", () => {
    expect(wears("code")).toEqual({ quietType: false, iconStatus: false });
  });
});

describe("the theme toggle (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("flips only the scheme word, keeping the theme and the host's words", () => {
    const el = mount({ theme: "soft acme", "data-theme-toggle": "" });
    const toggle = part(el, ".header-btn--theme");

    toggle.click();
    expect(el.getAttribute("theme")).toBe("soft acme dark");
    expect(background(el, ".chat")).toEqual(SOFT_DARK_BG);

    toggle.click();
    expect(el.getAttribute("theme")).toBe("soft acme light");
    expect(background(el, ".chat")).toEqual(SOFT_LIGHT_BG);
  });

  it("leaves auto for dark, an explicit choice", () => {
    const el = mount({ theme: "ledger auto", "data-theme-toggle": "" });
    part(el, ".header-btn--theme").click();
    expect(el.getAttribute("theme")).toBe("ledger dark");
  });
});

describe("extraStyles (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // .header is one class, the same specificity as the built-in .header rule.
  const RED_HEADER = ".header { background: rgb(200, 0, 0); }";

  it("adopts the host's sheets after the built-in one, so they win at equal specificity", () => {
    const extra = sheet(RED_HEADER);
    const el = mount({}, (e) => {
      e.extraStyles = [extra];
    });
    const adopted = el.shadowRoot?.adoptedStyleSheets ?? [];
    expect(adopted).toHaveLength(2);
    expect(adopted[1]).toBe(extra);
    expect(background(el, ".header")).toEqual([200, 0, 0, 1]);
  });

  it("re-adopts at once when set on a rendered element, and copies the array", () => {
    const el = mount();
    const before = background(el, ".header");
    const sheets = [sheet(RED_HEADER)];
    el.extraStyles = sheets;
    expect(background(el, ".header")).toEqual([200, 0, 0, 1]);

    // Mutating the array that was passed changes nothing until it is set again.
    sheets.pop();
    expect(el.extraStyles).toHaveLength(1);
    expect(background(el, ".header")).toEqual([200, 0, 0, 1]);

    el.extraStyles = [];
    expect(el.shadowRoot?.adoptedStyleSheets).toHaveLength(1);
    expect(background(el, ".header")).toEqual(before);
  });

  it("is per element", () => {
    const styled = mount({}, (e) => {
      e.extraStyles = [sheet(RED_HEADER)];
    });
    const plain = mount();
    expect(background(styled, ".header")).toEqual([200, 0, 0, 1]);
    expect(background(plain, ".header")).not.toEqual([200, 0, 0, 1]);
    expect(plain.extraStyles).toEqual([]);
  });
});
