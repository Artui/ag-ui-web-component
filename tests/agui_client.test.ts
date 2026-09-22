import type { ContentPart, Context, Interrupt, Message, Tool } from "@ag-ui/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_TOOL_ROUNDS } from "../src/constants.js";
import {
  AgUiClient,
  type AgUiClientHandlers,
  ConnectionLostError,
} from "../src/core/agui_client.js";
import { createHttpAgent } from "../src/core/create_http_agent.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

function recordingHandlers(): AgUiClientHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    onRunStart: () => calls.push("start"),
    onMessagesSnapshot: (messages) => calls.push(`snapshot:${messages.length}`),
    onCustomEvent: (name, value) => calls.push(`custom:${name}:${JSON.stringify(value)}`),
    onTextDelta: (b) => calls.push(`delta:${b}`),
    onTextEnd: (b) => calls.push(`end:${b}`),
    onToolCall: (c) => calls.push(`tool:${c.name}:${c.id}:${JSON.stringify(c.args)}`),
    onToolResult: (id, content) => calls.push(`result:${id}:${content}`),
    onActivity: (activityType, content) =>
      calls.push(`activity:${activityType}:${JSON.stringify(content)}`),
    onActivityChanged: (messageId, activityType, content) =>
      calls.push(`activity-changed:${messageId}:${activityType}:${JSON.stringify(content)}`),
    onReasoningStart: () => calls.push("reasoning-start"),
    onReasoningDelta: (b) => calls.push(`reasoning:${b}`),
    onReasoningEnd: () => calls.push("reasoning-end"),
    onSubAgentStarted: (runId, name, parentToolCallId) =>
      calls.push(`subagent-started:${runId}:${name}:${parentToolCallId}`),
    onSubAgentFinished: (runId) => calls.push(`subagent-finished:${runId}`),
    onSubAgentError: (runId, message) => calls.push(`subagent-error:${runId}:${message}`),
    onRunEnd: () => calls.push("done"),
    onError: (m) => calls.push(`err:${m}`),
    onCancelled: () => calls.push("cancelled"),
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
    // No attachments passed → no metadata on the message at all.
    expect(fake.messages[0]).not.toHaveProperty("metadata");
    expect(fake.messages[0]).not.toHaveProperty("attachments");
  });

  it("rides attachment refs in the user message's metadata", async () => {
    const fake = makeFakeAgent();
    const refs = [{ id: "a1", name: "notes.txt", mime: "text/plain", size: 5 }];
    await new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() }).send(
      "read this",
      refs,
    );
    expect(fake.messages[0]).toMatchObject({
      content: "read this",
      metadata: { attachments: refs },
    });
    // Not at the top level too: 1.0 strips it from the request there, with a
    // warning, and the server reads the metadata first anyway.
    expect(fake.messages[0]).not.toHaveProperty("attachments");
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

  it("maps reasoning events to the reasoning handlers", async () => {
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.reasoningStart();
        emit.reasoning("weigh");
        emit.reasoning("ing the options");
        emit.reasoningEnd();
        emit.text("the answer");
        emit.textEnd("the answer");
        emit.runEnd();
      },
    });
    const handlers = recordingHandlers();
    await new AgUiClient({ agent: fake.agent, handlers }).send("x");

    expect(handlers.calls).toEqual([
      "start",
      "reasoning-start",
      // The wire reports the buffer before each delta lands, so the first call
      // is empty and the block is only complete on the last one.
      "reasoning:",
      "reasoning:weigh",
      "reasoning:weighing the options",
      "reasoning-end",
      "delta:the answer",
      "end:the answer",
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

  it("stops the loop on RUN_ERROR: pending frontend tools are not executed", async () => {
    // A run that emits a frontend tool call and then errors is terminal — the
    // loop must not execute the tool or start another round.
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.toolCall("tc1", "fill_field", { value: "Paris" });
        emit.error("model exploded");
      },
    });
    const executed: string[] = [];
    const handlers = recordingHandlers();
    await new AgUiClient({
      agent: fake.agent,
      handlers,
      executeTool: async (call) => {
        executed.push(call.name);
        return { content: "ok" };
      },
    }).send("fill it");

    expect(executed).toEqual([]); // the tool was NOT run
    expect(fake.messages.some((m) => m.role === "tool")).toBe(false);
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
    // Both results are in the transcript, and only one of them is this client's
    // doing: the server tool's message is written by `@ag-ui/client` when it
    // applies `TOOL_CALL_RESULT`, before any of our code runs. This assertion
    // read `["filled"]` while the fake agent silently skipped that append, which
    // made it a claim about the helper rather than about the protocol.
    expect(fake.messages.filter((m) => m.role === "tool").map((m) => m.content)).toEqual([
      '{"ok":true}',
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

  it("takes a configured round bound, and rejects one that would run nothing", async () => {
    // A page-driving deployment reaches ten rounds legitimately -- one per
    // field filled -- and the symptom is an answer that stops mid-task rather
    // than an error. A bound below one is not a smaller budget but a send that
    // never runs the agent at all, so it falls back rather than being honoured.
    async function roundsUnder(maxToolRounds?: number): Promise<number> {
      let runs = 0;
      const fake = makeFakeAgent({
        script: (emit) => {
          runs += 1;
          emit.toolCall(`tc${runs}`, "fill_field", {});
        },
      });
      await new AgUiClient({
        agent: fake.agent,
        handlers: recordingHandlers(),
        executeTool: async () => ({ content: "ok" }),
        ...(maxToolRounds === undefined ? {} : { maxToolRounds }),
      }).send("x");
      return runs;
    }

    expect(await roundsUnder(3)).toBe(3);
    // A fractional bound floors rather than running a partial round.
    expect(await roundsUnder(2.9)).toBe(2);
    expect(await roundsUnder(0)).toBe(MAX_TOOL_ROUNDS);
    expect(await roundsUnder(Number.NaN)).toBe(MAX_TOOL_ROUNDS);
    expect(await roundsUnder()).toBe(MAX_TOOL_ROUNDS);
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

  describe("dropped stream (connection loss)", () => {
    it("treats a close without a terminal event as a connection loss", async () => {
      // The stream emits text then closes without RUN_FINISHED / RUN_ERROR.
      const fake = makeFakeAgent({ dropStream: true, script: (emit) => emit.text("partial") });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");
      expect(handlers.calls).toEqual(["delta:partial", "err:Connection lost", "settled"]);
      // Crucially, it did NOT rest silently as if the run finished.
      expect(handlers.calls).not.toContain("done");
    });

    it("surfaces a custom connection-lost message", async () => {
      const fake = makeFakeAgent({ dropStream: true });
      const handlers = recordingHandlers();
      await new AgUiClient({
        agent: fake.agent,
        handlers,
        connectionLostMessage: "Verbindung verloren",
      }).send("x");
      expect(handlers.calls).toContain("err:Verbindung verloren");
    });

    it("does not flag a connection loss when the run finished normally", async () => {
      // The fake auto-emits RUN_FINISHED for a clean script (dropStream unset).
      const fake = makeFakeAgent({ script: (emit) => emit.text("hi") });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");
      expect(handlers.calls).toContain("done");
      expect(handlers.calls.filter((c) => c.startsWith("err"))).toEqual([]);
    });

    it("does not flag a connection loss on a deliberate cancel", async () => {
      let client: AgUiClient | null = null;
      const fake = makeFakeAgent({
        dropStream: true,
        script: (emit) => {
          emit.text("partial");
          client?.cancel();
        },
      });
      const handlers = recordingHandlers();
      client = new AgUiClient({ agent: fake.agent, handlers });
      await client.send("x");
      expect(handlers.calls).toContain("cancelled");
      expect(handlers.calls.filter((c) => c.startsWith("err"))).toEqual([]);
    });

    it("exposes ConnectionLostError as an Error subclass", () => {
      const error = new ConnectionLostError("Connection lost");
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe("ConnectionLostError");
      expect(error.message).toBe("Connection lost");
    });
  });

  describe("cancel", () => {
    it("aborts the run and routes to onCancelled, not onError", async () => {
      let client: AgUiClient | null = null;
      let runs = 0;
      const executed: string[] = [];
      const fake = makeFakeAgent({
        script: (emit) => {
          runs += 1;
          emit.text("par");
          client?.cancel(); // the user hits Stop mid-stream
          emit.toolCall("tc1", "fill_field", {}); // collected before the abort lands
        },
      });
      const handlers = recordingHandlers();
      client = new AgUiClient({
        agent: fake.agent,
        handlers,
        executeTool: async (call) => {
          executed.push(call.name);
          return { content: "ok" };
        },
      });
      await client.send("x");

      expect(fake.abortRuns).toBe(1);
      expect(runs).toBe(1); // no further round
      expect(executed).toEqual([]); // pending tools not executed after cancel
      expect(handlers.calls).toContain("cancelled");
      expect(handlers.calls.filter((c) => c.startsWith("err"))).toEqual([]);
      expect(handlers.calls.filter((c) => c === "settled")).toEqual(["settled"]);
    });

    it("stays silent when the abort surfaces as a RUN_ERROR", async () => {
      // Aborting a response mid-read can reach the subscriber as a RUN_ERROR
      // carrying the browser's own abort text. Reporting it put a warning
      // bubble saying "BodyStreamBuffer was aborted" directly above the muted
      // stopped note — the same deliberate stop, described twice, once as a
      // failure.
      let client: AgUiClient | null = null;
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.text("par");
          client?.cancel(); // the user hits Stop mid-stream
          emit.error("BodyStreamBuffer was aborted");
        },
      });
      const handlers = recordingHandlers();
      client = new AgUiClient({ agent: fake.agent, handlers });
      await client.send("x");

      expect(handlers.calls.filter((c) => c.startsWith("err"))).toEqual([]);
      expect(handlers.calls).toContain("cancelled");
      expect(handlers.calls.filter((c) => c === "settled")).toEqual(["settled"]);
    });

    it("still reports a RUN_ERROR from a run nobody cancelled", async () => {
      // The other side of the guard: suppressing the report is what a cancel
      // buys, and a run that failed on its own must still say so.
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.error("the model is overloaded");
        },
      });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");

      expect(handlers.calls).toContain("err:the model is overloaded");
      expect(handlers.calls).not.toContain("cancelled");
    });

    it("routes Chrome's mid-read abort TypeError to onCancelled", async () => {
      // `TypeError: BodyStreamBuffer was aborted` is Chrome's name for a fetch
      // body cancelled mid-read. Without the flag set — a caller aborting the
      // request by another route — the name alone would call it a failure.
      const fake = makeFakeAgent({ throwOnRun: new TypeError("BodyStreamBuffer was aborted") });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");
      expect(handlers.calls).toEqual(["cancelled", "settled"]);
    });

    it("leaves an ordinary TypeError an error", async () => {
      const fake = makeFakeAgent({ throwOnRun: new TypeError("x is not a function") });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");
      expect(handlers.calls).toEqual(["err:x is not a function", "settled"]);
    });

    it("persists the partial history when cancelled", async () => {
      let client: AgUiClient | null = null;
      const lengths: number[] = [];
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.text("partial ans");
          client?.cancel();
        },
      });
      client = new AgUiClient({
        agent: fake.agent,
        handlers: recordingHandlers(),
        onPersist: (messages) => lengths.push(messages.length),
      });
      await client.send("x");
      // After the user message, after the aborted round, and in the cancel path.
      expect(lengths).toEqual([1, 1, 1]);
    });

    it("routes an AbortError rejection to onCancelled (re-throwing agent versions)", async () => {
      const abortError = new Error("The user aborted a request.");
      abortError.name = "AbortError";
      const fake = makeFakeAgent({ throwOnRun: abortError });
      const handlers = recordingHandlers();
      await new AgUiClient({ agent: fake.agent, handlers }).send("x");
      expect(handlers.calls).toEqual(["cancelled", "settled"]);
    });

    it("cancel during frontend-tool execution lets the handler finish but stops the loop", async () => {
      let client: AgUiClient | null = null;
      let runs = 0;
      const fake = makeFakeAgent({
        script: (emit) => {
          runs += 1;
          emit.toolCall(`tc${runs}`, "fill_field", {});
        },
      });
      const handlers = recordingHandlers();
      client = new AgUiClient({
        agent: fake.agent,
        handlers,
        executeTool: async () => {
          client?.cancel(); // Stop pressed while the tool handler runs
          return { content: "ok" };
        },
      });
      await client.send("x");

      expect(runs).toBe(1); // the result was posted, but no next round started
      expect(fake.messages.find((m) => m.role === "tool")).toMatchObject({ content: "ok" });
      expect(handlers.calls).toContain("cancelled");
    });

    it("is a safe no-op with no run in flight, and the next send runs clean", async () => {
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.text("ok");
          emit.textEnd("ok");
        },
      });
      const handlers = recordingHandlers();
      const client = new AgUiClient({ agent: fake.agent, handlers });

      expect(() => client.cancel()).not.toThrow();
      expect(fake.abortRuns).toBe(1);

      await client.send("hello"); // the stale flag must not mark this run cancelled
      expect(handlers.calls).toContain("end:ok");
      expect(handlers.calls).not.toContain("cancelled");
    });
  });

  describe("server-side tool approval (interrupts)", () => {
    const interrupt = (id: string, toolCallId: string): Interrupt =>
      ({ id, reason: "tool_call", toolCallId, message: `Approve ${toolCallId}?` }) as Interrupt;

    it("resolves the interrupt and resumes the run carrying the answers", async () => {
      const fake = makeFakeAgent({
        script: (emit, params) => {
          if (params.resume === undefined) {
            emit.toolCall("call-1", "delete_thing", { target: "x" });
            emit.interrupt([interrupt("int-call-1", "call-1")]);
          } else {
            emit.toolResult("call-1", "deleted x");
            emit.runEnd();
          }
        },
      });
      const seen: Interrupt[][] = [];
      const client = new AgUiClient({
        agent: fake.agent,
        handlers: recordingHandlers(),
        resolveInterrupts: async (interrupts) => {
          seen.push([...interrupts]);
          return { "int-call-1": { status: "resolved", payload: { approved: true } } };
        },
      });

      await client.send("delete x");

      expect(seen).toHaveLength(1);
      expect(seen[0]?.[0]?.id).toBe("int-call-1");
      // Two runs: the interrupt run + the resume run carrying the answers.
      expect(fake.runParams).toHaveLength(2);
      expect(fake.runParams[0]?.resume).toBeUndefined();
      expect(fake.runParams[1]?.resume).toEqual([
        { interruptId: "int-call-1", status: "resolved", payload: { approved: true } },
      ]);
    });

    it("ends the loop unanswered when no resolver is configured", async () => {
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.toolCall("call-1", "delete_thing", {});
          emit.interrupt([interrupt("int-call-1", "call-1")]);
        },
      });
      const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });

      await client.send("x");

      expect(fake.runParams).toHaveLength(1); // no resume run
    });

    it("stops without resuming when cancelled during resolution", async () => {
      const fake = makeFakeAgent({
        script: (emit) => {
          emit.toolCall("call-1", "delete_thing", {});
          emit.interrupt([interrupt("int-call-1", "call-1")]);
        },
      });
      const handlers = recordingHandlers();
      const client: AgUiClient = new AgUiClient({
        agent: fake.agent,
        handlers,
        resolveInterrupts: async () => {
          client.cancel(); // Stop pressed while an approval card is open
          return { "int-call-1": { status: "cancelled" } };
        },
      });

      await client.send("x");

      expect(fake.runParams).toHaveLength(1); // no resume run after cancel
      expect(handlers.calls).toContain("cancelled");
    });
  });
});

describe("duplicate message ids", () => {
  it("warns when a server reuses a message id it already closed", async () => {
    // The merge is silent and durable: @ag-ui/client appends to the existing
    // message rather than starting a new one, and that merged entry is what
    // gets persisted. Found by a demo harness streaming every answer under one
    // hardcoded id.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.textStart("m1");
        emit.text("first");
        emit.textEnd("first", "m1");
      },
    });
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });

    await client.send("one");
    expect(warn).not.toHaveBeenCalled();

    await client.send("two");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("m1");
    warn.mockRestore();
  });

  it("stays quiet when every message carries a fresh id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let n = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        n += 1;
        const id = `m${n}`;
        emit.textStart(id);
        emit.text("hi");
        emit.textEnd("hi", id);
      },
    });
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });

    await client.send("one");
    await client.send("two");

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("a tool result's content", () => {
  it("joins the text parts of a result that arrives as parts", async () => {
    // Since the protocol's 1.0 a tool can return parts, an image beside its
    // text. The handler takes a string because a card shows text, so the text
    // parts are joined in order and the rest is left to the stored message.
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "seat_map", {});
        emit.toolResult("tc1", [
          { type: "text", text: "seat 12A " },
          { type: "image", source: { type: "url", value: "https://example.test/map.png" } },
          { type: "text", text: "is held" },
        ]);
        emit.runEnd();
      },
    });
    const seen: string[] = [];
    const handlers = recordingHandlers();
    handlers.onToolResult = (_id, content) => {
      seen.push(content);
    };
    await new AgUiClient({ agent: fake.agent, handlers }).send("show me");

    expect(seen).toEqual(["seat 12A is held"]);
  });

  it("keeps the parts whole on the stored message", async () => {
    // The flattening is the card's view only. The message the host persists is
    // the one the client appended, parts and all, so the next run hands the
    // model the image it was shown.
    const parts: ContentPart[] = [
      { type: "text", text: "seat 12A" },
      { type: "image", source: { type: "url", value: "https://example.test/map.png" } },
    ];
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "seat_map", {});
        emit.toolResult("tc1", parts);
        emit.runEnd();
      },
    });
    const persisted: Message[][] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => persisted.push([...messages]),
    }).send("show me");

    const tool = persisted.at(-1)?.find((m) => m.role === "tool");
    expect(tool?.content).toEqual(parts);
  });
});

describe("a tool result's outcome", () => {
  it("forwards the outcome in the result's metadata to the handler", async () => {
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "book_flight", {});
        emit.toolResult("tc1", "no seats left", { outcome: "failed" });
        emit.runEnd();
      },
    });
    const seen: unknown[] = [];
    const handlers = recordingHandlers();
    handlers.onToolResult = (_id, _content, outcome) => {
      seen.push(outcome);
    };
    await new AgUiClient({ agent: fake.agent, handlers }).send("book it");

    expect(seen).toEqual(["failed"]);
  });

  it("forwards undefined when the server states no outcome", async () => {
    // The shape every server that states no outcome produces, and the one a
    // two-parameter handler has always seen.
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "book_flight", {});
        emit.toolResult("tc1", "seat 12A held");
        emit.runEnd();
      },
    });
    const seen: unknown[] = [];
    const handlers = recordingHandlers();
    handlers.onToolResult = (_id, _content, outcome) => {
      seen.push(outcome);
    };
    await new AgUiClient({ agent: fake.agent, handlers }).send("book it");

    expect(seen).toEqual([undefined]);
  });

  it("persists a frontend tool's own outcome in its result's metadata", async () => {
    // Nothing on the wire states this one: the call never reached a server.
    let round = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        if (round === 0) {
          emit.toolCall("tc1", "delete_user", {});
        }
        round += 1;
      },
    });
    const persisted: Message[][] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => persisted.push([...messages]),
      executeTool: async () => ({ content: "User declined the action.", outcome: "denied" }),
    }).send("delete user 7");

    expect(persisted.at(-1)?.find((m) => m.role === "tool")).toMatchObject({
      toolCallId: "tc1",
      metadata: { outcome: "denied" },
    });
  });

  it("keeps an earlier round's outcome on every later persist", async () => {
    // The store keeps only the most recent list, so an outcome written once and
    // then dropped by the next save would leave the card green again -- and
    // the persist that overwrites it is one the *next* round makes.
    let round = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        if (round === 0) {
          emit.toolCall("tc1", "book_flight", {});
          emit.toolResult("tc1", "no seats left", { outcome: "failed" });
          emit.toolCall("ui1", "note_it", {});
        } else {
          emit.text("understood");
          emit.textEnd("understood");
        }
        round += 1;
      },
    });
    const persisted: Message[][] = [];
    await new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => persisted.push([...messages]),
      executeTool: async (call) => (call.name === "note_it" ? { content: "noted" } : null),
    }).send("book it");

    expect(round).toBe(2);
    const last = persisted.at(-1) ?? [];
    expect(last.find((m) => m.role === "tool" && m.toolCallId === "tc1")).toMatchObject({
      metadata: { outcome: "failed" },
    });
    // And the round that followed, which succeeded, carries no metadata at all.
    expect(last.find((m) => m.role === "tool" && m.toolCallId === "ui1")).not.toHaveProperty(
      "metadata",
    );
  });

  it("hands the store the agent's own list, outcomes included", async () => {
    // The same array, not an annotated copy of it: the outcome is on the
    // message, so what a save writes is exactly what the next request sends,
    // and a host store diffing what it is handed sees the agent's own list.
    let round = 0;
    const fake = makeFakeAgent({
      script: (emit) => {
        if (round === 0) {
          emit.toolCall("tc1", "delete_user", {});
        }
        round += 1;
      },
    });
    const seen: (readonly Message[])[] = [];
    const client = new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => {
        seen.push(messages);
      },
      executeTool: async () => ({ content: "User declined the action.", outcome: "denied" }),
    });
    await client.send("delete user 7");

    expect(seen.at(-1)).toBe(fake.messages);
    // The getter that used to return the annotated copy is the same list now.
    expect(client.annotatedMessages).toBe(client.messages);
  });
});

describe("truncateToLastUser", () => {
  it("keeps the question and drops the answer to it", async () => {
    const fake = makeFakeAgent();
    const persisted: unknown[][] = [];
    const client = new AgUiClient({
      agent: fake.agent,
      handlers: recordingHandlers(),
      onPersist: (messages) => persisted.push([...messages]),
    });
    await client.send("what is it");
    fake.agent.addMessage({ id: "a1", role: "assistant", content: "an answer" });

    const kept = client.truncateToLastUser();

    // Truncating *to* the user message, inclusive: the agent answers the
    // question it was last asked rather than being told its answer was wrong.
    expect(kept?.map((m) => m.role)).toEqual(["user"]);
    expect(fake.messages.map((m) => m.content)).toEqual(["what is it"]);
    // Persisted, so a reload does not resurrect the answer that was dropped.
    expect(persisted.at(-1)).toHaveLength(1);
  });

  it("keeps every earlier turn, not just the last one", async () => {
    const fake = makeFakeAgent();
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });
    await client.send("first");
    fake.agent.addMessage({ id: "a1", role: "assistant", content: "first answer" });
    await client.send("second");
    fake.agent.addMessage({ id: "a2", role: "assistant", content: "second answer" });

    const kept = client.truncateToLastUser();

    expect(kept?.map((m) => m.content)).toEqual(["first", "first answer", "second"]);
  });

  it("reports nothing to retry when no question has been asked", () => {
    const fake = makeFakeAgent();
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });

    expect(client.truncateToLastUser()).toBeNull();
  });

  it("does not run the agent, so the caller can re-render in between", async () => {
    const fake = makeFakeAgent();
    const client = new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() });
    await client.send("go");
    const runsBefore = fake.runParams.length;

    client.truncateToLastUser();

    // Running here would stream the new answer in underneath the old one.
    expect(fake.runParams).toHaveLength(runsBefore);
  });
});

/**
 * The same client over the real `@ag-ui/client` `HttpAgent`, with only `fetch`
 * stubbed.
 *
 * Everything above drives the client through `makeFakeAgent`, which dispatches
 * straight to the subscriber and so skips the one stage that decides what a key
 * outside the protocol's schemas does: 1.0's enforcement, which strips every
 * undeclared key off an inbound event after parsing and off the outgoing
 * `RunAgentInput` before it is sent. The fake cannot model a stage it bypasses,
 * which is how a tool outcome and a message's attachment refs both stopped
 * arriving with the whole suite green. These read what crosses the wire instead.
 */
describe("over the real HttpAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** An SSE response carrying `events`, the way a server streams a run. */
  function sse(events: readonly Record<string, unknown>[]): Response {
    const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  /** A run that streams `middle` between a start and a finish. */
  function run(...middle: readonly Record<string, unknown>[]): Record<string, unknown>[] {
    return [
      { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
      ...middle,
      { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
    ];
  }

  /** A server-side tool call and its result, as `TOOL_CALL_*` events. */
  function serverToolCall(result: Record<string, unknown>): Record<string, unknown>[] {
    return [
      { type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "book_flight" },
      { type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: "{}" },
      { type: "TOOL_CALL_END", toolCallId: "tc1" },
      { type: "TOOL_CALL_RESULT", messageId: "m1", toolCallId: "tc1", content: "no", ...result },
    ];
  }

  /**
   * Answer each request with the next run in `runs` (an empty run once they are
   * spent), and return the parsed body of every request made.
   */
  function stubFetch(...runs: readonly Record<string, unknown>[][]): Record<string, unknown>[] {
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: unknown, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return Promise.resolve(sse(runs[bodies.length - 1] ?? run()));
      }),
    );
    return bodies;
  }

  /** The messages a request body carried. */
  function sent(body: Record<string, unknown> | undefined): Record<string, unknown>[] {
    return (body?.["messages"] ?? []) as Record<string, unknown>[];
  }

  /** Every `[ag-ui][enforce]` warning, which is what the client prints as it strips a key. */
  function enforceWarnings(): () => string[] {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    return () =>
      warn.mock.calls.map((args) => String(args[0])).filter((m) => m.includes("[ag-ui][enforce]"));
  }

  function outcomes(): { handlers: AgUiClientHandlers; seen: unknown[] } {
    const seen: unknown[] = [];
    const handlers = recordingHandlers();
    handlers.onToolResult = (_id, _content, outcome) => {
      seen.push(outcome);
    };
    return { handlers, seen };
  }

  it("delivers the outcome a result states in its metadata", async () => {
    stubFetch(run(...serverToolCall({ metadata: { outcome: "failed" } })));
    const { handlers, seen } = outcomes();

    await new AgUiClient({ agent: createHttpAgent({ endpoint: "/agent/" }), handlers }).send(
      "book it",
    );

    expect(seen).toEqual(["failed"]);
  });

  it("never sees an outcome stated only at the top level, which 1.0 strips", async () => {
    // What a server written against the 0.x client sends. The key is not in
    // the event's schema, so the client removes it before any subscriber runs
    // and the card settles as done -- the reason the outcome moved.
    stubFetch(run(...serverToolCall({ outcome: "failed" })));
    const warnings = enforceWarnings();
    const { handlers, seen } = outcomes();

    await new AgUiClient({ agent: createHttpAgent({ endpoint: "/agent/" }), handlers }).send(
      "book it",
    );

    expect(seen).toEqual([undefined]);
    expect(warnings()).toEqual([expect.stringContaining("'/outcome'")]);
  });

  it("sends attachment refs in the user message's metadata", async () => {
    const bodies = stubFetch(run());
    const warnings = enforceWarnings();
    const refs = [{ id: "att1", name: "notes.txt", mime: "text/plain", size: 5 }];

    await new AgUiClient({
      agent: createHttpAgent({ endpoint: "/agent/" }),
      handlers: recordingHandlers(),
    }).send("read this", refs);

    const user = sent(bodies[0]).find((m) => m["role"] === "user");
    expect(user?.["metadata"]).toEqual({ attachments: refs });
    expect(user).not.toHaveProperty("attachments");
    expect(warnings()).toEqual([]);
  });

  it("persists a server's outcome on the tool message, and sends it back", async () => {
    // The real client folds a result's metadata onto the tool message it
    // appends, so the transcript carries the outcome with no bookkeeping here,
    // and the next request carries it too: `metadata` is a declared field, and
    // a server that does not read it ignores it.
    const bodies = stubFetch(run(...serverToolCall({ metadata: { outcome: "failed" } })), run());
    const persisted: Message[][] = [];
    const client = new AgUiClient({
      agent: createHttpAgent({ endpoint: "/agent/" }),
      handlers: recordingHandlers(),
      onPersist: (messages) => persisted.push([...messages]),
    });

    await client.send("book it");
    await client.send("try again");

    const tool = { toolCallId: "tc1", metadata: { outcome: "failed" } };
    expect(persisted.at(-1)?.find((m) => m.role === "tool")).toMatchObject(tool);
    expect(sent(bodies[1]).find((m) => m["role"] === "tool")).toMatchObject(tool);
  });

  it("sends a frontend tool's own outcome in the tool message's metadata", async () => {
    // No server stated this one -- the call never reached a server -- so the
    // client writes it where the real client would have folded a server's.
    const bodies = stubFetch(
      run(
        { type: "TOOL_CALL_START", toolCallId: "ui1", toolCallName: "delete_user" },
        { type: "TOOL_CALL_END", toolCallId: "ui1" },
      ),
      run(),
    );
    const warnings = enforceWarnings();

    await new AgUiClient({
      agent: createHttpAgent({ endpoint: "/agent/" }),
      handlers: recordingHandlers(),
      executeTool: async () => ({ content: "User declined the action.", outcome: "denied" }),
    }).send("delete user 7");

    expect(sent(bodies[1]).find((m) => m["role"] === "tool")).toMatchObject({
      toolCallId: "ui1",
      metadata: { outcome: "denied" },
    });
    expect(warnings()).toEqual([]);
  });

  it("builds and places a result's tool message exactly as the fake agent does", async () => {
    // The drift guard for `makeFakeAgent`, which every other test here trusts:
    // the same round through both, compared message by message. The results
    // arrive in the opposite order to the calls, so a fake that appended rather
    // than placing each after its own call would disagree, and one of them
    // carries metadata, so a fake that dropped it -- or copied anything else
    // off the event -- would too.
    const call = (id: string): Record<string, unknown>[] => [
      { type: "TOOL_CALL_START", toolCallId: id, toolCallName: "book_flight" },
      { type: "TOOL_CALL_END", toolCallId: id },
    ];
    const result = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
      type: "TOOL_CALL_RESULT",
      messageId: `${id}-result`,
      toolCallId: id,
      content: "no",
      ...extra,
    });
    stubFetch(
      run(
        ...call("tc1"),
        ...call("tc2"),
        result("tc2", { metadata: { outcome: "failed" } }),
        result("tc1"),
      ),
    );
    const real = createHttpAgent({ endpoint: "/agent/" });
    await new AgUiClient({ agent: real, handlers: recordingHandlers() }).send("book both");
    const fake = makeFakeAgent({
      script: (emit) => {
        emit.toolCall("tc1", "book_flight", {});
        emit.toolCall("tc2", "book_flight", {});
        emit.toolResult("tc2", "no", { outcome: "failed" });
        emit.toolResult("tc1", "no");
      },
    });
    await new AgUiClient({ agent: fake.agent, handlers: recordingHandlers() }).send("book both");

    // Ids aside, which each side mints its own way: a turn by its role and the
    // calls it makes, and a tool message whole.
    const shape = (messages: readonly unknown[]): unknown[] =>
      messages.map((message) => {
        const m = message as Message & { toolCalls?: { id: string }[] };
        return m.role === "tool"
          ? { ...m, id: undefined }
          : [m.role, ...(m.toolCalls ?? []).map((c) => c.id)];
      });
    expect(shape(real.messages)).toEqual([
      ["user"],
      ["assistant", "tc1"],
      { role: "tool", toolCallId: "tc1", content: "no" },
      ["assistant", "tc2"],
      { role: "tool", toolCallId: "tc2", content: "no", metadata: { outcome: "failed" } },
    ]);
    expect(shape(fake.messages)).toEqual(shape(real.messages));
  });

  it("carries history stored by an earlier release into metadata", async () => {
    // Earlier releases stored both keys at the top level. Sent that way, 1.0
    // strips them -- and the server would lose the manifest of every file
    // attached before the upgrade -- so the seed moves them into metadata,
    // merged with what is there, where a key already in metadata wins.
    const ref = { id: "att1", name: "a.txt", mime: "text/plain", size: 1 };
    const call = (id: string) => ({
      id,
      type: "function",
      function: { name: "f", arguments: "{}" },
    });
    const legacy = [
      { id: "u1", role: "user", content: "read this", attachments: [ref] },
      { id: "a1", role: "assistant", toolCalls: [call("tc1"), call("tc2")] },
      {
        id: "r1",
        role: "tool",
        content: "no",
        toolCallId: "tc1",
        outcome: "denied",
        metadata: { note: "kept" },
      },
      {
        id: "r2",
        role: "tool",
        content: "no",
        toolCallId: "tc2",
        outcome: "denied",
        metadata: { outcome: "failed" },
      },
      // A store is not trusted to hold an object where one belongs.
      { id: "u2", role: "user", content: "and this", attachments: [ref], metadata: "junk" },
    ] as unknown as Message[];
    const bodies = stubFetch(run());
    const warnings = enforceWarnings();

    await new AgUiClient({
      agent: createHttpAgent({ endpoint: "/agent/", initialMessages: legacy }),
      handlers: recordingHandlers(),
    }).send("and now");

    const messages = sent(bodies[0]);
    expect(messages.map((m) => m["metadata"])).toEqual([
      { attachments: [ref] },
      undefined,
      { note: "kept", outcome: "denied" },
      { outcome: "failed" },
      { attachments: [ref] },
      undefined,
    ]);
    expect(messages.flatMap((m) => Object.keys(m))).not.toContain("attachments");
    expect(messages.flatMap((m) => Object.keys(m))).not.toContain("outcome");
    expect(warnings()).toEqual([]);
  });
});
