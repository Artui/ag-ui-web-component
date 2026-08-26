/**
 * Which tools a call may actually reach.
 *
 * The registry is mount-wide; the catalog handed to the agent is per-run and a
 * host is invited to scope it (`getTools`). These assert that the run's own
 * catalog is what dispatch honours — a tool the run never offered must not run
 * just because its handler happens to be registered.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
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

describe("dispatch honours the run's advertised catalog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("refuses a registered tool the run's catalog left out", async () => {
    const handler = vi.fn(() => "deleted");
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delete_record", { id: 7 });
      emit.runEnd();
    });
    el.autoConfirm = true;
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object" },
      handler,
    });
    // The host registers everything once at mount and scopes the per-run
    // catalog by page: this page does not offer deleting.
    el.getTools = () => [];

    await send(el, "delete record 7");

    expect(handler).not.toHaveBeenCalled();
  });

  it("keeps refusing when a second getTools() call would widen the set", async () => {
    // The timing trap: the catalog is a *provider*, so calling it again at
    // dispatch time asks a question the run already answered. The set that
    // counts is the one the agent was actually given.
    const handler = vi.fn(() => "deleted");
    const scoped = {
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object" },
    };
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delete_record", { id: 7 });
      emit.runEnd();
    });
    el.autoConfirm = true;
    el.registerTool({ ...scoped, handler });
    let asked = 0;
    el.getTools = () => {
      asked += 1;
      return asked === 1 ? [] : [scoped];
    };

    await send(el, "delete record 7");

    expect(handler).not.toHaveBeenCalled();
  });

  it("still runs a tool the run's catalog does advertise", async () => {
    const handler = vi.fn(() => "filled");
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "fill_field", { value: "Paris" });
      emit.runEnd();
    });
    el.autoConfirm = true;
    const tool = {
      name: "fill_field",
      description: "Fill a field",
      parameters: { type: "object" },
    };
    el.registerTool({ ...tool, handler });
    el.getTools = () => [tool];

    await send(el, "fill it");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves the default catalog dispatching every registered tool", async () => {
    // A host that never touches `getTools` advertises the built-ins plus
    // everything registered, so the gate must be invisible to it.
    const handler = vi.fn(() => "filled");
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "fill_field", { value: "Paris" });
      emit.runEnd();
    });
    el.autoConfirm = true;
    el.registerTool({
      name: "fill_field",
      description: "Fill a field",
      parameters: { type: "object" },
      handler,
    });

    await send(el, "fill it");

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("leaves a built-in tool dispatching under the default catalog", async () => {
    // The built-ins are advertised by the same default provider, so opting one
    // in (here `ask_user`) must not trip the gate either.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "ask_user", { question: "Which one?" });
      emit.runEnd();
    });
    el.askUser = true;

    await send(el, "ask me");

    expect(shadow(el).querySelector(".question")).not.toBeNull();
    // Leave nothing awaiting an answer behind for the next test.
    shadow(el).querySelector<HTMLButtonElement>(".question-submit")?.click();
    await flush();
  });
});

describe("a frontend tool handler that throws", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("sends the exception's own message on to the agent as the tool result", async () => {
    // Characterisation, not a wish: the message a handler throws leaves the
    // browser verbatim as conversation content. Pinned here because the
    // `registerTool` docs now tell hosts to sanitise before throwing, and a
    // doc that nothing checks is the thing that rots.
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("call-1", "save_record", {});
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    el.autoConfirm = true;
    el.registerTool({
      name: "save_record",
      description: "Save a record",
      parameters: { type: "object" },
      handler: () => {
        throw new Error("PUT https://internal.example/records/7?sig=abc failed");
      },
    });

    await send(el, "save it");

    const toolMessage = handle.messages.find((message) => message.role === "tool");
    expect(toolMessage?.content).toBe(
      "Error: PUT https://internal.example/records/7?sig=abc failed",
    );
  });
});
