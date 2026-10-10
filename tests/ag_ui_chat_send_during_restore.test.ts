/**
 * A send made while the element is still restoring a stored conversation that
 * has no run to resume.
 *
 * Every restore awaits the store, and until it answers the conversation's
 * client is seeded from nothing. A send in that window went out carrying only
 * its own turn, so the agent answered without the conversation, and its save
 * replaced the stored one with the new exchange. The restore then drew the
 * stored conversation under the new turn, and the client built for the send
 * stayed cached without it, so every later turn in the page went out without
 * it too. A Retry in the window found nothing to retry, but built and cached
 * that same empty client on the way.
 *
 * Now every restore holds the composer as a send holds it. A host's
 * `sendMessage` waits for the restore and then sends, with the conversation;
 * the built-in Send queues behind it; a Retry and a checkpoint pick refuse.
 * A restore that will resume a run keeps refusing a host's send, which
 * `ag_ui_chat_reload_mid_run.test.ts` holds.
 *
 * Each send is checked three ways, because each was wrong on its own: the
 * request the endpoint received, the transcript as drawn, and what the store
 * was left holding.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../src/core/run_index.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

defineAgUiChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A conversation as a store holds it after one finished exchange. */
function exchange(question: string, answer: string): readonly Message[] {
  return [
    { id: `${question}-u`, role: "user", content: question },
    { id: `${question}-a`, role: "assistant", content: answer },
  ];
}

const EARLIER = exchange("earlier question", "earlier answer");

/** What a request carries for {@link EARLIER}, reduced by {@link wire}. */
const EARLIER_SENT = [
  { role: "user", content: "earlier question" },
  { role: "assistant", calls: [] },
];

/** A store whose every load waits to be answered, holding several threads. */
interface GatedStore extends ClientConversationStore {
  /** What the store holds for `threadId` now. */
  held(threadId: string): readonly Message[];
  /** Answer the `n`th load, from zero, with what the store held when it was asked. */
  answer(n: number): void;
  /** Fail the `n`th load. */
  fail(n: number, error: Error): void;
  /** How many loads have been asked for. */
  loads(): number;
}

/**
 * An injected store rather than the built-in one, because the element
 * re-namespaces a `SessionStorageStore` it is handed, and because a load here
 * answers only when the test says so, as a remote store answers after a round
 * trip. It answers with what it held when asked, as a remote store's request
 * does: the server's row is what it was when the request went out, whatever
 * the element saves to its local copy meanwhile.
 */
function gatedStore(threads: Readonly<Record<string, readonly Message[]>>): GatedStore {
  const saved = new Map<string, readonly Message[]>(
    Object.entries(threads).map(([id, messages]) => [id, copy(messages)]),
  );
  let active = Object.keys(threads)[0] ?? "t1";
  const gates: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const gate = (n: number): { resolve: () => void; reject: (error: Error) => void } => {
    const found = gates[n];
    if (found === undefined) {
      throw new Error(`no load ${n} to answer; ${gates.length} asked`);
    }
    return found;
  };
  return {
    held: (threadId) => copy(saved.get(threadId) ?? []),
    answer: (n) => gate(n).resolve(),
    fail: (n, error) => gate(n).reject(error),
    loads: () => gates.length,
    threadId: () => active,
    setActiveThread: (threadId) => {
      active = threadId;
    },
    loadMessages: (threadId) => {
      const messages = saved.get(threadId) ?? [];
      const answer = messages.length === 0 ? null : copy(messages);
      return new Promise<void>((resolve, reject) => {
        gates.push({ resolve, reject });
      }).then(() => answer);
    },
    saveMessages: (threadId, messages) => {
      saved.set(threadId, copy(messages));
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: (threadId) => {
      saved.delete(threadId);
    },
    listThreads: (): Promise<readonly ThreadMeta[]> =>
      Promise.resolve(
        [...saved.keys()].map((threadId, i) => ({
          threadId,
          title: threadId,
          updatedAt: i,
          preview: "",
        })),
      ),
    renameThread: () => {},
  };
}

function copy(messages: readonly Message[]): readonly Message[] {
  return JSON.parse(JSON.stringify(messages)) as readonly Message[];
}

/** The history a request carried, reduced to roles, texts and call ids. */
function wire(messages: readonly unknown[]): unknown[] {
  return messages.map((raw) => {
    const m = raw as { role: string; content?: unknown; toolCalls?: unknown };
    if (m.role === "assistant") {
      const calls = (m.toolCalls as { id: string }[] | undefined) ?? [];
      return { role: m.role, calls: calls.map((c) => c.id) };
    }
    return { role: m.role, content: m.content };
  });
}

/** What a stored conversation holds, as role and text. */
function stored(messages: readonly Message[]): [string, unknown][] {
  return messages.map((m) => [m.role, m.content]);
}

const RUN: RunRow = {
  run_id: "r1",
  thread_id: "t1",
  parent_run_id: null,
  started_at: "2026-07-27T12:00:00+00:00",
  continuable: true,
};

/**
 * Stand in for the AG-UI endpoint, recording each run request's history. Run
 * N says "answer N". The runs index, which the checkpoint panel reads, is the
 * one request with no body, and is not a run.
 */
function stubEndpoint(): unknown[][] {
  const sent: unknown[][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.body === undefined) {
        return new Response(JSON.stringify({ runs: [RUN] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(String(init.body)) as {
        threadId: string;
        messages: readonly Message[];
      };
      sent.push(wire(body.messages));
      const n = sent.length;
      const stream = [
        { type: "RUN_STARTED", threadId: body.threadId, runId: `run-${n}` },
        { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
        { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
        { type: "RUN_FINISHED", threadId: body.threadId, runId: `run-${n}` },
      ];
      return new Response(stream.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return sent;
}

/** Mount over `store`, or the built-in store when none is given, with the element's own agent. */
function mount(store?: ClientConversationStore, attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  if (store !== undefined) {
    el.conversationStore = store;
  }
  document.body.appendChild(el);
  return el;
}

/** Macrotask ticks: the real `HttpAgent` hands events on across timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/** Each bubble's role and text, in the order drawn, without the action row. */
function transcript(el: AgUiChat): [string, string][] {
  return [...shadow(el).querySelectorAll<HTMLElement>(".message")].map((bubble) => {
    const shown = bubble.cloneNode(true) as HTMLElement;
    for (const bar of shown.querySelectorAll(".message-actions")) {
      bar.remove();
    }
    const role = bubble.classList.contains("message--user") ? "user" : "assistant";
    return [role, shown.textContent?.trim() ?? ""];
  });
}

function queued(el: AgUiChat): (string | null)[] {
  return [...shadow(el).querySelectorAll(".queued-chip")].map((chip) => chip.textContent);
}

/** Type `text` and press the built-in Send. */
function press(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

/** Every `ag-ui-submit` the element dispatches, by its content. */
function submits(el: AgUiChat): string[] {
  const heard: string[] = [];
  el.addEventListener("ag-ui-submit", (event) => {
    heard.push((event as CustomEvent<{ content: string }>).detail.content);
  });
  return heard;
}

describe("a send while a stored conversation with no run to resume loads", () => {
  it("waits for the load, then sends with the conversation drawn above it", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    const heard = submits(el);
    await settle();

    const sending = el.sendMessage("meanwhile");
    await settle();
    // Nothing yet: no request, no bubble and no event while the store has not
    // answered, because the conversation the turn follows is not drawn yet.
    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
    expect(heard).toEqual([]);

    store.answer(0);
    const sendingResult = await sending;
    await settle();

    expect(sent).toEqual([[...EARLIER_SENT, { role: "user", content: "meanwhile" }]]);
    expect(heard).toEqual(["meanwhile"]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
      ["user", "meanwhile"],
      ["assistant", "answer 1"],
    ]);
    expect(stored(store.held("t1"))).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
      ["user", "meanwhile"],
      ["assistant", "answer 1"],
    ]);
    expect(sendingResult).toBe(true);
  });

  it("sends the turns after it with the conversation too", async () => {
    // The client a send in the window built stayed cached without the
    // conversation, so the next turn went out without it as well.
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const sending = el.sendMessage("meanwhile");
    store.answer(0);
    await sending;
    await settle();
    await el.sendMessage("and then");
    await settle();

    expect(sent).toEqual([
      [...EARLIER_SENT, { role: "user", content: "meanwhile" }],
      [
        ...EARLIER_SENT,
        { role: "user", content: "meanwhile" },
        { role: "assistant", calls: [] },
        { role: "user", content: "and then" },
      ],
    ]);
  });

  it("refuses a second host send while the first waits", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const first = el.sendMessage("first");
    const second = await el.sendMessage("second");
    store.answer(0);
    await first;
    await settle();

    expect(sent).toEqual([[...EARLIER_SENT, { role: "user", content: "first" }]]);
    expect(second).toBe(false);
  });

  it("queues the built-in Send, and sends it after the load with the conversation", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    press(el, "typed meanwhile");
    await settle();
    const parked = queued(el);
    expect(sent).toEqual([]);
    store.answer(0);
    await settle();

    expect(parked).toEqual(["typed meanwhile"]);
    expect(queued(el)).toEqual([]);
    expect(sent).toEqual([[...EARLIER_SENT, { role: "user", content: "typed meanwhile" }]]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
      ["user", "typed meanwhile"],
      ["assistant", "answer 1"],
    ]);
  });

  it("sends a waiting host send before a turn the built-in Send queued", async () => {
    // The host's call is almost always the prompt fired on load, made before
    // anyone could type, so it goes first and the typed turn follows its run.
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const sending = el.sendMessage("on load");
    press(el, "typed meanwhile");
    store.answer(0);
    const sendingResult = await sending;
    await settle();

    expect(sent).toEqual([
      [...EARLIER_SENT, { role: "user", content: "on load" }],
      [
        ...EARLIER_SENT,
        { role: "user", content: "on load" },
        { role: "assistant", calls: [] },
        { role: "user", content: "typed meanwhile" },
      ],
    ]);
    expect(transcript(el).map(([, text]) => text)).toEqual([
      "earlier question",
      "earlier answer",
      "on load",
      "answer 1",
      "typed meanwhile",
      "answer 2",
    ]);
    expect(sendingResult).toBe(true);
  });

  it("refuses a Retry, and the next send still carries the conversation", async () => {
    // The Retry found nothing to retry, but built the conversation's client on
    // the way, from nothing, and that client stayed cached.
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const retried = await el.retryLastTurn();
    store.answer(0);
    await settle();
    await el.sendMessage("after the load");
    await settle();

    expect(retried).toBe(false);
    expect(sent).toEqual([[...EARLIER_SENT, { role: "user", content: "after the load" }]]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
      ["user", "after the load"],
      ["assistant", "answer 1"],
    ]);
  });

  it("refuses a pick, and says it is still loading", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store, { "data-runs-url": "/agent/runs/" });
    await settle();

    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await settle();
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "and now sort them";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await settle();
    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe(DEFAULT_UI_STRINGS.continueWhileLoading);
    expect(input.value).toBe("and now sort them");
    store.answer(0);
    await settle();

    expect(sent).toEqual([]);
    expect(stored(store.held("t1"))).toEqual(stored(EARLIER));
  });

  it("refuses a pick with the running wording once the load is done", async () => {
    // The load wording is the load's alone: once the restore has ended, a
    // pick behind a send is refused as it is behind any run.
    stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store, { "data-runs-url": "/agent/runs/" });
    store.answer(0);
    await settle();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await settle();

    const sending = el.sendMessage("after the load");
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "and now sort them";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await sending;

    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    expect(hint?.textContent).toBe(DEFAULT_UI_STRINGS.continueWhileRunning);
  });

  it("drops the waiting send and the queued turn when New chat is pressed", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    const heard = submits(el);
    await settle();

    const sending = el.sendMessage("meanwhile");
    press(el, "typed meanwhile");
    el.newChat();
    // Dropped as the chat is cleared, not once the abandoned load answers.
    const sendingResult = await sending;
    store.answer(0);
    await settle();

    expect(sent).toEqual([]);
    expect(heard).toEqual([]);
    expect(queued(el)).toEqual([]);
    expect(transcript(el)).toEqual([]);
    expect(stored(store.held("t1"))).toEqual(stored(EARLIER));
    expect(sendingResult).toBe(false);
  });

  it("drops the waiting send on a drawer switch, and a send then carries the picked thread", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER, t2: exchange("other question", "other answer") });
    const el = mount(store);
    await settle();

    const waiting = el.sendMessage("for the first");
    el.openThreads();
    await settle();
    const row = [...shadow(el).querySelectorAll<HTMLElement>(".drawer-row")].find(
      (r) => r.querySelector(".drawer-row-title")?.textContent === "t2",
    );
    row?.querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
    const waitingResult = await waiting;
    const picked = el.sendMessage("for the second");
    // The abandoned load answering ends a restore that is not the one this
    // send waits on, so it goes on waiting.
    store.answer(0);
    await settle();
    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
    store.answer(1);
    const pickedResult = await picked;
    await settle();

    expect(sent).toEqual([
      [
        { role: "user", content: "other question" },
        { role: "assistant", calls: [] },
        { role: "user", content: "for the second" },
      ],
    ]);
    expect(transcript(el)).toEqual([
      ["user", "other question"],
      ["assistant", "other answer"],
      ["user", "for the second"],
      ["assistant", "answer 1"],
    ]);
    expect(stored(store.held("t1"))).toEqual(stored(EARLIER));
    expect(waitingResult).toBe(false);
    expect(pickedResult).toBe(true);
  });

  it("keeps the waiting send through a first user-key, which adopts the conversation", async () => {
    // Signing in on an anonymous conversation moves it under the principal
    // and restores nothing, so the conversation the send waits on is the one
    // still loading, and it goes out after it.
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const sending = el.sendMessage("meanwhile");
    el.userKey = "alice";
    store.answer(0);
    const sendingResult = await sending;
    await settle();

    expect(store.loads()).toBe(1);
    expect(sent).toEqual([[...EARLIER_SENT, { role: "user", content: "meanwhile" }]]);
    expect(sendingResult).toBe(true);
  });

  it("drops the waiting send on a user-key handover", async () => {
    // From one principal to another. From none to one is an adoption, which
    // keeps the conversation on screen, and the send with it.
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store, { "user-key": "alice" });
    const heard = submits(el);
    await settle();

    const sending = el.sendMessage("meanwhile");
    el.userKey = "bob";
    const sendingResult = await sending;
    store.answer(0);
    store.answer(1);
    await settle();

    expect(sent).toEqual([]);
    expect(heard).toEqual([]);
    expect(sendingResult).toBe(false);
  });

  it("drops the waiting send when the element leaves the page", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    const heard = submits(el);
    await settle();

    const sending = el.sendMessage("meanwhile");
    el.remove();
    store.answer(0);

    const sendingResult = await sending;
    await settle();
    expect(sent).toEqual([]);
    expect(heard).toEqual([]);
    expect(sendingResult).toBe(false);
  });

  it("drops the waiting send when the host reloads", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const sending = el.sendMessage("meanwhile");
    const reloading = el.reload();
    const sendingResult = await sending;
    store.answer(0);
    store.answer(1);
    await reloading;
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "earlier answer"],
    ]);
    expect(sendingResult).toBe(false);
  });

  it("still sends what waited when the store fails to answer", async () => {
    // Into the empty conversation the page is left showing, as a turn typed
    // after the failure would be. The resume hold's counterpart is "sends what
    // it parked when the store fails to answer".
    const sent = stubEndpoint();
    const store = gatedStore({ t1: EARLIER });
    const el = mount(store);
    await settle();

    const reloading = el.reload();
    const sending = el.sendMessage("meanwhile");
    store.fail(1, new Error("offline"));
    await expect(reloading).rejects.toThrow("offline");
    const sendingResult = await sending;
    await settle();

    expect(sent).toEqual([[{ role: "user", content: "meanwhile" }]]);
    expect(transcript(el)).toEqual([
      ["user", "meanwhile"],
      ["assistant", "answer 1"],
    ]);
    expect(sendingResult).toBe(true);
  });

  it("carries the conversation for a send in the same task as the insertion, over the built-in store", async () => {
    // The built-in store answers in a microtask, so only a send in the same
    // task as the insertion lands in the window: a script right after the
    // append, a framework ref callback, a layout effect.
    const sent = stubEndpoint();
    const first = mount(undefined, { id: "chat" });
    await first.sendMessage("earlier question");
    await settle();
    first.remove();

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.id = "chat";
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-start-open", "");
    document.body.appendChild(el);
    const sending = el.sendMessage("on load");
    const sendingResult = await sending;
    await settle();

    expect(sent).toEqual([
      [{ role: "user", content: "earlier question" }],
      [
        { role: "user", content: "earlier question" },
        { role: "assistant", calls: [] },
        { role: "user", content: "on load" },
      ],
    ]);
    expect(transcript(el)).toEqual([
      ["user", "earlier question"],
      ["assistant", "answer 1"],
      ["user", "on load"],
      ["assistant", "answer 2"],
    ]);
    expect(sendingResult).toBe(true);
  });
});

describe("what sendMessage resolves to", () => {
  it("is false for an empty message", async () => {
    stubEndpoint();
    const el = mount(gatedStore({}));
    expect(await el.sendMessage("")).toBe(false);
  });

  it("is false while a run is in flight", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({});
    const el = mount(store);
    store.answer(0);
    await settle();

    const first = el.sendMessage("first");
    const second = await el.sendMessage("second");
    expect(await first).toBe(true);
    expect(second).toBe(false);
    await settle();
    expect(sent).toHaveLength(1);
  });

  it("is false when no endpoint is set, since nothing was sent", async () => {
    const sent = stubEndpoint();
    const store = gatedStore({});
    const el = mount(store);
    el.removeAttribute("endpoint");
    store.answer(0);
    await settle();
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await el.sendMessage("hello")).toBe(false);
    expect(sent).toEqual([]);
  });
});
