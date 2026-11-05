// Screenshot matrix for the design-revamp prototypes.
//
//   pnpm build && HOST=127.0.0.1 node demo/mock-server.mjs &
//   node prototypes/screenshot-matrix.cjs [outDir]
//
// Every cell loads prototypes/harness.html with its look in the URL. Most run
// the same scripted conversation (reasoning, a chart, five form steps with one
// failure, and a destructive save left on the confirmation card); the surface
// cells run the mock's approval, question and sub-agent branches, or open the
// slash palette or the history drawer. Shots are 2x.
const { mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL ?? "http://localhost:5173/prototypes/";
const OUT = process.argv[2] ?? join(__dirname, "shots");
const DESKTOP = { width: 1440, height: 1000 };
const PHONE = { width: 390, height: 844 };

// Built-in themes. Quiet is the default, so it carries no theme word.
const DIRECTIONS = [
  { key: "quiet", theme: "" },
  { key: "soft", theme: "soft" },
  { key: "ledger", theme: "ledger" },
  { key: "classic", theme: "classic" },
];
const PLACEMENTS = ["floating", "sidebar", "page"];
const SCHEMES = ["light", "dark"];

function url(direction, scheme, placement, extra = {}) {
  const query = new URLSearchParams({
    theme: direction.theme,
    scheme,
    placement,
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

/** What each scripted run leaves on screen once it has settled. */
const SETTLED = {
  1: ".confirm:not([data-resolved])",
  import: ".tool-call-approval .confirm, .approval",
  ask: ".question",
  delegate: '.tool-call[data-tool-name="delegate_task"] ~ .tool-call[data-tool-name="delegate_task"][data-status="done"]',
};

async function conversation(page, run = "1") {
  await page.waitForFunction(
    (selector) => document.querySelector("ag-ui-chat").shadowRoot.querySelector(selector),
    SETTLED[run],
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
          run: "1",
        });
      }
      list.push({
        name: `${direction.key}-phone-${scheme}`,
        url: url(direction, scheme, "floating", { run: "1" }),
        viewport: PHONE,
        placement: "floating",
        run: "1",
      });
      list.push({
        name: `${direction.key}-launcher-${scheme}`,
        url: url(direction, scheme, "floating", { collapsed: "1" }),
        viewport: DESKTOP,
        placement: "launcher",
      });
      // The surfaces the first round left out, in every theme.
      for (const run of ["import", "ask", "delegate"]) {
        list.push({
          name: `${direction.key}-surface-${run}-${scheme}`,
          url: url(direction, scheme, "floating", { run }),
          viewport: DESKTOP,
          placement: "floating",
          run,
          ...(run === "delegate" ? { action: "open-group" } : {}),
        });
      }
      list.push({
        name: `${direction.key}-surface-palette-${scheme}`,
        url: url(direction, scheme, "floating"),
        viewport: DESKTOP,
        placement: "floating",
        action: "palette",
      });
      list.push({
        name: `${direction.key}-surface-drawer-${scheme}`,
        url: url(direction, scheme, "floating", { run: "1" }),
        viewport: DESKTOP,
        placement: "floating",
        run: "1",
        action: "drawer",
      });
    }
    if (direction.key === "classic") {
      continue;
    }
    list.push({
      name: `${direction.key}-steps-open-light`,
      url: url(direction, "light", "floating", { run: "1" }),
      viewport: DESKTOP,
      placement: "floating",
      run: "1",
      action: "open-group",
    });
  }
  // classic with the steps folded, to separate the two changes.
  list.push({
    name: "classic-grouped-floating-light",
    url: url(DIRECTIONS[3], "light", "floating", { run: "1", steps: "group" }),
    viewport: DESKTOP,
    placement: "floating",
    run: "1",
  });
  list.push({
    name: "code-floating-dark",
    url: url({ theme: "code" }, "light", "floating", { run: "1" }),
    viewport: DESKTOP,
    placement: "floating",
    run: "1",
  });
  // The override layers, each on the scripted turn.
  const overrides = [
    ["accent", "", "accent"],
    ["accent-dark", "", "accent", "dark"],
    ["pertheme", "soft", "pertheme"],
    ["parts", "", "parts"],
    ["acme", "acme", null],
    ["acme-dark", "acme", null, "dark"],
    ["soft-acme", "soft acme", null],
    ["extra", "", "extra"],
  ];
  for (const [name, theme, override, scheme = "light"] of overrides) {
    list.push({
      name: `override-${name}`,
      url: url({ theme }, scheme, "floating", { run: "1", ...(override ? { override } : {}) }),
      viewport: DESKTOP,
      placement: "floating",
      run: "1",
    });
  }
  return list;
}

async function capture(browser, job) {
  const context = await browser.newContext({ viewport: job.viewport, deviceScaleFactor: 2 });
  const page = await context.newPage();
  try {
    await page.goto(job.url);
    await page.waitForFunction(() => customElements.get("ag-ui-chat") !== undefined);
    if (job.run) {
      await conversation(page, job.run);
    } else {
      await page.waitForTimeout(500);
    }
    if (job.action === "palette") {
      await page.evaluate(() => {
        const input = document.querySelector("ag-ui-chat").shadowRoot.querySelector(".input");
        input.focus();
      });
      await page.keyboard.type("/");
      await page.waitForTimeout(400);
    }
    if (job.action === "drawer") {
      await page.evaluate(() => {
        document.querySelector("ag-ui-chat").shadowRoot.querySelector(".header-btn--history").click();
      });
      await page.waitForTimeout(700);
    }
    if (job.action === "open-group") {
      await page.evaluate(() => {
        const root = document.querySelector("ag-ui-chat").shadowRoot;
        const group = root.querySelector('.tool-group[data-count="5"]') ?? root.querySelector(".tool-group");
        if (group !== null) {
          group.querySelector(".tool-group-head").click();
          group.scrollIntoView({ block: "center" });
        }
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
