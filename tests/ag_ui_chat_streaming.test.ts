/**
 * What a burst of text deltas costs.
 *
 * Every `TEXT_MESSAGE_CONTENT` event carries the *whole* answer so far, so a
 * render per delta re-parses, re-sanitises and rebuilds the bubble's subtree
 * once per token — quadratic in the answer's length, and a torn-down subtree
 * takes any selection or focus inside it with it. These pin the coalescing that
 * keeps a burst to one render, and the two edges that make coalescing safe: the
 * last delta of a run that never sends a text end must still be drawn, and the
 * bubble must stay the same node throughout.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RenderMarkdownOptions } from "../src/ui/render_markdown.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

/**
 * Counts markdown renders. Hoisted because `vi.mock` factories run before the
 * module body, and the cost this file is about is exactly "how many times did
 * the answer go through marked + DOMPurify".
 */
const counter = vi.hoisted(() => ({ renders: 0 }));

vi.mock("../src/ui/render_markdown.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/ui/render_markdown.js")>();
  return {
    ...actual,
    renderMarkdown: (text: string, options?: RenderMarkdownOptions): string => {
      counter.renders += 1;
      return actual.renderMarkdown(text, options);
    },
  };
});

defineAgUiChat();

function mountWithAgent(script: (emit: Emit) => void | Promise<void>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
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

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

/** Let a scheduled animation frame run (happy-dom drives them off a timer). */
async function frame(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

function sendNoWait(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

async function send(el: AgUiChat, text: string): Promise<void> {
  sendNoWait(el, text);
  await flush();
}

/** Run one answer streamed as `count` deltas, and report the renders it cost. */
async function rendersFor(count: number): Promise<number> {
  const el = mountWithAgent((emit) => {
    emit.runStart();
    let buffer = "";
    for (let i = 0; i < count; i += 1) {
      buffer += `token${i} `;
      emit.text(buffer);
    }
    emit.textEnd(buffer);
    emit.runEnd();
  });
  counter.renders = 0;
  await send(el, "write something");
  return counter.renders;
}

describe("streaming text deltas", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    counter.renders = 0;
  });

  it("costs the same number of renders whether the answer arrives in 2 deltas or 20", async () => {
    const short = await rendersFor(2);
    const long = await rendersFor(20);
    expect(long).toBe(short);
  });

  it("still shows the whole answer once it has streamed", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.text("Pa");
      emit.text("Paris");
      emit.text("Paris, France");
      emit.textEnd("Paris, France");
      emit.runEnd();
    });
    await send(el, "capital of France?");

    const bubbles = shadow(el).querySelectorAll(".message--assistant");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]?.textContent).toBe("Paris, France");
  });

  it("draws the queued deltas on the next frame, into the same bubble", async () => {
    // A long answer must appear as it streams, not only when it ends — so the
    // coalesced render has to land on its own, without a text end to force it.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mountWithAgent(async (emit) => {
      emit.runStart();
      emit.text("half an ans");
      await gate;
      emit.textEnd("half an answer");
      emit.runEnd();
    });
    sendNoWait(el, "go");
    await flush();

    const bubble = shadow(el).querySelector(".message--assistant");
    await frame();
    expect(bubble?.textContent).toBe("half an ans");

    release();
    await flush();
    // The same node all along: a rebuilt bubble is a lost selection and a lost
    // focus, every token.
    expect(shadow(el).querySelector(".message--assistant")).toBe(bubble);
    expect(bubble?.textContent).toBe("half an answer");
  });

  it("keeps the last delta when the run is stopped before the next frame", async () => {
    // The tail: a cancel lands between the delta and the frame that would have
    // drawn it, and the partial answer must survive into the transcript.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = mountWithAgent(async (emit) => {
      emit.runStart();
      emit.text("partial ans");
      await gate;
    });
    sendNoWait(el, "go");
    await flush();

    shadow(el).querySelector<HTMLButtonElement>(".send")?.click(); // reads "Stop"
    release();
    await flush();

    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("partial ans");
  });

  it("keeps the last delta when the round ends before the next frame", async () => {
    // Same edge, reached by a round boundary rather than a cancel: a text
    // message the server never closed, followed by RUN_FINISHED.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.text("unclosed answer");
      emit.runEnd();
    });
    await send(el, "go");

    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("unclosed answer");
  });
});
