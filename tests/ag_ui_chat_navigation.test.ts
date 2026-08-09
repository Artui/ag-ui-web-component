/**
 * Navigation continuity — what happens when the page moves under a run.
 *
 * Two halves, both about the same hazard and neither solvable by pushing fresh
 * context at a running agent (AG-UI has no client-initiated mid-run channel):
 *
 * - **After the fact** — a run that never produced a response is reported on the
 *   next mount instead of vanishing from the transcript.
 * - **During** — a tool call issued against a page that has since moved is
 *   refused rather than allowed to act on whatever happens to match.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  // Each stale-page test moves the URL; reset so the next one starts level.
  window.history.replaceState({}, "", "/");
});

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

/** Mount with a seeded store, as a reload onto an existing thread would. */
async function mountWithHistory(
  messages: readonly unknown[],
  seed?: (store: SessionStorageStore, threadId: string) => void,
): Promise<AgUiChat> {
  const store = new SessionStorageStore();
  const threadId = store.threadId();
  store.saveMessages(threadId, messages as never);
  seed?.(store, threadId);

  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.conversationStore = store;
  el.agentFactory = () => makeFakeAgent({ script: (emit: Emit) => emit.runEnd() }).agent;
  document.body.appendChild(el);
  await flush();
  return el;
}

function interruptedNotice(el: AgUiChat): Element | null {
  return shadow(el).querySelector(".run-notice--interrupted");
}

describe("interrupted-run notice", () => {
  it("reports a run whose response never arrived", async () => {
    // `send()` persists the user turn *before* starting the run, so a
    // transcript ending on it means nothing ever came back.
    const el = await mountWithHistory([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
      { id: "3", role: "user", content: "delete the draft" },
    ]);

    expect(interruptedNotice(el)).not.toBeNull();
  });

  it("stays quiet when the previous run completed", async () => {
    const el = await mountWithHistory([
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
    ]);

    expect(interruptedNotice(el)).toBeNull();
  });

  it("stays quiet on a thread with no history at all", async () => {
    const el = await mountWithHistory([]);

    expect(interruptedNotice(el)).toBeNull();
  });

  it("stays quiet when a checkpoint exists — the resume path owns that case", async () => {
    // An agent-initiated navigating tool leaves a checkpoint and resumes. Its
    // transcript also ends on a user turn, so without the checkpoint check
    // this would double-report a run that is about to continue normally.
    const el = await mountWithHistory(
      [{ id: "1", role: "user", content: "open the form" }],
      (store, threadId) => {
        store.saveCheckpoint(threadId, { toolCallId: "tc1" });
      },
    );

    expect(interruptedNotice(el)).toBeNull();
  });
});

/** Mount a live element whose agent script can move the page mid-round. */
function mountLive(script: (emit: Emit) => void): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

/**
 * A script that moves the page, then calls `tool`.
 *
 * The client builds each round's context *before* invoking the agent, so moving
 * the URL from inside the script reproduces exactly the race the guard exists
 * for: the agent was shown page A and its tool call lands on page B.
 */
function moveThenCall(tool: string, args: Record<string, unknown> = {}): (emit: Emit) => void {
  let round = 0;
  return (emit: Emit) => {
    if (round === 0) {
      window.history.pushState({}, "", "/moved/");
      emit.toolCall("tc1", tool, args);
    }
    round += 1;
  };
}

function cardStatus(el: AgUiChat): string | null {
  return shadow(el).querySelector<HTMLElement>(".tool-call")?.getAttribute("data-status") ?? null;
}

describe("stale-page tool guard", () => {
  it("refuses a tool call issued against a page that has since moved", async () => {
    let ran = false;
    const el = mountLive(moveThenCall("fill_field"));
    el.getPageMap = () => ({ route: "/orders/" });
    el.registerTool({
      name: "fill_field",
      description: "fill",
      parameters: { type: "object" },
      handler: () => {
        ran = true;
        return "filled";
      },
    });

    await send(el, "fill the name");

    // The handler must not have run: a same-named control on the new page would
    // have matched silently, which is the failure this guard exists to prevent.
    expect(ran).toBe(false);
    expect(cardStatus(el)).toBe("error");
  });

  it("lets read_page through — it is the recovery, not a victim", async () => {
    const el = mountLive(moveThenCall("read_page"));
    el.getPageMap = () => ({ route: "/moved/" });

    await send(el, "where am I");

    expect(cardStatus(el)).toBe("done");
  });

  it("lets a navigating tool through — moving the page is its job", async () => {
    let ran = false;
    const el = mountLive(moveThenCall("go_somewhere"));
    el.getPageMap = () => ({ route: "/orders/" });
    // An SPA router, so the navigating tool routes in-page and the loop
    // continues rather than halting for a reload.
    el.navigate = () => {};
    el.registerTool({
      name: "go_somewhere",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => {
        ran = true;
        return "navigated";
      },
    });

    await send(el, "go to orders");

    expect(ran).toBe(true);
    expect(cardStatus(el)).toBe("done");
  });

  it("does not guard when the host set no page-map provider", async () => {
    let ran = false;
    const el = mountLive(moveThenCall("ping"));
    el.registerTool({
      name: "ping",
      description: "ping",
      parameters: { type: "object" },
      handler: () => {
        ran = true;
        return "pong";
      },
    });

    await send(el, "ping");

    // No page map ⇒ no `read_page` to recommend and no page-scoped tools.
    expect(ran).toBe(true);
    expect(cardStatus(el)).toBe("done");
  });

  it("runs normally while the page stays put", async () => {
    let ran = false;
    let round = 0;
    const el = mountLive((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "fill_field", {});
      }
      round += 1;
    });
    el.getPageMap = () => ({ route: "/orders/" });
    el.registerTool({
      name: "fill_field",
      description: "fill",
      parameters: { type: "object" },
      handler: () => {
        ran = true;
        return "filled";
      },
    });

    await send(el, "fill the name");

    expect(ran).toBe(true);
    expect(cardStatus(el)).toBe("done");
  });
});
