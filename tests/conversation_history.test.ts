/**
 * A restore with no run to resume, stopped before it has finished drawing.
 *
 * Every restore awaits the store, and with a remote store that is a real
 * request: the page is live while it is out, and New chat, removing the element
 * or a `user-key` handover can all happen in it. Then the replay draws through
 * the host's activity and tool renderers, which are host code and can do the
 * same from inside it. Whatever the restore draws after that is the
 * conversation being left, and it has nowhere true to go.
 *
 * A restore that will resume a run is covered beside the resume itself, in
 * `ag_ui_chat_reload_mid_run.test.ts`. This one holds nothing -- a send made
 * while it loads is not refused -- so nothing about a hold can tell it it was
 * stopped.
 *
 * The stored conversation is written by hand rather than captured from a run,
 * because the question is what a restore does once stopped, and the shape it
 * replays is the one the client stores for an activity: its own message.
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

defineAgUiChat();

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A finished conversation with an activity ahead of two more messages. */
const STORED = [
  { id: "u1", role: "user", content: "first" },
  { id: "act1", role: "activity", activityType: "probe", content: {} },
  { id: "u2", role: "user", content: "second" },
  { id: "a2", role: "assistant", content: "answer 2" },
] as unknown as readonly Message[];

/** A store whose every load waits until the test answers it. */
interface GatedStore extends ClientConversationStore {
  /** Answer the `n`th load (from zero) with `messages`. */
  answer(n: number, messages: readonly Message[] | null): void;
}

function gatedStore(): GatedStore {
  const loads: ((messages: readonly Message[] | null) => void)[] = [];
  return {
    answer: (n, messages) => loads[n]?.(messages),
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      new Promise((resolve) => {
        loads.push(resolve);
      }),
    saveMessages: () => {},
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

/**
 * Stand in for the AG-UI endpoint, recording each request's history as role
 * and text. Run N says "answer N".
 */
function stubEndpoint(): [string, unknown][][] {
  const sent: [string, unknown][][] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: readonly Message[] };
      sent.push(body.messages.map((message) => [message.role, message.content]));
      const n = sent.length;
      const events = [
        { type: "RUN_STARTED", threadId: "t1", runId: `run-${n}` },
        { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
        { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
        { type: "RUN_FINISHED", threadId: "t1", runId: `run-${n}` },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return sent;
}

/**
 * Mount over `store` with the element's own agent, counting each time the
 * `probe` activity is drawn and running `onDraw` from inside the renderer.
 */
function mount(
  store: GatedStore,
  attrs: Record<string, string> = {},
  onDraw: (el: AgUiChat) => void = () => {},
): { el: AgUiChat; drawn: () => number } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.conversationStore = store;
  let drawn = 0;
  el.registerActivityRenderer({
    type: "probe",
    render: () => {
      drawn += 1;
      onDraw(el);
      return document.createElement("div");
    },
  });
  document.body.appendChild(el);
  return { el, drawn: () => drawn };
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

describe("a restore with nothing to resume, while the store is still answering", () => {
  it("restores the conversation when nothing stops it", async () => {
    // The baseline the cases below depart from, so that an empty transcript in
    // them is the restore standing down rather than one that never drew.
    const store = gatedStore();
    const { el, drawn } = mount(store);
    await settle();

    store.answer(0, STORED);
    await settle();

    expect(drawn()).toBe(1);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["user", "second"],
      ["assistant", "answer 2"],
    ]);
  });

  it("draws nothing into a new chat started while it loads", async () => {
    // Only a newer restore made it stand down. New chat is not one, so the
    // conversation being left was drawn into the new chat once the store
    // answered, and handed to its client as the history to send: the first turn
    // there went out carrying a conversation the user had just left.
    const sent = stubEndpoint();
    const store = gatedStore();
    const { el, drawn } = mount(store);
    await settle();

    el.newChat();
    store.answer(0, STORED);
    await settle();

    expect(transcript(el)).toEqual([]);
    expect(drawn()).toBe(0);
    await el.sendMessage("fresh");
    await settle();
    expect(sent).toEqual([[["user", "fresh"]]]);
  });

  it("draws nothing into an element that left the page while it loads", async () => {
    // Nothing on the page shows it, but the host's renderers ran for a node that
    // had gone. Connecting again restores the conversation afresh, so drawing
    // it now is work the next connect throws away.
    const store = gatedStore();
    const { el, drawn } = mount(store);
    await settle();

    el.remove();
    store.answer(0, STORED);
    await settle();

    expect(drawn()).toBe(0);
    expect(transcript(el)).toEqual([]);
  });

  it("draws nothing of the principal who left when user-key changes while it loads", async () => {
    // Held by the restore the handover starts, which is newer: the first stands
    // down for it whatever order the two loads answer in.
    const store = gatedStore();
    const { el, drawn } = mount(store, { "user-key": "alice" });
    await settle();

    el.setAttribute("user-key", "bob");
    store.answer(0, STORED);
    store.answer(1, null);
    await settle();

    expect(drawn()).toBe(0);
    expect(transcript(el)).toEqual([]);
  });

  it("draws nothing more once a renderer it replays through starts a new chat", async () => {
    // The activity sits ahead of two more messages, so the check after each
    // replayed message is what keeps them out of the new chat, rather than one
    // made once the replay is done.
    const store = gatedStore();
    let armed = true;
    const { el, drawn } = mount(store, {}, (chat) => {
      if (armed) {
        armed = false;
        chat.newChat();
      }
    });
    await settle();

    store.answer(0, STORED);
    await settle();

    expect(drawn()).toBe(1);
    expect(transcript(el)).toEqual([]);
  });
});
