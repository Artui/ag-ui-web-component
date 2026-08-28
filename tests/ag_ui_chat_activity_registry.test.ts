/**
 * Activities as an open set, not two hard-coded branches.
 *
 * `activity_type` is one of exactly two AG-UI fields whose payload name the
 * protocol leaves an open string. The component handled `chart` and
 * `compaction` and dropped everything else through a bare `return` -- no host
 * seam, no console call, no record that anything had arrived. The server could
 * only say things the client had been compiled to understand, in a protocol
 * designed so it can say more.
 *
 * The two built-ins now go through the registry like any host registration,
 * which is the test that the seam is real: a built-in that needs a privileged
 * branch would mean the seam cannot express what the component itself needs.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHART_ACTIVITY_TYPE, COMPACTION_ACTIVITY_TYPE, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

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

function mount(script: (emit: Emit) => void | Promise<void>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return el;
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

/** A renderer returning a tagged node, so a test can find what it drew. */
function tagged(text: string): HTMLElement {
  const node = document.createElement("div");
  node.className = "host-activity";
  node.textContent = text;
  return node;
}

describe("a host-registered activity type", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("draws a type the component has never heard of", async () => {
    const el = mount((emit) => {
      emit.activity("build_status", { status: "green" }, "b1");
    });
    el.registerActivityRenderer({
      type: "build_status",
      render: (content) => tagged(`Build ${(content as { status: string }).status}`),
    });

    await send(el, "hi");

    expect(shadow(el).querySelector(".host-activity")?.textContent).toBe("Build green");
  });

  it("replaces its own node when the server redraws under the same id", async () => {
    const el = mount((emit) => {
      emit.activity("build_status", { status: "running" }, "b1");
      emit.activityReplace("build_status", { status: "green" }, "b1");
    });
    el.registerActivityRenderer({
      type: "build_status",
      render: (content) => tagged(`Build ${(content as { status: string }).status}`),
    });

    await send(el, "hi");

    const nodes = shadow(el).querySelectorAll(".host-activity");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.textContent).toBe("Build green");
  });

  it("survives a renderer that throws, and says so", async () => {
    // This runs inside the history replay, where a throw abandons the loop and
    // takes every later turn of the transcript with it -- silently, and again
    // on every reload.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = mount((emit) => {
        emit.activity("explodes", {}, "e1");
        emit.textStart("m1");
        emit.textEnd("the rest of the conversation", "m1");
      });
      el.registerActivityRenderer({
        type: "explodes",
        render: () => {
          throw new Error("boom");
        },
      });

      await send(el, "hi");

      expect(shadow(el).textContent).toContain("the rest of the conversation");
      expect(warn.mock.calls.map((c) => String(c[0])).join(" ")).toContain("explodes");
    } finally {
      warn.mockRestore();
    }
  });

  it("can override a built-in, because built-ins are registrations too", async () => {
    const el = mount((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 4 }, "c1");
    });
    el.registerActivityRenderer({
      type: COMPACTION_ACTIVITY_TYPE,
      render: () => tagged("my own compaction notice"),
    });

    await send(el, "hi");

    expect(shadow(el).querySelector(".host-activity")?.textContent).toBe(
      "my own compaction notice",
    );
    expect(shadow(el).querySelector(".run-notice--compaction")).toBeNull();
  });
});

describe("an activity nobody registered", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("draws nothing and says nothing", async () => {
    // The protocol's own answer, and the point of an open field: a client that
    // does not know a name ignores the event. A warning would fire on every
    // well-behaved forward-compatible server.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = mount((emit) => {
        emit.activity("pydantic_ai_something", { a: 1 }, "p1");
      });

      await send(el, "hi");

      expect(shadow(el).querySelector(".host-activity")).toBeNull();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("is still findable, because silence is impossible to debug", async () => {
    const el = mount((emit) => {
      emit.activity("pydantic_ai_something", { a: 1 }, "p1");
      emit.activity("another_unknown", { a: 1 }, "p2");
    });

    await send(el, "hi");

    expect([...el.unhandledActivityTypes].sort()).toEqual([
      "another_unknown",
      "pydantic_ai_something",
    ]);
  });

  it("stops being listed once someone registers for it", async () => {
    const el = mount((emit) => {
      emit.activity("late", {}, "l1");
    });

    await send(el, "hi");
    expect(el.unhandledActivityTypes).toContain("late");

    el.registerActivityRenderer({ type: "late", render: () => tagged("now drawn") });

    expect(el.unhandledActivityTypes).not.toContain("late");
  });

  it("does not list a type the component draws itself", async () => {
    const el = mount((emit) => {
      emit.activity(COMPACTION_ACTIVITY_TYPE, { removed: 2 }, "c1");
    });

    await send(el, "hi");

    expect(el.unhandledActivityTypes).not.toContain(COMPACTION_ACTIVITY_TYPE);
  });

  it("ignores a stored activity message with no type at all", async () => {
    // Defensive, and the replay path is where it matters: history is whatever
    // is in the store, which may predate a schema change or come from another
    // writer. A throw here abandons the replay loop and takes every later turn
    // of the transcript with it, on every reload.
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = {
      threadId: () => "t1",
      setActiveThread: () => {},
      saveMessages: () => {},
      loadMessages: () =>
        Promise.resolve([
          { id: "a1", role: "activity", content: { a: 1 } },
          { id: "m1", role: "assistant", content: "the rest of the conversation" },
        ]),
      listThreads: () => Promise.resolve([]),
      clear: () => {},
      saveCheckpoint: () => {},
      loadCheckpoint: () => null,
      renameThread: () => {},
    } as never;
    document.body.appendChild(el);

    await flush();
    await flush();

    expect(shadow(el).textContent).toContain("the rest of the conversation");
    expect(el.unhandledActivityTypes).toEqual([]);
  });

  it("lists chart until charts are enabled", async () => {
    // Charts are a host opt-in, so before `enableCharts` a pushed chart is
    // genuinely an activity nobody registered for -- and that is worth being
    // able to see, since "I pushed a chart and nothing happened" is otherwise
    // indistinguishable from a broken payload.
    const el = mount((emit) => {
      emit.activity(CHART_ACTIVITY_TYPE, { labels: ["a"], series: [{ points: [1] }] }, "c1");
    });

    await send(el, "hi");

    expect(el.unhandledActivityTypes).toContain(CHART_ACTIVITY_TYPE);
  });
});
