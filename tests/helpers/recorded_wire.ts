/**
 * Replaying the recorded wire corpus through a real `<ag-ui-chat>`.
 *
 * Shared by the two files that cross the wire seam for real: one mounts the
 * element from `src/` through Vite, the other from the built vendored bundle.
 * They have to replay a run the same way, or a difference between their results
 * could be a difference in the replay rather than in what was built -- so there
 * is one replay, here. `tests/browser/recorded_wire_payload.browser.test.ts`
 * says why the corpus exists and what each recorded run covers.
 */

import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import recorded from "../fixtures/recorded_ag_ui_runs.json";

/** The recorded bodies, keyed as the recorder names them. */
export const RUNS: Readonly<Record<string, readonly string[]>> = recorded.runs;

/** The JSON object a recorded `data:` frame carries. */
export function payloadOf(frame: string): Record<string, unknown> {
  const body = frame.replace(/^data: /, "").trim();
  return JSON.parse(body) as Record<string, unknown>;
}

export function framesOf(run: string): readonly string[] {
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
export const ENDPOINT = "/agent/";

/**
 * Answer the agent endpoint with a recorded body; leave every other request
 * alone.
 *
 * Scoped rather than blanket, because the browser project's own runner talks
 * over `fetch` too, and a stub that swallowed those requests would replace the
 * harness's traffic with an SSE stream.
 */
export function stubFetch(frames: readonly string[]): () => void {
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

export function shadow(el: AgUiChat): ShadowRoot {
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
export async function replay(el: AgUiChat, frames: readonly string[]): Promise<void> {
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

export function text(el: AgUiChat, selector: string): string {
  return shadow(el).querySelector(selector)?.textContent ?? "";
}

/** Rewrite one recorded frame's JSON, leaving the framing intact. */
export function corrupt(
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
