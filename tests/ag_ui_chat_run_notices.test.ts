/**
 * Run notices — the ambient annotations a run produces about itself.
 *
 * Two sources, one rendering: an AG-UI `ACTIVITY_SNAPSHOT` saying the server
 * condensed the history, and a `load_capability` tool call saying the model
 * picked an agent skill. Neither is work the user asked for, so neither should
 * look like a tool card.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { COMPACTION_ACTIVITY_TYPE, ELEMENT_TAG, LOAD_CAPABILITY_TOOL } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

function mountWithAgent(script: (emit: Emit) => void | Promise<void>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
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

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
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

describe("compaction notices", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a notice carrying the removed count", async () => {
    const el = mountWithAgent((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 8, before: 10, after: 2 });
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--compaction")?.textContent).toContain("8");
  });

  it("ignores an activity event of another type", async () => {
    // The activity channel is general AG-UI surface — another producer's events
    // must pass through without rendering a compaction notice.
    const el = mountWithAgent((emit) => {
      emit.activity("something-else", { removed: 3 });
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--compaction")).toBeNull();
  });

  it("ignores a payload with no usable count", async () => {
    const el = mountWithAgent((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { unexpected: true });
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--compaction")).toBeNull();
  });

  it("renders one notice per firing", async () => {
    const el = mountWithAgent((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 4 });
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 6 });
    });
    await send(el, "hi");
    expect(shadow(el).querySelectorAll(".run-notice--compaction")).toHaveLength(2);
  });

  it("announces politely rather than interrupting", async () => {
    const el = mountWithAgent((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 2 });
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice")?.getAttribute("role")).toBe("status");
  });
});

describe("agent-skill notices", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders a skill notice for a load_capability call", async () => {
    let round = 0;
    const el = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("c1", LOAD_CAPABILITY_TOOL, { id: "summarise" });
      }
      round += 1;
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--skill")?.textContent).toContain("summarise");
  });

  it("does not also render a tool card for it", async () => {
    // The point of intercepting: a chip *beside* a raw `load_capability` card
    // would be worse than the card alone.
    let round = 0;
    const el = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("c1", LOAD_CAPABILITY_TOOL, { id: "summarise" });
      }
      round += 1;
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".tool-call")).toBeNull();
  });

  it("falls back to a tool card when the id is missing", async () => {
    // A malformed call is still real activity; dropping it silently would hide
    // it from the user entirely.
    let round = 0;
    const el = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("c1", LOAD_CAPABILITY_TOOL, {});
      }
      round += 1;
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--skill")).toBeNull();
    expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
  });

  it("leaves ordinary tool calls as cards", async () => {
    let round = 0;
    const el = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("c1", "list_widgets", {});
      }
      round += 1;
    });
    await send(el, "hi");
    expect(shadow(el).querySelector(".run-notice--skill")).toBeNull();
    expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
  });
});

describe("restored history", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("replays a skill load as a notice, not a tool card", async () => {
    // A reload must not resurrect the raw `load_capability` card the live path
    // deliberately replaced — the transcript should look the same either way.
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      { id: "1", role: "user", content: "summarise this" },
      {
        id: "2",
        role: "assistant",
        toolCalls: [
          {
            id: "tc1",
            type: "function",
            function: { name: LOAD_CAPABILITY_TOOL, arguments: '{"id":"summarise"}' },
          },
        ],
      },
      { id: "3", role: "assistant", content: "Done." },
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    expect(shadow(el).querySelector(".run-notice--skill")?.textContent).toContain("summarise");
    expect(shadow(el).querySelector(".tool-call")).toBeNull();
  });

  it("still replays ordinary tool calls as cards", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      { id: "1", role: "user", content: "count" },
      {
        id: "2",
        role: "assistant",
        toolCalls: [
          { id: "tc1", type: "function", function: { name: "count_users", arguments: "{}" } },
        ],
      },
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    expect(shadow(el).querySelector(".tool-call")).not.toBeNull();
  });
});
