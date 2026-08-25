/**
 * Charts in the transcript, by both routes.
 *
 * The routes differ in where the data lives, not in how a chart looks: one
 * renderer, two adapters. What is worth asserting is therefore not the drawing
 * (covered in `chart_block.test.ts`) but the seams — where a chart lands, when
 * it is redrawn rather than duplicated, and which half of a tool a reload is
 * allowed to run.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CHART_ACTIVITY_TYPE, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { ClientTool } from "../src/tools/client_tool_registry.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

const CHART = {
  kind: "bar",
  title: "Signups",
  labels: ["Mon", "Tue"],
  series: [{ label: "new", points: [1, 2] }],
};

beforeAll(() => defineAgUiChat());
beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

function mount(
  script: (emit: Emit) => void | Promise<void>,
  routes?: readonly ("tool" | "activity")[],
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  if (routes !== undefined) {
    el.enableCharts(routes);
  }
  return el;
}

const shadow = (el: AgUiChat) => el.shadowRoot as ShadowRoot;
const charts = (el: AgUiChat) => shadow(el).querySelectorAll(".chart-block");

async function send(el: AgUiChat, text: string): Promise<void> {
  await el.sendMessage(text);
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

describe("charts are off unless asked for", () => {
  it("ignores a pushed chart activity when no route is enabled", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
      emit.runEnd();
    });
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("ignores a pushed chart when only the tool route is enabled", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
        emit.runEnd();
      },
      ["tool"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("ignores an activity update when the activity route is off", async () => {
    // The update still reaches the component -- the client reports every
    // replacement -- so the route check has to hold on the update path too, not
    // only on the first draw.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
        emit.activityReplace(CHART_ACTIVITY_TYPE, { ...CHART, title: "changed" }, "a1");
        emit.runEnd();
      },
      ["tool"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("does not offer the chart tool when only the activity route is enabled", async () => {
    const el = mount(() => {}, ["activity"]);
    expect(el.getTools?.().some((tool) => tool.name === "render_chart")).not.toBe(true);
  });
});

describe("the server-pushed route", () => {
  it("draws a pushed chart", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(1);
    expect(shadow(el).querySelector(".chart-title")?.textContent).toBe("Signups");
  });

  it("redraws in place when a snapshot replaces one already shown", async () => {
    // Two copies would read as two measurements rather than one that moved.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
        emit.activityReplace(CHART_ACTIVITY_TYPE, { ...CHART, title: "Signups (revised)" }, "a1");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(1);
    expect(shadow(el).querySelector(".chart-title")?.textContent).toBe("Signups (revised)");
  });

  it("redraws a delta from the patched content, not the content it superseded", async () => {
    // The client dispatches the delta subscriber *before* applying the patch, so
    // reading the message there leaves the chart one revision behind for the
    // life of the run -- and disagreeing with what a reload shows.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, CHART, "a1");
        emit.activityDelta(CHART_ACTIVITY_TYPE, { ...CHART, title: "AFTER" }, "a1", {
          ...CHART,
          title: "BEFORE",
        });
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(1);
    expect(shadow(el).querySelector(".chart-title")?.textContent).toBe("AFTER");
  });

  it("ignores a delta whose id is not an activity message", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activityDeltaOrphan(CHART_ACTIVITY_TYPE, "ghost");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("does not walk the transcript when no chart is waiting on a change", async () => {
    // Message changes are constant during ordinary streaming; only the ids a
    // delta marked are looked at.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.messagesChanged();
        emit.text("hi");
        emit.textEnd("hi");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("ignores a pushed payload that is not a drawable spec", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(CHART_ACTIVITY_TYPE, { labels: ["a"], series: [] }, "a1");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });

  it("leaves other activity types alone", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity("compaction", { removed: 2 }, "c1");
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
    expect(shadow(el).querySelector(".run-notice")).not.toBeNull();
  });
});

describe("the agent-called route", () => {
  it("draws the chart under its own card, not at the end of the turn", async () => {
    // A client tool's handler runs after the round ends, so appending would put
    // the chart after everything the model said next.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "render_chart", CHART);
        emit.text("after");
        emit.textEnd("after");
        emit.runEnd();
      },
      ["tool"],
    );
    await send(el, "chart it");
    const block = shadow(el).querySelector(".chart-block");
    expect(block).not.toBeNull();
    expect(block?.previousElementSibling?.classList.contains("tool-call")).toBe(true);
  });

  it("does not claim a chart rendered when nothing was drawn", async () => {
    // A spec can validate and still show nothing -- zero labels matches zero
    // points -- and reporting success would leave the model believing it is on
    // screen.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "render_chart", {
          kind: "bar",
          labels: [],
          series: [{ label: "s", points: [] }],
        });
        emit.runEnd();
      },
      ["tool"],
    );
    await send(el, "chart it");
    expect(charts(el)).toHaveLength(0);
    expect(shadow(el).querySelector(".tool-call")?.textContent).toContain("chart not rendered");
  });

  it("survives a render that throws, and keeps the rest of the transcript", async () => {
    // `render` is consumer code running inside the history replay, where a throw
    // abandons the loop and takes every later turn with it -- silently, and
    // again on every reload.
    const store = new SessionStorageStore();
    store.saveMessages(store.threadId(), [
      { id: "m1", role: "user", content: "first" },
      {
        id: "m2",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "tc9", type: "function", function: { name: "boom", arguments: "{}" } }],
      },
      { id: "m3", role: "assistant", content: "the turn after the failure" },
    ] as never);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    el.agentFactory = () => makeFakeAgent({ script: (emit: Emit) => emit.runEnd() }).agent;
    el.registerTool({
      name: "boom",
      description: "throws while drawing",
      parameters: { type: "object", properties: {} },
      handler: () => "never runs on restore",
      render: () => {
        throw new Error("render exploded");
      },
    });
    el.enableCharts(["tool"]);
    document.body.appendChild(el);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }

    expect(shadow(el).textContent).toContain("the turn after the failure");
  });

  it("tells the model plainly when the arguments cannot be drawn", async () => {
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "render_chart", { labels: ["a"], series: [] });
        emit.runEnd();
      },
      ["tool"],
    );
    await send(el, "chart it");
    expect(charts(el)).toHaveLength(0);
    const card = shadow(el).querySelector(".tool-call");
    expect(card?.textContent).toContain("chart not rendered");
  });
});

describe("what a reload is allowed to run", () => {
  /** Mount with a seeded store, as a reload onto an existing thread would. */
  async function mountWithHistory(
    messages: readonly unknown[],
    routes: readonly ("tool" | "activity")[],
    tool?: ClientTool,
  ): Promise<AgUiChat> {
    const store = new SessionStorageStore();
    store.saveMessages(store.threadId(), messages as never);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    el.agentFactory = () => makeFakeAgent({ script: (emit: Emit) => emit.runEnd() }).agent;
    if (tool !== undefined) {
      el.registerTool(tool);
    }
    el.enableCharts(routes);
    document.body.appendChild(el);
    for (let i = 0; i < 8; i += 1) {
      await Promise.resolve();
    }
    return el;
  }

  const callMessage = (args: unknown) => ({
    id: "m2",
    role: "assistant",
    content: "here",
    toolCalls: [
      {
        id: "tc1",
        type: "function",
        function: { name: "render_chart", arguments: JSON.stringify(args) },
      },
    ],
  });

  it("redraws an agent-called chart from the call's own arguments", async () => {
    const el = await mountWithHistory(
      [{ id: "m1", role: "user", content: "chart" }, callMessage(CHART)],
      ["tool"],
    );
    expect(charts(el)).toHaveLength(1);
  });

  it("redraws a pushed chart from the activity message", async () => {
    const el = await mountWithHistory(
      [
        { id: "m1", role: "user", content: "chart" },
        { id: "a1", role: "activity", activityType: CHART_ACTIVITY_TYPE, content: CHART },
      ],
      ["activity"],
    );
    expect(charts(el)).toHaveLength(1);
  });

  it("leaves a restored activity alone when the route is off", async () => {
    const el = await mountWithHistory(
      [{ id: "a1", role: "activity", activityType: CHART_ACTIVITY_TYPE, content: CHART }],
      ["tool"],
    );
    expect(charts(el)).toHaveLength(0);
  });

  it("never re-runs a restored tool's handler — only its render", async () => {
    // The whole point of splitting the two. Replaying a client tool's *effect*
    // is out of the question: re-running `fill_field` on every reload is a bug,
    // and a boolean flag would leave that to the author's word.
    let handlerRuns = 0;
    let renderRuns = 0;
    const el = await mountWithHistory(
      [
        {
          id: "m2",
          role: "assistant",
          content: "",
          toolCalls: [
            { id: "tc9", type: "function", function: { name: "paint", arguments: "{}" } },
          ],
        },
      ],
      ["tool"],
      {
        name: "paint",
        description: "draws",
        parameters: { type: "object", properties: {} },
        handler: () => {
          handlerRuns += 1;
          return "ran";
        },
        render: () => {
          renderRuns += 1;
          const node = document.createElement("div");
          node.className = "painted";
          return node;
        },
      },
    );
    expect(handlerRuns).toBe(0);
    expect(renderRuns).toBe(1);
    expect(shadow(el).querySelector(".painted")).not.toBeNull();
  });

  it("draws nothing for a restored tool that declares no render", async () => {
    let handlerRuns = 0;
    const el = await mountWithHistory(
      [
        {
          id: "m2",
          role: "assistant",
          content: "",
          toolCalls: [{ id: "tc9", type: "function", function: { name: "act", arguments: "{}" } }],
        },
      ],
      ["tool"],
      {
        name: "act",
        description: "acts",
        parameters: { type: "object", properties: {} },
        handler: () => {
          handlerRuns += 1;
          return "ran";
        },
      },
    );
    expect(handlerRuns).toBe(0);
    expect(shadow(el).querySelectorAll(".chart-block")).toHaveLength(0);
  });

  it("draws nothing when a restored call's arguments say nothing", async () => {
    const el = await mountWithHistory([callMessage({ labels: [], series: [] })], ["tool"]);
    expect(charts(el)).toHaveLength(0);
  });

  it("draws nothing for a restored call whose tool is not registered", async () => {
    const el = await mountWithHistory([callMessage(CHART)], ["activity"]);
    expect(charts(el)).toHaveLength(0);
  });
});

describe("a spec that validates but cannot be drawn", () => {
  it("draws nothing for a pushed chart with no labels", async () => {
    // Passes validation — a series of zero points does match zero labels — and
    // still has nothing to show, which the renderer reports by returning null.
    const el = mount(
      (emit) => {
        emit.runStart();
        emit.activity(
          CHART_ACTIVITY_TYPE,
          { kind: "bar", labels: [], series: [{ label: "s", points: [] }] },
          "a1",
        );
        emit.runEnd();
      },
      ["activity"],
    );
    await send(el, "go");
    expect(charts(el)).toHaveLength(0);
  });
});
