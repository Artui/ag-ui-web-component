/**
 * What the request after a restore carries about how earlier tool calls ended
 * and which files were attached.
 *
 * A stored tool message carries its `outcome` so a reload can replay a declined
 * or failed card as it settled, and a stored user message carries the refs of
 * the files attached to it, which the server reads on every turn to tell the
 * agent what it can open. Both ride in the message's `metadata`: `@ag-ui/client`
 * 1.0 strips every key its schemas do not declare from the request it sends,
 * and `metadata` is the one it declares open by key. Earlier releases stored
 * both at the top level, so a restore of their history has to move them, or the
 * first request after the upgrade would drop them.
 *
 * A restore seeds the next agent from the stored copy, so this is read off the
 * body of the request itself, through the real `HttpAgent`, rather than off a
 * fake's message list: the question is what goes over the wire, and only the
 * real client applies the stage that strips.
 *
 * The stored conversation is captured from a real run in which a person
 * attached a file and declined a confirmation card, never written by hand. The
 * earlier release's shape is derived from it by moving the metadata back up.
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

const REF = { id: "att1", name: "users.csv", mime: "text/csv", size: 12 };

/**
 * Run a conversation in which a person attaches a file and declines a
 * destructive call, and return what it stored.
 */
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
  // Not awaited: the run waits on the confirmation card clicked below.
  void el.sendMessage("delete user 7", [REF]);
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

/** `stored` as a release before the move wrote it: every metadata key at the top level. */
function asAnEarlierReleaseStoredIt(stored: readonly Message[]): readonly Message[] {
  return stored.map((message) => {
    const { metadata, ...rest } = message as Message & { metadata?: Record<string, unknown> };
    return metadata === undefined ? message : ({ ...rest, ...metadata } as Message);
  });
}

/** Stub `fetch` to finish every run, and return the parsed body of each request. */
function recordRequests(): { messages: readonly Record<string, unknown>[] }[] {
  const bodies: { messages: readonly Record<string, unknown>[] }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: unknown, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as (typeof bodies)[number]);
      return Promise.resolve(finishedRun());
    }),
  );
  return bodies;
}

/** Every warning the client printed as it stripped an undeclared key. */
function enforceWarnings(): () => string[] {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  return () =>
    warn.mock.calls.map((args) => String(args[0])).filter((m) => m.includes("[ag-ui][enforce]"));
}

function byRole(
  messages: readonly Record<string, unknown>[],
  role: string,
): Record<string, unknown> {
  const found = messages.find((m) => m["role"] === role);
  if (found === undefined) {
    throw new Error(`expected a ${role} message`);
  }
  return found;
}

describe("a restored conversation's next request", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carries the outcome and the refs in metadata, and the card still restores declined", async () => {
    const stored = await declinedConversation();
    // The control: the store really holds both, so what the request carries
    // below is the restore passing them on rather than nothing to pass.
    expect(byRole(stored as never, "tool")["metadata"]).toEqual({ outcome: TOOL_OUTCOME.DENIED });
    expect(byRole(stored as never, "user")["metadata"]).toEqual({ attachments: [REF] });

    const bodies = recordRequests();
    const warnings = enforceWarnings();
    const store = memoryStore(stored);
    const el = mountOver(store);
    document.body.appendChild(el);
    await settle();
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-status")).toBe("declined");

    send(el, "never mind");
    await settle();

    // Sent back, deliberately: `metadata` is declared, so this is the protocol
    // round-tripping its own field, and a server that does not read it -- as
    // django-ag-ui does not, for a tool message -- ignores it.
    const request = bodies[0]?.messages ?? [];
    expect(byRole(request, "tool")).toMatchObject({
      toolCallId: "tc1",
      metadata: { outcome: TOOL_OUTCOME.DENIED },
    });
    expect(byRole(request, "user")).toMatchObject({ metadata: { attachments: [REF] } });
    expect(warnings()).toEqual([]);
  });

  it("moves what an earlier release stored at the top level into metadata", async () => {
    const stored = asAnEarlierReleaseStoredIt(await declinedConversation());
    // The control: this is the shape the move has to undo.
    expect(byRole(stored as never, "tool")).toMatchObject({ outcome: TOOL_OUTCOME.DENIED });
    expect(byRole(stored as never, "user")).toMatchObject({ attachments: [REF] });
    expect(JSON.stringify(stored)).not.toContain('"metadata"');

    const bodies = recordRequests();
    const warnings = enforceWarnings();
    const store = memoryStore(stored);
    const el = mountOver(store);
    document.body.appendChild(el);
    await settle();
    // Both still replay from the old shape...
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-status")).toBe("declined");
    expect(shadow(el).querySelector(".attachment-chip-name")?.textContent).toBe(REF.name);

    send(el, "never mind");
    await settle();

    // ...and the request carries both where 1.0 lets them through. Sent as
    // stored, the client would have stripped the two keys with a warning each,
    // and the server would no longer know the file was ever attached.
    const request = bodies[0]?.messages ?? [];
    expect(byRole(request, "tool")).toMatchObject({ metadata: { outcome: TOOL_OUTCOME.DENIED } });
    expect(byRole(request, "user")).toMatchObject({ metadata: { attachments: [REF] } });
    expect(request.flatMap((m) => Object.keys(m))).not.toContain("outcome");
    expect(request.flatMap((m) => Object.keys(m))).not.toContain("attachments");
    expect(warnings()).toEqual([]);

    // The request after this one saved the whole transcript again, in the new
    // shape, so a reload still replays the decline and the chip.
    const resaved = store.saved();
    expect(byRole(resaved as never, "tool")["metadata"]).toEqual({ outcome: TOOL_OUTCOME.DENIED });
    expect(byRole(resaved as never, "user")["metadata"]).toEqual({ attachments: [REF] });
  });
});
