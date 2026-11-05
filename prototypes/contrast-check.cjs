// Contrast sanity pass for the design-revamp prototypes.
//
//   node prototypes/contrast-check.cjs > prototypes/contrast.json
//
// Loads each direction in each scheme with the scripted conversation on
// screen, then measures the rendered foreground of every text role the
// review cares about against the first opaque background behind it. Colours
// are resolved by painting them to a canvas, so color-mix, oklch and
// light-dark come back as the sRGB the screen shows.
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173/prototypes/";
const DIRECTIONS = [
  { key: "quiet", theme: "" },
  { key: "soft", theme: "soft" },
  { key: "ledger", theme: "ledger" },
  { key: "classic", theme: "classic" },
  // A mid-tone brand accent on the default theme, set the way a host would.
  { key: "quiet+brand", theme: "", override: "accent" },
];
// [role, selector, minimum ratio]. 4.5 for text, 3 for an icon.
const ROLES = [
  ["header title", ".header-title", 4.5],
  ["header button", ".header-btn", 3],
  ["assistant text", ".message--assistant", 4.5],
  ["user text", ".message--user", 4.5],
  ["thoughts toggle", ".thoughts-toggle", 4.5],
  ["tool card name", ".tool-call-name", 4.5],
  ["tool card pill (classic only)", ".tool-call-status", 4.5],
  ["step group label", ".tool-group-label", 4.5],
  ["step group failed", '.tool-group[data-state="error"] .tool-group-meta', 4.5],
  ["step done icon", '.tool-call[data-status="done"] .tool-call-icon', 3],
  ["chart legend", ".chart-legend", 4.5],
  ["confirm prompt", ".confirm-body, .confirm", 4.5],
  ["confirm primary", ".confirm-btn--confirm", 4.5],
  ["confirm secondary", ".confirm-btn:not(.confirm-btn--confirm)", 4.5],
  ["composer placeholder", ".input", 4.5],
  ["message action", ".message-action", 3],
];

async function measure(page, roles) {
  return page.evaluate((roles) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const lum = ([r, g, b]) => {
      const f = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const over = (top, under) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    // Every background from the element out to the page, composited.
    const background = (el) => {
      const layers = [];
      let node = el;
      while (node) {
        if (node.nodeType === 1) {
          const c = rgba(getComputedStyle(node).backgroundColor);
          if (c[3] > 0) layers.push(c);
          if (c[3] >= 1) break;
        }
        node = node.parentNode instanceof ShadowRoot ? node.parentNode.host : node.parentElement;
      }
      let result = [255, 255, 255, 1];
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };
    const root = document.querySelector("ag-ui-chat").shadowRoot;
    const out = [];
    for (const [role, selector, min] of roles) {
      const el = root.querySelector(selector);
      if (!el) continue;
      // The pill is visually hidden outside classic and code; it is there for
      // screen readers only, so its colour is not what anyone sees.
      if (role.startsWith("tool card pill") && el.closest(".tool-group")) continue;
      const style = getComputedStyle(el);
      const placeholder = selector === ".input";
      const fgCss = placeholder
        ? getComputedStyle(el, "::placeholder").color
        : style.color;
      const bg = background(el);
      const fg = over(rgba(fgCss), bg);
      const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
      const ratio = (l1 + 0.05) / (l2 + 0.05);
      out.push({ role, ratio: Math.round(ratio * 100) / 100, min, pass: ratio >= min });
    }
    return out;
  }, roles);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const results = {};
  await Promise.all(
    DIRECTIONS.flatMap((d) =>
      ["light", "dark"].map(async (scheme) => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
        const q = new URLSearchParams({ theme: d.theme, scheme, placement: "floating", run: "1" });
        if (d.override) q.set("override", d.override);
        await page.goto(`${BASE}?${q}`);
        await page.waitForFunction(
          () => document.querySelector("ag-ui-chat").shadowRoot.querySelector(".confirm:not([data-resolved])"),
          null,
          { timeout: 45_000 },
        );
        await page.waitForTimeout(600);
        results[`${d.key}-${scheme}`] = await measure(page, ROLES);
        await page.close();
      }),
    ),
  );
  await browser.close();
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
})();
