/**
 * Which tools a call may actually reach.
 *
 * The registry is mount-wide; the catalog handed to the agent is per-run and a
 * host is invited to scope it (`getTools`). These assert that the run's own
 * catalog is what dispatch honours — a tool the run never offered must not run
 * just because its handler happens to be registered.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG, SUBMIT_EVENT } from "../src/constants.js";
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

describe("an Always allow waiver and the principal who granted it", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  /**
   * Mount as `userKey`, with one destructive tool the run calls once per send,
   * and waive it with Always allow on the first card. Returns the element and
   * how many times the handler ran.
   */
  async function waivedBy(userKey: string | null): Promise<{ el: AgUiChat; ran: () => number }> {
    let calls = 0;
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    if (userKey !== null) {
      el.setAttribute("user-key", userKey);
    }
    let round = 0;
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        if (round === 0) {
          emit.toolCall(`call-${calls}`, "delete_record", { id: 7 });
        }
        round += 1;
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    // A fresh round counter per send, so every send makes exactly one call.
    el.addEventListener(SUBMIT_EVENT, () => {
      round = 0;
    });
    document.body.appendChild(el);
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object", "x-destructive": true },
      handler: () => {
        calls += 1;
        return "deleted";
      },
    });

    await send(el, "delete record 7");
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--always")?.click();
    await flush();
    expect(calls).toBe(1);
    return { el, ran: () => calls };
  }

  it("asks the next principal again after user-key changes hands", async () => {
    // One person's "stop asking me" is not the next person's. `user-key` is how
    // a host says a different principal is now in this tab, and a waiver that
    // carried across would run the second user's destructive call on the
    // first user's click.
    const { el, ran } = await waivedBy("alice");

    el.setAttribute("user-key", "bob");
    await flush();
    await send(el, "delete record 7");

    expect(ran()).toBe(1);
    expect(shadow(el).querySelector(".confirm")).not.toBeNull();
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
  });

  it("asks again after a sign-out that drops user-key", async () => {
    // Removing the attribute is a documented sign-out, and it purges the stored
    // conversation the same way a new key does; the waiver goes with it.
    const { el, ran } = await waivedBy("alice");

    el.removeAttribute("user-key");
    await flush();
    await send(el, "delete record 7");

    expect(ran()).toBe(1);
    expect(shadow(el).querySelector(".confirm")).not.toBeNull();
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
  });

  it("keeps the waiver when user-key first arrives", async () => {
    // The first key names the user who was already there -- an auth handshake
    // resolving after mount -- which is why the conversation on screen moves
    // into their namespace rather than being purged. The waiver is theirs by
    // the same reasoning, so asking again would contradict the adoption.
    const { el, ran } = await waivedBy(null);

    el.setAttribute("user-key", "alice");
    await flush();
    await send(el, "delete record 7");

    expect(ran()).toBe(2);
    expect(shadow(el).querySelector(".confirm")).toBeNull();
  });
});

describe("a confirmPredicate that throws", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  const THROWS = {
    synchronously: () => {
      throw new Error("policy service unreachable at 10.0.0.7");
    },
    "by rejecting": () => Promise.reject(new Error("policy service unreachable at 10.0.0.7")),
  };

  it.each(Object.entries(THROWS))(
    "refuses the call and carries on when it throws %s",
    async (_how, predicate) => {
      // The predicate is documented as authoritative, and for a tool with no
      // `x-destructive` flag it is the only thing standing between the model and
      // the handler. A guard that cannot answer has not said the call is safe.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const handler = vi.fn(() => "sent");
      let round = 0;
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.setAttribute("endpoint", "/agent/");
      const handle = makeFakeAgent({
        script: (emit) => {
          emit.runStart();
          if (round === 0) {
            emit.toolCall("call-1", "send_invoice", { id: 7 });
          }
          round += 1;
          emit.runEnd();
        },
      });
      el.agentFactory = () => handle.agent;
      document.body.appendChild(el);
      el.confirmPredicate = predicate;
      el.registerTool({
        name: "send_invoice",
        description: "Send an invoice",
        parameters: { type: "object" },
        handler,
      });

      await send(el, "send invoice 7");

      const card = shadow(el).querySelector<HTMLElement>(".tool-call");
      expect(card?.getAttribute("data-status")).toBe("declined");
      expect(handler).not.toHaveBeenCalled();
      // Nobody was asked, so the card must not say a person declined.
      expect(card?.hasAttribute("data-decision")).toBe(false);
      expect(shadow(el).querySelector(".confirm")).toBeNull();
      // The run went on to its next round with the refusal as the tool result,
      // as it does after a decline, rather than ending on an error bubble.
      expect(handle.runParams).toHaveLength(2);
      expect(shadow(el).querySelector(".message--failed")).toBeNull();
      const result = handle.messages.find((message) => message.role === "tool");
      expect(result?.content).toBe(card?.querySelector(".tool-call-result")?.textContent);
      // The host's own message is a detail of its infrastructure: it goes to the
      // console, never to the endpoint or the model.
      expect(result?.content).not.toContain("10.0.0.7");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("confirmPredicate"),
        expect.objectContaining({ message: "policy service unreachable at 10.0.0.7" }),
      );
      warn.mockRestore();
    },
  );
});
