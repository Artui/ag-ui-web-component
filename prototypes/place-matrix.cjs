// Screenshot matrix for the page-context prototype.
//
//   pnpm build && PORT=5180 HOST=127.0.0.1 node demo/mock-server.mjs &
//   BASE_URL=http://localhost:5180/prototypes/place/ node prototypes/place-matrix.cjs
//
// The matrix is every placement in Quiet and classic, light and dark, with the
// chip in the composer's tool row after one "Where am I?" turn, so each shot
// also shows the agent quoting the place it was sent. The variants after it
// compare positions, the slot beside the chip, the excluded state, a long
// label, the route-map fallback, the greeting layout, a phone and the
// collapsed surfaces.
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5180/prototypes/place/";
const OUT = process.argv[2] ?? join(__dirname, "place-shots");
const DESKTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const THEMES = [
  { key: "quiet", theme: "" },
  { key: "classic", theme: "classic" },
];
const SCHEMES = ["light", "dark"];
const PLACEMENTS = ["floating", "bottom-left", "side", "sidebar", "full", "page", "embedded"];

const cells = [];
for (const placement of PLACEMENTS) {
  for (const t of THEMES) {
    for (const scheme of SCHEMES) {
      cells.push({
        name: `${placement}-${t.key}-${scheme}`,
        query: { theme: t.theme, scheme, placement, pos: "tools", run: "where" },
      });
    }
  }
}
const variants = [
  ["pos-row-floating", { placement: "floating", pos: "row", run: "where" }],
  ["pos-slot-floating", { placement: "floating", pos: "slot", run: "where" }],
  ["pos-row-page", { placement: "page", pos: "row", run: "where" }],
  ["slot-and-tools-floating", { placement: "floating", pos: "tools", slot: "1", run: "where" }],
  ["slot-and-row-floating", { placement: "floating", pos: "row", slot: "1", run: "where" }],
  ["slot-replaces-fallback-floating", { placement: "floating", pos: "slot", slot: "1", run: "where" }],
  ["excluded-floating", { placement: "floating", excluded: "1", run: "where" }],
  ["excluded-floating-classic-dark", { theme: "classic", scheme: "dark", placement: "floating", excluded: "1", run: "where" }],
  ["long-label-floating", { placement: "floating", long: "1", run: "where" }],
  ["long-label-row-floating", { placement: "floating", pos: "row", long: "1", run: "where" }],
  ["route-fallback-floating", { placement: "floating", source: "route", run: "where" }],
  ["greeting-tools-page", { placement: "page" }],
  ["greeting-tools-page-dark", { placement: "page", scheme: "dark" }],
  ["greeting-row-page", { placement: "page", pos: "row" }],
  ["greeting-tools-page-classic", { placement: "page", theme: "classic" }],
  ["collapsed-floating", { placement: "floating", collapsed: "1" }],
  ["collapsed-sidebar", { placement: "sidebar", collapsed: "1" }],
];
for (const [name, query] of variants) {
  cells.push({ name, query: { theme: "", scheme: "light", ...query } });
}
for (const t of THEMES) {
  for (const scheme of SCHEMES) {
    cells.push({
      name: `phone-${t.key}-${scheme}`,
      phone: true,
      query: { theme: t.theme, scheme, placement: "floating", run: "where" },
    });
  }
}
cells.push({ name: "phone-row", phone: true, query: { theme: "", scheme: "light", placement: "floating", pos: "row", run: "where" } });

async function clipFor(page, placement, viewport) {
  if (placement === "page" || placement === "full" || viewport.width < 600) {
    return undefined;
  }
  const box = await page.evaluate(() => {
    const chat = document.querySelector("ag-ui-chat");
    const el = chat.hasAttribute("collapsed")
      ? chat.shadowRoot.querySelector(".launcher") ?? chat
      : chat.shadowRoot.querySelector(".chat");
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  if (placement === "embedded") {
    return { x: 0, y: 0, width: viewport.width, height: viewport.height };
  }
  const margin = 32;
  const left = Math.max(0, box.x - 320);
  const right = Math.min(viewport.width, box.x + box.width + margin);
  return { x: left, y: 0, width: right - left, height: viewport.height };
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const only = process.env.ONLY;
  for (const cell of cells) {
    if (only && !cell.name.includes(only)) continue;
    const viewport = cell.phone ? PHONE : DESKTOP;
    const page = await browser.newPage({ viewport, deviceScaleFactor: cell.phone ? 2 : 1.5 });
    await page.emulateMedia({ colorScheme: cell.query.scheme === "dark" ? "dark" : "light" });
    await page.goto(`${BASE}?${new URLSearchParams(cell.query)}`);
    await page.waitForSelector("body[data-ready]", { state: "attached" });
    if (cell.query.run === "where") {
      await page.waitForFunction(() => {
        const text = document.querySelector("ag-ui-chat").shadowRoot.textContent ?? "";
        return /You are on|not told/.test(text);
      });
    }
    await page.waitForTimeout(700);
    const clip = await clipFor(page, cell.query.placement, viewport);
    await page.screenshot({ path: join(OUT, `${cell.name}.png`), ...(clip ? { clip } : {}) });
    await page.close();
    process.stdout.write(`${cell.name}\n`);
  }
  await browser.close();
})();
