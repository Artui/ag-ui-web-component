/**
 * Every tool call a request carries has a result, however the run that made
 * the call ended.
 *
 * Several model providers reject a turn holding a tool call with no result, so
 * a conversation that sends one cannot continue. A live run leaves a call
 * unanswered in more ways than one: Stop while the stream is still arriving,
 * Stop on a server-side approval, a round that ends on `RUN_ERROR`, and a call
 * naming a tool nothing here owns. Each is driven through the element and read
 * off the history the next request carries.
 *
 * The result also has to be true. A person declined only where a person was
 * asked: an open approval that Stop answered says so, and everything else says
 * the call did not finish, without blaming anyone.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import type { HttpAgentOptions } from "../src/core/create_http_agent.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

const DECLINED = "User declined the action.";
const NOT_FINISHED =
  "Not finished: the run ended or moved on before this tool call returned a result.";

/** One round of the fake agent, able to read the history the request carried. */
type Script = (
  emit: Emit,
  params: { resume?: unknown },
  history: () => readonly unknown[],
) => void | Promise<void>;

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

function mount(script: Script): AgUiChat {
  const handle = makeFakeAgent({
    script: (emit, params) => script(emit, params, () => handle.messages),
  });
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return el;
}

/**
 * Mount a chat restoring `messages`, with the agent seeded from the restore as
 * `HttpAgent` seeds itself from `initialMessages`.
 */
function mountStored(messages: readonly unknown[], script: Script): AgUiChat {
  const store = new SessionStorageStore();
  store.saveMessages(store.threadId(), messages as never);
  const handle = makeFakeAgent({
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
  return el;
}

function send(el: AgUiChat, text: string): void {
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

/** The state of the `index`th tool card, in call order, as a person reads it. */
function card(el: AgUiChat, index: number): { status: string | null; result: string | null } {
  const found = shadow(el).querySelectorAll<HTMLElement>(".tool-call")[index];
  return {
    status: found?.getAttribute("data-status") ?? null,
    result: found?.querySelector(".tool-call-result")?.textContent ?? null,
  };
}

/**
 * Run `first` for the conversation's opening send, then record what every later
 * request carried. `act` does whatever ends the first run.
 */
async function nextRequestAfter(
  first: Script,
  act: (el: AgUiChat) => Promise<void>,
  register?: (el: AgUiChat) => void,
): Promise<{ el: AgUiChat; seen: unknown[][] }> {
  const seen: unknown[][] = [];
  let sends = 0;
  const el = mount((emit, params, history) => {
    if (sends === 0) {
      return first(emit, params, history);
    }
    emit.runStart();
    seen.push(wire(history()));
    return undefined;
  });
  register?.(el);
  send(el, "go");
  await flush();
  await act(el);
  await flush();
  sends += 1;
  send(el, "again");
  await flush();
  return { el, seen };
}

function registerLookup(el: AgUiChat, calls: string[]): void {
  el.registerTool({
    name: "lookup",
    description: "look something up",
    parameters: { type: "object" },
    handler: (_args, id) => {
      calls.push(String(id));
      return "found";
    },
  });
}

describe("Stop while the stream is still arriving", () => {
  it("sends a not-finished result for a call that arrived before it", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ran: string[] = [];
    const { el, seen } = await nextRequestAfter(
      async (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "lookup", {});
        await gate;
      },
      async (chat) => {
        stop(chat);
        release();
      },
      (chat) => registerLookup(chat, ran),
    );

    expect(ran).toEqual([]);
    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: NOT_FINISHED },
      { role: "user", content: "again" },
    ]);
    expect(card(el, 0)).toEqual({ status: "interrupted", result: NOT_FINISHED });
  });
});

describe("Stop on a server-side approval", () => {
  function deferred(ids: readonly string[]): Script {
    return (emit, params) => {
      emit.runStart();
      if (params.resume === undefined) {
        for (const id of ids) {
          emit.toolCall(id, "delete_thing", { target: id });
        }
        emit.interrupt(ids.map((id) => ({ id: `int-${id}`, reason: "tool_call", toolCallId: id })));
      }
    };
  }

  it("sends the decline Stop gave the open approval", async () => {
    const { el, seen } = await nextRequestAfter(deferred(["call-1"]), async (chat) => {
      expect(shadow(chat).querySelector(".approval")).not.toBeNull();
      stop(chat);
    });

    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["call-1"] },
      { role: "tool", toolCallId: "call-1", content: DECLINED },
      { role: "user", content: "again" },
    ]);
    expect(card(el, 0).status).toBe("declined");
  });

  it("does not call an approved call declined, since nobody declined it", async () => {
    // Approved, then stopped before the resume that would have run it went out:
    // a person said yes, so the truthful result is that it never finished.
    const { el, seen } = await nextRequestAfter(deferred(["call-1", "call-2"]), async (chat) => {
      shadow(chat).querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
      await flush();
      stop(chat);
    });

    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["call-1"] },
      { role: "assistant", calls: ["call-2"] },
      { role: "tool", toolCallId: "call-2", content: DECLINED },
      { role: "tool", toolCallId: "call-1", content: NOT_FINISHED },
      { role: "user", content: "again" },
    ]);
    expect(card(el, 0)).toEqual({ status: "interrupted", result: NOT_FINISHED });
    expect(card(el, 1).status).toBe("declined");
  });
});

describe("an approval that resumes", () => {
  it("leaves the call it resumes for the server to answer", async () => {
    // The resume request is the answer: the server runs or denies the call on
    // it. A result beside it would answer the call twice.
    const resumed: unknown[][] = [];
    const el = mount((emit, params, history) => {
      emit.runStart();
      if (params.resume === undefined) {
        emit.toolCall("call-1", "delete_thing", { target: "call-1" });
        emit.interrupt([{ id: "int-call-1", reason: "tool_call", toolCallId: "call-1" }]);
      } else {
        resumed.push(wire(history()));
      }
    });
    send(el, "go");
    await flush();
    shadow(el).querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    await flush();

    expect(resumed).toEqual([
      [
        { role: "user", content: "go" },
        { role: "assistant", calls: ["call-1"] },
      ],
    ]);
  });
});

describe("a round that ends on RUN_ERROR", () => {
  it("sends a not-finished result for the calls it emitted first", async () => {
    const ran: string[] = [];
    const { el, seen } = await nextRequestAfter(
      (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "lookup", {});
        emit.error("boom");
      },
      async () => {},
      (chat) => registerLookup(chat, ran),
    );

    expect(ran).toEqual([]);
    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: NOT_FINISHED },
      { role: "user", content: "again" },
    ]);
    expect(card(el, 0)).toEqual({ status: "interrupted", result: NOT_FINISHED });
  });
});

describe("a call to a tool nothing here owns", () => {
  it("sends a not-finished result on the next turn", async () => {
    const { el, seen } = await nextRequestAfter(
      (emit) => {
        emit.runStart();
        emit.toolCall("tc-x", "unknown_tool", {});
      },
      async () => {},
    );

    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["tc-x"] },
      { role: "tool", toolCallId: "tc-x", content: NOT_FINISHED },
      { role: "user", content: "again" },
    ]);
    expect(card(el, 0)).toEqual({ status: "interrupted", result: NOT_FINISHED });
  });

  it("answers it after the round's own results, in the request that follows the round", async () => {
    // The unknown call comes first and a real tool second, so the result has to
    // land after the whole round rather than straight after its own call, and
    // after the result the loop already recorded.
    const ran: string[] = [];
    const seen: unknown[][] = [];
    let round = 0;
    const el = mount((emit, _params, history) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc-x", "unknown_tool", {});
        emit.toolCall("tc1", "lookup", {});
      } else {
        seen.push(wire(history()));
      }
      round += 1;
    });
    registerLookup(el, ran);
    send(el, "go");
    await flush();

    expect(ran).toEqual(["tc1"]);
    expect(seen[0]).toEqual([
      { role: "user", content: "go" },
      { role: "assistant", calls: ["tc-x"] },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: '"found"' },
      { role: "tool", toolCallId: "tc-x", content: NOT_FINISHED },
    ]);
  });
});

describe("a conversation stored with a call left open", () => {
  it("answers each round's open call before the next round starts", async () => {
    // Written out rather than captured, because this element can no longer store
    // it: every request now answers what is open first. It is what the previous
    // release stored for a run that called a tool nothing here owns beside one it
    // does, was stopped between rounds, and then had another message sent.
    const call = (id: string, name: string) => ({
      id: `a-${id}`,
      role: "assistant",
      toolCalls: [{ id, type: "function", function: { name, arguments: "{}" } }],
    });
    const seen: unknown[][] = [];
    const el = mountStored(
      [
        { id: "u1", role: "user", content: "first" },
        call("tc-x", "unknown_tool"),
        call("tc1", "lookup"),
        { id: "r1", role: "tool", toolCallId: "tc1", content: '"found"' },
        call("tc2", "lookup"),
        { id: "r2", role: "tool", toolCallId: "tc2", content: '"found"' },
        { id: "u2", role: "user", content: "second" },
      ],
      (emit, _params, history) => {
        emit.runStart();
        seen.push(wire(history()));
      },
    );
    await flush();
    // Read before sending: the next run's own sweep would settle a card the
    // restore left spinning.
    expect(card(el, 0)).toEqual({ status: "interrupted", result: NOT_FINISHED });

    send(el, "third");
    await flush();

    expect(seen[0]).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", calls: ["tc-x"] },
      { role: "assistant", calls: ["tc1"] },
      { role: "tool", toolCallId: "tc1", content: '"found"' },
      { role: "tool", toolCallId: "tc-x", content: NOT_FINISHED },
      { role: "assistant", calls: ["tc2"] },
      { role: "tool", toolCallId: "tc2", content: '"found"' },
      { role: "user", content: "second" },
      { role: "user", content: "third" },
    ]);
  });
});
