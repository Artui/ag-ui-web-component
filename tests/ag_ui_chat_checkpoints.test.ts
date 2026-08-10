import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../src/core/run_index.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

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

    const labels = [...shadow(el).querySelectorAll<HTMLElement>(".checkpoint-label")].map(
      (n) => n.title,
    );
    expect(labels).toEqual(["r1"]);
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

  it("does nothing when the composer is empty", async () => {
    const { built } = await pick("resume", "   ");
    expect(built).toHaveLength(0);
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
    const { el } = mount();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    el.removeAttribute("data-runs-url");
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();

    expect(shadow(el).querySelector(".checkpoints-empty")).not.toBeNull();
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
