import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, STATE_EVENT, TOOL_OUTCOME } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../src/core/conversation_store.js";
import type { HttpAgentOptions as AgentOptions } from "../src/core/create_http_agent.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../src/core/run_index.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";

beforeAll(() => {
  defineAgUiChat();
});

function row(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: "2026-07-27T12:00:00+00:00",
    continuable: true,
    ...overrides,
  };
}

function stubRuns(runs: readonly RunRow[]): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ runs }) })),
  );
}

/** Mount with a fake agent, capturing the endpoint + seed of every agent built. */
function mount(
  withRunsUrl = true,
  script?: (emit: Emit) => void,
): {
  el: AgUiChat;
  built: {
    endpoint: string;
    initialMessages: readonly unknown[];
    headers: Record<string, string>;
  }[];
} {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (withRunsUrl) {
    el.setAttribute("data-runs-url", "/agent/runs/");
  }
  const built: {
    endpoint: string;
    initialMessages: readonly unknown[];
    headers: Record<string, string>;
  }[] = [];
  el.agentFactory = (options) => {
    built.push({
      endpoint: options.endpoint,
      initialMessages: options.initialMessages ?? [],
      // Invoked as the real factory's fetch wrapper does, per request — a
      // rotated CSRF/JWT must reach the resume endpoint too.
      headers: options.getHeaders?.() ?? {},
    });
    return makeFakeAgent({ script: script ?? ((emit: Emit) => emit.runEnd()) }).agent;
  };
  document.body.appendChild(el);
  return { el, built };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

beforeEach(() => {
  stubRuns([]);
});

describe("the header affordance", () => {
  it("appears when the host opted in", () => {
    const { el } = mount();
    expect(shadow(el).querySelector(".header-btn--checkpoints")).not.toBeNull();
  });

  it("is absent without data-runs-url", () => {
    // Nothing indexes runs, so the button would open a permanently empty panel.
    const { el } = mount(false);
    expect(shadow(el).querySelector(".header-btn--checkpoints")).toBeNull();
  });
});

describe("loading the panel", () => {
  it("shows only continuable runs", async () => {
    stubRuns([row(), row({ run_id: "r2", continuable: false })]);
    const { el } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    // Identified by the short id the row now shows, rather than by a `title` on
    // the label — which is where the full id used to hide.
    const listed = [...shadow(el).querySelectorAll<HTMLElement>(".checkpoint-id")].map(
      (n) => n.title,
    );
    expect(listed).toEqual(["r1"]);
  });

  it("opens the panel", async () => {
    const { el } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    expect((shadow(el).querySelector(".checkpoints") as HTMLElement).hidden).toBe(false);
  });
});

describe("continuing a run", () => {
  async function pick(verb: "resume" | "fork", text = "and now sort them") {
    stubRuns([row()]);
    const { el, built } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = text;
    (shadow(el).querySelector(`.checkpoint-${verb}`) as HTMLButtonElement).click();
    await flush();
    return { el, built, input };
  }

  it("posts to the resume endpoint for the picked run", async () => {
    const { built } = await pick("resume");
    expect(built.at(-1)?.endpoint).toBe("/agent/resume/r1/");
  });

  it("posts to the fork endpoint when forking", async () => {
    const { built } = await pick("fork");
    expect(built.at(-1)?.endpoint).toBe("/agent/fork/r1/");
  });

  it("seeds the continuation with no history at all", async () => {
    // The server supplies the prior turns from the snapshot; re-sending them
    // would duplicate. A fresh agent makes that structural.
    const { built } = await pick("resume");
    expect(built.at(-1)?.initialMessages).toEqual([]);
  });

  it("builds a separate agent, leaving the main one untouched", async () => {
    const { built } = await pick("resume");
    expect(built).toHaveLength(1);
    expect(built[0]?.endpoint).toBe("/agent/resume/r1/");
  });

  it("clears the composer", async () => {
    const { input } = await pick("resume");
    expect(input.value).toBe("");
  });

  it("sends nothing when the composer is empty", async () => {
    // A continuation carries only the new turn -- the snapshot supplies the
    // rest -- so with nothing typed there is nothing to send.
    const { built } = await pick("resume", "   ");
    expect(built).toHaveLength(0);
  });

  it("says what the composer still needs, rather than closing over nothing", async () => {
    // The row's button closes the panel before the pick is handled, so a bare
    // return left the widget visibly reacting and then doing nothing at all --
    // which reads as a resume that was attempted and lost.
    const { el } = await pick("resume", "   ");

    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe(DEFAULT_UI_STRINGS.continueNeedsTurn);
  });

  it("puts the caret where the fix goes", async () => {
    const { el, input } = await pick("resume", "");
    expect(shadow(el).activeElement).toBe(input);
  });

  it("takes the hint down on the next keystroke", async () => {
    // Self-clearing is why this lives at the composer and not in the transcript:
    // the slip is recoverable, and typing is the recovery.
    const { el, input } = await pick("resume", "");
    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    // Asserted before the keystroke, or this passes against a hint that was
    // never raised -- which is the very state this test is here to rule out.
    expect(hint?.hidden).toBe(false);

    input.value = "and now sort them";
    input.dispatchEvent(new Event("input"));

    expect(hint?.hidden).toBe(true);
  });
});

describe("when the host withdraws the endpoint", () => {
  it("treats an empty data-runs-url as unset", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "");
    document.body.appendChild(el);

    expect(shadow(el).querySelector(".header-btn--checkpoints")).toBeNull();
  });

  it("declines to continue once the attribute is removed", async () => {
    // The panel is already open with rows when the host drops the attribute —
    // picking a row must not fall back to the main agent endpoint.
    stubRuns([row()]);
    const { el, built } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    el.removeAttribute("data-runs-url");
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(built).toHaveLength(0);
  });

  it("empties the panel when refreshed with no endpoint", async () => {
    // Refreshed by the public method, not by a second press of the button: the
    // button toggles now, so pressing it twice closes the panel and refreshes
    // nothing — which left this test asserting an empty state that had been there
    // since the first open.
    stubRuns([row()]);
    const { el } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    expect(shadow(el).querySelectorAll(".checkpoint-row")).toHaveLength(1);

    el.removeAttribute("data-runs-url");
    el.openCheckpoints();
    await flush();

    expect(shadow(el).querySelector(".checkpoints-empty")).not.toBeNull();
    expect(shadow(el).querySelectorAll(".checkpoint-row")).toHaveLength(0);
  });
});

describe("headers", () => {
  it("gives the continuation a live header source", async () => {
    stubRuns([row()]);
    const { el, built } = mount();
    el.headers = { "X-CSRFToken": "rotated" };
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(built.at(-1)?.headers).toMatchObject({ "X-CSRFToken": "rotated" });
  });
});

describe("a resumed run behaves like any other", () => {
  async function resumeWith(script: (emit: Emit) => void) {
    stubRuns([row()]);
    const mounted = mount(true, script);
    (shadow(mounted.el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(mounted.el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    return mounted;
  }

  it("executes a frontend tool called during the continuation", async () => {
    const handler = vi.fn(async () => "42");
    let round = 0;
    const { el } = await resumeWith((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "count_users", { active: true });
      }
      round += 1;
      emit.runEnd();
    });
    el.registerTool({
      name: "count_users",
      description: "count",
      parameters: { type: "object" },
      handler,
    });
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(handler).toHaveBeenCalled();
  });

  it("surfaces an approval interrupt raised during the continuation", async () => {
    const { el } = await resumeWith((emit) => {
      emit.interrupt([
        {
          id: "i1",
          type: "tool_approval",
          toolCallId: "tc1",
          toolCallName: "delete_all",
          toolCallArgs: {},
        } as never,
      ]);
    });
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(shadow(el).querySelector(".approval")).not.toBeNull();
  });
});

describe("checkpoint panel focus management", () => {
  it("moves focus into the panel and restores it on close", async () => {
    // The thread drawer already did this; the checkpoint panel declared
    // role="dialog" and took no focus, so a keyboard user was left behind it.
    const { el } = mount();
    await flush();
    const toggle = shadow(el).querySelector<HTMLButtonElement>(".header-btn--checkpoints");
    toggle?.focus();

    toggle?.click();
    await flush();

    const panel = shadow(el).querySelector<HTMLElement>(".checkpoints");
    expect(panel?.hidden).toBe(false);
    expect(panel?.contains(shadow(el).activeElement)).toBe(true);

    shadow(el)
      .querySelector<HTMLElement>(".checkpoints")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flush();

    expect(panel?.hidden).toBe(true);
    expect(shadow(el).activeElement).toBe(toggle);
  });

  it("traps Tab inside the panel once it has rows", async () => {
    // Without the trap, Tab walks out of an open dialog into the transcript
    // behind it — reachable, invisible, and impossible to get back from.
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    const panel = shadow(el).querySelector<HTMLElement>(".checkpoints");
    const buttons = [...(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    expect(buttons.length).toBeGreaterThan(1);

    buttons[buttons.length - 1]?.focus();
    panel?.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(shadow(el).activeElement).toBe(buttons[0]);

    buttons[0]?.focus();
    panel?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
    );
    expect(shadow(el).activeElement).toBe(buttons[buttons.length - 1]);
  });

  it("lets Tab move normally in the middle of the panel", async () => {
    // Only the edges wrap; trapping every Tab would stop a user reaching the
    // second row at all.
    const { el } = mount();
    await flush();
    stubRuns([row(), row({ run_id: "r2" })]);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    const panel = shadow(el).querySelector<HTMLElement>(".checkpoints");
    const buttons = [...(panel?.querySelectorAll<HTMLButtonElement>("button") ?? [])];

    buttons[1]?.focus();
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    panel?.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(shadow(el).activeElement).toBe(buttons[1]);
  });

  it("ignores other keys", async () => {
    const { el } = mount();
    await flush();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    const panel = shadow(el).querySelector<HTMLElement>(".checkpoints");

    panel?.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(panel?.hidden).toBe(false);
  });
});

describe("dismissing the panel", () => {
  /**
   * The ⭯ button opened the panel and had no way to close it: pressing it again
   * called `open()` on an already-open panel, which returns early. Escape worked
   * and picking an action worked, so the one gesture a person tries first was the
   * one that did nothing.
   */
  it("closes on a second press of the button that opened it", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    const button = shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement;

    button.click();
    await flush();
    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);

    button.click();
    await flush();
    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
  });

  it("reopens on the press after that", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    const button = shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement;

    button.click();
    await flush();
    button.click();
    await flush();
    button.click();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);
  });

  it("closes when the pointer goes down anywhere else in the widget", async () => {
    // The drawer has a backdrop that swallows the click; this popover has none,
    // so without this it could only be dismissed by answering it or by Escape.
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    shadow(el)
      .querySelector(".messages")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
  });

  it("stays open when the pointer goes down inside it", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    shadow(el)
      .querySelector(".checkpoints-title")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);
  });

  it("does not fight the button it is dismissed by", async () => {
    // pointerdown on the button would close the panel before the button's own
    // click toggled it back open, so a press would look like it did nothing.
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    const button = shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement;
    button.click();
    await flush();

    button.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);
  });

  it("ignores a pointer that goes down while it is already closed", async () => {
    const { el } = mount();
    await flush();

    shadow(el)
      .querySelector(".messages")
      ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
  });

  it("closes from the host's own call", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    el.openCheckpoints();
    await flush();

    el.closeCheckpoints();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
  });
});

describe("opening the panel without an endpoint", () => {
  it("renders the empty state rather than asking a URL that is not there", async () => {
    // No `data-runs-url`, so the built-in button is never rendered — but the
    // method behind it is public and documented, and it has to answer somehow.
    const { el } = mount(false);
    await flush();

    el.openCheckpoints();
    await flush();

    const panel = shadow(el).querySelector<HTMLElement>(".checkpoints");
    expect(panel?.hidden).toBe(false);
    expect(panel?.querySelector(".checkpoints-empty")).not.toBeNull();
    expect(panel?.querySelectorAll(".checkpoint-row")).toHaveLength(0);
  });
});

describe("the two overlapping surfaces", () => {
  /**
   * The drawer and the checkpoint popover both float over the transcript, and the
   * built-in buttons sit next to each other. Clicking away covers the pointer
   * case; these cover the host-driven one, where no pointer event is raised and
   * the drawer would otherwise open underneath a popover still floating over it.
   */
  it("closes the checkpoints panel when the thread drawer is opened", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    el.openCheckpoints();
    await flush();
    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);

    el.openThreads();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
  });

  it("closes the thread drawer when the checkpoints panel is opened", async () => {
    const { el } = mount();
    await flush();
    el.openThreads();
    await flush();
    expect(shadow(el).querySelector<HTMLElement>(".drawer")?.hidden).toBe(false);

    el.openCheckpoints();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".drawer")?.hidden).toBe(true);
  });

  it("closes the popover when the drawer's own button is pressed", async () => {
    const { el } = mount();
    await flush();
    stubRuns([row()]);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    (shadow(el).querySelector(".header-btn--history") as HTMLButtonElement).click();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(true);
    expect(shadow(el).querySelector<HTMLElement>(".drawer")?.hidden).toBe(false);
  });
});

describe("a continuation is the run in flight", () => {
  /**
   * Continue a run whose stream is held open until the test releases it.
   *
   * Every agent the element builds is recorded, because the continuation's is
   * the one that has to be stopped and the conversation's own is not. Once
   * released, the script delivers the rest of its answer only if nothing
   * aborted it -- which is what a real agent does, since an abort closes the
   * request the rest would have arrived on.
   */
  async function continueHeld(): Promise<{
    el: AgUiChat;
    agents: FakeAgentHandle[];
    release: () => void;
  }> {
    stubRuns([row()]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    const agents: FakeAgentHandle[] = [];
    el.agentFactory = () => {
      const handle = makeFakeAgent({
        script: async (emit) => {
          emit.runStart();
          await gate;
          if (handle.abortRuns === 0) {
            emit.text("the rest of the resumed answer");
          }
        },
      });
      agents.push(handle);
      return handle.agent;
    };
    document.body.appendChild(el);
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();
    return { el, agents, release };
  }

  function sendButton(el: AgUiChat): HTMLButtonElement {
    return shadow(el).querySelector(".send") as HTMLButtonElement;
  }

  it("offers Stop while it runs", async () => {
    const { el, release } = await continueHeld();
    expect(sendButton(el).title).toBe(DEFAULT_UI_STRINGS.stop);
    release();
    await flush();
  });

  it("stops when Stop is pressed", async () => {
    // The button read Stop and pressing it did nothing: the element cancelled
    // only the conversation's own client, and a continuation runs on another.
    const { el, agents, release } = await continueHeld();

    sendButton(el).click();
    release();
    await flush();

    expect(agents.map((agent) => agent.abortRuns)).toEqual([1]);
    expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
    expect(shadow(el).textContent).not.toContain("the rest of the resumed answer");
    expect(sendButton(el).title).toBe(DEFAULT_UI_STRINGS.send);
  });

  it("stops when a new chat starts, and leaves the new conversation empty", async () => {
    const { el, agents, release } = await continueHeld();

    el.newChat();
    release();
    await flush();

    expect(agents.map((agent) => agent.abortRuns)).toEqual([1]);
    // Nothing the abandoned run does afterwards belongs to the conversation
    // that replaced it -- not its answer, and not the note saying it stopped.
    expect(shadow(el).querySelector(".message--assistant")).toBeNull();
    expect(shadow(el).querySelector(".stopped-note")).toBeNull();
  });

  it("stops when another conversation is opened", async () => {
    const { el, agents, release } = await continueHeld();
    el.conversationStore.saveMessages("elsewhere", [
      { id: "u1", role: "user", content: "another conversation" },
    ] as never);

    (shadow(el).querySelector(".header-btn--history") as HTMLButtonElement).click();
    await flush();
    const rows = [...shadow(el).querySelectorAll<HTMLButtonElement>(".drawer-row-select")];
    rows.find((button) => button.textContent?.includes("another conversation"))?.click();
    release();
    await flush();

    expect(el.conversationStore.threadId()).toBe("elsewhere");
    expect(agents.map((agent) => agent.abortRuns)).toEqual([1]);
    expect(shadow(el).textContent).not.toContain("the rest of the resumed answer");
  });

  it("stops when the element is removed", async () => {
    const { el, agents, release } = await continueHeld();

    el.remove();
    release();
    await flush();

    expect(agents.map((agent) => agent.abortRuns)).toEqual([1]);
  });
});

describe("a continuation is built like the conversation's own client", () => {
  /** Mount with `attrs`, capturing the options every agent is built with. */
  function mountBuilt(
    script: (emit: Emit) => void,
    attrs: Record<string, string> = {},
  ): { el: AgUiChat; built: AgentOptions[] } {
    stubRuns([row()]);
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    for (const [name, value] of Object.entries(attrs)) {
      el.setAttribute(name, value);
    }
    const built: AgentOptions[] = [];
    el.agentFactory = (options) => {
      built.push(options);
      return makeFakeAgent({ script, initialState: { ...(options.initialState ?? {}) } }).agent;
    };
    document.body.appendChild(el);
    return { el, built };
  }

  async function resume(el: AgUiChat): Promise<void> {
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    // Past every round a run can take, rather than a fixed count of microtasks:
    // each round awaits a tool handler, so a short flush stops counting early
    // and would agree with any bound at all.
    for (let i = 0; i < 20; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it("stops at the host's tool-round bound, not the built-in one", async () => {
    // A page-driving deployment raises the bound because filling a form takes
    // a round per field; the resumed half of that same task stopped at ten.
    let rounds = 0;
    const { el } = mountBuilt(
      (emit) => {
        rounds += 1;
        emit.toolCall(`tc${rounds}`, "fill_field", {});
      },
      { "data-max-tool-rounds": "3" },
    );
    el.registerTool({
      name: "fill_field",
      description: "fill a field",
      parameters: { type: "object" },
      handler: () => "filled",
    });

    await resume(el);

    expect(rounds).toBe(3);
  });

  it("sends the conversation's shared state", async () => {
    // State rides every run's input. A resumed run sent an empty object, so an
    // agent whose tools read the page's state resumed without it.
    const { el, built } = mountBuilt((emit) => emit.runEnd());
    el.sharedState = { board: "sprint-12" };

    await resume(el);

    expect(built.at(-1)?.initialState).toEqual({ board: "sprint-12" });
  });

  it("tells the host when it changes shared state", async () => {
    const { el } = mountBuilt((emit) => emit.state({ board: "sprint-13" }));
    const states: unknown[] = [];
    el.addEventListener(STATE_EVENT, (event) => {
      states.push((event as CustomEvent<{ state: unknown }>).detail.state);
    });

    await resume(el);

    expect(states).toEqual([{ board: "sprint-13" }]);
  });

  it("reads the shared state it changed while it runs, not the conversation's", async () => {
    // The conversation's own client has to exist for this to mean anything:
    // without one the getter read the element's mirror, which every client
    // writes. A message sent first builds it, holding the state as assigned.
    stubRuns([row()]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    const agents: FakeAgentHandle[] = [];
    el.agentFactory = (options) => {
      const continuing = options.endpoint !== "/agent/";
      const handle = makeFakeAgent({
        initialState: { ...(options.initialState ?? {}) },
        script: async (emit) => {
          emit.runStart();
          if (continuing) {
            emit.state({ board: "sprint-13" });
            await gate;
          }
        },
      });
      agents.push(handle);
      return handle.agent;
    };
    document.body.appendChild(el);
    el.sharedState = { board: "sprint-12" };
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "what is on the board?";
    (shadow(el).querySelector(".send") as HTMLButtonElement).click();
    await flush();

    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    input.value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(el.sharedState).toEqual({ board: "sprint-13" });

    // A value the host assigns meanwhile reaches the run that is going, whose
    // next round sends it, and reads back as what was assigned.
    el.sharedState = { board: "sprint-14" };
    expect(agents.at(-1)?.agent.state).toEqual({ board: "sprint-14" });
    expect(el.sharedState).toEqual({ board: "sprint-14" });

    release();
    await flush();
  });
});

/**
 * A store that serialises, as the built-in one does, and keeps one list per
 * thread -- which is the property a continuation's save has to respect.
 */
function memoryStore(seed: Record<string, readonly Message[]> = {}): ClientConversationStore & {
  saved: (threadId: string) => readonly Message[] | null;
} {
  const copy = (messages: readonly Message[]): Message[] =>
    JSON.parse(JSON.stringify(messages)) as Message[];
  const threads = new Map(Object.entries(seed).map(([id, messages]) => [id, copy(messages)]));
  let active = "t1";
  let minted = 1;
  return {
    saved: (threadId) => {
      const messages = threads.get(threadId);
      return messages === undefined ? null : copy(messages);
    },
    threadId: () => active,
    newThread: () => {
      minted += 1;
      active = `t${minted}`;
      return active;
    },
    setActiveThread: (threadId) => {
      active = threadId;
    },
    loadMessages: (threadId) => {
      const messages = threads.get(threadId);
      return Promise.resolve(messages === undefined ? null : copy(messages));
    },
    saveMessages: (threadId, messages) => {
      threads.set(threadId, copy(messages));
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: (threadId) => {
      threads.delete(threadId);
    },
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

/** Each message's role and text, which is what these assertions are about. */
function turns(messages: readonly Message[] | null | undefined): [string, unknown][] {
  return (messages ?? []).map((message) => [message.role, message.content]);
}

/** Macrotask ticks: the real `HttpAgent` hands events on across timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** A run request as the real `HttpAgent` put it on the wire. */
interface SentRun {
  readonly url: string;
  readonly body: { readonly messages: readonly Message[]; readonly state: unknown };
}

/**
 * Stand in for the server: the run index lists one continuable run, and every
 * run request is recorded and answered with the events `reply` gives it for
 * that URL, framed as the SSE stream an AG-UI endpoint writes.
 */
function stubServer(reply: (url: string) => readonly Record<string, unknown>[]): SentRun[] {
  const sent: SentRun[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method !== "POST") {
        return { ok: true, json: async () => ({ runs: [row()] }) };
      }
      sent.push({ url, body: JSON.parse(String(init.body)) as SentRun["body"] });
      const runId = `run-${sent.length}`;
      const events = [
        { type: "RUN_STARTED", threadId: "t1", runId },
        ...reply(url),
        { type: "RUN_FINISHED", threadId: "t1", runId },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return sent;
}

/** The events of one complete assistant text message. */
function says(messageId: string, text: string): Record<string, unknown>[] {
  return [
    { type: "TEXT_MESSAGE_START", messageId, role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId, delta: text },
    { type: "TEXT_MESSAGE_END", messageId },
  ];
}

/** Type `text` and press Send. */
function sendTurn(el: AgUiChat, text: string): void {
  (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = text;
  (shadow(el).querySelector(".send") as HTMLButtonElement).click();
}

/** Open the checkpoint panel, type `text`, and resume the listed run. */
async function resumeWith(el: AgUiChat, text: string): Promise<void> {
  (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
  await flush();
  (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = text;
  (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
}

describe("a continuation waits for the run in flight", () => {
  /**
   * Mount with every run held open until released, recording each agent built
   * and the endpoint it was built for. Once released, a run delivers the rest
   * of its answer only if nothing aborted it, as a real agent would.
   *
   * The first event arrives a microtask after the run starts, as it does from
   * `HttpAgent`, which awaits its subscribers before any of them hears of the
   * run. A fake that announced it synchronously would close the gap one of the
   * guards exists for.
   */
  function mountHeld(): {
    el: AgUiChat;
    agents: { endpoint: string; handle: FakeAgentHandle }[];
    release: () => void;
  } {
    stubRuns([row()]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    const agents: { endpoint: string; handle: FakeAgentHandle }[] = [];
    el.agentFactory = (options) => {
      const handle = makeFakeAgent({
        script: async (emit) => {
          await Promise.resolve();
          emit.runStart();
          await gate;
          if (handle.abortRuns === 0) {
            emit.text("the rest of the answer");
          }
        },
      });
      agents.push({ endpoint: options.endpoint, handle });
      return handle.agent;
    };
    document.body.appendChild(el);
    return { el, agents, release: () => release() };
  }

  it("does not start while the conversation's own run is streaming", async () => {
    // It would stream a second answer into the turn that is still arriving,
    // and Stop would reach only one of the two.
    const { el, agents, release } = mountHeld();
    sendTurn(el, "what is on the board?");
    await flush();

    await resumeWith(el, "go on");
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual(["/agent/"]);
    release();
    await flush();
  });

  it("does not start over a continuation still streaming, which Stop then still reaches", async () => {
    // Starting the second replaced the one the element keeps for Stop, so the
    // first streamed on where nothing could end it.
    const { el, agents, release } = mountHeld();
    await resumeWith(el, "go on");
    await flush();

    await resumeWith(el, "and faster");
    await flush();
    (shadow(el).querySelector(".send") as HTMLButtonElement).click();
    release();
    await flush();

    expect(agents.map((agent) => [agent.endpoint, agent.handle.abortRuns])).toEqual([
      ["/agent/resume/r1/", 1],
    ]);
    expect(shadow(el).textContent).not.toContain("the rest of the answer");
  });

  it("lets go of a continuation whose first save threw", async () => {
    // `conversationStore` is the host's to replace, and nothing promises its
    // writes succeed: the built-in one swallows a write the browser refused, a
    // server-backed one need not. The first save runs synchronously inside the
    // send, so the throw comes back out before any run starts -- and the
    // element went on holding a client that would never run. Every later pick
    // was refused for it, with no way to clear it: the composer's button is
    // Send until a run reports a start, so Stop was never offered.
    const { el, agents, release } = mountHeld();
    // The store the element actually uses, with its one write made to fail.
    // Patched in place rather than wrapped in a literal: a store is a class
    // instance, so a spread copies none of its prototype methods and the
    // element loses every one it does not go on to call in this test.
    const store = el.conversationStore;
    const write = store.saveMessages.bind(store);
    let offline = true;
    store.saveMessages = (threadId, messages) => {
      if (offline) {
        throw new Error("the store is offline");
      }
      write(threadId, messages);
    };

    await resumeWith(el, "go on");
    await flush();
    offline = false;

    await resumeWith(el, "and then?");
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual([
      "/agent/resume/r1/",
      "/agent/resume/r1/",
    ]);
    release();
    await flush();
  });

  it("parks a turn typed before the continuation's run has begun", async () => {
    // The composer learns a run is going from its first event, a request round
    // trip behind the pick, so its button is still Send. A turn typed in that
    // window started a second run of its own -- against the conversation the
    // continuation froze when it was picked, so whichever saved last dropped
    // the other's turn from the store, while both answers streamed into one
    // transcript.
    const { el, agents, release } = mountHeld();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    // Not awaited, which is the whole window: one microtask later the run has
    // reported its start and the button is Stop, so a test that waited here
    // would be checking the guard that already worked.
    sendTurn(el, "actually, do X");
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual(["/agent/resume/r1/"]);
    expect(shadow(el).querySelector<HTMLElement>(".queued")?.hidden).toBe(false);

    // And it is parked rather than dropped: the continuation settling is what
    // sends it, through the same path every other queued turn takes.
    release();
    await flush();
    expect(agents.map((agent) => agent.endpoint)).toEqual(["/agent/resume/r1/", "/agent/"]);
  });

  it("no-ops a scripted send in the same window", async () => {
    // `sendMessage` is the programmatic half of the composer and goes nowhere
    // near it, so the parking above does not cover a host driving its own
    // input. It returns instead of queueing, as it already does during a run:
    // the caller still holds what it tried to send, which a queue would take
    // from it.
    const { el, agents, release } = mountHeld();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "go on";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();

    await el.sendMessage("actually, do X");
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual(["/agent/resume/r1/"]);
    release();
    await flush();
  });

  it("does not start over one picked a moment ago, before its run has begun", async () => {
    // The composer learns a run is going from its first event, which is behind
    // the pick. A host driving the rows can land a second pick in that gap.
    const { el, agents, release } = mountHeld();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    const resume = shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement;

    input.value = "go on";
    resume.click();
    input.value = "and faster";
    resume.click();
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual(["/agent/resume/r1/"]);
    release();
    await flush();
  });

  it("says why at the composer, and keeps the turn that was typed for it", async () => {
    // The row closes the panel before the pick is handled, so a refusal with
    // nothing to show for it reads as a resume that was attempted and lost.
    // And the text is the user's next turn, still wanted once the run is done.
    const { el, release } = mountHeld();
    sendTurn(el, "what is on the board?");
    await flush();

    await resumeWith(el, "go on");
    await flush();

    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toBe(DEFAULT_UI_STRINGS.continueWhileRunning);
    expect(input.value).toBe("go on");
    expect(shadow(el).activeElement).toBe(input);
    release();
    await flush();
  });

  it("starts once the run it waited for has settled", async () => {
    // The refusal lasts as long as the run and no longer: a guard that is never
    // lifted would turn the panel off for the rest of the page.
    const { el, agents, release } = mountHeld();
    await resumeWith(el, "go on");
    await flush();
    release();
    await flush();

    await resumeWith(el, "and then?");
    await flush();

    expect(agents.map((agent) => agent.endpoint)).toEqual([
      "/agent/resume/r1/",
      "/agent/resume/r1/",
    ]);
  });
});

describe("a continued exchange joins the conversation", () => {
  const conversation: readonly Message[] = [
    { id: "u1", role: "user", content: "what is on the board?" },
    { id: "a1", role: "assistant", content: "three cards" },
  ];

  /** Mount over `store`, with the checkpoint panel configured. */
  function mountOver(store: ClientConversationStore): AgUiChat {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    el.conversationStore = store;
    document.body.appendChild(el);
    return el;
  }

  it("is saved after the conversation it continues", async () => {
    // A store keeps one list per thread, and the continuation's own history is
    // only the turn it adds. Unsaved, a reload brought the conversation back
    // without the exchange the user had just watched arrive.
    stubServer((url) => (url === "/agent/resume/r1/" ? says("a2", "the resumed answer") : []));
    const store = memoryStore({ t1: conversation });
    const el = mountOver(store);
    await settle();

    await resumeWith(el, "go on");
    await settle();

    expect(turns(store.saved("t1"))).toEqual([
      ["user", "what is on the board?"],
      ["assistant", "three cards"],
      ["user", "go on"],
      ["assistant", "the resumed answer"],
    ]);
  });

  it("goes out with the next ordinary message", async () => {
    // The conversation's own client never held the exchange, so the next
    // message went to the agent without the turn it was a reply to.
    const sent = stubServer((url) =>
      url === "/agent/resume/r1/" ? says("a2", "the resumed answer") : says("a3", "done"),
    );
    const el = mountOver(memoryStore({ t1: conversation }));
    await settle();
    await resumeWith(el, "go on");
    await settle();

    sendTurn(el, "and then?");
    await settle();

    expect(sent.map((run) => run.url)).toEqual(["/agent/resume/r1/", "/agent/"]);
    expect(turns(sent.at(-1)?.body.messages)).toEqual([
      ["user", "what is on the board?"],
      ["assistant", "three cards"],
      ["user", "go on"],
      ["assistant", "the resumed answer"],
      ["user", "and then?"],
    ]);
  });

  it("keeps how an earlier call ended, in a conversation sent in this page", async () => {
    // Here the conversation lives in a client this page built rather than in a
    // restore, and a declined call's outcome rides in its result's metadata.
    // Saving anything but the messages as that client holds them ahead of the
    // exchange would turn the declined card green on the next reload. And it is
    // that client which the next message would have gone out on, without the
    // exchange.
    let posts = 0;
    const sent = stubServer((url) => {
      posts += 1;
      if (url === "/agent/resume/r1/") {
        return says("a2", "the resumed answer");
      }
      return posts === 1
        ? [
            { type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "delete_user" },
            { type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: '{"id":7}' },
            { type: "TOOL_CALL_END", toolCallId: "tc1" },
          ]
        : says(`a${posts}`, "left alone");
    });
    const store = memoryStore();
    const el = mountOver(store);
    el.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => "deleted",
    });
    await settle();
    sendTurn(el, "delete user 7");
    await settle();
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await settle();

    await resumeWith(el, "go on");
    await settle();

    const saved = store.saved("t1");
    expect(turns(saved).slice(-2)).toEqual([
      ["user", "go on"],
      ["assistant", "the resumed answer"],
    ]);
    const declined = saved?.find((message) => message.role === "tool");
    expect(declined?.metadata).toEqual({ outcome: TOOL_OUTCOME.DENIED });

    sendTurn(el, "and then?");
    await settle();
    const request = sent.at(-1)?.body.messages;
    expect(sent.at(-1)?.url).toBe("/agent/");
    expect(turns(request).slice(-3)).toEqual([
      ["user", "go on"],
      ["assistant", "the resumed answer"],
      ["user", "and then?"],
    ]);
    // Carried there as a save writes it: in the result's metadata, which the
    // protocol declares, and never at the top level, which 1.0 would strip.
    const tool = request?.find((message) => message["role"] === "tool");
    expect(tool).toMatchObject({ metadata: { outcome: TOOL_OUTCOME.DENIED } });
    expect(tool).not.toHaveProperty("outcome");
  });

  /**
   * Mount over a store holding the conversation, with every run held open
   * until released, recording the options each agent is built with. Each fake
   * starts from the history it is seeded with, as a real agent does, so what a
   * client saves is measured against what the element gave it.
   */
  async function mountHeldOver(store: ClientConversationStore): Promise<{
    el: AgUiChat;
    built: AgentOptions[];
    release: () => void;
  }> {
    stubRuns([row()]);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-runs-url", "/agent/runs/");
    el.conversationStore = store;
    const built: AgentOptions[] = [];
    el.agentFactory = (options) => {
      built.push(options);
      const { agent } = makeFakeAgent({
        script: async (emit) => {
          emit.runStart();
          await gate;
        },
      });
      agent.setMessages([...(options.initialMessages ?? [])]);
      return agent;
    };
    document.body.appendChild(el);
    await flush();
    return { el, built, release: () => release() };
  }

  it("stopped part-way, is kept as far as it got", async () => {
    // As a stopped ordinary run is: its turn stays in the conversation, saved
    // and sent with the next message.
    const store = memoryStore({ t1: conversation });
    const { el, built, release } = await mountHeldOver(store);
    await resumeWith(el, "go on");
    await flush();

    (shadow(el).querySelector(".send") as HTMLButtonElement).click();
    release();
    await flush();
    sendTurn(el, "and then?");
    await flush();

    expect(built.map((options) => options.endpoint)).toEqual(["/agent/resume/r1/", "/agent/"]);
    expect(turns(built.at(-1)?.initialMessages)).toEqual([
      ["user", "what is on the board?"],
      ["assistant", "three cards"],
      ["user", "go on"],
    ]);
    expect(turns(store.saved("t1"))).toEqual([
      ["user", "what is on the board?"],
      ["assistant", "three cards"],
      ["user", "go on"],
      ["user", "and then?"],
    ]);
  });

  it("stays with its own conversation when a new chat replaces it mid-run", async () => {
    // A stopped run saves once its request closes, which can be after New chat.
    // That save belongs to the thread the run continued, and nothing of it
    // belongs in the conversation that replaced it.
    const store = memoryStore({ t1: conversation });
    const { el, built, release } = await mountHeldOver(store);
    await resumeWith(el, "go on");
    await flush();

    el.newChat();
    release();
    await flush();
    sendTurn(el, "a new question");
    await flush();

    expect(turns(store.saved("t1"))).toEqual([
      ["user", "what is on the board?"],
      ["assistant", "three cards"],
      ["user", "go on"],
    ]);
    expect(built.at(-1)?.initialMessages).toEqual([]);
    expect(turns(store.saved("t2"))).toEqual([["user", "a new question"]]);
  });

  it("leaves its shared state for the next ordinary message to send", async () => {
    // The conversation's own client held the state as it was before the
    // continuation changed it, and sent that.
    let answers = 0;
    const sent = stubServer((url) => {
      answers += 1;
      return url === "/agent/resume/r1/"
        ? [{ type: "STATE_SNAPSHOT", snapshot: { board: "sprint-13" } }]
        : says(`a${answers}`, "noted");
    });
    const el = mountOver(memoryStore());
    el.sharedState = { board: "sprint-12" };
    await settle();
    sendTurn(el, "what is on the board?");
    await settle();

    await resumeWith(el, "go on");
    await settle();
    expect(el.sharedState).toEqual({ board: "sprint-13" });

    sendTurn(el, "and then?");
    await settle();
    expect(sent.at(-1)?.url).toBe("/agent/");
    expect(sent.at(-1)?.body.state).toEqual({ board: "sprint-13" });
  });
});
