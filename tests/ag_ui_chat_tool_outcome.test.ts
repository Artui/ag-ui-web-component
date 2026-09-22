/**
 * A tool call that failed must not render as one that worked.
 *
 * Two separate paths reached the same wrong answer, and they are separate bugs:
 *
 * 1. **Live.** `TOOL_CALL_RESULT` settled every card as `done`, whatever the
 *    server said about it, so a refusal arrived as a green card with the reason
 *    folded inside its result body. In a sibling demo that rendered a booking
 *    the server had refused as a booking that was made.
 * 2. **Replay.** Restoring a conversation settled every historical `tool`
 *    message as `done` too — which broke the *client-side* decline as well, with
 *    no server involved at all: a confirmation the user cancelled rendered
 *    correctly as `declined` and then came back green after a reload.
 *
 * The reload cases at the bottom are the ones that matter most, because each
 * half can be right on its own while the pair loses the outcome in between: it
 * has to reach the store, survive being serialised, and be read back out.
 * The store here round-trips through JSON for exactly that reason.
 *
 * The outcome rides in `metadata`, on the event and on the tool message, since
 * `@ag-ui/client` 1.0 strips anything its schemas do not declare. The one test
 * that shows what happens to an outcome stated anywhere else runs over the real
 * `HttpAgent`, because the fake agent dispatches past the stage that strips it.
 */

import type { ContentPart, Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, TOOL_OUTCOME } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

/** A store shared by two mounts, so a "reload" reads what the run wrote. */
interface MemoryStore extends ClientConversationStore {
  /** What the element last persisted, as the store holds it. */
  readonly saved: readonly Message[];
  /** Pre-load a transcript, standing in for history written by an earlier visit. */
  seed(messages: readonly unknown[]): void;
}

/**
 * An injected store rather than the built-in one.
 *
 * Two reasons, and the first is not optional: the element re-namespaces a
 * `SessionStorageStore` it is handed, so a test that kept a reference to one
 * would be reading a different store than the element writes to. The second is
 * that a real store serialises, and the outcome this file is about rides in
 * `metadata`, which `Message` declares open by key and so checks nothing inside
 * -- so the JSON round trip is part of what is under test, not an
 * implementation detail of the default store.
 */
function memoryStore(): MemoryStore {
  let saved: readonly Message[] = [];
  return {
    get saved(): readonly Message[] {
      return saved;
    },
    seed(messages: readonly unknown[]): void {
      saved = JSON.parse(JSON.stringify(messages)) as readonly Message[];
    },
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : saved),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = JSON.parse(JSON.stringify(messages)) as readonly Message[];
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
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

function element(store: MemoryStore): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  el.conversationStore = store;
  return el;
}

/** Mount a chat driven by a scripted fake agent. */
function mountWithAgent(
  store: MemoryStore,
  script: (emit: Emit, params: FakeRunParams) => void | Promise<void>,
): AgUiChat {
  const el = element(store);
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

/** Mount with no agent at all, so the only thing on screen is restored history. */
function mountRestoring(store: MemoryStore): AgUiChat {
  const el = element(store);
  document.body.appendChild(el);
  return el;
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

function cardStatus(el: AgUiChat): string | null | undefined {
  return shadow(el).querySelector<HTMLElement>(".tool-call")?.getAttribute("data-status");
}

function cardResult(el: AgUiChat): string | null | undefined {
  return shadow(el).querySelector(".tool-call-result")?.textContent;
}

/** The heading over the result body, which names the outcome in words. */
function resultLabel(el: AgUiChat): string | null | undefined {
  return shadow(el).querySelector(".tool-call-section--result .tool-call-section-label")
    ?.textContent;
}

/** The outcome the store holds in a tool message's metadata, if it holds one at all. */
function savedOutcome(store: MemoryStore, toolCallId: string): unknown {
  const message = store.saved.find(
    (m) => m.role === "tool" && (m as { toolCallId?: string }).toolCallId === toolCallId,
  );
  return (message as { metadata?: { outcome?: unknown } } | undefined)?.metadata?.outcome;
}

/** Run one server-side tool that returns `content`, optionally stating an outcome. */
function serverTool(content: string | ContentPart[], outcome?: string): (emit: Emit) => void {
  return (emit) => {
    emit.runStart();
    emit.toolCall("tc1", "book_flight", { seat: "12A" });
    emit.toolResult("tc1", content, outcome === undefined ? undefined : { outcome });
    emit.runEnd();
  };
}

describe("a server-side tool's outcome", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("renders a failed call as an error, not a green card", async () => {
    const el = mountWithAgent(memoryStore(), serverTool("no seats left", TOOL_OUTCOME.FAILED));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("error");
    expect(cardResult(el)).toBe("no seats left");
    // The heading over the body changes with the status, so the reason reads as
    // a reason rather than as the thing the tool returned.
    expect(resultLabel(el)).toBe("Error");
  });

  it("renders a failed call's text when the reason arrives as parts", async () => {
    // The protocol's 1.0 lets a result be parts rather than a string. The card
    // shows the text parts joined, and the outcome still decides its colour.
    const el = mountWithAgent(
      memoryStore(),
      serverTool(
        [
          { type: "text", text: "no seats " },
          { type: "image", source: { type: "url", value: "https://example.test/map.png" } },
          { type: "text", text: "left" },
        ],
        TOOL_OUTCOME.FAILED,
      ),
    );
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("error");
    expect(cardResult(el)).toBe("no seats left");
  });

  it("renders a denied call as declined", async () => {
    const el = mountWithAgent(
      memoryStore(),
      serverTool("A person refused this", TOOL_OUTCOME.DENIED),
    );
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("declined");
    expect(resultLabel(el)).toBe("Declined");
  });

  it("renders a stated success as done", async () => {
    const el = mountWithAgent(memoryStore(), serverTool("seat 12A held", TOOL_OUTCOME.SUCCESS));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("done");
  });

  it("renders a result with no outcome exactly as before", async () => {
    // The compatibility case. Every server written before the field existed
    // omits it, so this is the shape the overwhelming majority of streams have.
    const el = mountWithAgent(memoryStore(), serverTool("seat 12A held"));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("done");
    expect(cardResult(el)).toBe("seat 12A held");
  });

  it("renders an outcome it does not recognise as done", async () => {
    // Forward compatibility beats completeness: a word from a later protocol
    // version must not turn every card red.
    const el = mountWithAgent(memoryStore(), serverTool("stopped part-way", "expired"));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("done");
  });

  it("renders pydantic-ai's interrupted as a call that did not finish", async () => {
    // Neither a success nor a failure: the server's own history repair says the
    // call produced no result, which is the state the element gives a call its
    // own run left open.
    const el = mountWithAgent(memoryStore(), serverTool("stopped part-way", "interrupted"));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("interrupted");
    expect(cardResult(el)).toBe("stopped part-way");
  });

  it("keeps the outcome in the result's metadata, for the store and the next run alike", async () => {
    // `agent.messages` is what the next `runAgent` posts, and the client folds
    // the result's metadata onto the message it appends there, so the outcome
    // goes back to the server with it. That is the protocol's own behaviour for
    // a declared field, not a client-side addition: a strict server validates
    // `metadata` as an open object, and one that does not read it ignores it.
    // Never at the top level, which 1.0 would strip from the request with a
    // warning.
    const handle = makeFakeAgent({ script: serverTool("no seats left", TOOL_OUTCOME.FAILED) });
    const store = memoryStore();
    const el = element(store);
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await send(el, "book me a flight");

    const tool = handle.messages.find((m) => m.role === "tool");
    expect(tool).toMatchObject({ toolCallId: "tc1", metadata: { outcome: TOOL_OUTCOME.FAILED } });
    expect(tool).not.toHaveProperty("outcome");
    // ...and the store holds the same message, not an annotated copy of it.
    expect(savedOutcome(store, "tc1")).toBe(TOOL_OUTCOME.FAILED);
  });

  it("states an outcome only for the calls that did not simply succeed", async () => {
    const store = memoryStore();
    const el = mountWithAgent(store, (emit) => {
      emit.runStart();
      emit.toolCall("ok1", "list_flights", {});
      emit.toolResult("ok1", "two flights");
      emit.toolCall("bad1", "book_flight", { seat: "12A" });
      emit.toolResult("bad1", "no seats left", { outcome: TOOL_OUTCOME.FAILED });
      emit.runEnd();
    });
    await send(el, "book me a flight");

    expect(store.saved.filter((m) => Object.hasOwn(m, "metadata"))).toHaveLength(1);
    expect(savedOutcome(store, "bad1")).toBe(TOOL_OUTCOME.FAILED);
    expect(savedOutcome(store, "ok1")).toBeUndefined();
  });
});

describe("a server-side tool's outcome over the real HttpAgent", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Answer the run request with one server-side call whose result adds `result`. */
  function serve(result: Record<string, unknown>): void {
    const events = [
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      { type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "book_flight" },
      { type: "TOOL_CALL_END", toolCallId: "tc1" },
      { type: "TOOL_CALL_RESULT", messageId: "m1", toolCallId: "tc1", content: "no", ...result },
      { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
    ];
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    const headers = { "Content-Type": "text/event-stream" };
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(body, { status: 200, headers }))),
    );
  }

  /** Macrotasks rather than microtasks: the real client reads a stream. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it("renders a failure stated in the result's metadata as an error", async () => {
    serve({ metadata: { outcome: TOOL_OUTCOME.FAILED } });
    const store = memoryStore();
    const el = element(store);
    document.body.appendChild(el);
    sendNoWait(el, "book me a flight");
    await settle();

    expect(cardStatus(el)).toBe("error");
    expect(savedOutcome(store, "tc1")).toBe(TOOL_OUTCOME.FAILED);
  });

  it("renders a failure stated only at the top level as done", async () => {
    // What a server written for the 0.x client sends. 1.0 strips the key before
    // the element sees the event, so the card cannot tell this failure from a
    // success -- which is what a django-ag-ui older than the one that moved the
    // outcome into metadata looks like against this release.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    serve({ outcome: TOOL_OUTCOME.FAILED });
    const store = memoryStore();
    const el = element(store);
    document.body.appendChild(el);
    sendNoWait(el, "book me a flight");
    await settle();

    expect(cardStatus(el)).toBe("done");
    expect(savedOutcome(store, "tc1")).toBeUndefined();
  });
});

describe("replaying a tool result from history", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  /**
   * A store holding one assistant tool call and its `tool` result message.
   *
   * The outcome goes in the message's metadata, where this release writes it,
   * or at its top level, where earlier releases did.
   */
  function seeded(
    outcome?: string,
    content: string | ContentPart[] = "no seats left",
    where: "metadata" | "top level" = "metadata",
  ): MemoryStore {
    const stated =
      outcome === undefined ? {} : where === "metadata" ? { metadata: { outcome } } : { outcome };
    const store = memoryStore();
    store.seed([
      { id: "1", role: "user", content: "book me a flight" },
      {
        id: "2",
        role: "assistant",
        toolCalls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "book_flight", arguments: '{"seat":"12A"}' },
          },
        ],
      },
      {
        id: "3",
        role: "tool",
        toolCallId: "tc1",
        content,
        ...stated,
      },
    ]);
    return store;
  }

  it("replays a failed call as an error", async () => {
    const el = mountRestoring(seeded(TOOL_OUTCOME.FAILED));
    await flush();

    expect(cardStatus(el)).toBe("error");
    expect(cardResult(el)).toBe("no seats left");
  });

  it("replays a denied call as declined", async () => {
    const el = mountRestoring(seeded(TOOL_OUTCOME.DENIED));
    await flush();

    expect(cardStatus(el)).toBe("declined");
  });

  it("replays a message with no outcome as done", async () => {
    // History written before this shipped, and any host store that drops fields
    // it does not know. Both land here, and here is where they landed before --
    // losing the distinction, never inventing one.
    const el = mountRestoring(seeded());
    await flush();

    expect(cardStatus(el)).toBe("done");
    expect(cardResult(el)).toBe("no seats left");
  });

  it("replays a result stored as parts with its text", async () => {
    // Flattened as the live path flattens it, so the card after a reload reads
    // the way it read when it settled.
    const el = mountRestoring(
      seeded(TOOL_OUTCOME.FAILED, [
        { type: "text", text: "no seats " },
        { type: "image", source: { type: "url", value: "https://example.test/map.png" } },
        { type: "text", text: "left" },
      ]),
    );
    await flush();

    expect(cardStatus(el)).toBe("error");
    expect(cardResult(el)).toBe("no seats left");
  });

  it("replays an unrecognised outcome as done", async () => {
    const el = mountRestoring(seeded("expired"));
    await flush();

    expect(cardStatus(el)).toBe("done");
  });

  it("replays an outcome an earlier release stored at the top level", async () => {
    // Every conversation stored before the outcome moved into metadata has it
    // here, and a reload has to keep showing those cards as they settled.
    const el = mountRestoring(seeded(TOOL_OUTCOME.DENIED, "no seats left", "top level"));
    await flush();

    expect(cardStatus(el)).toBe("declined");
  });

  it("reads the metadata first when a message carries both", async () => {
    const store = memoryStore();
    store.seed([
      { id: "1", role: "user", content: "book me a flight" },
      {
        id: "2",
        role: "assistant",
        toolCalls: [{ id: "tc1", type: "function", function: { name: "f", arguments: "{}" } }],
      },
      {
        id: "3",
        role: "tool",
        toolCallId: "tc1",
        content: "no seats left",
        outcome: TOOL_OUTCOME.DENIED,
        metadata: { outcome: TOOL_OUTCOME.FAILED },
      },
    ]);
    const el = mountRestoring(store);
    await flush();

    expect(cardStatus(el)).toBe("error");
  });
});

describe("an outcome survives a reload", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  /** Drop the running element and mount a fresh one over the same store. */
  async function reload(first: AgUiChat, store: MemoryStore): Promise<AgUiChat> {
    first.remove();
    document.body.innerHTML = "";
    const second = mountRestoring(store);
    await flush();
    return second;
  }

  it("keeps a server-side failure red", async () => {
    const store = memoryStore();
    const first = mountWithAgent(store, serverTool("no seats left", TOOL_OUTCOME.FAILED));
    await send(first, "book me a flight");
    expect(cardStatus(first)).toBe("error");

    const second = await reload(first, store);

    expect(cardStatus(second)).toBe("error");
    expect(cardResult(second)).toBe("no seats left");
  });

  it("keeps an ordinary result green", async () => {
    // The control for the case above. If the annotation leaked onto every tool
    // message, this card would come back as something other than done and the
    // change would be worse than the bug it fixes.
    const store = memoryStore();
    const first = mountWithAgent(store, serverTool("seat 12A held"));
    await send(first, "book me a flight");

    const second = await reload(first, store);

    expect(cardStatus(second)).toBe("done");
  });

  it("keeps a declined confirmation declined", async () => {
    // No server states this outcome -- nothing ran. The refusal happened in this
    // browser, in a confirmation card, and the transcript is the only place it
    // can be recorded. This half of the bug needs no server cooperation at all.
    const store = memoryStore();
    let round = 0;
    const first = mountWithAgent(store, (emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    first.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => "deleted",
    });

    sendNoWait(first, "delete user 7");
    await flush();
    shadow(first).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
    expect(cardStatus(first)).toBe("declined");
    expect(savedOutcome(store, "tc1")).toBe(TOOL_OUTCOME.DENIED);

    const second = await reload(first, store);

    expect(cardStatus(second)).toBe("declined");
    expect(cardResult(second)).toBe("User declined the action.");
  });

  it("keeps a frontend tool's thrown error red", async () => {
    const store = memoryStore();
    let round = 0;
    const first = mountWithAgent(store, (emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "boom", {});
      }
      round += 1;
    });
    first.registerTool({
      name: "boom",
      description: "explodes",
      parameters: { type: "object" },
      handler: () => {
        throw new Error("kaboom");
      },
    });

    await send(first, "trigger boom");
    expect(cardStatus(first)).toBe("error");

    const second = await reload(first, store);

    expect(cardStatus(second)).toBe("error");
  });

  it("keeps a call blocked by a page move red", async () => {
    // The third client-side refusal: the page navigated under the round, so the
    // call was never attempted. Like the decline, nothing on the wire records it.
    const store = memoryStore();
    let round = 0;
    const first = mountWithAgent(store, (emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "click_element", { selector: "#save" });
      }
      round += 1;
    });
    first.getPageMap = () => ({ actions: [] });
    first.registerTool({
      name: "click_element",
      description: "click",
      parameters: { type: "object" },
      handler: () => "clicked",
    });

    sendNoWait(first, "save it");
    // Between building the round's context and dispatching the call, the page
    // moves -- which is the whole condition the guard exists for.
    window.history.pushState({}, "", "/somewhere-else");
    await flush();
    expect(cardStatus(first)).toBe("error");
    // Named, so this cannot pass on some *other* error: three paths settle a
    // card to `error` and only one of them is the subject here. Without this
    // the test would still be green with the guard deleted, because the handler
    // would then run and the card would be `done` -- but it would also be green
    // if the handler had thrown, which is a different test entirely.
    expect(cardResult(first)).toContain("Call read_page");
    expect(savedOutcome(store, "tc1")).toBe(TOOL_OUTCOME.FAILED);

    const second = await reload(first, store);

    expect(cardStatus(second)).toBe("error");
  });
});
