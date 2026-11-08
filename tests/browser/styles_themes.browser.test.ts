import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cdp, userEvent } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { ToolCallCard } from "../../src/ui/progress/tool_call_card.js";
import { STYLES } from "../../src/ui/styles.js";
import { makeFakeAgent } from "../helpers/fake_agent.js";

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
  // Set rather than left to the default, so a tool card shows what these tests read.
  el.setAttribute("data-tool-display", "full");
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

/** The colour an element resolves for `var(<token>)`, read from a probe appended into its shadow root. */
function tokenColour(el: AgUiChat, token: string): Rgba {
  const probe = document.createElement("span");
  // A sentinel fallback: an undefined token would otherwise inherit the host's
  // text colour, which is what several tokens read here are expected to equal.
  probe.style.color = `var(${token}, rgb(1, 2, 3))`;
  el.shadowRoot?.appendChild(probe);
  return ink(probe);
}

/** One sent message, answered by nothing: the user's own turn in the real transcript. */
async function sendOne(el: AgUiChat, text = "hello"): Promise<HTMLElement> {
  const input = part(el, ".input") as HTMLTextAreaElement;
  input.value = text;
  part(el, ".send").click();
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return part(el, ".message--user");
}

/** A mounted element whose agent answers a send with a bare run. */
function mountWithAgent(attrs: Record<string, string> = {}): AgUiChat {
  return mount(attrs, (e) => {
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.runEnd();
      },
    });
    e.agentFactory = () => handle.agent;
  });
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

const QUIET = {
  light: { bg: "#ffffff", fg: "#1b1b1d", accent: "#232326" },
  dark: { bg: "#161618", fg: "#ececee", accent: "#f0f0f2" },
} as const;

describe("quiet's three seeds, per scheme (real browser)", () => {
  // Quiet is three light-dark() seeds and a set of mixes. The user's turn is the
  // accent at 12% over the panel, so a mix taken from the text colour instead
  // lands a byte away from it, and halves of the accent that trade places draw
  // a pale send button on the light panel: both read as "a grey wash" at a glance.
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["light", "dark"] as const)(
    "draws the accent as the %s half in that scheme",
    (scheme) => {
      const el = mount({ theme: scheme });
      expect(getComputedStyle(el).colorScheme).toBe(scheme);
      expect(background(el, ".send")).toEqual(rgba(QUIET[scheme].accent));
      expect(tokenColour(el, "--_accent")).toEqual(rgba(QUIET[scheme].accent));
    },
  );

  it.each(["light", "dark"] as const)(
    "mixes the user's turn from the accent over the panel in the %s scheme",
    async (scheme) => {
      const { accent, bg } = QUIET[scheme];
      const el = mountWithAgent({ theme: scheme });
      const bubble = await sendOne(el);
      expect(background(el, ".message--user")).toEqual(
        rgba(`color-mix(in oklch, ${accent} 12%, ${bg})`),
      );
      expect(bubble.textContent).toContain("hello");
    },
  );

  // The two seeds are a few bytes apart, so the default colours alone could not
  // tell the accent from the text colour. A brand accent can.
  it.each(["light", "dark"] as const)(
    "tints the user's turn with a host's brand accent in the %s scheme",
    async (scheme) => {
      const el = mountWithAgent({ theme: scheme, style: `--ag-ui-accent: ${BRAND_ORANGE}` });
      await sendOne(el);
      expect(background(el, ".message--user")).toEqual(
        rgba(`color-mix(in oklch, ${BRAND_ORANGE} 12%, ${QUIET[scheme].bg})`),
      );
    },
  );
});

describe("the chart series colours, per theme and scheme (real browser)", () => {
  // Read through a probe: a custom property read back is its token stream, and
  // the light-dark() inside it is only resolved where it is used as a colour.
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Which token each theme's first series follows. The fg and the accent are a
  // few bytes apart under Quiet and Ledger, so the pair is asserted unequal
  // wherever a mutant could swap them and not be seen.
  it.each([
    ["", "--_fg"],
    ["dark", "--_fg"],
    ["ledger", "--_fg"],
    ["ledger dark", "--_fg"],
    ["soft", "--_accent"],
    ["soft dark", "--_accent"],
  ])("draws the first series of theme %j in the colour of %s", (theme, token) => {
    const el = mount(theme === "" ? {} : { theme });
    expect(tokenColour(el, "--_chart-1")).toEqual(tokenColour(el, token));
    // And it is not the other seed, which a swap would leave it on.
    const other = token === "--_fg" ? "--_accent" : "--_fg";
    expect(tokenColour(el, "--_chart-1")).not.toEqual(tokenColour(el, other));
  });

  it.each([
    ["", QUIET.light.fg],
    ["dark", QUIET.dark.fg],
  ])("draws Quiet's first series, theme %j, as its text seed %s", (theme, seed) => {
    expect(tokenColour(mount(theme === "" ? {} : { theme }), "--_chart-1")).toEqual(rgba(seed));
  });

  it.each(["classic", "classic dark", "code"])(
    "draws the first series of theme %j as classic's blue",
    (theme) => {
      expect(tokenColour(mount({ theme }), "--_chart-1")).toEqual(rgba("#4f7cff"));
    },
  );

  it("keeps Quiet's first series on the text colour when the accent changes", () => {
    const el = mount({ theme: "dark", style: `--ag-ui-accent: ${BRAND_ORANGE}` });
    expect(tokenColour(el, "--_chart-1")).toEqual(rgba(QUIET.dark.fg));
    expect(tokenColour(el, "--_chart-1")).not.toEqual(BRAND_ORANGE_RGB);
  });
});

describe("the code theme's scheme (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("draws the code theme in the dark scheme, as classic's structure assumes", () => {
    // Code is dark only and its colours are fixed, so what shows the scheme is
    // a light-dark() it did not override.
    const el = mount({ theme: "code" });
    expect(getComputedStyle(el).colorScheme).toBe("dark");
    const probe = document.createElement("span");
    probe.style.color = "light-dark(rgb(1, 2, 3), rgb(4, 5, 6))";
    el.shadowRoot?.appendChild(probe);
    expect(ink(probe)).toEqual([4, 5, 6, 1]);
  });
});

describe("classic's contrast fixes (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  // Every state the pill can show, not the one the card settles into most
  // often: the generic rule is what lifts pending, declined and interrupted
  // (the muted ink alone measured 3.61:1), and each of the rest has a rule of
  // its own that could go the same way.
  const PILL_STATUSES = [
    "pending",
    "deferred",
    "done",
    "error",
    "declined",
    "interrupted",
  ] as const;

  /** A card in the real transcript, in the given state. */
  function cardIn(el: AgUiChat, status: (typeof PILL_STATUSES)[number]): HTMLElement {
    const card = new ToolCallCard("create_event", { title: "Design sync" }, "Create event");
    if (status === "deferred") {
      card.mark("deferred");
    } else if (status !== "pending") {
      card.settle(status, "result");
    }
    part(el, ".messages").appendChild(card.element);
    expect(card.element.getAttribute("data-status")).toBe(status);
    return card.element;
  }

  for (const scheme of ["light", "dark"]) {
    for (const status of PILL_STATUSES) {
      it(`draws the ${status} status pill at 4.5:1 in the ${scheme} scheme`, () => {
        const el = mount({ theme: `classic ${scheme}` });
        const card = cardIn(el, status);
        const pill = card.querySelector(".tool-call-status");
        if (pill === null) {
          throw new Error("expected the status pill");
        }
        // The pill is a translucent wash over the card, which is opaque.
        const cardFill = rgba(getComputedStyle(card).backgroundColor);
        const pillFill = over(rgba(getComputedStyle(pill).backgroundColor), cardFill);
        expect(contrast(ink(pill), pillFill)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  // The lift above is a mix toward the text colour, not a grey: three states
  // keep a rule of their own so each stays recognisably itself, and nothing
  // else above would notice one of them going.
  for (const scheme of ["light", "dark"]) {
    it(`keeps the deferred, done and error pills each their own colour in the ${scheme} scheme`, () => {
      const el = mount({ theme: `classic ${scheme}` });
      const inks = (["pending", "deferred", "done", "error"] as const).map((status) => {
        const pill = cardIn(el, status).querySelector(".tool-call-status");
        if (pill === null) {
          throw new Error("expected the status pill");
        }
        return ink(pill).join(",");
      });
      expect(new Set(inks).size).toBe(4);
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

  it("keeps the indigo user bubble whatever the host's accent", () => {
    const el = mount({ theme: "classic", style: `--ag-ui-accent: ${BRAND_ORANGE}` });
    const userBg = getComputedStyle(el).getPropertyValue("--_user-bg").trim();
    expect(rgba(userBg)).toEqual([79, 70, 229, 1]);
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
   * The built-in sheet as an engine without relative colour syntax applies
   * it (Firefox 120 to 127, Safari 17.5 and 17.6): the two blocks that ask for
   * it deleted, the text on the accent's and the header buttons' hover
   * square's, and the block that asks for its absence unwrapped in place.
   * Edited in a parsed sheet rather than in the source text, and counted, so
   * a change to any condition cannot leave this testing the full sheet under
   * another name.
   */
  function relativeColourBlocks(styles: CSSStyleSheet): CSSSupportsRule[] {
    return [...styles.cssRules].filter(
      (rule): rule is CSSSupportsRule =>
        rule instanceof CSSSupportsRule && /(?:color|rgb)\(from/.test(rule.conditionText),
    );
  }

  function withoutRelativeColour(): CSSStyleSheet {
    const edited = sheet(STYLES);
    const blocks = relativeColourBlocks(edited);
    const present = blocks.filter((block) => !block.conditionText.startsWith("not "));
    expect(present).toHaveLength(2);
    // Last first, so each index still names the block it was read from.
    for (const block of blocks.reverse()) {
      const index = [...edited.cssRules].indexOf(block);
      const inner = [...block.cssRules].map((rule) => rule.cssText);
      edited.deleteRule(index);
      if (block.conditionText.startsWith("not ")) {
        for (const [offset, text] of inner.entries()) {
          edited.insertRule(text, index + offset);
        }
      }
    }
    return edited;
  }

  it("negates the computing block exactly where a theme falls back", () => {
    // Two conditions spelled twice: if they drifted apart, an engine could
    // apply both blocks or neither.
    const blocks = relativeColourBlocks(sheet(STYLES));
    const absent = blocks.filter((block) => block.conditionText.startsWith("not "));
    const computing = blocks.find(
      (block) => !absent.includes(block) && block.conditionText.includes("color(from"),
    );
    expect(absent.map((block) => block.conditionText)).toEqual([`not ${computing?.conditionText}`]);
  });

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

  // The other thing behind relative colour syntax. The square is the opposite
  // of the header text where it can be computed, and mixed from the text itself
  // where it cannot, which the white on this blue pays for: 5.1:1 falls to 3.75:1.
  it("mixes the header buttons' hover square from the header text without relative colour syntax", async () => {
    const el = mount({ placement: "floating", "data-start-open": "" }, (e) => {
      e.style.setProperty("--ag-ui-header-bg", "#3d5afe");
      e.style.setProperty("--ag-ui-header-fg", "#ffffff");
    });
    if (el.shadowRoot === null) {
      throw new Error("expected a shadow root");
    }
    el.shadowRoot.adoptedStyleSheets = [withoutRelativeColour()];
    const button = part(el, ".header-btn--history");
    await userEvent.hover(button);
    // A pointer left over the panel reveals the next test's hover-only rows.
    try {
      expect(button.matches(":hover")).toBe(true);
      const square = rgba(getComputedStyle(button).backgroundColor);
      expect(square).toEqual(rgba("color-mix(in srgb, #ffffff 18%, transparent)"));
      expect(contrast(WHITE, over(square, rgba("#3d5afe")))).toBeCloseTo(3.75, 2);
    } finally {
      await userEvent.hover(document.body, { position: { x: 1, y: 1 } });
    }
  });

  // Where it can compute, the pick matches the fallback's side on every
  // built-in accent but code's green, where white measures 2.5:1 and black
  // 8.3:1.
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

  it("draws code's send icon in black on its green", () => {
    const send = part(mount({ theme: "code" }), ".send");
    const fill = rgba(getComputedStyle(send).backgroundColor);
    expect(fill).toEqual([63, 185, 80, 1]);
    expect(ink(send)).toEqual(BLACK);
    expect(contrast(BLACK, fill)).toBeCloseTo(8.3, 1);
    expect(contrast(WHITE, fill)).toBeCloseTo(2.5, 1);
  });

  it("keeps the computed pick over classic's fallback on a pale host accent", () => {
    // Classic's white is set only where the pick cannot be computed, so a
    // pale brand accent still gets dark text wherever it can.
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

describe("one action row per answer (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  /** One run that answers in two bubbles with a tool call between them. */
  async function interimTurn(theme: string): Promise<HTMLElement[]> {
    const el = mount({ theme }, (e) => {
      const handle = makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          emit.textStart("message-1");
          emit.textEnd("Let me look that up.", "message-1");
          emit.toolCall("call-1", "lookup_docs", { q: "settlement" });
          emit.toolResult("call-1", "three mentions");
          emit.textStart("message-2");
          emit.textEnd("It is mentioned three times.", "message-2");
          emit.runEnd();
        },
      });
      e.agentFactory = () => handle.agent;
    });
    const input = part(el, ".input") as HTMLTextAreaElement;
    input.value = "check the handbook";
    part(el, ".send").click();
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    expect(el.shadowRoot?.querySelectorAll(".message--assistant")).toHaveLength(2);
    return [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".message-actions") ?? [])];
  }

  it("hides the row under an interim bubble and keeps the last one", async () => {
    const rows = await interimTurn("quiet");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.getBoundingClientRect().height > 0)).toEqual([false, true]);
  });

  it("keeps every row under classic", async () => {
    const rows = await interimTurn("classic");
    expect(rows.map((row) => row.getBoundingClientRect().height > 0)).toEqual([true, true]);
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

  describe("with no scheme word, from the scheme the panel is drawn in", () => {
    const HOST_DARK = "ag-ui-chat { color-scheme: dark; }";

    function pageRule(css: string): void {
      const style = document.createElement("style");
      style.setAttribute("data-test-page-rule", "");
      style.textContent = css;
      document.head.append(style);
    }

    const darkSystem = (): Promise<unknown> =>
      cdp().send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-color-scheme", value: "dark" }],
      });

    /** The scheme the glyph offers: the sun is the only mark with a circle. */
    const offers = (el: AgUiChat): string =>
      part(el, ".header-btn--theme").querySelector("circle") === null ? "dark" : "light";

    /** The saved scheme, under whatever namespace the element's endpoint gives it. */
    const saved = (): string | null => {
      const key = Object.keys(localStorage).find((name) => name.startsWith("ag-ui-chat:theme"));
      return key === undefined ? null : localStorage.getItem(key);
    };

    /** The panel's text, which a scheme inherited from the host would get wrong. */
    const ink = (el: AgUiChat): number =>
      luminance(rgba(getComputedStyle(part(el, ".chat")).color));

    beforeEach(() => {
      sessionStorage.clear();
      localStorage.clear();
    });

    afterEach(async () => {
      sessionStorage.clear();
      localStorage.clear();
      for (const style of document.head.querySelectorAll("style[data-test-page-rule]")) {
        style.remove();
      }
      await cdp().send("Emulation.setEmulatedMedia", { features: [] });
    });

    it.each([
      ["auto on a dark system", { theme: "auto" }, darkSystem],
      ["a host rule on the element", {}, async () => pageRule(HOST_DARK)],
      ["a host rule beside a theme name", { theme: "soft" }, async () => pageRule(HOST_DARK)],
    ] as ReadonlyArray<
      readonly [string, Readonly<Record<string, string>>, () => Promise<unknown>]
    >)("turns a dark panel light on the first press, under %s", async (_case, attrs, setUp) => {
      await setUp();
      const el = mount({ ...attrs, "data-theme-toggle": "" });
      const dark = attrs["theme"] === "soft" ? SOFT_DARK_BG : QUIET_DARK_BG;
      const light = attrs["theme"] === "soft" ? SOFT_LIGHT_BG : QUIET_LIGHT_BG;
      expect(background(el, ".chat")).toEqual(dark);
      expect(offers(el)).toBe("light");

      part(el, ".header-btn--theme").click();
      expect(el.getAttribute("theme")).toBe(attrs["theme"] === "soft" ? "soft light" : "light");
      expect(saved()).toBe("light");
      expect(background(el, ".chat")).toEqual(light);
      expect(ink(el)).toBeLessThan(0.1);
      expect(offers(el)).toBe("dark");

      part(el, ".header-btn--theme").click();
      expect(saved()).toBe("dark");
      expect(background(el, ".chat")).toEqual(dark);
      expect(ink(el)).toBeGreaterThan(0.7);
      expect(offers(el)).toBe("light");
    });

    it("restores a saved light over a host rule that draws the element dark", () => {
      pageRule(HOST_DARK);
      sessionStorage.setItem("ag-ui-chat:theme", "light");
      const el = mount({ "data-theme-toggle": "" });
      expect(el.getAttribute("theme")).toBe("light");
      expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
      expect(offers(el)).toBe("dark");
    });

    it("turns a panel a host rule draws light dark on the first press, on a dark system", async () => {
      await darkSystem();
      pageRule("ag-ui-chat { color-scheme: light; }");
      const el = mount({ "data-theme-toggle": "" });
      expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
      expect(offers(el)).toBe("dark");
      part(el, ".header-btn--theme").click();
      expect(el.getAttribute("theme")).toBe("dark");
      expect(saved()).toBe("dark");
      expect(background(el, ".chat")).toEqual(QUIET_DARK_BG);
      expect(ink(el)).toBeGreaterThan(0.7);
      expect(offers(el)).toBe("light");
    });

    it("offers dark on a light panel: the default, and auto on a light system", () => {
      expect(offers(mount({ "data-theme-toggle": "" }))).toBe("dark");
      expect(offers(mount({ theme: "auto", "data-theme-toggle": "" }))).toBe("dark");
    });

    it("lets the system pick when a host rule allows both schemes", async () => {
      await darkSystem();
      pageRule("ag-ui-chat { color-scheme: light dark; }");
      const el = mount({ "data-theme-toggle": "" });
      expect(background(el, ".chat")).toEqual(QUIET_DARK_BG);
      expect(offers(el)).toBe("light");
      part(el, ".header-btn--theme").click();
      expect(el.getAttribute("theme")).toBe("light");
      expect(background(el, ".chat")).toEqual(QUIET_LIGHT_BG);
    });
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
