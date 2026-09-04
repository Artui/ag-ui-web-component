/**
 * The wire seam, crossed for real: recorded server bytes into rendered DOM.
 *
 * Every other element-level test in this suite drives the subscriber through
 * `tests/helpers/fake_agent.ts`, which builds the callback params by hand and
 * casts them through `never`. That is the right tool for plumbing — it is fast,
 * it makes an interleaving easy to write, and the component's behaviour is what
 * those tests are about. What it cannot do is disagree with the component,
 * because both halves are written here. Rename a field on the wire and the fake
 * renames it too; the suite stays green and the browser breaks.
 *
 * So this file starts one layer earlier, at the bytes. It replays SSE bodies
 * recorded from the server side's own encoder (`scripts/record_wire_fixture.py`
 * writes `tests/fixtures/recorded_ag_ui_runs.json`; the fixture's frames are
 * verbatim `EventEncoder` output) through a stubbed `fetch`, and lets the real
 * `HttpAgent` decode them: SSE framing, JSON, chunk transformation, event
 * application, subscriber dispatch, render. Nothing between the recorded byte
 * and the asserted pixel is written by this repository's tests.
 *
 * **Why the browser project.** Two reasons, and the first is the finding's own
 * words — the drift this covers "surfaces only in a browser against a live
 * server", so an emulated DOM is the wrong place to go looking for it.
 * `HttpAgent` reads the response through `body.getReader()` and a `TextDecoder`,
 * which is real streaming machinery that happy-dom only approximates. The
 * second is the same reason the sanitisation tests live here: DOMPurify does
 * not sanitise under happy-dom, so an assertion that markdown from the wire
 * rendered as markdown cannot be evaluated there at all.
 *
 * **Why these events.** The protocol has thirty-three; a uniform sweep of all
 * of them would mostly pin events nothing in this package looks at. The corpus
 * covers the ones `AgUiClient`'s subscriber reads *fields* off, plus the two
 * activity payloads whose interior shape the server package owns (a chart spec
 * and a compaction summary). `RECORDED_EVENT_TYPES` states that cut so it
 * cannot drift silently.
 */

import { EventSchemas, EventType } from "@ag-ui/core";
import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import recorded from "../fixtures/recorded_ag_ui_runs.json";

/** The recorded bodies, keyed as the recorder names them. */
const RUNS: Readonly<Record<string, readonly string[]>> = recorded.runs;

/**
 * The events the corpus deliberately carries.
 *
 * Written out rather than derived from the fixture, for the same reason
 * `ag_ui_chat_charts.test.ts` pins the chart activity type as a literal:
 * comparing a recording against itself is a tautology. This is the list a
 * reviewer has to change on purpose.
 */
const RECORDED_EVENT_TYPES: readonly string[] = [
  "ACTIVITY_DELTA",
  "ACTIVITY_SNAPSHOT",
  "REASONING_END",
  "REASONING_MESSAGE_CONTENT",
  "REASONING_MESSAGE_END",
  "REASONING_MESSAGE_START",
  "REASONING_START",
  "RUN_ERROR",
  "RUN_FINISHED",
  "RUN_STARTED",
  "STATE_SNAPSHOT",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TEXT_MESSAGE_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "TOOL_CALL_START",
];

/** The JSON object a recorded `data:` frame carries. */
function payloadOf(frame: string): Record<string, unknown> {
  const body = frame.replace(/^data: /, "").trim();
  return JSON.parse(body) as Record<string, unknown>;
}

function framesOf(run: string): readonly string[] {
  const frames = RUNS[run];
  if (frames === undefined) {
    throw new Error(`no recorded run named "${run}"`);
  }
  return frames;
}

/**
 * Serve `frames` as a streaming `text/event-stream` response.
 *
 * Each frame is enqueued as its own chunk, and the first frame is split in
 * half, because a real response arrives in transport-sized pieces that have no
 * relationship to event boundaries. Handing the parser one whole string would
 * never exercise the buffer it keeps across chunks.
 */
function sseResponse(frames: readonly string[]): Response {
  const encoder = new TextEncoder();
  const chunks: string[] = [];
  for (const [index, frame] of frames.entries()) {
    if (index === 0) {
      const cut = Math.floor(frame.length / 2);
      chunks.push(frame.slice(0, cut), frame.slice(cut));
      continue;
    }
    chunks.push(frame);
  }
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": recorded.contentType },
  });
}

/** The endpoint the mounted element runs against. */
const ENDPOINT = "/agent/";

/**
 * Answer the agent endpoint with a recorded body; leave every other request
 * alone.
 *
 * Scoped rather than blanket, because the browser project's own runner talks
 * over `fetch` too, and a stub that swallowed those requests would replace the
 * harness's traffic with an SSE stream.
 */
function stubFetch(frames: readonly string[]): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (new URL(String(input), location.href).pathname !== ENDPOINT) {
      return original(input, init);
    }
    return Promise.resolve(sseResponse(frames));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Mount a real `<ag-ui-chat>` with its real agent factory.
 *
 * Deliberately no `agentFactory` override: the element must build the same
 * `HttpAgent` it builds in production, or this test proves nothing about the
 * path production takes.
 */
function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", ENDPOINT);
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/**
 * Send a message and let the whole recorded body decode and render.
 *
 * The send promise is deliberately not awaited. A run that finishes on an
 * interrupt is still open when its assertions run — nobody has answered the
 * approval yet — so awaiting it would hang rather than settle. Draining timer
 * turns is what every run needs anyway: the body arrives through a stream
 * reader, so the decode advances on macrotasks and not on microtasks.
 */
async function replay(el: AgUiChat, frames: readonly string[]): Promise<void> {
  const restore = stubFetch(frames);
  // `sendMessage` reports failures through the element rather than by
  // rejecting, so nothing here is being swallowed.
  void el.sendMessage("what happened this week?");
  try {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  } finally {
    restore();
  }
}

function text(el: AgUiChat, selector: string): string {
  return shadow(el).querySelector(selector)?.textContent ?? "";
}

defineAgUiChat();

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  // Layout preferences are durable on purpose, so the per-tab clear no longer
  // reaches all of them. Without this a dragged position leaks into the next
  // test, which reads as a drag that travelled the wrong distance.
  localStorage.clear();
});

describe("the recorded corpus", () => {
  it("is framed the way the server's encoder frames it", () => {
    for (const frames of Object.values(RUNS)) {
      for (const frame of frames) {
        // `data: ` prefix, one JSON object, blank-line terminator. Asserted
        // rather than assumed because the parser silently drops a line it does
        // not recognise, so a mis-framed fixture would decode to *nothing* and
        // every render assertion below would fail for the wrong reason.
        expect(frame.startsWith("data: ")).toBe(true);
        expect(frame.endsWith("\n\n")).toBe(true);
        expect(typeof payloadOf(frame)["type"]).toBe("string");
      }
    }
  });

  it("validates field-for-field against the protocol's own schemas", () => {
    // `@ag-ui/client` does run these schemas on the HTTP path, but it runs them
    // one event at a time and *errors the stream* on the first rejection — so
    // against a live server a single drifted field reads as "the run failed",
    // with the offending name only in a console. Checking the whole corpus up
    // front instead turns that into a list of exactly which events drifted and
    // which of their fields, before a single byte is replayed.
    // Collected rather than asserted frame by frame, so a failure names every
    // event that drifted at once instead of only the first.
    const rejected: string[] = [];
    for (const [run, frames] of Object.entries(RUNS)) {
      for (const frame of frames) {
        const payload = payloadOf(frame);
        const result = EventSchemas.safeParse(payload);
        if (!result.success) {
          const issues = result.error.issues.map((i) => `${i.path.join(".")} ${i.message}`);
          rejected.push(`${run} / ${payload["type"] as string}: ${issues.join("; ")}`);
        }
      }
    }
    expect(rejected).toEqual([]);
  });

  it("covers the declared cut of the protocol, and nothing outside it", () => {
    const present = new Set<string>();
    for (const frames of Object.values(RUNS)) {
      for (const frame of frames) {
        present.add(payloadOf(frame)["type"] as string);
      }
    }
    expect([...present].sort()).toEqual([...RECORDED_EVENT_TYPES]);
    // Every recorded name is one the shared cross-repo contract knows about, so
    // this corpus can never drift into pinning an event that no longer exists.
    const known = new Set<string>(Object.values(EventType).filter((v) => typeof v === "string"));
    expect(RECORDED_EVENT_TYPES.filter((name) => !known.has(name))).toEqual([]);
  });
});

describe("an ordinary run, decoded from recorded bytes", () => {
  it("renders reasoning, a server tool, a chart, a notice and the answer", async () => {
    const el = mount();
    el.enableCharts(["activity"]);
    await replay(el, framesOf("ordinary"));

    // REASONING_MESSAGE_CONTENT.delta, accumulated by the client. Asserted on
    // the first delta rather than the whole reasoning text: `@ag-ui/client`
    // hands a content subscriber the buffer *before* the announced delta is
    // appended, so the trailing one has not landed at the point this element
    // last redraws. That gap is real and belongs to the client layer, not to
    // this fixture; a `toContain` states what is both true and correct now, and
    // stays true once the trailing delta arrives too.
    expect(text(el, ".thoughts-body")).toContain("Checking the order table");

    // TOOL_CALL_START.toolCallName, and the two TOOL_CALL_ARGS deltas joined
    // into one argument object. A single-frame payload would not prove the join.
    expect(text(el, ".tool-call-name")).toContain("Query orders");
    expect(text(el, ".tool-call-args")).toContain("week");
    expect(text(el, ".tool-call-args")).toContain("current");
    // TOOL_CALL_RESULT.content — the field the fake helper's comment names.
    expect(text(el, ".tool-call-result")).toContain("3 orders on Mon");
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-status")).toBe("done");

    // ACTIVITY_SNAPSHOT with the server's compaction content shape.
    expect(text(el, ".run-notice--compaction")).toContain("8");

    // ACTIVITY_SNAPSHOT with the server's chart content shape, then the
    // ACTIVITY_DELTA's JSON Patch applied on top of it.
    expect(text(el, ".chart-title")).toBe("Orders this week");
    const bars = shadow(el).querySelectorAll<SVGRectElement>(".chart-block rect");
    expect(bars).toHaveLength(3);
    const heights = [...bars].map((bar) => Number(bar.getAttribute("height")));
    // Snapshot points were [3, 5, 4]; the patch replaced them with [9, 1, 4].
    // Monday taller than Tuesday is only true after the patch landed.
    expect(heights[0]).toBeGreaterThan(heights[1] as number);

    // STATE_SNAPSHOT.snapshot, applied by the agent rather than by this package.
    expect(el.sharedState).toEqual({ selectedWeek: "current" });

    // TEXT_MESSAGE_CONTENT deltas, accumulated and rendered as markdown. The
    // `<strong>` is the half happy-dom cannot evaluate.
    const bubbles = shadow(el).querySelectorAll(".message");
    const answer = bubbles[bubbles.length - 1];
    expect(answer?.textContent).toContain("Orders are up on Tuesday.");
    expect(answer?.querySelector("strong")?.textContent).toBe("up");
  });
});

describe("a run the server aborts, decoded from recorded bytes", () => {
  it("surfaces RUN_ERROR's message", async () => {
    const el = mount();
    await replay(el, framesOf("failed"));

    const bubbles = shadow(el).querySelectorAll(".message");
    expect(bubbles[bubbles.length - 1]?.textContent).toContain("The upstream model timed out");
  });
});

describe("a gated tool that deferred, decoded from recorded bytes", () => {
  it("reads the interrupt out of RUN_FINISHED's outcome object", async () => {
    // The terminal event the fakes flatten hardest: on the wire `outcome` is an
    // object carrying its own discriminator and a list of interrupts, each with
    // an id, a reason, a prompt and the call it gates. The fake helper writes
    // `{ outcome: "interrupt", interrupts }` — a shape no server ever sends.
    const el = mount();
    await replay(el, framesOf("deferred"));

    const card = shadow(el).querySelector(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("deferred");
    expect(text(el, ".tool-call-approval .approval")).toContain("Delete order 41?");
  });
});

describe("field-level drift is visible from here", () => {
  /** Rewrite one recorded frame's JSON, leaving the framing intact. */
  function corrupt(
    frames: readonly string[],
    type: string,
    edit: (payload: Record<string, unknown>) => void,
  ): readonly string[] {
    return frames.map((frame) => {
      const payload = payloadOf(frame);
      if (payload["type"] !== type) {
        return frame;
      }
      edit(payload);
      return `data: ${JSON.stringify(payload)}\n\n`;
    });
  }

  it("catches a renamed field at the schema, and again at the render", async () => {
    // The finding's scenario, run forwards: the protocol renames a field, the
    // server follows, and this repository does not. Both halves of the guard
    // must fire, because either alone can rot — a schema check with no render
    // behind it pins a name nothing reads, and a render check with no schema
    // behind it cannot say *why* the pixel went missing. Note what the render
    // half actually shows: the drift does not degrade the card, it takes the
    // whole run down, because the client errors the stream on a rejected event.
    const drifted = corrupt(framesOf("ordinary"), "TOOL_CALL_START", (payload) => {
      payload["toolName"] = payload["toolCallName"];
      delete payload["toolCallName"];
    });
    const offending = drifted
      .map(payloadOf)
      .filter((payload) => payload["type"] === "TOOL_CALL_START");
    expect(offending).toHaveLength(1);
    expect(EventSchemas.safeParse(offending[0]).success).toBe(false);

    const el = mount();
    await replay(el, drifted);
    expect(text(el, ".tool-call-name")).not.toContain("Query orders");
  });

  it("catches a dropped required field at the schema, and again at the render", async () => {
    const drifted = corrupt(framesOf("ordinary"), "TOOL_CALL_RESULT", (payload) => {
      delete payload["content"];
    });
    const offending = drifted
      .map(payloadOf)
      .filter((payload) => payload["type"] === "TOOL_CALL_RESULT");
    expect(offending).toHaveLength(1);
    expect(EventSchemas.safeParse(offending[0]).success).toBe(false);

    const el = mount();
    await replay(el, drifted);
    expect(text(el, ".tool-call-result")).not.toContain("3 orders on Mon");
  });
});
