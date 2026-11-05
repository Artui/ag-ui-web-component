// Screenshot matrix for the design-revamp prototypes.
//
//   pnpm build && HOST=127.0.0.1 node demo/mock-server.mjs &
//   node prototypes/screenshot-matrix.cjs [outDir]
//
// Every cell loads prototypes/harness.html with its look in the URL and runs
// the same scripted conversation (reasoning, a chart, five form steps with one
// failure, and a destructive save left on the confirmation card), then waits
// for that card before capturing. Shots are 2x.
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173/prototypes/";
const OUT = process.argv[2] ?? join(__dirname, "shots");
const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

const DIRECTIONS = [
  { key: "baseline", theme: "light", steps: "cards" },
  { key: "quiet", theme: "proto-quiet", steps: "group" },
  { key: "soft", theme: "proto-soft", steps: "group" },
  { key: "ledger", theme: "proto-ledger", steps: "group" },
];
const PLACEMENTS = ["floating", "sidebar", "page"];
const SCHEMES = ["light", "dark"];

function url(direction, scheme, placement, extra = {}) {
  const query = new URLSearchParams({
    theme: direction.theme,
    scheme,
    placement,
    steps: direction.steps,
    ...extra,
  });
  return `${BASE}?${query}`;
}

/** The region worth looking at for a placement: the panel, with some host page. */
async function clipFor(page, placement, viewport) {
  if (placement === "page" || viewport.width < 600) {
    return undefined;
  }
  const box = await page.evaluate(() => {
    const chat = document.querySelector("ag-ui-chat").shadowRoot.querySelector(".chat");
    const r = chat.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  const margin = placement === "floating" ? 40 : 0;
  const left = placement === "sidebar" ? Math.max(0, box.x - 260) : Math.max(0, box.x - margin);
  const top = placement === "sidebar" ? 0 : Math.max(0, box.y - margin);
  return {
    x: left,
    y: top,
    width: Math.min(viewport.width, box.x + box.width + margin) - left,
    height: Math.min(viewport.height, box.y + box.height + margin) - top,
  };
}

async function conversation(page) {
  await page.waitForFunction(
    () => document.querySelector("ag-ui-chat").shadowRoot.querySelector(".confirm:not([data-resolved])"),
    null,
    { timeout: 45_000 },
  );
  // The form fills and the transcript settles at its foot.
  await page.waitForTimeout(900);
}

function jobs() {
  const list = [];
  for (const direction of DIRECTIONS) {
    for (const scheme of SCHEMES) {
      for (const placement of PLACEMENTS) {
        list.push({
          name: `${direction.key}-${placement}-${scheme}`,
          url: url(direction, scheme, placement, { run: "1" }),
          viewport: DESKTOP,
          placement,
          run: true,
        });
      }
      list.push({
        name: `${direction.key}-phone-${scheme}`,
        url: url(direction, scheme, "floating", { run: "1" }),
        viewport: PHONE,
        placement: "floating",
        run: true,
      });
      list.push({
        name: `${direction.key}-launcher-${scheme}`,
        url: url(direction, scheme, "floating", { collapsed: "1" }),
        viewport: DESKTOP,
        placement: "launcher",
        run: false,
      });
    }
    // Tool steps up close: the turn as it settles, and the group opened.
    if (direction.steps === "group") {
      list.push({
        name: `${direction.key}-steps-open-light`,
        url: url(direction, "light", "floating", { run: "1" }),
        viewport: DESKTOP,
        placement: "floating",
        run: true,
        openGroup: true,
      });
    }
  }
  // The baseline wearing the grouped steps, to separate the two changes.
  list.push({
    name: "baseline-grouped-floating-light",
    url: url(DIRECTIONS[0], "light", "floating", { run: "1", steps: "group" }),
    viewport: DESKTOP,
    placement: "floating",
    run: true,
  });
  return list;
}

async function capture(browser, job) {
  const context = await browser.newContext({ viewport: job.viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto(job.url);
    await page.waitForFunction(() => customElements.get("ag-ui-chat") !== undefined);
    if (job.run) {
      await conversation(page);
    } else {
      await page.waitForTimeout(500);
    }
    if (job.openGroup) {
      await page.evaluate(() => {
        const root = document.querySelector("ag-ui-chat").shadowRoot;
        root.querySelector('.tool-group[data-count="5"] .tool-group-head').click();
        root.querySelector('.tool-group[data-count="5"]').scrollIntoView({ block: "center" });
      });
      await page.waitForTimeout(400);
    }
    let clip;
    if (job.placement === "launcher") {
      clip = { x: job.viewport.width - 160, y: job.viewport.height - 160, width: 160, height: 160 };
    } else {
      clip = await clipFor(page, job.placement, job.viewport);
    }
    await page.screenshot({ path: join(OUT, `${job.name}.png`), ...(clip ? { clip } : {}) });
    process.stdout.write(`ok ${job.name}\n`);
  } catch (error) {
    process.stdout.write(`FAILED ${job.name}: ${error.message}\n`);
    process.exitCode = 1;
  } finally {
    await context.close();
  }
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium",
  });
  const queue = jobs();
  const workers = Array.from({ length: 6 }, async () => {
    while (queue.length > 0) {
      await capture(browser, queue.shift());
    }
  });
  await Promise.all(workers);
  await browser.close();
})();
