import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../../src/core/run_index.js";

/**
 * The checkpoint row, measured rather than inspected — the same lesson as the
 * tool-call head, one panel along.
 *
 * A row is a time, a short run id, a "branched" badge and two buttons. Every one
 * of those but the time is fixed-width, so the time is the only child that can
 * absorb a squeeze, and `flex: 1` (basis zero) lets it absorb all of it. Adding
 * the run id was enough: at 320px the label kept its text, reported the right
 * `textContent`, and measured **0px wide**. Nothing was wrong except that nobody
 * could see it.
 *
 * happy-dom lays out no boxes, so it answers 0 for every width and would call
 * both the broken and the fixed row a pass. Only a real engine can tell them
 * apart, which is why this lives here.
 */

/** The width the gallery embeds the panel at. */
const PANEL = "470px";
/** Narrow enough to force the row to choose between crushing and wrapping. */
const NARROW = "320px";

function runs(): RunRow[] {
  const now = Date.now();
  return [
    {
      run_id: "5087f329-a842-473f-b16b-881f7c91668d",
      thread_id: "t1",
      parent_run_id: "931fef34-e1ba-4eed-a239-0444a5bcb996",
      started_at: new Date(now - 2_000).toISOString(),
      continuable: true,
    },
  ];
}

function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-runs-url", "/runs/");
  el.style.width = width;
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

/** Render the panel with one branched run, bypassing the network. */
async function openPanel(width: string): Promise<ShadowRoot> {
  const el = mount(width);
  const original = globalThis.fetch;
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({ runs: runs() }),
  })) as unknown as typeof fetch;
  try {
    el.openCheckpoints();
    await new Promise((resolve) => setTimeout(resolve, 50));
  } finally {
    globalThis.fetch = original;
  }
  return shadow(el);
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("the checkpoint row", () => {
  it("keeps the timestamp visible at the width the panel is embedded at", async () => {
    const root = await openPanel(PANEL);
    const label = root.querySelector(".checkpoint-label") as HTMLElement;

    expect(label.textContent).not.toBe("");
    expect(label.getBoundingClientRect().width).toBeGreaterThan(40);
  });

  it("keeps it visible when the panel is too narrow to hold the row on one line", async () => {
    const root = await openPanel(NARROW);
    const row = root.querySelector(".checkpoint-row") as HTMLElement;
    const label = root.querySelector(".checkpoint-label") as HTMLElement;

    // The floor, not the ellipsis: a time is short and bounded, so there is
    // nothing to elide and no reason for it to shrink out of existence.
    expect(label.getBoundingClientRect().width).toBeGreaterThan(40);
    // It pays by wrapping the buttons onto their own line instead.
    expect(row.getBoundingClientRect().height).toBeGreaterThan(
      label.getBoundingClientRect().height * 1.5,
    );
  });

  it("does not paint the row on hover, because the row is not what responds", async () => {
    const root = await openPanel(PANEL);
    const row = root.querySelector(".checkpoint-row") as HTMLElement;
    const resume = root.querySelector(".checkpoint-resume") as HTMLElement;

    // Nothing about the row is pressable, and a surface that lights up under the
    // pointer is the affordance of something that is.
    expect(getComputedStyle(row).cursor).toBe("auto");
    expect(getComputedStyle(resume).cursor).toBe("pointer");
  });

  it("gives the two actions different weight and a visible resting surface", async () => {
    const root = await openPanel(PANEL);
    const row = root.querySelector(".checkpoint-row") as HTMLElement;
    const resume = root.querySelector(".checkpoint-resume") as HTMLElement;
    const fork = root.querySelector(".checkpoint-fork") as HTMLElement;

    // Three distinct surfaces: the row, the primary action, the secondary one. A
    // transparent button on a highlighted row was none of them.
    const surfaces = new Set([row, resume, fork].map((el) => getComputedStyle(el).backgroundColor));
    expect(surfaces.size).toBe(3);
  });

  it("shows the branch badge against the panel rather than against the row", async () => {
    const root = await openPanel(PANEL);
    const row = root.querySelector(".checkpoint-row") as HTMLElement;
    const badge = root.querySelector(".checkpoint-branch") as HTMLElement;

    expect(getComputedStyle(badge).backgroundColor).not.toBe(getComputedStyle(row).backgroundColor);
  });
});
