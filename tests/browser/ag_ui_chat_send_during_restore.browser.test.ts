/**
 * A host's send in the same task as the insertion, against the browser's own
 * `sessionStorage`.
 *
 * The built-in store answers a restore in a microtask, so the only send that
 * lands while it loads is one made in the same task as the insertion: a script
 * right after the append, a framework ref callback, a layout effect. That send
 * went out carrying only its own turn, its save replaced the stored
 * conversation, and the replay then drew that conversation under it. The
 * happy-dom suite holds the same case; this one holds it where both the
 * storage and the microtask ordering are the browser's own.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.id = "restore-send";
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  document.body.appendChild(el);
  return el;
}

/**
 * Answer the agent endpoint with one short run per request, recording each
 * request's messages as role and text; leave every other request alone, since
 * the browser runner talks over `fetch` too.
 */
function answerRuns(): { sent: [string, unknown][][]; restore: () => void } {
  const original = globalThis.fetch;
  const sent: [string, unknown][][] = [];
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), location.href).pathname;
    if (path !== "/agent/") {
      return original(input, init);
    }
    const body = JSON.parse(String(init?.body)) as {
      threadId: string;
      messages: { role: string; content?: unknown }[];
    };
    sent.push(body.messages.map((m) => [m.role, m.content]));
    const n = sent.length;
    const events = [
      { type: "RUN_STARTED", threadId: body.threadId, runId: `run-${n}` },
      { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
      { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
      { type: "RUN_FINISHED", threadId: body.threadId, runId: `run-${n}` },
    ];
    return Promise.resolve(
      new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
  }) as typeof fetch;
  return {
    sent,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

/** Each bubble's role and text, in the order drawn, without the action row. */
function transcript(el: AgUiChat): [string, string][] {
  return [...(el.shadowRoot?.querySelectorAll<HTMLElement>(".message") ?? [])].map((bubble) => {
    const shown = bubble.cloneNode(true) as HTMLElement;
    for (const bar of shown.querySelectorAll(".message-actions")) {
      bar.remove();
    }
    const role = bubble.classList.contains("message--user") ? "user" : "assistant";
    return [role, shown.textContent?.trim() ?? ""];
  });
}

async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("a host send made as the element is inserted", () => {
  let endpoint: ReturnType<typeof answerRuns>;

  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    sessionStorage.clear();
    endpoint = answerRuns();
  });

  afterEach(() => {
    endpoint.restore();
    document.body.replaceChildren();
    sessionStorage.clear();
  });

  it("carries the stored conversation, drawn above it, and keeps it stored", async () => {
    const first = mount();
    const store = first.conversationStore;
    const threadId = store.threadId();
    store.saveMessages(threadId, [
      { id: "u0", role: "user", content: "earlier question" },
      { id: "a0", role: "assistant", content: "earlier answer" },
    ] as never);
    first.remove();

    const el = mount();
    const sent = await el.sendMessage("on load");
    await settle();

    expect(endpoint.sent).toEqual([
      [
        ["user", "earlier question"],
        ["assistant", "earlier answer"],
        ["user", "on load"],
      ],
    ]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
      ["user", "on load"],
      ["assistant", "answer 1"],
    ]);
    const kept = await el.conversationStore.loadMessages(threadId);
    expect(kept?.map((m) => m.content)).toEqual([
      "earlier question",
      "earlier answer",
      "on load",
      "answer 1",
    ]);
    expect(sent).toBe(true);
  });
});
