/**
 * The greeting an empty conversation shows, and the state that lays it out.
 *
 * What is decidable without layout lives here: the text, where it comes from,
 * the slot it sits in, and the `data-empty` stamp the stylesheet reads to
 * centre the composer. Whether the stylesheet actually centres anything --
 * which placements show the greeting, and where the composer ends up -- is
 * geometry, and happy-dom lays out no boxes, so those assertions are in
 * `tests/browser/greeting_layout.browser.test.ts`.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, LOAD_CAPABILITY_TOOL, MESSAGE_ROLE } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ClientConversationStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

function mount(
  attrs: Record<string, string> = {},
  configure: (el: AgUiChat) => void = () => {},
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "page");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  configure(el);
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

function greeting(el: AgUiChat): HTMLElement {
  const found = shadow(el).querySelector<HTMLElement>(".greeting");
  if (found === null) {
    throw new Error("expected a .greeting");
  }
  return found;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

/** A store holding one thread whose messages are `messages`. */
function storeWith(messages: readonly Message[]): ClientConversationStore {
  return {
    threadId: () => "t1",
    loadMessages: () => Promise.resolve([...messages]),
    saveMessages: () => {},
    loadCheckpoint: () => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: () => Promise.resolve([]),
    setActiveThread: () => {},
    renameThread: () => {},
  };
}

/**
 * A store whose every load waits to be answered, so "a restore in flight" is a
 * real state rather than a flag set from outside.
 */
function heldStore(): {
  store: ClientConversationStore;
  answer: (index: number, messages: readonly Message[] | null) => void;
  loads: () => number;
} {
  const pending: ((messages: readonly Message[] | null) => void)[] = [];
  return {
    store: {
      ...storeWith([]),
      loadMessages: () =>
        new Promise((resolve) => {
          pending.push(resolve);
        }),
    },
    answer: (index, messages) => pending[index]?.(messages),
    loads: () => pending.length,
  };
}

const answering = (emit: Emit): void => {
  emit.runStart();
  emit.textEnd("an answer");
  emit.runEnd();
};

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

describe("the greeting's text", () => {
  it("greets nobody in particular when no name is given", () => {
    expect(greeting(mount()).textContent).toBe("Hello there");
  });

  it("greets the user-name set before connecting", () => {
    expect(greeting(mount({ "user-name": "Ada" })).textContent).toBe("Hello, Ada");
  });

  it("follows user-name live, in both directions", () => {
    // The documented late shape: the element mounts, an auth handshake
    // resolves, and only then is the user known.
    const el = mount();
    el.setAttribute("user-name", "Grace");
    expect(greeting(el).textContent).toBe("Hello, Grace");

    el.setAttribute("user-name", "Ada");
    expect(greeting(el).textContent).toBe("Hello, Ada");

    el.removeAttribute("user-name");
    expect(greeting(el).textContent).toBe("Hello there");
  });

  it("treats a blank name as no name", () => {
    expect(greeting(mount({ "user-name": "   " })).textContent).toBe("Hello there");
  });

  it("mirrors the attribute on the userName property", () => {
    const el = mount();
    expect(el.userName).toBe("");

    el.userName = "Ada";
    expect(el.getAttribute("user-name")).toBe("Ada");
    expect(greeting(el).textContent).toBe("Hello, Ada");

    el.setAttribute("user-name", "Grace");
    expect(el.userName).toBe("Grace");
  });

  it("puts a name with dollar patterns in it on screen as written", () => {
    // A name is text somebody typed into a profile. Filled through a string
    // replacement, `$&` would splice the matched token back in.
    const el = mount({ "user-name": "Grace $& Hopper $'" });
    expect(greeting(el).textContent).toBe("Hello, Grace $& Hopper $'");
  });

  it("is never sent anywhere", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({ "user-name": "Ada Lovelace" }, (e) => {
      e.agentFactory = () => handle.agent;
    });

    await send(el, "hi");

    // Everything the agent is handed: the messages and each run's tools,
    // context and resume payload.
    expect(handle.runParams.length).toBeGreaterThan(0);
    expect(JSON.stringify([handle.messages, handle.runParams])).not.toContain("Ada Lovelace");
  });

  it("translates both forms through the strings property", () => {
    const named = mount({ "user-name": "Ada" }, (e) => {
      e.strings = { greeting: "Hallo, {name}", greetingNoName: "Hallo" };
    });
    expect(greeting(named).textContent).toBe("Hallo, Ada");

    named.removeAttribute("user-name");
    expect(greeting(named).textContent).toBe("Hallo");
  });

  it("translates both forms through data-strings", () => {
    const el = mount({
      "user-name": "Ada",
      "data-strings": JSON.stringify({ greeting: "{name}, bonjour", greetingNoName: "Bonjour" }),
    });
    expect(greeting(el).textContent).toBe("Ada, bonjour");

    el.removeAttribute("user-name");
    expect(greeting(el).textContent).toBe("Bonjour");
  });
});

describe("the greeting's place in the empty state", () => {
  it("is a part holding a greeting slot, whose fallback is the text", () => {
    const el = mount({ "user-name": "Ada" });
    const node = greeting(el);

    expect(node.getAttribute("part")).toBe("greeting");
    const slot = node.querySelector("slot");
    expect(slot?.getAttribute("name")).toBe("greeting");
    expect(slot?.textContent).toBe("Hello, Ada");
  });

  it("heads the empty state, above the empty slot and the starters", () => {
    // Its own slot, so a host replacing the starters keeps the greeting and a
    // host replacing the greeting keeps the starters.
    const el = mount({ "data-starters": JSON.stringify(["Summarise this page"]) });
    const empty = shadow(el).querySelector(".empty");
    const children = [...(empty?.children ?? [])];

    expect(children[0]?.className).toBe("greeting");
    expect(children[1]?.getAttribute("name")).toBe("empty");
    expect(children[1]?.textContent).toContain("Summarise this page");
  });

  it("is rendered under every placement, for the stylesheet to show or not", () => {
    // A placement switch at runtime then needs nothing from script.
    for (const placement of ["floating", "sidebar", "embedded", "page"]) {
      document.body.innerHTML = "";
      expect(greeting(mount({ placement })).textContent).toBe("Hello there");
    }
  });

  it("is not a heading, because the host page owns the document outline", () => {
    const node = greeting(mount());
    expect(node.tagName).toBe("DIV");
    expect(node.getAttribute("role")).toBeNull();
  });
});

describe("data-empty", () => {
  it("is set on connect, before anything renders", () => {
    expect(mount().hasAttribute("data-empty")).toBe(true);
  });

  it("is cleared by the user's own bubble", () => {
    const el = mount();
    el.appendMessage(MESSAGE_ROLE.USER, "hello");
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("is cleared by an assistant bubble", () => {
    const el = mount();
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("is cleared by a run notice with nothing else on screen", async () => {
    // A restored skill load draws a notice and nothing else, through the same
    // answer group a card uses.
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([
        {
          id: "a1",
          role: "assistant",
          toolCalls: [
            {
              id: "tc1",
              type: "function",
              function: { name: LOAD_CAPABILITY_TOOL, arguments: '{"id":"summarise"}' },
            },
          ],
        } as Message,
      ]);
    });
    await flush();

    expect(shadow(el).querySelector(".run-notice--skill")).not.toBeNull();
    expect(shadow(el).querySelector(".message")).toBeNull();
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("is cleared by a tool card with nothing else on screen", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([
        {
          id: "a1",
          role: "assistant",
          toolCalls: [
            { id: "tc1", type: "function", function: { name: "list_widgets", arguments: "{}" } },
          ],
        } as Message,
      ]);
    });
    await flush();

    expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
    expect(shadow(el).querySelector(".message")).toBeNull();
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("is cleared when a restored conversation replays", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([
        { id: "u1", role: "user", content: "earlier" },
        { id: "a1", role: "assistant", content: "an answer" },
      ]);
    });
    await flush();

    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("stays set when the store has nothing to restore", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([]);
    });
    await flush();

    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("comes back on a new chat", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
    });
    await send(el, "hi");
    expect(el.hasAttribute("data-empty")).toBe(false);

    el.newChat();

    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("comes back when the transcript is cleared for a retry, and goes once it re-renders", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
    });
    await send(el, "hi");
    expect(el.hasAttribute("data-empty")).toBe(false);

    // A retry clears and re-renders in one go, so the stamp is watched rather
    // than sampled. Counted rather than read: a write that changes nothing
    // makes no record, so two records are an add and a remove, while happy-dom
    // reports the removal's old value as null where a browser reports "".
    let writes = 0;
    const observer = new MutationObserver((records) => {
      writes += records.length;
    });
    observer.observe(el, { attributes: true, attributeFilter: ["data-empty"] });
    expect(await el.retryLastTurn()).toBe(true);
    await flush();
    observer.disconnect();

    expect(writes).toBe(2);
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("comes back when the signed-in principal changes", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({ "user-key": "alice" }, (e) => {
      e.agentFactory = () => handle.agent;
    });
    await send(el, "hi");
    expect(el.hasAttribute("data-empty")).toBe(false);

    el.setAttribute("user-key", "bob");

    expect(el.hasAttribute("data-empty")).toBe(true);
  });
});

describe("the send that leaves the empty state", () => {
  it("arms the slide for a send from an empty conversation", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
    });
    expect(el.hasAttribute("data-composer-settling")).toBe(false);

    await send(el, "hi");

    expect(el.hasAttribute("data-composer-settling")).toBe(true);
  });

  it("arms it for a host's own sendMessage and for a starter, which are sends too", async () => {
    const handle = makeFakeAgent({ script: answering });
    const host = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
    });
    await host.sendMessage("from the host");
    expect(host.hasAttribute("data-composer-settling")).toBe(true);

    document.body.innerHTML = "";
    const starter = mount({ "data-starters": JSON.stringify(["Summarise this page"]) }, (e) => {
      e.agentFactory = () => handle.agent;
    });
    shadow(starter).querySelector<HTMLButtonElement>(".suggestion-chip")?.click();
    await flush();
    expect(starter.hasAttribute("data-composer-settling")).toBe(true);
  });

  it("does not arm it for a send into a conversation that already has content", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
      e.conversationStore = storeWith([
        { id: "u1", role: "user", content: "earlier" },
        { id: "a1", role: "assistant", content: "an answer" },
      ]);
    });
    await flush();

    await send(el, "and another thing");

    expect(el.hasAttribute("data-composer-settling")).toBe(false);
  });

  it("does not arm it for a send that is refused before anything lands", async () => {
    // Nothing leaves the empty state, so there is nothing to travel.
    const el = mount();
    await el.sendMessage("");
    expect(el.hasAttribute("data-composer-settling")).toBe(false);
  });

  it("never arms it for a restored conversation", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([{ id: "u1", role: "user", content: "earlier" }]);
    });
    await flush();

    expect(el.hasAttribute("data-empty")).toBe(false);
    expect(el.hasAttribute("data-composer-settling")).toBe(false);
  });

  it("never arms it for a continued run, which is a change of context", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          runs: [
            {
              run_id: "r1",
              thread_id: "t1",
              parent_run_id: null,
              started_at: "2026-07-27T12:00:00+00:00",
              continuable: true,
            },
          ],
        }),
      })),
    );
    const el = mount({ "data-runs-url": "/agent/runs/" }, (e) => {
      e.agentFactory = () =>
        makeFakeAgent({
          script: (emit) => {
            emit.runStart();
            emit.textEnd("continued");
            emit.runEnd();
          },
        }).agent;
    });
    shadow(el).querySelector<HTMLButtonElement>(".header-btn--checkpoints")?.click();
    await flush();
    const input = shadow(el).querySelector<HTMLTextAreaElement>(".input") as HTMLTextAreaElement;
    input.value = "and now sort them";
    shadow(el).querySelector<HTMLButtonElement>(".checkpoint-resume")?.click();
    await flush();

    expect(el.hasAttribute("data-empty")).toBe(false);
    expect(el.hasAttribute("data-composer-settling")).toBe(false);
  });

  it("disarms it when the conversation is emptied, so returning to the centre snaps", async () => {
    const handle = makeFakeAgent({ script: answering });
    const el = mount({}, (e) => {
      e.agentFactory = () => handle.agent;
    });
    await send(el, "hi");
    expect(el.hasAttribute("data-composer-settling")).toBe(true);

    el.newChat();

    expect(el.hasAttribute("data-composer-settling")).toBe(false);
  });
});

describe("holding the layout while a conversation is restored", () => {
  it("holds it for as long as the store takes to answer", async () => {
    const held = heldStore();
    const el = mount({}, (e) => {
      e.conversationStore = held.store;
    });
    await flush();
    expect(el.hasAttribute("data-restoring")).toBe(true);

    held.answer(0, [{ id: "u1", role: "user", content: "earlier" }]);
    await flush();

    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(false);
  });

  it("releases it for a thread that turns out to be empty, which then greets", async () => {
    const held = heldStore();
    const el = mount({}, (e) => {
      e.conversationStore = held.store;
    });
    await flush();

    held.answer(0, null);
    await flush();

    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("is released only by the restore that is still current", async () => {
    // A principal change starts a second restore while the first is pending.
    // The first answering late must neither release the hold the second still
    // needs nor draw its messages.
    const held = heldStore();
    const el = mount({ "user-key": "alice" }, (e) => {
      e.conversationStore = held.store;
    });
    await flush();
    el.setAttribute("user-key", "bob");
    await flush();
    expect(held.loads()).toBe(2);
    expect(el.hasAttribute("data-restoring")).toBe(true);

    held.answer(0, [{ id: "u1", role: "user", content: "alice's" }]);
    await flush();
    expect(el.hasAttribute("data-restoring")).toBe(true);
    expect(el.hasAttribute("data-empty")).toBe(true);

    held.answer(1, null);
    await flush();
    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("is dropped by a new chat started mid-restore, which greets at once", async () => {
    const held = heldStore();
    const el = mount({}, (e) => {
      e.conversationStore = held.store;
    });
    await flush();
    expect(el.hasAttribute("data-restoring")).toBe(true);

    el.newChat();

    expect(el.hasAttribute("data-restoring")).toBe(false);
    expect(el.hasAttribute("data-empty")).toBe(true);
  });

  it("is released when the store fails rather than answering", async () => {
    const el = mount({}, (e) => {
      e.conversationStore = storeWith([]);
    });
    await flush();
    el.conversationStore = {
      ...storeWith([]),
      loadMessages: () => Promise.reject(new Error("offline")),
    };

    await expect(el.reload()).rejects.toThrow("offline");

    expect(el.hasAttribute("data-restoring")).toBe(false);
  });
});
