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
 * that a real store serialises, and the annotation this file is about rides on a
 * field `Message` does not declare -- so the JSON round trip is part of what is
 * under test, not an implementation detail of the default store.
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

/** The outcome the store holds for a tool message, if it holds one at all. */
function savedOutcome(store: MemoryStore, toolCallId: string): unknown {
  const message = store.saved.find(
    (m) => m.role === "tool" && (m as { toolCallId?: string }).toolCallId === toolCallId,
  );
  return (message as { outcome?: unknown } | undefined)?.outcome;
}

/** Run one server-side tool that returns `content`, optionally with an outcome. */
function serverTool(content: string, outcome?: string): (emit: Emit) => void {
  return (emit) => {
    emit.runStart();
    emit.toolCall("tc1", "book_flight", { seat: "12A" });
    emit.toolResult("tc1", content, outcome);
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
    // Forward compatibility beats completeness: a later protocol version, or
    // pydantic-ai's own `interrupted`, must not turn every card red.
    const el = mountWithAgent(memoryStore(), serverTool("stopped part-way", "interrupted"));
    await send(el, "book me a flight");

    expect(cardStatus(el)).toBe("done");
  });

  it("does not send the outcome back to the server on the next run", async () => {
    // The annotation is for the store. `agent.messages` is what the next
    // `runAgent` posts, and a client-side field appearing in it is a change to
    // the wire nobody asked for -- a strict server would be within its rights
    // to reject it.
    const handle = makeFakeAgent({ script: serverTool("no seats left", TOOL_OUTCOME.FAILED) });
    const store = memoryStore();
    const el = element(store);
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await send(el, "book me a flight");

    const tool = handle.messages.find((m) => m.role === "tool");
    expect(tool).toMatchObject({ toolCallId: "tc1" });
    expect(tool).not.toHaveProperty("outcome");
    // ...while the copy the store received does carry it.
    expect(savedOutcome(store, "tc1")).toBe(TOOL_OUTCOME.FAILED);
  });

  it("annotates only the calls that did not simply succeed", async () => {
    const store = memoryStore();
    const el = mountWithAgent(store, (emit) => {
      emit.runStart();
      emit.toolCall("ok1", "list_flights", {});
      emit.toolResult("ok1", "two flights");
      emit.toolCall("bad1", "book_flight", { seat: "12A" });
      emit.toolResult("bad1", "no seats left", TOOL_OUTCOME.FAILED);
      emit.runEnd();
    });
    await send(el, "book me a flight");

    expect(store.saved.filter((m) => Object.hasOwn(m, "outcome"))).toHaveLength(1);
    expect(savedOutcome(store, "bad1")).toBe(TOOL_OUTCOME.FAILED);
    expect(savedOutcome(store, "ok1")).toBeUndefined();
  });
});

describe("replaying a tool result from history", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  /** A store holding one assistant tool call and its `tool` result message. */
  function seeded(outcome?: string): MemoryStore {
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
        content: "no seats left",
        ...(outcome === undefined ? {} : { outcome }),
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

  it("replays an unrecognised outcome as done", async () => {
    const el = mountRestoring(seeded("interrupted"));
    await flush();

    expect(cardStatus(el)).toBe("done");
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
