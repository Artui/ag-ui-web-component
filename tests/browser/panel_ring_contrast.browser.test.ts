import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The focus ring inside the panel holds 3:1 against the panel it is drawn on
 * (WCAG 2.4.13 and 1.4.11), whatever accent the host themes.
 *
 * The ring was the accent at 55% over transparent, so its contrast was the
 * accent's own: a light host accent such as #79aec8 measured 1.58:1 on the
 * default light panel. Colours are read as the ring and the panel resolve
 * inside the shadow tree, by a probe that inherits the chat's scheme, and
 * normalised to sRGB bytes through a canvas because Chromium serialises a
 * resolved color-mix() in its own space. A translucent ring is composited
 * over the panel before it is measured, which is what the eye sees.
 */

type Rgba = readonly [number, number, number, number];

function rgba(color: string): Rgba {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    throw new Error("expected a 2d context");
  }
  context.fillStyle = "rgba(0, 0, 0, 0)";
  context.fillStyle = color;
  context.clearRect(0, 0, 1, 1);
  context.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}

function over(top: Rgba, under: Rgba): Rgba {
  const alpha = top[3];
  const mix = (index: 0 | 1 | 2) => top[index] * alpha + under[index] * (1 - alpha);
  return [mix(0), mix(1), mix(2), 1];
}

function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** A custom property as the colour it resolves to inside the chat. */
function resolved(chat: AgUiChat, name: string): Rgba {
  const root = chat.shadowRoot;
  if (root === null) {
    throw new Error("expected an open shadow root");
  }
  const probe = document.createElement("span");
  probe.style.color = `var(${name})`;
  root.appendChild(probe);
  const color = rgba(getComputedStyle(probe).color);
  probe.remove();
  return color;
}

function mount(theme: string, accent: string | null): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  if (theme !== "") {
    el.setAttribute("theme", theme);
  }
  if (accent !== null) {
    el.style.setProperty("--ag-ui-accent", accent);
  }
  document.body.appendChild(el);
  return el;
}

function ringContrast(chat: AgUiChat): number {
  const panel = resolved(chat, "--_bg");
  return contrast(over(resolved(chat, "--_ring"), panel), panel);
}

const THEMES = [
  "",
  "dark",
  "soft",
  "soft dark",
  "ledger",
  "ledger dark",
  "classic",
  "classic dark",
  "code",
] as const;

const ACCENTS = [
  null,
  "#79aec8",
  "#264b5d",
  "#ffffff",
  "#000000",
  "#ffff00",
  "#00ffff",
  "#0000ff",
  "#ff0000",
  "#c0c0c0",
  "#808080",
  "#404040",
] as const;

describe("panel focus ring contrast (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it.each(["#79aec8", "#264b5d"])(
    "holds 3:1 on the default light panel for the host accent %s",
    (accent) => {
      expect(ringContrast(mount("", accent))).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(THEMES.flatMap((theme) => ACCENTS.map((accent) => [theme, accent] as const)))(
    "holds 3:1 under theme %j with accent %s",
    (theme, accent) => {
      expect(ringContrast(mount(theme, accent))).toBeGreaterThanOrEqual(3);
    },
  );

  it("still takes a host's --ag-ui-ring as it is", () => {
    const chat = mount("", "#79aec8");
    chat.style.setProperty("--ag-ui-ring", "rgb(0, 128, 0)");

    expect(resolved(chat, "--_ring")).toEqual([0, 128, 0, 1]);
  });
});
