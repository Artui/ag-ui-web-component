/**
 * Unread answers are counted per thread.
 *
 * An answer that finished while the panel was collapsed belongs to the thread
 * it ran on, and is read only once that thread is on screen with the panel
 * expanded. A collapsed switch, a new chat or an expand on another thread used
 * to mark it read unseen. `unread` stays the total the launcher badge shows.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, UNREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ClientConversationStore, ThreadMeta } from "../src/core/conversation_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

type Detail = Record<string, unknown>;

interface Mounted {
  readonly el: AgUiChat;
  readonly events: Detail[];
}

function mount(attributes: Record<string, string> = {}, store?: ClientConversationStore): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  if (store !== undefined) {
    el.conversationStore = store;
  }
  el.agentFactory = () =>
    makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.textEnd("an answer");
        emit.runEnd();
      },
    }).agent;
  const events: Detail[] = [];
  el.addEventListener(UNREAD_EVENT, (event) => {
    events.push({ ...((event as CustomEvent).detail as Detail) });
  });
  document.body.appendChild(el);
  return { el, events };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

async function answer(el: AgUiChat): Promise<void> {
  const input = el.shadowRoot?.querySelector<HTMLTextAreaElement>(".input");
  if (input == null) {
    throw new Error("expected the composer");
  }
  input.value = "hi";
  el.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

function badge(el: AgUiChat): HTMLElement {
  const found = el.shadowRoot?.querySelector<HTMLElement>(".launcher-badge");
  if (found == null) {
    throw new Error("expected a .launcher-badge");
  }
  return found;
}

function saved(store: ClientConversationStore, threadId: string): void {
  store.saveMessages(threadId, [{ id: `u-${threadId}`, role: "user", content: "x" } as Message]);
}

/** A store with only the required members: no `markRead`, no `unread` on its rows. */
function minimalStore(rows: readonly ThreadMeta[] = []): ClientConversationStore {
  const inner = new SessionStorageStore("minimal");
  return {
    threadId: () => inner.threadId(),
    loadMessages: (id) => inner.loadMessages(id),
    saveMessages: (id, messages) => inner.saveMessages(id, messages),
    loadCheckpoint: (id) => inner.loadCheckpoint(id),
    saveCheckpoint: (id, checkpoint) => inner.saveCheckpoint(id, checkpoint),
    clear: (id) => inner.clear(id),
    listThreads: () => Promise.resolve(rows),
    setActiveThread: (id) => inner.setActiveThread(id),
    renameThread: (id, title) => inner.renameThread(id, title),
  };
}

/** The minimal store with a `markRead` spy, and rows the test fills. */
function readingStore(): {
  store: ClientConversationStore;
  markRead: ReturnType<typeof vi.fn>;
  rows: ThreadMeta[];
} {
  const rows: ThreadMeta[] = [];
  const markRead = vi.fn();
  const store = { ...minimalStore(rows), markRead } as ClientConversationStore;
  return { store, markRead, rows };
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("an answer finished while collapsed", () => {
  it("stays marked on its thread across a collapsed switch and an expand elsewhere", async () => {
    const { el } = mount();
    await flush();
    const threadA = el.threadId as string;
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    expect(el.unread).toBe(1);

    await el.switchThread("tB");
    el.setCollapsed(false);

    expect(el.unread).toBe(1);
    el.setCollapsed(true);
    expect(badge(el).hidden).toBe(false);
    expect(badge(el).textContent).toBe("1");

    el.setCollapsed(false);
    await el.switchThread(threadA);

    expect(el.unread).toBe(0);
  });

  it("shows the badge on the collapsed launcher only, never behind an open panel", async () => {
    const { el } = mount();
    await flush();
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    await el.switchThread("tB");
    expect(badge(el).hidden).toBe(false);

    el.setCollapsed(false);

    expect(el.unread).toBe(1);
    expect(badge(el).hidden).toBe(true);
    el.setCollapsed(true);
    expect(badge(el).hidden).toBe(false);
  });

  it("is not read by being on screen in a collapsed panel", async () => {
    const { el } = mount();
    await flush();
    const threadA = el.threadId as string;
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    await el.switchThread("tB");

    await el.switchThread(threadA);

    expect(el.unread).toBe(1);
    el.setCollapsed(false);
    expect(el.unread).toBe(0);
  });

  it("totals the threads on the badge, and an expand clears only the one on screen", async () => {
    const { el } = mount();
    await flush();
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    await el.switchThread("tB");
    await answer(el);
    await answer(el);

    expect(el.unread).toBe(3);
    expect(badge(el).textContent).toBe("3");

    el.setCollapsed(false);

    expect(el.unread).toBe(1);
  });

  it("names the thread it changed on the event", async () => {
    const { el, events } = mount();
    await flush();
    const threadA = el.threadId as string;
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    await el.switchThread("tB");
    el.setCollapsed(false);
    events.length = 0;

    await el.switchThread(threadA);

    expect(events).toEqual([{ unread: 0, threadIds: [threadA] }]);
  });

  it("reports a collapse toggle that clears nothing with no threads", async () => {
    const { el, events } = mount();
    await flush();
    events.length = 0;

    el.setCollapsed(true);

    expect(events).toEqual([{ unread: 0, threadIds: [] }]);
  });

  it("names the thread on the count that marks it", async () => {
    const { el, events } = mount();
    await flush();
    el.setCollapsed(true);
    events.length = 0;

    await answer(el);

    expect(events).toEqual([{ unread: 1, threadIds: [el.threadId] }]);
  });

  it("is not cleared by a switch to a thread that is still loading", async () => {
    const { el } = mount();
    await flush();
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    const load = el.conversationStore.loadMessages.bind(el.conversationStore);
    let release = (): void => undefined;
    el.conversationStore.loadMessages = (id) =>
      new Promise((resolve) => {
        release = () => void load(id).then(resolve);
      });

    const switching = el.switchThread("tB");
    el.setCollapsed(false);
    expect(el.unread).toBe(1);
    release();
    await switching;

    expect(el.unread).toBe(1);
  });
});

describe("a thread switched to but still loading", () => {
  async function loading(el: AgUiChat): Promise<{ release: () => void; switching: Promise<void> }> {
    saved(el.conversationStore, "tB");
    const load = el.conversationStore.loadMessages.bind(el.conversationStore);
    let release = (): void => undefined;
    el.conversationStore.loadMessages = (id) =>
      new Promise((resolve) => {
        release = () => void load(id).then(resolve);
      });
    const switching = el.switchThread("tB");
    return { release: () => release(), switching };
  }

  it("does not read a listed unread row for it until it is shown", async () => {
    const { store, markRead, rows } = readingStore();
    const { el } = mount({}, store);
    await flush();
    const { release, switching } = await loading(el);
    rows.push({ threadId: "tB", title: "B", updatedAt: 0, preview: "", unread: true });

    el.shadowRoot?.querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await flush();

    expect(el.unread).toBe(1);
    expect(markRead).not.toHaveBeenCalled();
    release();
    await switching;
  });
});

describe("new chat", () => {
  it("keeps the thread it leaves marked", async () => {
    const { el } = mount();
    await flush();
    el.setCollapsed(true);
    await answer(el);

    el.newChat();
    await flush();
    el.setCollapsed(false);

    expect(el.unread).toBe(1);
  });
});

describe("a principal change", () => {
  it("drops the previous principal's marks and names them", async () => {
    const { el, events } = mount({ "user-key": "alice" });
    await flush();
    const threadA = el.threadId as string;
    el.setCollapsed(true);
    await answer(el);
    events.length = 0;

    el.setAttribute("user-key", "bob");
    await flush();
    el.setCollapsed(false);

    expect(el.unread).toBe(0);
    expect(events[0]).toEqual({ unread: 0, threadIds: [threadA] });
  });

  it("reports a principal change that had no marks, naming no threads", async () => {
    const { el, events } = mount({ "user-key": "alice" });
    await flush();
    events.length = 0;

    el.setAttribute("user-key", "bob");
    await flush();

    expect(events).toEqual([{ unread: 0, threadIds: [] }]);
  });

  it("keeps the marks when a key arrives for the user already there", async () => {
    const { el } = mount();
    await flush();
    el.setCollapsed(true);
    await answer(el);

    el.setAttribute("user-key", "alice");
    await flush();

    expect(el.unread).toBe(1);
  });
});

describe("the store seam", () => {
  it("works with a store that has neither markRead nor unread rows", async () => {
    const { el } = mount({}, minimalStore());
    await flush();
    el.setCollapsed(true);
    await answer(el);

    el.setCollapsed(false);

    expect(el.unread).toBe(0);
  });

  it("calls markRead when it clears a thread", async () => {
    const { store, markRead } = readingStore();
    const { el } = mount({}, store);
    await flush();
    el.setCollapsed(true);
    await answer(el);
    expect(markRead).not.toHaveBeenCalled();

    el.setCollapsed(false);

    expect(markRead).toHaveBeenCalledExactlyOnceWith(el.threadId);
  });

  it("calls markRead for an answer read as it lands", async () => {
    const { store, markRead } = readingStore();
    const { el } = mount({}, store);
    await flush();

    await answer(el);

    expect(el.unread).toBe(0);
    expect(markRead).toHaveBeenCalledExactlyOnceWith(el.threadId);
  });

  it("takes a row the store lists as unread, and reads the one on screen", async () => {
    const { store, markRead, rows } = readingStore();
    const { el } = mount({}, store);
    await flush();
    const now = Date.now();
    rows.push(
      { threadId: "tB", title: "B", updatedAt: now, preview: "", unread: true },
      { threadId: el.threadId as string, title: "A", updatedAt: now, preview: "", unread: true },
      { threadId: "tC", title: "C", updatedAt: now, preview: "", unread: false },
    );

    el.shadowRoot?.querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await flush();

    expect(el.unread).toBe(1);
    expect(markRead).toHaveBeenCalledExactlyOnceWith(el.threadId);

    el.shadowRoot?.querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await flush();
    expect(el.unread).toBe(1);
  });

  it("keeps the count of a thread already counted when the store lists it unread", async () => {
    const { store, rows } = readingStore();
    const { el, events } = mount({}, store);
    await flush();
    el.setCollapsed(true);
    await answer(el);
    await answer(el);
    expect(el.unread).toBe(2);
    rows.push({
      threadId: el.threadId as string,
      title: "A",
      updatedAt: 0,
      preview: "",
      unread: true,
    });
    events.length = 0;

    el.openThreads();
    await flush();

    expect(el.unread).toBe(2);
    expect(events).toEqual([]);
  });

  it("does not read a listed row on screen in a collapsed panel", async () => {
    const { store, markRead, rows } = readingStore();
    const { el } = mount({}, store);
    await flush();
    el.setCollapsed(true);
    rows.push({
      threadId: el.threadId as string,
      title: "A",
      updatedAt: 0,
      preview: "",
      unread: true,
    });

    el.openThreads();
    await flush();

    expect(el.unread).toBe(1);
    expect(markRead).not.toHaveBeenCalled();
  });
});

describe("deleting a thread", () => {
  it("drops its marks", async () => {
    const { el, events } = mount();
    await flush();
    const threadA = el.threadId as string;
    saved(el.conversationStore, "tB");
    el.setCollapsed(true);
    await answer(el);
    await el.switchThread("tB");
    events.length = 0;

    el.deleteThread(threadA);
    await flush();

    expect(el.unread).toBe(0);
    expect(events).toEqual([{ unread: 0, threadIds: [threadA] }]);
  });
});
