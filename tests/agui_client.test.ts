import type { Context, Tool } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { MAX_TOOL_ROUNDS } from "../src/constants.js";
import { AgUiClient, type AgUiClientHandlers } from "../src/core/agui_client.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

function recordingHandlers(): AgUiClientHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onRunStart: () => calls.push("start"),
    onTextDelta: (b) => calls.push(`delta:${b}`),
    onTextEnd: (b) => calls.push(`end:${b}`),
    onToolCall: (c) => calls.push(`tool:${c.name}:${c.id}:${JSON.stringify(c.args)}`),
    onToolResult: (id, content) => calls.push(`result:${id}:${content}`),
    onRunEnd: () => calls.push("done"),
    onError: (m) => calls.push(`err:${m}`),
    onSettled: () => calls.push("settled"),
  };
}

describe("AgUiClient", () => {
  it("appends a user message and runs the agent", async () => {
    const fake = makeFakeAgent();
    const handlers = recordingHandlers();
    const client = new AgUiClient({ agent: fake.agent, handlers });

    await client.send("hello");

    expect(fake.messages).toHaveLength(1);
    expect(fake.messages[0]).toMatchObject({ role: "user", content: "hello" });
    expect(typeof fake.messages[0]?.id).toBe("string");
  });

  it("maps every subscriber callback to a handler", async () => {
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.text("par");
        emit.text("paris");
        emit.textEnd("paris");
        emit.toolCall("tc1", "fill_field", { name: "city", value: "Paris" });
        emit.toolResult("tc1", "filled");
        emit.runEnd();
      },
    });
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).send("x");

    expect(handlers.calls).toEqual([
      "start",
      "delta:par",
      "delta:paris",
      "end:paris",
      'tool:fill_field:tc1:{"name":"city","value":"Paris"}',
      "result:tc1:filled",
      "done",
      "settled",
    ]);
  });

  it("routes a run-error event to onError", async () => {
    const fake = makeFakeAgent({ script: (emit) => emit.error("model exploded") });
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).send("x");
    expect(handlers.calls).toContain("err:model exploded");
  });

  it("catches a thrown run (network failure) and reports it", async () => {
    const fake = makeFakeAgent({ throwOnRun: new Error("connection refused") });
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).send("x");
    expect(handlers.calls).toEqual(["err:connection refused", "settled"]);
  });

  it("stringifies a non-Error thrown value", async () => {
    const fake = makeFakeAgent();
    // Force runAgent to reject with a non-Error.
    (fake.agent as unknown as { runAgent: () => Promise<never> }).runAgent = () =>
      Promise.reject("boom");
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).send("x");
    expect(handlers.calls).toEqual(["err:boom", "settled"]);
  });

  it("reflects the agent's running state", () => {
    const idle = makeFakeAgent({ isRunning: false });
    const busy = makeFakeAgent({ isRunning: true });
    const handlers = recordingHandlers();
    expect(new AgUiClient({ agent: idle.agent, handlers }).running).toBe(false);
    expect(new AgUiClient({ agent: busy.agent, handlers }).running).toBe(true);
  });

  it("passes provided tools and context to each run", async () => {
    const fake = makeFakeAgent();
    const tools: Tool[] = [{ name: "t", description: "d", parameters: { type: "object" } }];
    const context: Context[] = [{ description: "page", value: "/admin/" }];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      getTools: () => tools,
      getContext: () => context,
    }).send("x");
    expect(fake.lastRunParams).toEqual({ tools, context });
  });

  it("defaults tools and context to empty arrays", async () => {
    const fake = makeFakeAgent();
    await new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() }).send("x");
    expect(fake.lastRunParams).toEqual({ tools: [], context: [] });
  });

  it("executes a frontend tool, posts the result, and re-runs", async () => {
    let round = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        if (round === 0) {
          emit.toolCall("tc1", "fill_field", { value: "Paris" });
        } else {
          emit.text("done");
          emit.textEnd("done");
        }
        round += 1;
      },
    });
    const executed: string[] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      executeTool: async (call) => {
        executed.push(call.name);
        return { content: "ok" };
      },
    }).send("fill it");

    expect(executed).toEqual(["fill_field"]);
    // user message + tool-result message both appended.
    const tool = fake.messages.find((m) => m.role === "tool");
    expect(tool).toMatchObject({ role: "tool", content: "ok" });
  });

  it("runs the frontend tool in a round that also has a server tool, then re-runs", async () => {
    // A server→UI chain in one turn: the server tool's result is streamed
    // (executeTool returns null for it), while the frontend tool executes
    // locally, posts its result, and drives another round.
    let round = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        if (round === 0) {
          emit.toolCall("srv1", "server_tool", {});
          emit.toolResult("srv1", '{"ok":true}');
          emit.toolCall("ui1", "fill_field", { value: "Paris" });
        } else {
          emit.text("done");
          emit.textEnd("done");
        }
        round += 1;
      },
    });
    const executed: string[] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      executeTool: async (call) => {
        executed.push(call.name);
        return call.name === "fill_field" ? { content: "filled" } : null;
      },
    }).send("do both");

    // Both tools were offered to executeTool, but only the frontend tool posted
    // a result — and that triggered a second round.
    expect(executed).toEqual(["server_tool", "fill_field"]);
    expect(fake.messages.filter((m) => m.role === "tool").map((m) => m.content)).toEqual([
      "filled",
    ]);
    expect(round).toBe(2);
  });

  it("does not re-run when the only tool calls are server-side (null result)", async () => {
    let runs = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        runs += 1;
        emit.toolCall("tc1", "server_tool", {});
      },
    });
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      executeTool: async () => null, // not ours
    }).send("x");
    expect(runs).toBe(1);
  });

  it("does not loop when no executeTool is configured", async () => {
    let runs = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        runs += 1;
        emit.toolCall("tc1", "fill_field", {});
      },
    });
    await new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() }).send("x");
    expect(runs).toBe(1);
  });

  it("stops re-running at MAX_TOOL_ROUNDS", async () => {
    let runs = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        runs += 1;
        emit.toolCall(`tc${runs}`, "fill_field", {}); // always calls a tool
      },
    });
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      executeTool: async () => ({ content: "ok" }), // always executes
    }).send("x");
    expect(runs).toBe(MAX_TOOL_ROUNDS);
  });

  it("exposes the agent's message history", async () => {
    const fake = makeFakeAgent();
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });
    await client.send("hi");
    expect(client.messages).toBe(fake.messages);
    expect(client.messages.map((m) => m.content)).toEqual(["hi"]);
  });

  it("invokes onPersist with the latest history as it changes", async () => {
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.text("ok");
        emit.textEnd("ok");
      },
    });
    const lengths: number[] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => lengths.push(messages.length),
    }).send("hello");
    // Once after the user message, once after the (tool-free) run settles.
    expect(lengths).toEqual([1, 1]);
  });

  it("halts the loop on a navigating tool result without appending a message", async () => {
    let runs = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        runs += 1;
        emit.toolCall(`tc${runs}`, "open_changelist", {});
      },
    });
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      executeTool: async () => ({ content: "", halt: true }),
    }).send("navigate");
    expect(runs).toBe(1); // did not re-run into a dead page context
    expect(fake.messages.find((m) => m.role === "tool")).toBeUndefined();
  });

  it("resume runs the loop without adding a user message", async () => {
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.text("resumed");
        emit.textEnd("resumed");
      },
    });
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).resume();
    expect(fake.messages).toHaveLength(0);
    expect(handlers.calls).toContain("end:resumed");
  });

  it("addToolResult appends a tool message and persists", () => {
    const fake = makeFakeAgent();
    let persisted = 0;
    const client = new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: () => {
        persisted += 1;
      },
    });
    client.addToolResult("tc1", '{"navigated":true}');
    expect(fake.messages).toEqual([
      expect.objectContaining({ role: "tool", toolCallId: "tc1", content: '{"navigated":true}' }),
    ]);
    expect(persisted).toBe(1);
  });
});
