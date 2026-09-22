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
import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, TOOL_OUTCOME } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import type { HttpAgentOptions } from "../src/core/create_http_agent.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
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
 */
function memoryStore(seed?: Snapshot): MemoryStore {
  let saved: readonly Message[] = seed === undefined ? [] : copy(seed.messages);
  let checkpoint: NavigationCheckpoint | null = seed?.checkpoint ?? null;
  return {
    snapshot: () => ({ messages: copy(saved), checkpoint }),
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : copy(saved)),
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
  it("still resumes with the landed page's result, and is not declined", async () => {
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
    const running: unknown[] = [];
    const restored = await reload(snapshot, (emit, params, history) => {
      recording(seen)(emit, params, history);
      // Still running while the resumed request is out, because it is: the
      // restore must not have settled the one card a reload was expected by.
      const host = document.querySelector(ELEMENT_TAG) as AgUiChat;
      running.push(cardView(host).status);
    });

    expect(running).toEqual(["pending"]);
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
