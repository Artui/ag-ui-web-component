/**
 * The sub-agent progress wire, crossed for real, and the box it lands in.
 *
 * Two things happen here that cannot happen under happy-dom.
 *
 * **The wire.** The fixture's events are re-framed as Server-Sent Events and fed
 * through a stubbed `fetch` to the element's own `HttpAgent`, so SSE framing,
 * JSON decode, schema validation, event application and subscriber dispatch all
 * run for real. Nothing between the recorded byte and the asserted node is
 * written by this repository's tests. The element-level suite next door drives
 * the same fixture through a fake subscriber, which is faster and cannot
 * disagree with the component because both halves are written here; this one can.
 *
 * **The box.** The delegation surface is a new control inside a card that
 * already existed, and adding one to an existing row has previously pushed a
 * sibling outside its container. happy-dom lays out no boxes, so it gives the
 * same agreeable answer whether the row fits, wraps or overflows. These
 * assertions are rects, measured at a sidebar width and at a genuinely narrow
 * one.
 *
 * The fixture's provenance and the rule that it is regenerated rather than
 * edited are in `tests/helpers/subagent_fixture.ts`.
 */

import { EventSchemas } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { SubAgentPanel } from "../../src/ui/subagent_panel.js";
import { ToolCallCard } from "../../src/ui/tool_call_card.js";
import { DEFAULT_UI_STRINGS } from "../../src/ui/ui_strings.js";
import { FIXTURE_EVENTS, lifecycleEvent } from "../helpers/subagent_fixture.js";

/** The endpoint the mounted element runs against. */
const ENDPOINT = "/agent/";

/** A sidebar, which is where these cards actually live. */
const SIDEBAR = "470px";

/** The narrow end: a phone-width panel, where a row that wraps badly shows it. */
const NARROW = "300px";

/**
 * The recorded events, re-framed the way the encoder frames them.
 *
 * `data: `, one JSON object, blank-line terminator -- the framing the sibling
 * corpus in `recorded_ag_ui_runs.json` is recorded in verbatim. Re-encoding the
 * decoded events rather than recording bytes is what the fixture's own format
 * allows; the *values* are still entirely the server's.
 */
function frames(): readonly string[] {
  return FIXTURE_EVENTS.map((event) => `data: ${JSON.stringify(event)}\n\n`);
}

function sseResponse(): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const [index, frame] of frames().entries()) {
        // The first frame is cut in half, because a real response arrives in
        // transport-sized pieces with no relationship to event boundaries, and
        // handing the parser one whole frame never exercises the buffer it keeps
        // across chunks.
        if (index === 0) {
          const cut = Math.floor(frame.length / 2);
          controller.enqueue(encoder.encode(frame.slice(0, cut)));
          controller.enqueue(encoder.encode(frame.slice(cut)));
          continue;
        }
        controller.enqueue(encoder.encode(frame));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/event-stream" },
  });
}

/**
 * Answer the agent endpoint with the recorded body; leave every other request
 * alone -- the browser runner talks over `fetch` too.
 */
function stubFetch(): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input), location.href).pathname !== ENDPOINT) {
      return original(input, init);
    }
    return Promise.resolve(sseResponse());
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** A real element with its real agent factory, at `width`. */
function mount(width: string): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", ENDPOINT);
  el.setAttribute("placement", "embedded");
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

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/**
 * Send, then drain timer turns rather than awaiting the send.
 *
 * The body arrives through a stream reader, so the decode advances on
 * macrotasks and not on microtasks.
 */
async function replay(el: AgUiChat): Promise<void> {
  const restore = stubFetch();
  void el.sendMessage("find the settlement passages and check them");
  try {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    restore();
  }
}

/**
 * The two settled rows, as the element words them.
 *
 * The success line is this element's own -- `SUBAGENT_FINISHED` carries a run id
 * and no rendered status, which is the better shape for a localised UI. The
 * failure line *is* the server's, because the protocol requires a `message` on
 * `SUBAGENT_ERROR`, and the server fills it with the sub-agent's name and
 * nothing else.
 */
const RESEARCHER_FINISHED_LINE = DEFAULT_UI_STRINGS.subAgentFinished.replace(
  "{agent}",
  "researcher",
);
const AUDITOR_LAST = lifecycleEvent((event) => event.type === "SUBAGENT_ERROR");

defineAgUiChat();

describe("the sub-agent progress corpus", () => {
  it("validates field-for-field against the protocol's own schemas", () => {
    // `@ag-ui/client` runs these on the HTTP path one event at a time and errors
    // the *stream* on the first rejection, so against a live server a single
    // drifted field reads as "the run failed". Checking the whole corpus up
    // front names every event that drifted instead of only the first.
    const rejected: string[] = [];
    for (const event of FIXTURE_EVENTS) {
      const result = EventSchemas.safeParse(event);
      if (!result.success) {
        const issues = result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`);
        rejected.push(`${event["type"] as string}: ${issues.join("; ")}`);
      }
    }

    expect(rejected).toEqual([]);
  });
});

describe("a delegation, from recorded bytes (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    document.body.replaceChildren();
    sessionStorage.clear();
    // Layout preferences are durable on purpose, so the per-tab clear no longer
    // reaches all of them. Without this a dragged position leaks into the next
    // test, which reads as a drag that travelled the wrong distance.
    localStorage.clear();
  });

  it("draws one delegation row per delegate_task card", async () => {
    const el = mount(SIDEBAR);

    await replay(el);

    const cards = [...shadow(el).querySelectorAll('.tool-call[data-tool-name="delegate_task"]')];
    expect(cards).toHaveLength(2);
    expect(cards.map((card) => card.querySelectorAll(".subagent").length)).toEqual([1, 1]);
  });

  it("settles each row on the card the server keyed it to", async () => {
    const el = mount(SIDEBAR);

    await replay(el);

    const rows = [...shadow(el).querySelectorAll(".subagent-status")].map((n) => n.textContent);
    expect(rows).toEqual([RESEARCHER_FINISHED_LINE, AUDITOR_LAST.message]);
  });

  it("settles each row into the phase its closing event named", async () => {
    // The attribute a host styles the glyph off, and the only place the
    // success/failure distinction is visible once both rows have stopped
    // moving -- the failing one carries no text saying so.
    const el = mount(SIDEBAR);

    await replay(el);

    const phases = [...shadow(el).querySelectorAll(".subagent")].map((n) =>
      n.getAttribute("data-phase"),
    );
    expect(phases).toEqual(["finished", "failed"]);
  });

  it("keeps the delegation row inside the card it hangs off", async () => {
    const el = mount(NARROW);

    await replay(el);

    const panel = part(shadow(el), ".subagent");
    const card = panel.closest(".tool-call") as HTMLElement;
    const row = part(panel, ".subagent-row").getBoundingClientRect();
    const bounds = card.getBoundingClientRect();

    expect(row.right).toBeLessThanOrEqual(bounds.right);
    expect(row.left).toBeGreaterThanOrEqual(bounds.left);
    // Containment is satisfied by a box of zero width, and a row collapsed to
    // nothing is exactly the failure mode being ruled out. Most of the card's
    // content width, or the assertion above means nothing.
    expect(row.width).toBeGreaterThan(bounds.width * 0.8);
  });

  it("wraps a status line too long for the card rather than overflowing it", () => {
    // The status is a server string of no stated length, sharing a flex row with
    // a fixed icon and a fixed chevron. A row whose flexible child cannot shrink
    // pushes the fixed ones out of the card -- which is what adding a control to
    // an existing row has done here before. Synthesised rather than recorded:
    // this is a fact about the box, and the recorded run's lines are short.
    const el = mount(NARROW);
    const panel = new SubAgentPanel();
    panel.report({
      delegationId: "call-1",
      agent: "researcher",
      phase: "tool_call",
      status: `researcher: calling ${"long_tool_name_".repeat(12)}`,
      tool: null,
    });
    const card = new ToolCallCard("delegate_task", { agent_name: "researcher" });
    card.subagentSlot.appendChild(panel.element);
    part(shadow(el), ".messages").appendChild(card.element);

    const row = part(card.element, ".subagent-row").getBoundingClientRect();
    const status = part(card.element, ".subagent-status").getBoundingClientRect();
    const bounds = card.element.getBoundingClientRect();

    expect(status.right).toBeLessThanOrEqual(bounds.right);
    expect(row.right).toBeLessThanOrEqual(bounds.right);
    // It wrapped rather than merely being clipped: several lines tall, and the
    // chevron is still on the row beside it.
    expect(status.height).toBeGreaterThan(row.height / 2);
    expect(status.width).toBeLessThan(bounds.width);
  });

  it("shows the delegation whatever the card's display mode hides", async () => {
    // The slot sits outside the card body on purpose. The body is what the
    // density modes hide, and a live progress line that only appeared in `full`
    // would leave the very stall it exists to end -- the same reasoning that
    // already shows a deferred card's arguments in every mode.
    const el = mount(SIDEBAR);
    el.setAttribute("data-tool-display", "minimal");

    await replay(el);

    const row = part(shadow(el), ".subagent-row").getBoundingClientRect();
    expect(row.width).toBeGreaterThan(0);
    expect(row.height).toBeGreaterThan(0);
  });

  it("leaves the card's own Details toggle below the delegation, still inside", async () => {
    // The control this adds sits between the head and the toggle. A new row in a
    // column that mis-measures pushes whatever follows it out of the box.
    const el = mount(NARROW);

    await replay(el);

    const panel = part(shadow(el), ".subagent");
    const card = panel.closest(".tool-call") as HTMLElement;
    const toggle = part(card, ".tool-call-toggle").getBoundingClientRect();
    const row = part(panel, ".subagent-row").getBoundingClientRect();

    expect(toggle.top).toBeGreaterThanOrEqual(row.bottom - 1);
    expect(toggle.bottom).toBeLessThanOrEqual(card.getBoundingClientRect().bottom);
  });

  it("keeps an expanded child step inside the card too", async () => {
    const el = mount(NARROW);

    await replay(el);

    const panel = part(shadow(el), ".subagent");
    part(panel, ".subagent-row").click();
    const card = panel.closest(".tool-call") as HTMLElement;
    const step = part(panel, ".subagent-step").getBoundingClientRect();

    expect(step.right).toBeLessThanOrEqual(card.getBoundingClientRect().right);
    // Indented under the row, and still a real box rather than a collapsed one.
    expect(step.left).toBeGreaterThan(part(panel, ".subagent-row").getBoundingClientRect().left);
    expect(step.width).toBeGreaterThan(0);
  });

  it("costs one row until someone opens it", async () => {
    // The whole reason the collapsed shape was chosen: a child with ten steps
    // must not be ten rows in the transcript by default.
    const el = mount(SIDEBAR);

    await replay(el);

    const panel = part(shadow(el), ".subagent");
    const collapsed = panel.getBoundingClientRect().height;
    part(panel, ".subagent-row").click();

    expect(panel.getBoundingClientRect().height).toBeGreaterThan(collapsed);
  });
});
