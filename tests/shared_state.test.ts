import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, STATE_EVENT } from "../src/constants.js";
import type { AgUiChat, StateDetail } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

/** Mount with a fake agent, capturing the `initialState` every agent is built with. */
function mount(script?: (emit: Emit) => void): {
  el: AgUiChat;
  seeded: unknown[];
  built: ReturnType<typeof makeFakeAgent>[];
} {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const seeded: unknown[] = [];
  const built: ReturnType<typeof makeFakeAgent>[] = [];
  el.agentFactory = (options) => {
    seeded.push(options.initialState);
    const handle = makeFakeAgent({
      script: script ?? ((emit: Emit) => emit.runEnd()),
      initialState: { ...((options.initialState ?? {}) as Record<string, unknown>) },
    });
    built.push(handle);
    return handle.agent;
  };
  document.body.appendChild(el);
  return { el, seeded, built };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const shadow = el.shadowRoot as ShadowRoot;
  const input = shadow.querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow.querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

describe("seeding", () => {
  it("starts empty", () => {
    const { el } = mount();
    expect(el.sharedState).toEqual({});
  });

  it("seeds the agent with what the host assigned before the first run", async () => {
    const { el, seeded } = mount();
    el.sharedState = { document: "draft" };

    await send(el, "hi");

    expect(seeded).toEqual([{ document: "draft" }]);
  });

  it("copies on assignment, so a host mutating its object later can't leak in", () => {
    const { el } = mount();
    const source = { document: "draft" };
    el.sharedState = source;
    source.document = "mutated";

    expect(el.sharedState).toEqual({ document: "draft" });
  });
});

describe("when the server changes state mid-run", () => {
  const snapshot = (emit: Emit) => {
    emit.state({ document: "written by the agent" });
    emit.runEnd();
  };

  it("reflects the applied state", async () => {
    const { el } = mount(snapshot);
    await send(el, "write something");

    expect(el.sharedState).toEqual({ document: "written by the agent" });
  });

  it("tells the host, so it can re-render", async () => {
    const { el } = mount(snapshot);
    const seen: StateDetail[] = [];
    el.addEventListener(STATE_EVENT, (event) => {
      seen.push((event as CustomEvent<StateDetail>).detail);
    });

    await send(el, "write something");

    expect(seen.at(-1)?.state).toEqual({ document: "written by the agent" });
  });

  it("the event escapes the shadow root", async () => {
    // `composed: true` — a host listening on document must receive it.
    const { el } = mount(snapshot);
    const onDocument = vi.fn();
    document.addEventListener(STATE_EVENT, onDocument);

    await send(el, "write something");
    document.removeEventListener(STATE_EVENT, onDocument);

    expect(onDocument).toHaveBeenCalled();
  });
});

describe("assigning after a run has started", () => {
  it("pushes through to the live agent rather than waiting for a new one", async () => {
    // The client is built once per conversation, so a naive implementation
    // would strand a host that sets state after the first message.
    const { el, built } = mount();
    await send(el, "hi");

    el.sharedState = { document: "set later" };

    expect(built.at(-1)?.agent.state).toEqual({ document: "set later" });
  });
});
