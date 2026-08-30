/**
 * The three host seams a constrained deployment needs and could not reach:
 * how a tool card's body is drawn, how many tool rounds one send may take, and
 * whether a finished answer carries an action row at all.
 *
 * Each is an *opt-out or override* of behaviour that already ships on by
 * default, so every test here pairs the configured element with the unconfigured
 * one -- the defaults are the contract, and a seam that quietly changed them
 * would pass a test that only looked at the configured side.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MAX_TOOL_ROUNDS } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/** Mount with a fake agent, applying attributes and a pre-connect setup hook. */
function mountWithAgent(
  script: (emit: Emit) => void,
  attrs: Record<string, string> = {},
  setup?: (el: AgUiChat) => void,
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  setup?.(el);
  document.body.appendChild(el);
  return el;
}

/**
 * Drain pending microtasks. Generously: the round-bound tests run the loop to
 * exhaustion, and each round costs several turns, so the usual handful would
 * measure the drain rather than the bound.
 */
async function flush(): Promise<void> {
  for (let i = 0; i < 200; i += 1) {
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

/** A run that answers once, so the transcript ends on a finished assistant bubble. */
function answers(emit: Emit): void {
  emit.runStart();
  emit.text("the answer");
  emit.textEnd("the answer");
  emit.runEnd();
}

const actionRow = (el: AgUiChat): HTMLElement | null =>
  shadow(el).querySelector<HTMLElement>(".message-actions");

const actionNames = (el: AgUiChat): string[] =>
  [...shadow(el).querySelectorAll(".message-actions .message-action")].map((button) =>
    (button.getAttribute("class") ?? "").replace(/^message-action message-action--/, ""),
  );

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("AgUiChat.formatToolPayload", () => {
  it("draws a tool card's body when the host supplies a formatter", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "list_orders", { status: "open" });
      emit.toolResult("tc1", '{"count":3,"currency":"EUR"}');
      emit.runEnd();
    });
    el.formatToolPayload = (payload) => {
      if (payload.kind !== "result") {
        return null;
      }
      const line = document.createElement("span");
      line.className = "orders-summary";
      line.textContent = `${payload.toolName}: 3 open`;
      return line;
    };
    await send(el, "orders?");

    const body = shadow(el).querySelector<HTMLElement>(".tool-call-result");
    expect(body?.querySelector(".orders-summary")?.textContent).toBe("list_orders: 3 open");
    expect(body?.getAttribute("data-formatted")).toBe("true");
  });

  it("reads the property live, so a formatter set late still draws later results", async () => {
    // Set after the element mounted and after the card exists is the ordinary
    // case for a host that configures from a framework effect; a formatter
    // captured at construction would silently miss it.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "count_users", {});
      emit.toolResult("tc1", "42");
      emit.runEnd();
    });
    el.formatToolPayload = () => "42 people";
    await send(el, "how many?");

    expect(shadow(el).querySelector(".tool-call-result")?.textContent).toBe("42 people");
  });

  it("pretty-prints as before when no formatter is set", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "count_users", {});
      emit.toolResult("tc1", '{"count":42}');
      emit.runEnd();
    });
    await send(el, "how many?");

    const body = shadow(el).querySelector<HTMLElement>(".tool-call-result");
    expect(body?.textContent).toBe('{\n  "count": 42\n}');
    expect(body?.hasAttribute("data-formatted")).toBe(false);
  });
});

describe("AgUiChat data-max-tool-rounds", () => {
  /** A run that never stops calling a frontend tool, so only the bound ends it. */
  function loopingAgent(attrs: Record<string, string>): { el: AgUiChat; rounds: () => number } {
    let rounds = 0;
    const el = mountWithAgent(
      (emit) => {
        rounds += 1;
        emit.runStart();
        emit.toolCall(`tc${rounds}`, "fill_field", {});
        emit.runEnd();
      },
      attrs,
      (chat) => {
        chat.registerTool({
          name: "fill_field",
          description: "fill a field",
          parameters: { type: "object" },
          handler: () => "filled",
        });
      },
    );
    return { el, rounds: () => rounds };
  }

  it("bounds the tool-round loop at the configured number", async () => {
    const { el, rounds } = loopingAgent({ "data-max-tool-rounds": "3" });
    await send(el, "go");
    expect(rounds()).toBe(3);
  });

  it("keeps the built-in bound when the attribute is absent or unusable", async () => {
    const plain = loopingAgent({});
    await send(plain.el, "go");
    expect(plain.rounds()).toBe(MAX_TOOL_ROUNDS);

    // A bound below one is not a smaller budget, it is a send that never runs.
    const zero = loopingAgent({ "data-max-tool-rounds": "0" });
    await send(zero.el, "go");
    expect(zero.rounds()).toBe(MAX_TOOL_ROUNDS);

    const nonsense = loopingAgent({ "data-max-tool-rounds": "lots" });
    await send(nonsense.el, "go");
    expect(nonsense.rounds()).toBe(MAX_TOOL_ROUNDS);
  });
});

describe("AgUiChat data-message-actions", () => {
  it("gives a finished answer copy, retry and feedback by default", async () => {
    const el = mountWithAgent(answers);
    await send(el, "hi");
    expect(actionNames(el).sort()).toEqual(["copy", "down", "retry", "up"]);
  });

  it("suppresses the row entirely on data-message-actions=false", async () => {
    // The constrained-surface case: no row at all, not an empty one. An empty
    // row still occupies its margin and still answers to its own part.
    const el = mountWithAgent(answers, { "data-message-actions": "false" });
    await send(el, "hi");
    expect(actionRow(el)).toBeNull();
    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("the answer");
  });

  it("keeps exactly the actions the list names", async () => {
    // Per-action rather than all-or-nothing: a host with nowhere to send a
    // rating wants the feedback pair gone and copy kept, which one switch
    // cannot say.
    const el = mountWithAgent(answers, { "data-message-actions": "copy, retry" });
    await send(el, "hi");
    expect(actionNames(el).sort()).toEqual(["copy", "retry"]);
  });

  it("builds the row for the rating pair alone, with nothing to copy", async () => {
    const el = mountWithAgent(answers, { "data-message-actions": "feedback" });
    await send(el, "hi");
    expect(actionNames(el)).toEqual(["up", "down"]);
  });

  it("builds the row for retry alone when nothing else is enabled", async () => {
    const el = mountWithAgent(answers, { "data-message-actions": "retry" });
    await send(el, "hi");
    expect(actionNames(el)).toEqual(["retry"]);
  });

  it("drops retry from a failed run's row, keeping the rest of the list", async () => {
    // A failure's row exists only for retry; asked for copy only, it has
    // nothing to offer and must not invent one.
    const el = mountWithAgent(
      (emit) => {
        emit.runStart();
        emit.error("connection lost");
      },
      { "data-message-actions": "copy" },
    );
    await send(el, "hi");
    expect(actionNames(el)).toEqual(["copy"]);
  });
});
