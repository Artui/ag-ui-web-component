/**
 * An element removed from the document and inserted again.
 *
 * A framework does this without being asked -- a portal, a teleport, a list
 * reordered by key -- and the README documents it as the way to apply a
 * connect-time attribute written late. Either way the element that comes back
 * has to be one element: one header, one composer, and one of every listener,
 * so that one click still sends one message. It is also rebuilt from the
 * attributes as they stand when it comes back, which is the half the README
 * promises.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import {
  type ClientConversationStore,
  SessionStorageStore,
} from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import { type Emit, type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";
import { type FakeXhrController, installFakeXhr } from "./helpers/fake_xhr.js";

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function mount(
  attrs: Record<string, string> = {},
  script: (emit: Emit) => void | Promise<void> = (emit) => emit.text("hello"),
): { el: AgUiChat; handle: FakeAgentHandle } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  // Up, so the transcript and composer are the open panel's.
  for (const [key, value] of Object.entries({ "data-start-open": "", ...attrs })) {
    el.setAttribute(key, value);
  }
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return { el, handle };
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

/** Take the element out of the document and put it back, as a framework move does. */
function reinsert(el: AgUiChat): void {
  el.remove();
  document.body.appendChild(el);
}

/**
 * How many elements carry each class, across the whole shadow root.
 *
 * Compared before and after a re-insertion rather than listed class by class,
 * so a duplicated grip, glyph or probe fails here too, and a control added
 * later is covered without this test knowing its name.
 */
function classCounts(el: AgUiChat): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of shadow(el).querySelectorAll("*")) {
    for (const name of node.classList) {
      counts[name] = (counts[name] ?? 0) + 1;
    }
  }
  return counts;
}

function input(el: AgUiChat): HTMLTextAreaElement {
  const node = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (node === null) {
    throw new Error("expected the composer input");
  }
  return node;
}

describe("an element removed and inserted again", () => {
  it("has one header and one composer row", () => {
    const { el } = mount();

    reinsert(el);

    expect(shadow(el).querySelectorAll(".header")).toHaveLength(1);
    expect(shadow(el).querySelectorAll(".input-row")).toHaveLength(1);
  });

  it("has exactly the elements it had before it left", () => {
    const { el } = mount({
      "data-theme-toggle": "",
      "data-transcribe-url": "/agent/transcribe/",
      "data-attachments-url": "/agent/attachments/",
    });
    const before = classCounts(el);

    reinsert(el);
    reinsert(el);

    expect(classCounts(el)).toEqual(before);
  });

  it("starts one run for one click on send", async () => {
    const { el, handle } = mount();
    reinsert(el);

    input(el).value = "hi";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    expect(handle.runParams).toHaveLength(1);
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(1);
  });

  it("stops a run once for one click on Stop", async () => {
    // Send alone cannot show a doubled listener: the first one empties the
    // composer, so the second finds nothing to send. Stop has no such guard.
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { el, handle } = mount({}, async (emit) => {
      emit.runStart();
      await gate;
    });
    reinsert(el);
    input(el).value = "hi";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    release();
    await flush();

    expect(handle.abortRuns).toBe(1);
  });

  it("opens the file picker once for one click on the paperclip", () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
    reinsert(el);
    const picker = shadow(el).querySelector<HTMLInputElement>(".attach-input");
    const opened = vi.fn();
    picker?.addEventListener("click", opened);

    shadow(el).querySelector<HTMLButtonElement>(".attach-btn")?.click();

    expect(opened).toHaveBeenCalledTimes(1);
  });

  it("starts one run for one Enter in the composer", async () => {
    const { el, handle } = mount();
    reinsert(el);

    input(el).value = "hi";
    input(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, cancelable: true }),
    );
    await flush();

    expect(handle.runParams).toHaveLength(1);
  });

  it("flips the theme once for one click on the built-in toggle", () => {
    const { el } = mount({ "data-theme-toggle": "" });
    reinsert(el);

    shadow(el).querySelector<HTMLButtonElement>(".header-btn--theme")?.click();

    // Two listeners flip it twice, which reads as a toggle that does nothing.
    expect(el.getAttribute("theme")).toBe("dark");
  });

  it("offers a tool registered before the move to the next run", async () => {
    const { el, handle } = mount();
    el.registerTool({
      name: "highlight_row",
      description: "Highlight a row.",
      parameters: { type: "object" },
      handler: async () => "ok",
    });
    reinsert(el);

    input(el).value = "hi";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    const tools = (handle.lastRunParams?.tools ?? []) as ReadonlyArray<{ name: string }>;
    expect(tools.map((tool) => tool.name)).toContain("highlight_row");
  });

  it("draws the conversation once, from its history", async () => {
    const { el } = mount();
    input(el).value = "hi";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(1);

    reinsert(el);
    await flush();

    // The history replay used to land beneath the transcript still showing.
    const users = shadow(el).querySelectorAll(".message--user");
    expect(users).toHaveLength(1);
    expect(users[0]?.textContent).toContain("hi");
  });

  it("does not stack a second remote thread store on the first", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ threads: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount({ "data-threads-url": "/agent/threads/" });
    reinsert(el);
    await flush();
    fetchMock.mockClear();

    el.conversationStore.renameThread(el.conversationStore.threadId(), "Renamed");
    await flush();

    const patches = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(1);
  });

  it("wraps a store the host assigned while it was away, not the one it had", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ threads: [] }) }),
    );
    const { el } = mount({ "data-threads-url": "/agent/threads/" });
    el.remove();
    // Of the host's own kind: the element re-scopes its built-in store on
    // every connect, and would replace a SessionStorageStore with its own.
    const own: ClientConversationStore = {
      threadId: () => "host-thread",
      loadMessages: () => Promise.resolve(null),
      saveMessages: () => undefined,
      loadCheckpoint: () => null,
      saveCheckpoint: () => undefined,
      clear: () => undefined,
      listThreads: () => Promise.resolve([]),
      setActiveThread: () => undefined,
      renameThread: () => undefined,
    };
    el.conversationStore = own;

    document.body.appendChild(el);

    // The remote keeps the active thread in the store it wraps, so the thread
    // it answers with says which store that is.
    expect(el.conversationStore).toBeInstanceOf(RemoteConversationStore);
    expect(el.conversationStore.threadId()).toBe("host-thread");
  });

  it("drops the remote thread store when data-threads-url went while it was away", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ threads: [] }) }),
    );
    const { el } = mount({ "data-threads-url": "/agent/threads/" });
    expect(el.conversationStore).toBeInstanceOf(RemoteConversationStore);
    el.remove();

    el.removeAttribute("data-threads-url");
    document.body.appendChild(el);

    expect(el.conversationStore).toBeInstanceOf(SessionStorageStore);
  });

  describe("with uploads", () => {
    let xhr: FakeXhrController;

    beforeEach(() => {
      xhr = installFakeXhr();
    });

    afterEach(() => {
      xhr.restore();
    });

    it("takes one file dropped on it once", () => {
      const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
      reinsert(el);

      const event = new Event("drop", { bubbles: true, cancelable: true });
      (event as { dataTransfer?: unknown }).dataTransfer = {
        files: [new File(["notes"], "notes.txt", { type: "text/plain" })],
      };
      shadow(el).querySelector(".chat")?.dispatchEvent(event);

      expect(shadow(el).querySelectorAll(".attachment-chip")).toHaveLength(1);
    });
  });

  it("builds the chrome from the attributes as they stand when it comes back", () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
    el.remove();

    el.removeAttribute("data-attachments-url");
    el.setAttribute("data-theme-toggle", "");
    document.body.appendChild(el);

    expect(shadow(el).querySelector(".attachment-tray")).toBeNull();
    expect(shadow(el).querySelectorAll(".header-btn--theme")).toHaveLength(1);
  });
});
