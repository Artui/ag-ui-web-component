/**
 * The signal a host needs when the agent changes data the page is showing.
 *
 * A server-side tool writes without the page's knowledge, and until this event
 * existed nothing the element dispatched implied "something may have moved
 * underneath you" — so a client-rendered host had no reason to refetch and went
 * quietly stale after every server-side write. Found by approving a booking in
 * the framework gallery: the row existed, the board did not show it.
 *
 * Shared state is the richer channel and it is not a substitute: it requires the
 * agent to emit state, which is not the host's decision to make.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, LOAD_CAPABILITY_TOOL, RUN_FINISHED_EVENT } from "../src/constants.js";
import type { AgUiChat, RunFinishedDetail, ToolRun } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

interface Mounted {
  readonly el: AgUiChat;
  /** Every run-finished detail, in order. */
  readonly seen: RunFinishedDetail[];
}

function mountWithAgent(script: (emit: Emit, params: FakeRunParams) => void): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  const seen: RunFinishedDetail[] = [];
  el.addEventListener(RUN_FINISHED_EVENT, (event) => {
    seen.push((event as CustomEvent<RunFinishedDetail>).detail);
  });
  document.body.appendChild(el);
  return { el, seen };
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

function sendNoWait(el: AgUiChat, text: string): void {
  void el.sendMessage(text);
}

function names(tools: readonly ToolRun[]): string[] {
  return tools.map((tool) => tool.name);
}

describe("run-finished event", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reports a server-side tool as having run on the server", async () => {
    const { el, seen } = mountWithAgent((emit) => {
      emit.toolCall("call-1", "create_event", { title: "Design sync" });
      emit.toolResult("call-1", '{"id": 13}');
      emit.runEnd();
    });

    await el.sendMessage("book a design sync");
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.tools).toEqual([{ name: "create_event", side: "server" }]);
  });

  it("reports a host's own tool as having run on the client", async () => {
    // A client tool's result opens another round, so the script has to stop
    // asking for it or the loop runs to MAX_TOOL_ROUNDS.
    let round = 0;
    const { el, seen } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("call-1", "scroll_to", { target: "slot-1" });
      } else {
        emit.textEnd("done");
        emit.runEnd();
      }
      round += 1;
    });
    el.registerTool({
      name: "scroll_to",
      description: "Scroll a target into view.",
      parameters: { type: "object" },
      handler: () => "scrolled",
    });

    await el.sendMessage("scroll to Friday");
    await flush();

    expect(seen[0]?.tools).toEqual([{ name: "scroll_to", side: "client" }]);
  });

  it("fires once for an interaction that spans several tool rounds", async () => {
    let round = 0;
    const { el, seen } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("call-1", "read_page", {});
      } else {
        emit.toolCall("call-2", "create_event", {});
        emit.toolResult("call-2", "ok");
        emit.runEnd();
      }
      round += 1;
    });
    el.registerTool({
      name: "read_page",
      description: "Read the page.",
      parameters: { type: "object" },
      handler: () => "{}",
    });

    await el.sendMessage("book it");
    await flush();

    expect(seen).toHaveLength(1);
    expect(names(seen[0]?.tools ?? [])).toEqual(["read_page", "create_event"]);
  });

  it("survives an approval interrupt in the middle of the interaction", async () => {
    const { el, seen } = mountWithAgent((emit, params) => {
      if (params.resume === undefined) {
        emit.toolCall("call-1", "create_event", {});
        emit.interrupt([{ id: "int-call-1", reason: "tool_call", toolCallId: "call-1" } as never]);
      } else {
        emit.toolResult("call-1", "created");
        emit.runEnd();
      }
    });

    sendNoWait(el, "book it");
    await flush();
    shadow(el).querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    await flush();

    // One event for the whole thing, and the write is attributed to the server:
    // the point of the gate is that the run continued rather than restarted.
    expect(seen).toHaveLength(1);
    expect(seen[0]?.tools).toEqual([{ name: "create_event", side: "server" }]);
  });

  it("fires with an empty list when the answer was only words", async () => {
    const { el, seen } = mountWithAgent((emit) => {
      emit.textEnd("nothing to do");
      emit.runEnd();
    });

    await el.sendMessage("hello");
    await flush();

    // Exact equality on the whole detail, deliberately: the shape is public
    // API, so a field appearing unannounced should fail here.
    expect(seen).toEqual([{ tools: [], invalidated: [] }]);
  });

  it("fires after an error, because a partial write is still a write", async () => {
    const { el, seen } = mountWithAgent((emit) => {
      emit.toolCall("call-1", "create_event", {});
      emit.toolResult("call-1", "created");
      emit.error("upstream exploded");
    });

    await el.sendMessage("book it");
    await flush();

    expect(seen[0]?.tools).toEqual([{ name: "create_event", side: "server" }]);
  });

  it("does not count a capability load, which moves nothing a host renders", async () => {
    const { el, seen } = mountWithAgent((emit) => {
      emit.toolCall("call-1", LOAD_CAPABILITY_TOOL, { id: "summarise" });
      emit.runEnd();
    });

    await el.sendMessage("summarise this");
    await flush();

    expect(seen[0]?.tools).toEqual([]);
  });

  it("starts each interaction from an empty list", async () => {
    let round = 0;
    const { el, seen } = mountWithAgent((emit) => {
      emit.toolCall(`call-${round}`, round === 0 ? "create_event" : "move_event", {});
      emit.toolResult(`call-${round}`, "ok");
      emit.runEnd();
      round += 1;
    });

    await el.sendMessage("book it");
    await flush();
    await el.sendMessage("now move it");
    await flush();

    expect(names(seen[0]?.tools ?? [])).toEqual(["create_event"]);
    expect(names(seen[1]?.tools ?? [])).toEqual(["move_event"]);
  });

  it("crosses the shadow boundary, so a host listens on the element", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runEnd();
    });
    const onDocument: RunFinishedDetail[] = [];
    document.addEventListener(RUN_FINISHED_EVENT, (event) => {
      onDocument.push((event as CustomEvent<RunFinishedDetail>).detail);
    });

    await el.sendMessage("hi");
    await flush();

    expect(onDocument).toHaveLength(1);
  });
});
