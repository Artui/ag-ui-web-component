/**
 * A delegated sub-agent's progress, hung off the card that delegated.
 *
 * A run that hands work to a sub-agent used to read as a stall: the parent's
 * `delegate_task` card sat at "running…" for the child's whole duration with
 * nothing on screen, however many tools the child called. The server now
 * narrates that on the AG-UI `CUSTOM` carrier, and this is the consumer.
 *
 * **Driven from the producer's own fixture.** Every payload below comes out of
 * `tests/fixtures/subagent_progress_stream.json`, which the server repository
 * generates from its own encoder — see `tests/helpers/subagent_fixture.ts` for
 * the provenance and the standing rule that it is regenerated, never edited.
 * Nothing here states a field name the server did not write.
 *
 * The shape asserted is the one that was chosen: **one collapsed row per
 * delegation, carrying the live status, expanding onto the child's own tool
 * calls**. It reuses how a tool card already behaves rather than inventing a
 * second visual language, and a ten-step child costs one row until someone opens
 * it. The two rejected alternatives are worth naming because each fails a test
 * here: a bare status line gives up the detail entirely (nothing to expand onto),
 * and inline child cards in the transcript interleave parent and child with
 * nothing marking whose is whose.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { CUSTOM_AGENT_EVENT, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat, CustomAgentDetail } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import {
  FIXTURE_CUSTOM_NAME,
  FIXTURE_EVENTS,
  type FixtureLifecycleEvent,
  type FixtureSubAgentValue,
  lifecycleEvent,
  subAgentValue,
} from "./helpers/subagent_fixture.js";

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

async function send(el: AgUiChat, text = "find the settlement passages"): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

/**
 * Play the recorded run through the fake agent, event for event.
 *
 * A translation of the fixture rather than a re-telling of it: each branch maps
 * one recorded event type onto the emitter that stands for it, and every value
 * handed over is read out of the recording. `RUN_FINISHED` is left to the fake,
 * which appends the terminal pair itself.
 */
function replayFixture(emit: Emit): void {
  const names = new Map<string, string>();
  const args = new Map<string, string>();
  const text = new Map<string, string>();
  const append = (into: Map<string, string>, key: string, delta: string): void => {
    into.set(key, (into.get(key) ?? "") + delta);
  };
  for (const event of FIXTURE_EVENTS) {
    const type = event["type"];
    if (type === "RUN_STARTED") {
      emit.runStart();
    } else if (type === "TOOL_CALL_START") {
      names.set(event["toolCallId"] as string, event["toolCallName"] as string);
    } else if (type === "TOOL_CALL_ARGS") {
      append(args, event["toolCallId"] as string, event["delta"] as string);
    } else if (type === "TOOL_CALL_END") {
      const id = event["toolCallId"] as string;
      emit.toolCall(id, names.get(id) ?? "", JSON.parse(args.get(id) ?? "{}"));
    } else if (type === "CUSTOM") {
      emit.custom(event["name"] as string, event["value"]);
    } else if (type === "SUBAGENT_STARTED") {
      emit.subAgentStarted(
        event["subagentRunId"] as string,
        event["name"] as string,
        event["parentToolCallId"] as string,
      );
    } else if (type === "SUBAGENT_FINISHED") {
      emit.subAgentFinished(event["subagentRunId"] as string);
    } else if (type === "SUBAGENT_ERROR") {
      emit.subAgentError(event["subagentRunId"] as string, event["message"] as string);
    } else if (type === "TOOL_CALL_RESULT") {
      emit.toolResult(event["toolCallId"] as string, event["content"] as string);
    } else if (type === "TEXT_MESSAGE_START") {
      emit.textStart(event["messageId"] as string);
    } else if (type === "TEXT_MESSAGE_CONTENT") {
      append(text, event["messageId"] as string, event["delta"] as string);
    } else if (type === "TEXT_MESSAGE_END") {
      const id = event["messageId"] as string;
      emit.textEnd(text.get(id) ?? "", id);
    }
  }
}

/** The delegation panel inside the card for `toolCallId`, or `null`. */
function panelFor(el: AgUiChat, toolCallId: string): HTMLElement | null {
  // Named off the lifecycle event now, not off a CUSTOM payload: the agent's
  // name arrives on SUBAGENT_STARTED, and it is the only place it is stated.
  const started = lifecycleEvent(
    (event) => event.type === "SUBAGENT_STARTED" && event.parentToolCallId === toolCallId,
  );
  return shadow(el).querySelector<HTMLElement>(`.subagent[data-agent="${started.name}"]`);
}

function rowOf(panel: HTMLElement): HTMLButtonElement {
  const row = panel.querySelector<HTMLButtonElement>(".subagent-row");
  if (row === null) {
    throw new Error("expected a collapsed delegation row");
  }
  return row;
}

function stepsOf(panel: HTMLElement): HTMLElement {
  const steps = panel.querySelector<HTMLElement>(".subagent-steps");
  if (steps === null) {
    throw new Error("expected a steps region");
  }
  return steps;
}

/** The recorded events, named by what they are so an assertion reads. */
const RESEARCHER_STARTED: FixtureLifecycleEvent = lifecycleEvent(
  (event) => event.type === "SUBAGENT_STARTED" && event.name === "researcher",
);
const AUDITOR_LAST: FixtureLifecycleEvent = lifecycleEvent(
  (event) => event.type === "SUBAGENT_ERROR",
);
/** The line the element words for itself when a delegation completes. */
const RESEARCHER_FINISHED_LINE: string = DEFAULT_UI_STRINGS.subAgentFinished.replace(
  "{agent}",
  RESEARCHER_STARTED.name ?? "",
);
const RETRY: FixtureSubAgentValue = subAgentValue(
  (v) => v.phase === "tool_result" && v.tool?.ok === false,
);
const ACCEPTED: FixtureSubAgentValue = subAgentValue(
  (v) => v.phase === "tool_result" && v.tool?.ok === true,
);

describe("a delegated sub-agent's progress", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("attaches to the card the parent's own delegate_task call already drew", async () => {
    // `delegationId` is the parent's tool-call id, not the child's run id, which
    // is what lets the surface hang off a card that exists rather than float.
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-1");
    expect(panel?.closest(".tool-call")?.getAttribute("data-tool-name")).toBe("delegate_task");
    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(2);
  });

  it("words a settled delegation from its own strings", async () => {
    // The lifecycle events carry a name and no rendered status -- deliberately,
    // since a localised UI wants to word its own -- so the closing line comes
    // from UiStrings here rather than off the wire. The two step phases still
    // carry a server-rendered `status`; see the test below.
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-1") as HTMLElement;
    expect(rowOf(panel).textContent).toContain(RESEARCHER_FINISHED_LINE);
    expect(stepsOf(panel).hidden).toBe(true);
  });

  it("carries the server's own status line for a step", async () => {
    // The structured keys are there for a host that wants its own wording; a
    // row that never expands needs nothing but `status`.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted(RESEARCHER_STARTED.subagentRunId, "researcher", "call-1");
      emit.custom(FIXTURE_CUSTOM_NAME, ACCEPTED);
    });

    await send(el);

    const panel = panelFor(el, "call-1") as HTMLElement;
    expect(rowOf(panel).textContent).toContain(ACCEPTED.status);
  });

  it("opens onto the child's own tool calls when asked", async () => {
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-1") as HTMLElement;
    rowOf(panel).click();

    expect(stepsOf(panel).hidden).toBe(false);
    expect(
      [...stepsOf(panel).querySelectorAll(".subagent-step-name")].map((n) => n.textContent),
    ).toEqual([ACCEPTED.tool?.name, RETRY.tool?.name]);
  });

  it("updates a child's step in place rather than stacking a second row", async () => {
    // Four tool phases, two `toolCallId`s. Keyed by the id, the pair collapses
    // into two rows; keyed by arrival it would be four.
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-1") as HTMLElement;
    expect(
      [...stepsOf(panel).querySelectorAll(".subagent-step")].map((s) =>
        s.getAttribute("data-tool-call-id"),
      ),
    ).toEqual([ACCEPTED.tool?.toolCallId, RETRY.tool?.toolCallId]);
  });

  it("marks which of the child's calls was accepted and which came back", async () => {
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-1") as HTMLElement;
    const outcome = (id: string): string | null =>
      panel.querySelector(`.subagent-step[data-tool-call-id="${id}"]`)?.getAttribute("data-ok") ??
      null;

    expect(outcome(ACCEPTED.tool?.toolCallId ?? "")).toBe("true");
    expect(outcome(RETRY.tool?.toolCallId ?? "")).toBe("false");
  });

  it("leaves a failure's detail to the tool result, which the card already draws", async () => {
    // A failure carries no exception text on the progress channel, deliberately
    // -- an exception's words are written for an operator. The detail rides the
    // ordinary TOOL_CALL_RESULT for the same delegation, on the same card.
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-2") as HTMLElement;
    const card = panel.closest(".tool-call") as HTMLElement;

    expect(panel.textContent).toBe(AUDITOR_LAST.message);
    expect(card.querySelector(".tool-call-result")?.textContent).toContain(
      "the auditor model went away",
    );
  });

  it("offers nothing to expand on a delegation that called no tools", async () => {
    // The auditor fails before calling anything. An expander onto an empty
    // region is the control the card's own toggle already refuses to show.
    const el = mount(replayFixture);

    await send(el);

    const panel = panelFor(el, "call-2") as HTMLElement;
    expect(rowOf(panel).disabled).toBe(true);
    expect(stepsOf(panel).children).toHaveLength(0);
  });

  it("keeps the parent's card in charge of its own status", async () => {
    // The progress channel narrates the child. Whether the parent's call
    // succeeded is the TOOL_CALL_RESULT's business, and both delegations here
    // return one -- including the failed delegation, whose *call* succeeded.
    const el = mount(replayFixture);

    await send(el);

    const cards = [...shadow(el).querySelectorAll('.tool-call[data-tool-name="delegate_task"]')];
    expect(cards.map((c) => c.getAttribute("data-status"))).toEqual(["done", "done"]);
  });

  it("does not also forward the routed name on the generic custom channel", async () => {
    // Routed to its own surface, the way `ag_ui.invalidate` is routed to its own
    // DOM event. Every other name still reaches the page untouched.
    const el = mount(replayFixture);
    const seen: CustomAgentDetail[] = [];
    el.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
      seen.push((event as CustomEvent<CustomAgentDetail>).detail);
    });

    await send(el);

    expect(seen).toEqual([]);
  });

  it("ignores progress for a delegation no card was drawn for", async () => {
    // The card is the attachment point, so an announcement naming a call this
    // client never saw has nowhere to go -- and must not invent a floating one.
    // Asserted on both carriers, since both name the card the same way.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(FIXTURE_CUSTOM_NAME, { ...ACCEPTED, delegationId: "never-drawn" });
      emit.subAgentStarted("subagent-never-drawn", "researcher", "never-drawn");
    });

    await send(el);

    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(0);
  });

  it("ignores a close naming a delegation it never saw open", async () => {
    // The two closing events carry the child's run id and nothing else, so the
    // pairing has to have been recorded on the opening one. A close without it
    // names nothing this client can find, which is the same refusal.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentFinished("subagent-never-opened");
      emit.subAgentError("subagent-never-opened", "researcher failed");
    });

    await send(el);

    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(0);
  });

  it("settles a delegation whose name the server left empty", async () => {
    // `name` is required by the protocol but not required to be useful. With no
    // name there is nothing to interpolate into either line, so the row falls
    // back to the neutral one rather than rendering "Delegated to " with a hole
    // in it -- and it still has to settle, because the row is the control.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", {});
      emit.subAgentStarted("subagent-call-1", "", "call-1");
      emit.subAgentFinished("subagent-call-1");
    });

    await send(el);

    const panel = shadow(el).querySelector<HTMLElement>(".subagent") as HTMLElement;
    expect(panel.hasAttribute("data-agent")).toBe(false);
    expect(rowOf(panel).textContent).toBe(DEFAULT_UI_STRINGS.subAgentWorking);
    expect(panel.getAttribute("data-phase")).toBe("finished");
  });

  it("names a failure the server left blank", async () => {
    // `message` is required by the protocol but not required to carry words.
    // An empty one used to settle the row to nothing at all, which reads as a
    // delegation that said nothing rather than one that failed -- and the
    // fallback for it had been written into the string table and never wired
    // to anything.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-call-1", "researcher", "call-1");
      emit.subAgentError("subagent-call-1", "");
    });

    await send(el);

    const panel = shadow(el).querySelector<HTMLElement>(".subagent") as HTMLElement;
    expect(rowOf(panel).textContent).toBe(DEFAULT_UI_STRINGS.subAgentFailed);
    expect(panel.getAttribute("data-phase")).toBe("failed");
  });

  it("keeps the server's own words when it sent some", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-call-1", "researcher", "call-1");
      emit.subAgentError("subagent-call-1", "researcher ran out of budget");
    });

    await send(el);

    const panel = shadow(el).querySelector<HTMLElement>(".subagent") as HTMLElement;
    expect(rowOf(panel).textContent).toBe("researcher ran out of budget");
  });

  it("drops a close for a delegation whose card was never drawn", async () => {
    // The open was remembered but drew nothing, so the close has a delegation
    // to name and still no card to settle. It must stay silent rather than
    // create the panel the open declined to.
    const el = mount((emit) => {
      emit.runStart();
      emit.subAgentStarted("subagent-never-drawn", "researcher", "never-drawn");
      emit.subAgentFinished("subagent-never-drawn");
    });

    await send(el);

    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(0);
  });

  it("draws nothing for a delegation that names no parent call", async () => {
    // `parentToolCallId` is optional on the wire. Without one there is no card
    // to hang off, and a floating panel is exactly what attaching was chosen
    // over -- so the delegation is simply not drawn.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", { agent_name: "researcher" });
      emit.subAgentStarted("subagent-orphan", "researcher");
    });

    await send(el);

    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(0);
  });

  it("survives a payload that is not the shape the contract states", async () => {
    // `value` is `unknown` on the wire, so a malformed announcement must not
    // take the run down with it -- the same defensiveness the invalidation
    // channel applies to the same field.
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", {});
      emit.custom(FIXTURE_CUSTOM_NAME, null);
      emit.custom(FIXTURE_CUSTOM_NAME, "not an object");
      emit.custom(FIXTURE_CUSTOM_NAME, { delegationId: 7, phase: "started" });
      emit.custom(FIXTURE_CUSTOM_NAME, { delegationId: "call-1", phase: "invented" });
      emit.textStart("m1");
      emit.textEnd("done", "m1");
    });

    await send(el);

    expect(shadow(el).querySelectorAll(".subagent")).toHaveLength(0);
    expect(shadow(el).querySelector(".messages")?.textContent).toContain("done");
  });

  it("renders a status line as text, never as markup", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.toolCall("call-1", "delegate_task", {});
      emit.custom(FIXTURE_CUSTOM_NAME, {
        delegationId: "call-1",
        agent: "researcher",
        phase: "started",
        status: "<img src=x onerror=alert(1)>",
      });
    });

    await send(el);

    const row = shadow(el).querySelector(".subagent-status");
    expect(row?.querySelector("img")).toBeNull();
    expect(row?.textContent).toBe("<img src=x onerror=alert(1)>");
  });

  it("is not persisted, so nothing replays it on a thread restore", async () => {
    // A CUSTOM event never enters `agent.messages`. That is deliberate and it is
    // the reason the surface is allowed to be live: replayed progress is a lie
    // about a run that is over.
    const el = mount(replayFixture);

    await send(el);

    const stored = Object.keys(sessionStorage)
      .map((key) => sessionStorage.getItem(key) ?? "")
      .join("\n");
    expect(stored).not.toContain(RESEARCHER_FINISHED_LINE);
    expect(stored).not.toContain(AUDITOR_LAST.message);
  });
});
