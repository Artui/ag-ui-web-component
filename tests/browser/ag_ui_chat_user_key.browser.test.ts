/**
 * A `user-key` handover, against the `sessionStorage` a real browser keeps.
 *
 * The happy-dom suite covers every half of it -- recall, waivers, shared state,
 * the unread count, the drawer, the composer. This is the half that matters
 * most, the previous principal's words gone from the tab, checked where the
 * storage is the browser's own rather than an emulation of it: after a change
 * made while detached, after a run still streaming when the key changed, and
 * with a store the host assigned to keep message bodies off the client.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../../src/core/conversation_store.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { RemoteConversationStore } from "../../src/core/remote_conversation_store.js";

const SECRET = "alice's account balance is 12345";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("user-key", "alice");
  document.body.appendChild(el);
  return el;
}

/** Every key and value in `sessionStorage`, as one string. */
function dumpStorage(): string {
  const lines: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    lines.push(`${key}=${key === null ? "" : sessionStorage.getItem(key)}`);
  }
  return lines.join("\n");
}

/** Save one message from alice under the element's own store, and check it landed. */
function aliceSays(el: AgUiChat): void {
  const store = el.conversationStore;
  store.saveMessages(store.threadId(), [{ id: "m1", role: "user", content: SECRET }] as never);
  expect(dumpStorage()).toContain(SECRET);
}

/**
 * Answer the agent endpoint with a run that is still streaming `text` when the
 * test looks, and stays open until the request is aborted; leave every other
 * request alone, since the browser runner talks over `fetch` too.
 */
function holdRun(text: string): () => void {
  const original = globalThis.fetch;
  const encoder = new TextEncoder();
  const frame = (event: Record<string, unknown>): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), location.href).pathname;
    if (path === "/agent/threads/") {
      return Promise.resolve(Response.json({ threads: [] }));
    }
    if (path !== "/agent/") {
      return original(input, init);
    }
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(frame({ type: "RUN_STARTED", threadId: "t1", runId: "r1" }));
        controller.enqueue(
          frame({ type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" }),
        );
        controller.enqueue(frame({ type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: text }));
        init?.signal?.addEventListener("abort", () => {
          controller.error(new DOMException("The operation was aborted.", "AbortError"));
        });
      },
    });
    return Promise.resolve(
      new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
    );
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Drain real tasks: a streamed body and an aborted one both settle across several. */
async function settle(): Promise<void> {
  for (let index = 0; index < 10; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function send(el: AgUiChat, text: string): void {
  const input = el.shadowRoot?.querySelector<HTMLTextAreaElement>(".input");
  if (input === null || input === undefined) {
    throw new Error("expected a composer");
  }
  input.value = text;
  el.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.click();
}

describe("user-key changed while detached (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("purges the previous principal's conversation from the tab", () => {
    const el = mount();
    aliceSays(el);

    el.remove();
    el.setAttribute("user-key", "bob");
    document.body.appendChild(el);

    expect(dumpStorage()).not.toContain(SECRET);
  });

  it("keeps it on a move that keeps the key", () => {
    const el = mount();
    aliceSays(el);

    el.remove();
    document.body.appendChild(el);

    expect(dumpStorage()).toContain(SECRET);
  });
});

describe("user-key changed while connected (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  let restore: () => void = () => undefined;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    restore();
    restore = () => undefined;
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("saves nothing of a run it stopped into the next principal's storage", async () => {
    // The stopped run saves what it had once its request closes, which is after
    // the store was purged and scoped to the principal who arrived.
    restore = holdRun(SECRET);
    const el = mount();
    send(el, "what is my balance?");
    await settle();
    // The control: the run is in flight.
    expect(el.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.title).toBe("Stop");

    el.setAttribute("user-key", "bob");
    await settle();

    expect(dumpStorage()).not.toContain(SECRET);
    expect(dumpStorage()).not.toContain("what is my balance?");
  });

  it("keeps a store the host assigned to keep bodies off the client", async () => {
    // Assigned after connecting, so connecting never saw it. A key change used
    // to replace it with the element's own store, which caches every body.
    restore = holdRun("unused");
    const el = mount();
    const injected = new RemoteConversationStore(
      "/agent/threads/",
      () => ({}),
      new SessionStorageStore("host-ns"),
      () => "same-origin",
      false,
    );
    el.conversationStore = injected;

    el.setAttribute("user-key", "bob");
    await settle();
    el.conversationStore.saveMessages("t1", [{ id: "m1", role: "user", content: SECRET }] as never);

    expect(dumpStorage()).not.toContain(SECRET);
    expect(el.conversationStore).toBe(injected);
  });
});
