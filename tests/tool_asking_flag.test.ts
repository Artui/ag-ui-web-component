/**
 * The flag a card carries while a prompt is open on it.
 *
 * A question or a confirmation leaves its call's status at `pending`, because a
 * card display mode draws that status and must not change. The card says it is
 * asking in `data-asking` instead, and the step group reads it. What this holds
 * is that the flag is on for exactly as long as a prompt is open: every way a
 * prompt can end clears it, since a flag left behind would read "waiting for
 * you" on a row that is waiting for nothing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

/** An element whose first round makes one call, and whose next round ends. */
function mountCalling(toolName: string, userKey: string | null = null): AgUiChat {
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
        emit.toolCall("call-1", toolName, { question: "Which colour?", options: ["red", "blue"] });
      }
      round += 1;
      emit.runEnd();
    },
  });
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

async function send(el: AgUiChat): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = "go";
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

function card(el: AgUiChat): HTMLElement {
  const found = shadow(el).querySelector<HTMLElement>(".tool-call");
  if (found === null) {
    throw new Error("expected a tool card");
  }
  return found;
}

function stop(el: AgUiChat): void {
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

function answerQuestion(el: AgUiChat): void {
  const blue = shadow(el).querySelectorAll<HTMLInputElement>(".question-choice input")[1];
  blue?.click();
  blue?.dispatchEvent(new Event("change"));
  shadow(el).querySelector<HTMLButtonElement>(".question-btn")?.click();
}

function destructive(el: AgUiChat): void {
  el.registerTool({
    name: "wipe",
    description: "Wipe it",
    parameters: { type: "object", "x-destructive": true },
    handler: () => "wiped",
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("a question open on a card", () => {
  it("flags the card while it is open, leaving the status alone, and clears it on the answer", async () => {
    const el = mountCalling("ask_user");
    el.askUser = true;
    await send(el);

    expect(card(el).hasAttribute("data-asking")).toBe(true);
    expect(card(el).getAttribute("data-status")).toBe("pending");
    answerQuestion(el);
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
    expect(card(el).getAttribute("data-status")).toBe("done");
  });

  it("clears the flag when a Stop abandons it", async () => {
    const el = mountCalling("ask_user");
    el.askUser = true;
    await send(el);
    expect(card(el).hasAttribute("data-asking")).toBe(true);

    stop(el);
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
  });

  it("holds it for a host renderer, and clears it when the renderer answers", async () => {
    const el = mountCalling("ask_user");
    el.askUser = true;
    let answer: (value: string) => void = () => {};
    el.askUserRenderer = () =>
      new Promise<string>((resolve) => {
        answer = resolve;
      });
    await send(el);
    expect(card(el).hasAttribute("data-asking")).toBe(true);

    answer("blue");
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
  });

  it("keeps it on across a failed renderer's fallback to the built-in card, then clears it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const el = mountCalling("ask_user");
    el.askUser = true;
    el.askUserRenderer = () => Promise.reject(new Error("modal library not loaded"));
    await send(el);
    expect(shadow(el).querySelector(".question")).not.toBeNull();
    expect(card(el).hasAttribute("data-asking")).toBe(true);

    answerQuestion(el);
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
    warn.mockRestore();
  });

  it("clears it when the renderer rejects because the wait was abandoned", async () => {
    const el = mountCalling("ask_user");
    el.askUser = true;
    el.askUserRenderer = (_request, { signal }) =>
      new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("abandoned", "AbortError")));
      });
    await send(el);
    expect(card(el).hasAttribute("data-asking")).toBe(true);

    stop(el);
    await flush();
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
  });
});

describe("a confirmation open on a card", () => {
  it("flags the card while it is open, leaving the status alone, and clears it on the answer", async () => {
    const el = mountCalling("wipe");
    destructive(el);
    await send(el);

    expect(card(el).hasAttribute("data-asking")).toBe(true);
    expect(card(el).getAttribute("data-status")).toBe("pending");
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
  });

  it("clears the flag when a Stop abandons it", async () => {
    const el = mountCalling("wipe");
    destructive(el);
    await send(el);
    expect(card(el).hasAttribute("data-asking")).toBe(true);

    stop(el);
    await flush();
    expect(card(el).hasAttribute("data-asking")).toBe(false);
  });

  it("clears the flag on the card a handover leaves behind", async () => {
    const el = mountCalling("wipe", "alice");
    destructive(el);
    await send(el);
    const left = card(el);
    expect(left.hasAttribute("data-asking")).toBe(true);

    el.setAttribute("user-key", "bob");
    await flush();
    expect(left.hasAttribute("data-asking")).toBe(false);
  });
});
