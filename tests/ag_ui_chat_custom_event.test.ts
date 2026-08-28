/**
 * The imperative carrier, forwarded whole.
 *
 * AG-UI has exactly two carriers whose payload name is an open string the
 * protocol does not enumerate. `ACTIVITY_SNAPSHOT` carries transcript
 * **content**; `CUSTOM` carries an **imperative** with no place in the
 * transcript. The component implemented no `CUSTOM` branch at all, so the
 * server could only say things the client had been compiled to understand -- in
 * a protocol whose whole design intent is that it can say more.
 *
 * The asymmetry is also the design rule, and these assert it: an activity is
 * materialised, persisted and replayed; a custom event is dispatched and then
 * forgotten, because replaying "refetch the board" on every thread load is a
 * bug rather than a feature.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { CUSTOM_AGENT_EVENT, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat, CustomAgentDetail } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

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

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

function listen(el: AgUiChat): CustomAgentDetail[] {
  const seen: CustomAgentDetail[] = [];
  el.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
    seen.push((event as CustomEvent<CustomAgentDetail>).detail);
  });
  return seen;
}

describe("an AG-UI CUSTOM event", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reaches the host page", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("invalidate", { resources: ["orders"] });
    });
    const seen = listen(el);

    await send(el, "hi");

    expect(seen).toEqual([{ name: "invalidate", value: { resources: ["orders"] } }]);
  });

  it("forwards a name the component has never heard of", async () => {
    // The whole point of an open field. A component that decided which names
    // were legal would be the thing the open field exists to avoid.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("something.nobody.wrote.a.branch.for", 42);
    });
    const seen = listen(el);

    await send(el, "hi");

    expect(seen.map((d) => d.name)).toEqual(["something.nobody.wrote.a.branch.for"]);
  });

  it("passes the value through unparsed, whatever shape it is", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("a", null);
      emit.custom("b", "plain string");
      emit.custom("c", [1, 2, 3]);
    });
    const seen = listen(el);

    await send(el, "hi");

    expect(seen.map((d) => d.value)).toEqual([null, "plain string", [1, 2, 3]]);
  });

  it("crosses the shadow boundary, so a host listens on the element", async () => {
    // bubbles + composed, like every other event the element dispatches. A host
    // cannot reach inside the shadow root to listen.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("invalidate", {});
    });
    const seen: string[] = [];
    document.body.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
      seen.push((event as CustomEvent<CustomAgentDetail>).detail.name);
    });

    await send(el, "hi");

    expect(seen).toEqual(["invalidate"]);
  });

  it("puts nothing in the transcript", async () => {
    // It is an imperative, not content. Anything rendered here would also be
    // persisted and replayed, which is the bug the carrier split exists to
    // prevent.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("invalidate", { resources: ["orders"] });
      emit.textStart("m1");
      emit.textEnd("done", "m1");
    });

    await send(el, "hi");

    const transcript = shadow(el).querySelector(".messages")?.textContent ?? "";
    expect(transcript).not.toContain("invalidate");
    expect(transcript).toContain("done");
  });

  it("stays quiet on a run that sends none", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("done", "m1");
    });
    const seen = listen(el);

    await send(el, "hi");

    expect(seen).toEqual([]);
  });
});
