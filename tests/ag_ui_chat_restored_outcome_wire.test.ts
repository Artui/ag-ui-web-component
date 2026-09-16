/**
 * What the request after a restore carries about how earlier tool calls ended.
 *
 * The element annotates a stored tool message with an `outcome` so a reload can
 * replay a declined or failed card as it settled. That annotation is a
 * client-side record, and the README promises it never reaches the server. A
 * restore seeds the next agent from the stored copy, so this is read off the
 * body of the request itself, through the real `HttpAgent`, rather than off a
 * fake's message list: the question is what goes over the wire.
 *
 * The stored conversation is captured from a real run in which a person
 * declined a confirmation card, never written by hand.
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
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A store that serialises, as the built-in one does. */
function memoryStore(seed: readonly Message[] = []): ClientConversationStore & {
  saved: () => readonly Message[];
} {
  let saved = copy(seed);
  return {
    saved: () => copy(saved),
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : copy(saved)),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = copy(messages);
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
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

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function send(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

function mountOver(store: ClientConversationStore): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-tool-display", "full");
  el.conversationStore = store;
  return el;
}

function registerDelete(el: AgUiChat): void {
  el.registerTool({
    name: "delete_user",
    description: "delete",
    parameters: { type: "object", "x-destructive": true },
    handler: () => "deleted",
  });
}

/** Run a conversation in which a person declines a destructive call, and return what it stored. */
async function declinedConversation(): Promise<readonly Message[]> {
  const store = memoryStore();
  const el = mountOver(store);
  let round = 0;
  el.agentFactory = () =>
    makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        if (round === 0) {
          emit.toolCall("tc1", "delete_user", { id: 7 });
        }
        round += 1;
      },
    }).agent;
  registerDelete(el);
  document.body.appendChild(el);
  send(el, "delete user 7");
  await settle();
  shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
  await settle();
  document.body.innerHTML = "";
  return store.saved();
}

/** An SSE body that starts and finishes a run, which is all a request needs back. */
function finishedRun(): Response {
  const events = [
    { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
    { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
  ];
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("a restored conversation's next request", () => {
  it("carries no outcome annotation, and the card still restores declined", async () => {
    const stored = await declinedConversation();
    // The control: the store really holds the annotation, so a clean request
    // below is the restore keeping it off the wire rather than nothing to keep.
    const annotated = stored.find((m) => m.role === "tool") as { outcome?: unknown } | undefined;
    expect(annotated?.outcome).toBe(TOOL_OUTCOME.DENIED);

    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve(finishedRun());
      }),
    );
    const store = memoryStore(stored);
    const el = mountOver(store);
    document.body.appendChild(el);
    await settle();
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-status")).toBe("declined");

    send(el, "never mind");
    await settle();

    const request = bodies[0] as { messages: readonly Record<string, unknown>[] };
    const tool = request.messages.find((m) => m["role"] === "tool");
    expect(tool).toMatchObject({ toolCallId: "tc1" });
    expect(Object.keys(tool ?? {})).not.toContain("outcome");
    expect(JSON.stringify(request.messages)).not.toContain('"outcome"');

    // Kept in the store, though: the request after this one saved the whole
    // transcript again, and a reload must still replay the decline.
    const resaved = store.saved().find((m) => m.role === "tool") as { outcome?: unknown };
    expect(resaved.outcome).toBe(TOOL_OUTCOME.DENIED);
  });
});
