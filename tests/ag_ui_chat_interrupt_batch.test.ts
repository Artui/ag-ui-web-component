/**
 * A run that defers more than one call.
 *
 * Every earlier approval test gates exactly one call, and one card sitting under
 * one "running…" reads as the thing being asked about. Three of them do not:
 * three copies of one question, asked one at a time, three cards below the calls
 * they gate — while all three of those calls claim to be running. The wire
 * answers each interrupt independently, so this is where the UI has to.
 */

import type { Interrupt } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "./helpers/fake_agent.js";

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.replaceChildren();
});

const ROWS = [
  { id: "call-1", title: "Design sync" },
  { id: "call-2", title: "Retro" },
  { id: "call-3", title: "One-on-one" },
];

function interrupt(toolCallId: string): Interrupt {
  // Every gated call of one tool carries the same prompt, because the prompt is
  // the tool's `x-confirm`. That is the finding, so the fixture reproduces it.
  return {
    id: `int-${toolCallId}`,
    reason: "tool_call",
    toolCallId,
    message: "Add this event to the board?",
  } as never;
}

/** A run deferring one `create_event` per row, then settling on the resume. */
function mountBatch(): { el: AgUiChat; handle: ReturnType<typeof makeFakeAgent> } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({
    script: (emit: Emit, params: FakeRunParams) => {
      emit.runStart();
      if (params.resume === undefined) {
        for (const row of ROWS) {
          emit.toolCall(row.id, "create_event", { title: row.title });
        }
        emit.interrupt(ROWS.map((row) => interrupt(row.id)));
        return;
      }
      // Only the approved calls come back with a result; a denial never does.
      for (const answer of params.resume as { interruptId: string; status: string }[]) {
        if (answer.status === "resolved") {
          emit.toolResult(answer.interruptId.replace("int-", ""), "created");
        }
      }
      emit.runEnd();
    },
  });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return { el, handle };
}

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function send(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

/** The tool cards, in transcript order. */
function cards(el: AgUiChat): HTMLElement[] {
  return Array.from(shadow(el).querySelectorAll<HTMLElement>(".tool-call"));
}

/** The approval prompt inside one card, if it is being asked about. */
function promptIn(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>(".tool-call-approval .approval");
}

function argsOf(card: HTMLElement): string {
  return card.querySelector(".tool-call-args")?.textContent ?? "";
}

function click(card: HTMLElement, action: "approve" | "deny"): void {
  card.querySelector<HTMLButtonElement>(`.approval-btn--${action}`)?.click();
}

describe("a batch of interrupts", () => {
  it("asks inside each gated call's own card, not in the answer group", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();

    const open = cards(el);
    expect(open).toHaveLength(3);
    // One prompt per card, and every prompt is *inside* the card whose arguments
    // say which row it is about. Nothing else in the transcript asks.
    for (const [index, card] of open.entries()) {
      expect(promptIn(card)).not.toBeNull();
      expect(argsOf(card)).toContain(ROWS[index]?.title);
    }
    expect(shadow(el).querySelectorAll(".approval")).toHaveLength(3);
    expect(shadow(el).querySelectorAll(".tool-call-approval .approval")).toHaveLength(3);
  });

  it("shows every question at once, so the batch can be compared before answering", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();

    // The serial loop rendered card two only once card one was answered: a person
    // answering the first could not see what else was coming.
    const prompts = shadow(el).querySelectorAll<HTMLElement>(".approval");
    expect(prompts).toHaveLength(3);
    for (const prompt of prompts) {
      expect(prompt.hasAttribute("data-resolved")).toBe(false);
    }
  });

  it("carries a different answer per interrupt to the server", async () => {
    const { el, handle } = mountBatch();

    send(el, "import these three rows");
    await flush();
    const [first, second, third] = cards(el);
    click(first as HTMLElement, "approve");
    click(second as HTMLElement, "deny");
    click(third as HTMLElement, "approve");
    await flush();

    expect(handle.runParams).toHaveLength(2);
    expect(handle.runParams[1]?.resume).toEqual([
      { interruptId: "int-call-1", status: "resolved", payload: { approved: true } },
      { interruptId: "int-call-2", status: "cancelled" },
      { interruptId: "int-call-3", status: "resolved", payload: { approved: true } },
    ]);
  });

  it("settles each card by its own decision", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();
    const [first, second, third] = cards(el);
    click(first as HTMLElement, "approve");
    click(second as HTMLElement, "deny");
    click(third as HTMLElement, "approve");
    await flush();

    expect(cards(el).map((card) => card.getAttribute("data-status"))).toEqual([
      "done",
      "declined",
      "done",
    ]);
    expect(cards(el).map((card) => card.getAttribute("data-decision"))).toEqual([
      "approved",
      "declined",
      "approved",
    ]);
  });

  it("resolving one card leaves the others open", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();
    click(cards(el)[0] as HTMLElement, "approve");
    await flush();

    const [first, second, third] = cards(el);
    expect(promptIn(first as HTMLElement)?.getAttribute("data-resolved")).toBe("approved");
    expect(promptIn(second as HTMLElement)?.hasAttribute("data-resolved")).toBe(false);
    expect(promptIn(third as HTMLElement)?.hasAttribute("data-resolved")).toBe(false);
    // The run has not resumed: it is still waiting on the other two.
    expect(cards(el)[1]?.getAttribute("data-status")).toBe("deferred");
  });

  it("falls back to the answer group when the interrupt names no call", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit: Emit, params: FakeRunParams) => {
          if (params.resume === undefined) {
            emit.interrupt([{ id: "int-x", reason: "tool_call", message: "Proceed?" } as never]);
            return;
          }
          emit.runEnd();
        },
      }).agent;
    document.body.appendChild(el);

    send(el, "go");
    await flush();

    // No tool card to render into, so the transcript is still the right host —
    // the prompt must never be dropped for want of a card.
    expect(shadow(el).querySelector(".approval")).not.toBeNull();
    expect(shadow(el).querySelector(".tool-call-approval .approval")).toBeNull();
  });
});

describe("a deferred call does not claim to be running", () => {
  it("reads as waiting for a person while the run is suspended", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();

    for (const card of cards(el)) {
      expect(card.getAttribute("data-status")).toBe("deferred");
      expect(card.querySelector(".tool-call-status")?.textContent).toBe("waiting for you");
    }
  });

  it("goes back to running once approved, because then it is", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();
    const first = cards(el)[0] as HTMLElement;
    click(first, "approve");
    // One microtask, so the decision is recorded but the run has not resumed:
    // two cards are still open, and the approved tool is now the server's to run.
    await Promise.resolve();
    expect(first.getAttribute("data-status")).toBe("pending");
    expect(first.querySelector(".tool-call-status")?.textContent).toBe("running…");

    // Answer the rest so the run resumes and the real result lands.
    click(cards(el)[1] as HTMLElement, "approve");
    click(cards(el)[2] as HTMLElement, "approve");
    await flush();
    expect(cards(el)[0]?.getAttribute("data-status")).toBe("done");
  });

  it("stays running for a frontend tool, which really is running", async () => {
    // The narrow half of the finding: `ask_user` sits at "running…" while its
    // card is open and that is correct — the browser is executing it, waiting on
    // a person. Only a *deferred* call claimed something false.
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    let round = 0;
    el.agentFactory = () =>
      makeFakeAgent({
        script: (emit: Emit) => {
          if (round === 0) {
            emit.toolCall("q1", "ask_user", { question: "Which slot?", options: ["a", "b"] });
          }
          round += 1;
        },
      }).agent;
    el.askUser = true;
    document.body.appendChild(el);

    send(el, "ask me");
    await flush();

    expect(shadow(el).querySelector(".question")).not.toBeNull();
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-status")).toBe("pending");
  });
});

describe("stopping a batch", () => {
  it("denies every open card at once", async () => {
    const { el } = mountBatch();

    send(el, "import these three rows");
    await flush();
    // Stop is the composer button's running state, not a control of its own.
    const stop = shadow(el).querySelector<HTMLButtonElement>(".send");
    expect(stop?.dataset["state"]).toBe("running");
    stop?.click();
    await flush();

    for (const card of cards(el)) {
      expect(promptIn(card)?.getAttribute("data-resolved")).toBe("denied");
      expect(card.getAttribute("data-status")).toBe("declined");
    }
  });
});
