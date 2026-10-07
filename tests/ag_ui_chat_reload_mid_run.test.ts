/**
 * A page reload in the middle of a run, and what the restored conversation says
 * about the calls that run left unanswered.
 *
 * The run loop persists a round's history when its stream ends -- *before* it
 * asks the user about a gated call, and before it runs a frontend tool. A reload
 * in that window therefore leaves a stored assistant turn whose calls have no
 * result, and the request that would have produced one died with the page. There
 * is no run left to answer them, so a restored card that waits for one waits for
 * good: it came back as a spinner with no Approve or Decline, and the next send
 * carried a tool call with no result, which several providers reject outright.
 *
 * The answer has to be true as well as present. Stop is a person answering the
 * open decision, so a stopped approval is a declined card and a declined result.
 * A reload answers nothing: the stored shape is the same whether the round was
 * waiting on a person or on a handler the reload killed, and neither was
 * refused. So every call a reload abandoned comes back as not finished, on the
 * card and in the result the next request carries.
 *
 * Every stored state here is captured from a real run at the moment a reload
 * would find it, never written by hand: the question is what *this element*
 * leaves behind, and a hand-written transcript only answers what its author
 * thought it left.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, TOOL_OUTCOME } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import type { HttpAgentOptions } from "../src/core/create_http_agent.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../src/core/run_index.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

const NOT_FINISHED =
  "Not finished: the run ended or moved on before this tool call returned a result.";

/** What a store holds at one instant: the transcript and the navigation checkpoint. */
interface Snapshot {
  readonly messages: readonly Message[];
  readonly checkpoint: NavigationCheckpoint | null;
}

/** A store that serialises, and can be read at the instant a reload would read it. */
interface MemoryStore extends ClientConversationStore {
  snapshot(): Snapshot;
}

/**
 * An injected store rather than the built-in one, because the element
 * re-namespaces a `SessionStorageStore` it is handed -- a reference kept here
 * would read a different store than the element writes. It round-trips through
 * JSON because the outcome annotation rides on a field `Message` does not
 * declare, so surviving serialisation is part of what is under test.
 *
 * Given `answered`, it loads as a remote store does: what it held when asked,
 * once `answered` settles. Without it, it answers in a microtask, as the
 * built-in store does.
 */
function memoryStore(seed?: Snapshot, answered?: Promise<void>): MemoryStore {
  let saved: readonly Message[] = seed === undefined ? [] : copy(seed.messages);
  let checkpoint: NavigationCheckpoint | null = seed?.checkpoint ?? null;
  return {
    snapshot: () => ({ messages: copy(saved), checkpoint }),
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> => {
      const messages = saved.length === 0 ? null : copy(saved);
      return answered === undefined ? Promise.resolve(messages) : answered.then(() => messages);
    },
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = copy(messages);
    },
    loadCheckpoint: (): NavigationCheckpoint | null => checkpoint,
    saveCheckpoint: (_threadId: string, next: NavigationCheckpoint | null): void => {
      checkpoint = next;
    },
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

/** Everything in `sessionStorage`, by key. */
function storageEntries(): Record<string, string | null> {
  const entries: Record<string, string | null> = {};
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key !== null) {
      entries[key] = sessionStorage.getItem(key);
    }
  }
  return entries;
}

function copy(messages: readonly Message[]): readonly Message[] {
  return JSON.parse(JSON.stringify(messages)) as readonly Message[];
}

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

/** One round of the fake agent, able to read the history the request carried. */
type Script = (emit: Emit, params: { resume?: unknown }, history: () => readonly unknown[]) => void;

/**
 * Mount a chat over `store`, driven by a scripted fake agent.
 *
 * The factory seeds the agent from `initialMessages`, as `HttpAgent` does. The
 * fake ignores the field on its own, and a test about what the *next* request
 * carries after a restore is a test of exactly that seed.
 */
function mount(
  store: MemoryStore,
  script: Script = () => {},
): { el: AgUiChat; handle: FakeAgentHandle } {
  // The script reads the agent's history through a thunk, because the handle
  // it reads does not exist yet when the script is written.
  const handle: FakeAgentHandle = makeFakeAgent({
    script: (emit, params) => script(emit, params, () => handle.messages),
  });
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  el.conversationStore = store;
  el.agentFactory = (config: HttpAgentOptions) => {
    (handle.agent as unknown as { setMessages(next: readonly unknown[]): void }).setMessages(
      config.initialMessages ?? [],
    );
    return handle.agent;
  };
  document.body.appendChild(el);
  return { el, handle };
}

/**
 * Reload the page onto what `snapshot` holds.
 *
 * Taken from the store *before* the old element goes: removing it runs
 * `disconnectedCallback`, which stops the run and so declines the decision --
 * a reload runs none of that, and a test that let it would be testing Stop.
 */
async function reload(
  snapshot: Snapshot,
  script?: Script,
): Promise<{ el: AgUiChat; handle: FakeAgentHandle; store: MemoryStore }> {
  document.body.innerHTML = "";
  const store = memoryStore(snapshot);
  const mounted = mount(store, script);
  await flush();
  return { ...mounted, store };
}

function sendNoWait(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

/** Press Stop, which is the Send button while a run is in flight. */
function stop(el: AgUiChat): void {
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

/** A card's state as a person reads it: the status, the result, and its heading. */
interface CardView {
  readonly status: string | null | undefined;
  readonly result: string | null | undefined;
  readonly label: string | null | undefined;
}

function cardView(el: AgUiChat): CardView {
  const card = shadow(el).querySelector<HTMLElement>(".tool-call");
  return {
    status: card?.getAttribute("data-status"),
    result: card?.querySelector(".tool-call-result")?.textContent,
    label: card?.querySelector(".tool-call-section--result .tool-call-section-label")?.textContent,
  };
}

/** The history a request carried, reduced to what a provider validates. */
function wire(messages: readonly unknown[]): unknown[] {
  return messages.map((raw) => {
    const m = raw as { role: string; content?: unknown; toolCallId?: string; toolCalls?: unknown };
    if (m.role === "tool") {
      return { role: m.role, toolCallId: m.toolCallId, content: m.content };
    }
    if (m.role === "assistant") {
      const calls = (m.toolCalls as { id: string }[] | undefined) ?? [];
      return { role: m.role, calls: calls.map((c) => c.id) };
    }
    return { role: m.role, content: m.content };
  });
}

/** A script that says nothing and records the history each request carried. */
function recording(seen: unknown[][]): Script {
  return (emit, _params, history) => {
    emit.runStart();
    seen.push(wire(history()));
  };
}

/** A destructive frontend tool, so calling it opens a confirmation card. */
function registerDelete(el: AgUiChat): void {
  el.registerTool({
    name: "delete_user",
    description: "delete",
    parameters: { type: "object", "x-destructive": true },
    handler: () => "deleted",
  });
}

/** The agent's first round calls `delete_user`; later rounds say nothing. */
function callsDeleteOnce(): (emit: Emit) => void {
  let round = 0;
  return (emit) => {
    emit.runStart();
    if (round === 0) {
      emit.toolCall("tc1", "delete_user", { id: 7 });
    }
    round += 1;
  };
}

/** Drive a run to the open confirmation card, and return the store at that moment. */
async function atConfirmation(): Promise<{ el: AgUiChat; store: MemoryStore }> {
  const store = memoryStore();
  const { el } = mount(store, callsDeleteOnce());
  registerDelete(el);
  sendNoWait(el, "delete user 7");
  await flush();
  expect(shadow(el).querySelector(".confirm")).not.toBeNull();
  return { el, store };
}

describe("reloading while a confirmation card is open", () => {
  it("persisted the call and no result for it", async () => {
    // The state every other test here restores, stated once: the round's
    // history was written when its stream ended, and nothing since.
    const { store } = await atConfirmation();

    const { messages, checkpoint } = store.snapshot();
    expect(wire(messages)).toEqual([
      { role: "user", content: "delete user 7" },
      { role: "assistant", calls: ["tc1"] },
    ]);
    expect(checkpoint).toBeNull();
  });

  it("restores the card as not finished rather than running, or declined", async () => {
    const { store } = await atConfirmation();

    const { el } = await reload(store.snapshot());

    expect(cardView(el)).toEqual({
      status: "interrupted",
      result: NOT_FINISHED,
      label: "Not finished",
    });
  });

  it("does not claim the decline Stop records, since nobody answered the card", async () => {
    const stopped = await atConfirmation();
    stop(stopped.el);
    await flush();
    const afterStop = await reload(stopped.store.snapshot());

    const reloaded = await atConfirmation();
    const afterReload = await reload(reloaded.store.snapshot());

    expect(cardView(afterStop.el).status).toBe("declined");
    expect(cardView(afterReload.el).status).toBe("interrupted");
  });

  it("sends a not-finished result for the call on the next turn, where Stop sends its decline", async () => {
    // A tool call with no result is a malformed turn to several providers. Both
    // ways out of the prompt send one, and each says what actually happened.
    const stopSeen: unknown[][] = [];
    const store = memoryStore();
    let round = 0;
    const live = mount(store, (emit, _params, history) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      } else {
        stopSeen.push(wire(history()));
      }
      round += 1;
    });
    registerDelete(live.el);
    sendNoWait(live.el, "delete user 7");
    await flush();
    const midApproval = store.snapshot();
    stop(live.el);
    await flush();
    sendNoWait(live.el, "never mind");
    await flush();

    const seen: unknown[][] = [];
    const { el } = await reload(midApproval, recording(seen));
    sendNoWait(el, "never mind");
    await flush();

    expect(seen[0]).toEqual([
      { role: "user", content: "delete user 7" },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: NOT_FINISHED },
      { role: "user", content: "never mind" },
    ]);
    expect(stopSeen[0]).toEqual([
      { role: "user", content: "delete user 7" },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: "User declined the action." },
      { role: "user", content: "never mind" },
    ]);
  });

  it("stores the answer, so a second reload shows the same", async () => {
    const { store } = await atConfirmation();
    const first = await reload(store.snapshot());
    sendNoWait(first.el, "never mind");
    await flush();

    const stored = first.store
      .snapshot()
      .messages.find((m) => m.role === "tool" && m.toolCallId === "tc1");
    expect(stored?.metadata).toEqual({ outcome: TOOL_OUTCOME.INTERRUPTED });

    const second = await reload(first.store.snapshot());
    expect(cardView(second.el).status).toBe("interrupted");
  });

  it("does not report the run as interrupted", async () => {
    // The card says what happened. The interrupted-run notice is for a turn that
    // ended on the user's own message, which this one did not.
    const { store } = await atConfirmation();

    const { el } = await reload(store.snapshot());

    expect(shadow(el).querySelector(".run-notice--interrupted")).toBeNull();
  });
});

describe("reloading while a frontend tool is still running", () => {
  it("does not leave its card running either", async () => {
    // The same stored shape as an open confirmation -- the round's history is
    // written before either the question or the handler -- and a handler the
    // reload killed has no result coming any more than an unanswered question
    // does. Declined would be a plain falsehood here: the call was running.
    const store = memoryStore();
    let round = 0;
    const { el } = mount(store, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc1", "slow_tool", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "slow_tool",
      description: "never finishes",
      parameters: { type: "object" },
      handler: () => new Promise(() => {}),
    });
    sendNoWait(el, "go");
    await flush();
    expect(cardView(el).status).toBe("pending");
    expect(wire(store.snapshot().messages)).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["tc1"] },
    ]);

    const restored = await reload(store.snapshot());

    expect(cardView(restored.el)).toMatchObject({ status: "interrupted", result: NOT_FINISHED });
  });
});

describe("reloading while a server-side approval is open", () => {
  /** A server tool the run defers on an approval interrupt. */
  function deferredDelete(emit: Emit, params: { resume?: unknown }): void {
    emit.runStart();
    if (params.resume === undefined) {
      emit.toolCall("call-1", "delete_thing", { target: "widget-1" });
      emit.interrupt([{ id: "int-call-1", reason: "tool_call", toolCallId: "call-1" } as never]);
    }
  }

  async function atApproval(): Promise<{ el: AgUiChat; store: MemoryStore }> {
    const store = memoryStore();
    const { el } = mount(store, deferredDelete);
    sendNoWait(el, "delete widget-1");
    await flush();
    expect(shadow(el).querySelector(".approval")).not.toBeNull();
    return { el, store };
  }

  it("restores the card as not finished, where it waited deferred", async () => {
    const { store } = await atApproval();

    const { el } = await reload(store.snapshot());

    expect(cardView(el)).toMatchObject({ status: "interrupted", result: NOT_FINISHED });
  });

  it("keeps the decline Stop gave it, and does not invent one for a reload", async () => {
    const stopped = await atApproval();
    stop(stopped.el);
    await flush();
    expect(cardView(stopped.el).status).toBe("declined");
    const afterStop = await reload(stopped.store.snapshot());

    const reloaded = await atApproval();
    const afterReload = await reload(reloaded.store.snapshot());

    expect(cardView(afterStop.el).status).toBe("declined");
    expect(cardView(afterReload.el).status).toBe("interrupted");
  });

  it("answers every approval it abandoned on the next turn, with no label on the wire", async () => {
    // Several approvals open at once, as a real page leaves them.
    const store = memoryStore();
    const { el } = mount(store, (emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        const ids = ["call-1", "call-2", "call-3"];
        for (const id of ids) {
          emit.toolCall(id, "delete_thing", { target: id });
        }
        emit.interrupt(
          ids.map((id) => ({ id: `int-${id}`, reason: "tool_call", toolCallId: id })) as never,
        );
      }
    });
    sendNoWait(el, "delete them");
    await flush();

    const sent: unknown[][] = [];
    const seen: unknown[][] = [];
    const restored = await reload(store.snapshot(), (emit, params, history) => {
      recording(seen)(emit, params, history);
      sent.push([...history()]);
    });
    sendNoWait(restored.el, "never mind");
    await flush();

    expect(seen[0]).toEqual([
      { role: "user", content: "delete them" },
      { role: "assistant", calls: ["call-1"] },
      { role: "assistant", calls: ["call-2"] },
      { role: "assistant", calls: ["call-3"] },
      { role: "tool", toolCallId: "call-1", content: NOT_FINISHED },
      { role: "tool", toolCallId: "call-2", content: NOT_FINISHED },
      { role: "tool", toolCallId: "call-3", content: NOT_FINISHED },
      { role: "user", content: "never mind" },
    ]);
    expect(sent[0]?.filter((message) => "outcome" in (message as object))).toEqual([]);
  });
});

describe("the navigating tool a reload was expected by", () => {
  it("resumes with the landed page's result, and its card says so", async () => {
    // The one reload that is part of the run: the tool checkpointed its call
    // before navigating, and the next mount answers it from the page it landed
    // on. It has no stored result either, and that must not make it look
    // abandoned.
    const store = memoryStore();
    let round = 0;
    const { el } = mount(store, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("nav-1", "open_changelist", { model: "Book" });
      }
      round += 1;
    });
    el.registerTool({
      name: "open_changelist",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => ({ ok: true }),
    });
    sendNoWait(el, "open the books");
    await flush();
    const snapshot = store.snapshot();
    expect(snapshot.checkpoint).toEqual({ toolCallId: "nav-1" });

    const seen: unknown[][] = [];
    const during: CardView[] = [];
    const restored = await reload(snapshot, (emit, params, history) => {
      recording(seen)(emit, params, history);
      const host = document.querySelector(ELEMENT_TAG) as AgUiChat;
      during.push(cardView(host));
    });

    // The call has its result before the resumed request is built -- the
    // landed page supplied it -- so its card says so while that request is
    // out, rather than spinning as though the navigation were still under way.
    expect(during).toHaveLength(1);
    expect(during[0]?.status).toBe("done");
    expect(during[0]?.result).toContain('"navigated": true');
    // And it keeps saying so once the run settles. Left unsettled, the sweep
    // that closes a run found it pending and called it not finished -- the
    // opposite of what happened, on the one call that is known to have.
    expect(cardView(restored.el)).toEqual(during[0]);
    // Settled from the result the next request carries, so the card a later
    // reload draws from the stored message is the one the landing page drew.
    const again = await reload(restored.store.snapshot());
    expect(cardView(again.el)).toEqual(during[0]);
    // The resumed request: the navigating call answered from the landed page,
    // and answered once.
    expect(seen).toEqual([
      [
        { role: "user", content: "open the books" },
        { role: "assistant", calls: ["nav-1"] },
        {
          role: "tool",
          toolCallId: "nav-1",
          content: expect.stringContaining('"navigated":true'),
        },
      ],
    ]);
    expect(shadow(restored.el).querySelector(".message--failed")).toBeNull();
    expect(cardView(restored.el).status).not.toBe("declined");
    expect(restored.store.snapshot().checkpoint).toBeNull();
  });
});

describe("a call the run went past", () => {
  it("is answered as not finished on the next turn, and restores as it settled", async () => {
    // A call nothing answered that the conversation then moved beyond: a name no
    // tool here owns, whose server sent no result. Live, the run settled it as
    // not finished, and the next request answered it in those words. It was not
    // abandoned by any reload, so the restore must not invent a decline for it.
    const store = memoryStore();
    let round = 0;
    const { el } = mount(store, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc-x", "unknown_tool", {});
      }
      round += 1;
    });
    sendNoWait(el, "first");
    await flush();
    expect(cardView(el)).toMatchObject({ status: "interrupted", result: NOT_FINISHED });
    sendNoWait(el, "second");
    await flush();

    const seen: unknown[][] = [];
    const restored = await reload(store.snapshot(), recording(seen));
    // Read before sending anything: the next run's own terminal sweep would
    // settle a card left spinning, and hide that the restore never did.
    expect(cardView(restored.el)).toMatchObject({ status: "interrupted", result: NOT_FINISHED });

    sendNoWait(restored.el, "third");
    await flush();

    expect(seen[0]).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", calls: ["tc-x"] },
      { role: "tool", toolCallId: "tc-x", content: NOT_FINISHED },
      { role: "user", content: "second" },
      { role: "user", content: "third" },
    ]);
  });
});

describe("a round that finished", () => {
  it("is restored exactly as it was stored", async () => {
    // The control. A round whose calls all have results is not abandoned, and a
    // second result appended for one of them would be a duplicate turn on the
    // next request -- which no card on screen would show, since a card keeps
    // the first outcome it settles to.
    const store = memoryStore();
    let round = 0;
    const { el } = mount(store, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc1", "lookup", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "lookup",
      description: "look something up",
      parameters: { type: "object" },
      handler: () => "found",
    });
    sendNoWait(el, "look it up");
    await flush();

    const seen: unknown[][] = [];
    const restored = await reload(store.snapshot(), recording(seen));
    expect(cardView(restored.el).status).toBe("done");
    sendNoWait(restored.el, "thanks");
    await flush();

    expect(seen[0]).toEqual([
      { role: "user", content: "look it up" },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: '"found"' },
      { role: "user", content: "thanks" },
    ]);
  });

  it("is not reopened by a call the same run answered with text", async () => {
    // A server that runs a tool without streaming its result, then answers:
    // the run went on past the call, so the reload abandoned nothing. The
    // answer closes the round even with no user turn after it.
    const store = memoryStore();
    let round = 0;
    const { el } = mount(store, (emit, _params, history) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc-s", "server_tool", {});
        emit.messagesSnapshot([
          ...(history() as { id: string; role: string; content: string }[]),
          { id: "answer", role: "assistant", content: "All done." },
        ]);
      }
      round += 1;
    });
    sendNoWait(el, "do the thing");
    await flush();

    const seen: unknown[][] = [];
    const restored = await reload(store.snapshot(), recording(seen));
    expect(cardView(restored.el)).toMatchObject({ status: "interrupted", result: NOT_FINISHED });
    sendNoWait(restored.el, "thanks");
    await flush();

    // Answered where the call was made, ahead of the text that moved past it.
    expect(seen[0]).toEqual([
      { role: "user", content: "do the thing" },
      { role: "assistant", calls: ["tc-s"] },
      { role: "tool", toolCallId: "tc-s", content: NOT_FINISHED },
      { role: "assistant", calls: [] },
      { role: "user", content: "thanks" },
    ]);
  });
});

/**
 * A reload that resumes, asked to start something else while the store answers.
 *
 * The resume is a run, and it starts only once the store has answered. With a
 * remote store that is a real request, and a send, a Retry or a pick in it was
 * refused by nothing: each built the conversation's client before the
 * conversation had loaded, so a send went out carrying none of it, and the
 * resume then ran on that client as a second run, answering a call its history
 * no longer held.
 *
 * Over the real `HttpAgent` with `fetch` stubbed, because the window ends when
 * the client starts a run, and the real one starts it a microtask after it is
 * asked, as it does in a page; the fake starts one only when its script says.
 */
describe("a reload that resumes, while the store is still answering", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const RUN: RunRow = {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: "2026-07-27T12:00:00+00:00",
    continuable: true,
  };

  /**
   * Stand in for the AG-UI endpoint, recording each run request's history as
   * `wire` reduces it. Run N says "answer N", or what `answer` gives it. The
   * runs index, which the checkpoint panel reads, is the one request with no
   * body, and is not a run.
   */
  function stubEndpoint(answer: (n: number) => readonly object[] = () => []): unknown[][] {
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
        const body = JSON.parse(String(init.body)) as { messages: readonly Message[] };
        sent.push(wire(body.messages));
        const n = sent.length;
        const events = answer(n);
        const said =
          events.length > 0
            ? events
            : [
                { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
                { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
                { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
              ];
        const stream = [
          { type: "RUN_STARTED", threadId: "t1", runId: `run-${n}` },
          ...said,
          { type: "RUN_FINISHED", threadId: "t1", runId: `run-${n}` },
        ];
        return new Response(stream.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );
    return sent;
  }

  /** Mount over `store` with the element's own agent, against the stubbed `fetch`. */
  function mountReal(store: MemoryStore, attrs: Record<string, string> = {}): AgUiChat {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-start-open", "");
    for (const [key, value] of Object.entries(attrs)) {
      el.setAttribute(key, value);
    }
    el.conversationStore = store;
    el.registerTool({
      name: "open_changelist",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => ({ ok: true }),
    });
    document.body.appendChild(el);
    return el;
  }

  /** Macrotask ticks: the real `HttpAgent` hands events on across timers. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
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

  /** Drive a real run to the navigating call, and return the store a reload finds. */
  async function atNavigation(): Promise<Snapshot> {
    stubEndpoint((n) =>
      n === 1
        ? [
            { type: "TOOL_CALL_START", toolCallId: "nav-1", toolCallName: "open_changelist" },
            { type: "TOOL_CALL_ARGS", toolCallId: "nav-1", delta: "{}" },
            { type: "TOOL_CALL_END", toolCallId: "nav-1" },
          ]
        : [],
    );
    const store = memoryStore();
    const el = mountReal(store);
    await el.sendMessage("open the books");
    await settle();
    const snapshot = store.snapshot();
    expect(snapshot.checkpoint).toEqual({ toolCallId: "nav-1" });
    vi.unstubAllGlobals();
    return snapshot;
  }

  /**
   * Reload onto `snapshot` over a store that answers when `answer` is called,
   * and wait until the page is otherwise idle, so all that is outstanding is
   * the load.
   */
  async function reloadAnsweringLater(
    snapshot: Snapshot,
    attrs: Record<string, string> = {},
  ): Promise<{ el: AgUiChat; answer: () => void }> {
    document.body.innerHTML = "";
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const el = mountReal(memoryStore(snapshot, answered), attrs);
    await settle();
    return { el, answer };
  }

  /** The request the resume makes: the stored turn, its call, and the landed page. */
  const RESUMED = [
    { role: "user", content: "open the books" },
    { role: "assistant", calls: ["nav-1"] },
    { role: "tool", toolCallId: "nav-1", content: expect.stringContaining('"navigated":true') },
  ];

  it("refuses a send, and resumes the run the reload interrupted", async () => {
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    await el.sendMessage("meanwhile");
    await settle();
    // Refused, not waiting on the load to go out: nothing has been asked of
    // the endpoint while the store has not answered.
    expect(sent).toEqual([]);
    answer();
    await settle();

    // One run, the resume, carrying the conversation the store held. The send
    // used to go out first with none of it, and the resume then followed it on
    // the same client, answering a call that history no longer held.
    expect(sent).toEqual([RESUMED]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
    ]);
  });

  it("parks what the built-in Send takes, and sends it after the resumed answer", async () => {
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    sendNoWait(el, "meanwhile");
    const queued = [...shadow(el).querySelectorAll(".queued-chip")].map((chip) => chip.textContent);
    answer();
    await settle();

    expect(queued).toEqual(["meanwhile"]);
    expect(sent).toEqual([
      RESUMED,
      [...RESUMED, { role: "assistant", calls: [] }, { role: "user", content: "meanwhile" }],
    ]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
      ["user", "meanwhile"],
      ["assistant", "answer 2"],
    ]);
  });

  it("refuses a Retry, and resumes with the conversation it loaded", async () => {
    // The Retry found nothing to retry -- nothing had loaded -- but it built
    // the conversation's client on the way, from that nothing, and the resume
    // then ran on it: a request holding the landed page's result and no turn.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    const retried = await el.retryLastTurn();
    answer();
    await settle();

    expect(retried).toBe(false);
    expect(sent).toEqual([RESUMED]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
    ]);
  });

  it("refuses a pick, and says why at the composer", async () => {
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot, {
      "data-runs-url": "/agent/runs/",
    });

    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await settle();
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "and now sort them";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await settle();
    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe(DEFAULT_UI_STRINGS.continueWhileRunning);
    expect(input.value).toBe("and now sort them");
    answer();
    await settle();

    expect(sent).toEqual([RESUMED]);
  });

  it("stands down when New chat is pressed while the store answers", async () => {
    // New chat stops what is in flight, and the resume is, from the moment the
    // restore set out to load it. It used to land in the new chat regardless:
    // the conversation being left drawn into it, and its run resumed there.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    el.newChat();
    answer();
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
    expect(shadow(el).querySelector(".tool-call")).toBeNull();
  });

  it("forgets the checkpoint when New chat stops the resume, so the call ends as not finished", async () => {
    // New chat is a Stop for the run the restore was about to resume. The
    // checkpoint outlived it: coming back to the conversation later resumed
    // the navigating call with whatever page was current by then. Cleared for
    // the thread the restore was reading, which is no longer the active one.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);
    const store = el.conversationStore as MemoryStore;
    const writes: unknown[][] = [];
    const save = store.saveCheckpoint.bind(store);
    store.saveCheckpoint = (threadId, checkpoint) => {
      writes.push([threadId, checkpoint]);
      save(threadId, checkpoint);
    };

    el.newChat();
    answer();
    await settle();
    expect(writes).toEqual([["t1", null]]);

    const { el: later, handle } = await reload(store.snapshot());
    expect(handle.lastRunParams).toBeNull();
    expect(cardView(later)).toEqual({
      status: "interrupted",
      result: NOT_FINISHED,
      label: "Not finished",
    });
    expect(sent).toEqual([]);
  });

  it("resumes nothing once a renderer the replay draws through starts a new chat", async () => {
    // The replay draws through the host's renderers, which can start a new chat
    // as a Retry's replay can. The resume went ahead regardless, on a client
    // seeded from the new chat: a request in the new thread carrying the landed
    // page's result and none of the turns that made the call.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);
    el.registerTool({
      name: "open_changelist",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => ({ ok: true }),
      render: () => {
        el.newChat();
        return document.createElement("div");
      },
    });

    answer();
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
    expect(shadow(el).querySelector(".tool-call")).toBeNull();
    // Stopped from inside the replay, which is a Stop for the run all the same.
    expect((el.conversationStore as MemoryStore).snapshot().checkpoint).toBeNull();
  });

  it("resumes nothing once the landed page's result starts a new chat", async () => {
    // `navigationResult` is host code too, run on the way to the resume, and
    // the client it answers on was taken before it ran. Going on resumed the
    // conversation being left on that client, which nothing held any more.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);
    el.navigationResult = () => {
      el.newChat();
      return { navigated: true };
    };

    answer();
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
  });

  it("resumes nothing once the store's save of the checkpoint starts a new chat", async () => {
    // The first thing the resume does is clear the checkpoint through the
    // host's store. The client is built after that, so a store that started a
    // new chat there had the resume answer the call into the new chat's client,
    // and send it from the new thread.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);
    const store = el.conversationStore;
    const save = store.saveCheckpoint.bind(store);
    store.saveCheckpoint = (threadId, checkpoint) => {
      save(threadId, checkpoint);
      el.newChat();
    };

    answer();
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
  });

  it("resumes nothing once the element leaves the page while the store answers", async () => {
    // Leaving the page clears nothing until the element connects again, and
    // connecting restores afresh, so the restore has to see for itself that the
    // element has gone. Otherwise the resume's request went out from a node no
    // longer on the page. And it is not a Stop for the run: a move or a
    // re-render has to resume once the element is back, so the checkpoint stays.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    el.remove();
    answer();
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
    expect((el.conversationStore as MemoryStore).snapshot().checkpoint).toEqual({
      toolCallId: "nav-1",
    });
    document.body.appendChild(el);
    await settle();
    expect(sent).toEqual([RESUMED]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
    ]);
  });

  it("resumes once when the element is moved while the store answers", async () => {
    // A move inside one task connects again before the store answers, and
    // connecting clears the conversation and starts a newer restore. The first
    // stands down for it and forgets the checkpoint it loaded, which the newer
    // one has already read as it started, so the run still resumes, once.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    el.remove();
    document.body.appendChild(el);
    answer();
    await settle();

    expect(sent).toEqual([RESUMED]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
    ]);
  });

  it("resumes once when the host reloads while the store answers", async () => {
    // A host configuring the element once it has connected calls `reload()`,
    // which starts the restore again with the first still loading. The first
    // stands down for the second and forgets the checkpoint it loaded, which
    // the second read as it started, so the second still resumes the run, once.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);

    const reloading = el.reload();
    answer();
    await reloading;
    await settle();

    expect(sent).toEqual([RESUMED]);
    expect(transcript(el)).toEqual([
      ["user", "open the books"],
      ["assistant", "answer 1"],
    ]);
  });

  it("still refuses a send for the newer restore once the older has stood down", async () => {
    // The older restore lets go of only its own hold as it goes, because the
    // newer one's is in the same field by then. Letting go of that opened the
    // composer for the rest of the newer load, and a send in it went out
    // without the conversation, ahead of the resume.
    //
    // The host also swaps the store here, so the older restore forgets its
    // checkpoint in the store it read it from, not in the one now assigned.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    const { el, answer } = await reloadAnsweringLater(snapshot);
    const first = el.conversationStore as MemoryStore;
    let answerAgain: () => void = () => {};
    el.conversationStore = memoryStore(
      snapshot,
      new Promise<void>((resolve) => {
        answerAgain = resolve;
      }),
    );

    const reloading = el.reload();
    answer();
    await settle();
    await el.sendMessage("meanwhile");
    await settle();
    expect(sent).toEqual([]);
    expect(first.snapshot().checkpoint).toBeNull();
    answerAgain();
    await reloading;
    await settle();

    expect(sent).toEqual([RESUMED]);
  });

  it("writes nothing into the next principal's storage when a handover stops the resume", async () => {
    // The handover purges the previous principal's storage and scopes the
    // store to the next one before the stopped restore forgets its checkpoint.
    // That clear goes to the store the checkpoint was read from, and is a
    // removal from a namespace already purged, so nothing anywhere changes.
    // The built-in store, because a host's store is the host's to scope.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    document.body.innerHTML = "";
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("user-key", "alice");
    document.body.appendChild(el);
    await settle();
    const alice = el.conversationStore;
    const thread = alice.threadId();
    alice.saveMessages(thread, snapshot.messages);
    alice.saveCheckpoint(thread, snapshot.checkpoint);
    let answer: () => void = () => {};
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const load = alice.loadMessages.bind(alice);
    alice.loadMessages = (threadId) => answered.then(() => load(threadId));

    void el.reload();
    el.setAttribute("user-key", "bob");
    await settle();
    const before = storageEntries();
    answer();
    await settle();

    expect(storageEntries()).toEqual(before);
    expect(Object.keys(before).some((key) => key.includes(thread))).toBe(false);
    expect(sent).toEqual([]);
  });

  it("sends what it parked when the store fails to answer", async () => {
    // No run starts, so none settles to send the parked turn: the restore
    // letting go of its hold is what sends it. It goes into the empty
    // conversation the page is left showing, as a turn typed after the failure
    // would. A resumed request that fails is not this case -- the client
    // reports its run started before the request goes out, so that run's
    // settle sends it.
    const snapshot = await atNavigation();
    const sent = stubEndpoint();
    document.body.innerHTML = "";
    const el = mountReal(memoryStore());
    await settle();
    let fail: (error: Error) => void = () => {};
    const answered = new Promise<void>((_resolve, reject) => {
      fail = reject;
    });
    el.conversationStore = memoryStore(snapshot, answered);

    const reloading = el.reload();
    sendNoWait(el, "meanwhile");
    const queued = [...shadow(el).querySelectorAll(".queued-chip")].map((chip) => chip.textContent);
    fail(new Error("offline"));
    await expect(reloading).rejects.toThrow("offline");
    await settle();

    expect(queued).toEqual(["meanwhile"]);
    expect(sent).toEqual([[{ role: "user", content: "meanwhile" }]]);
    expect(transcript(el)).toEqual([
      ["user", "meanwhile"],
      ["assistant", "answer 1"],
    ]);
  });
});
