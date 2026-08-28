/**
 * Telling the host page what the agent moved.
 *
 * `ag-ui-run-finished` already said *something* moved and every gallery
 * frontend already refetched on it, so this is precision on a channel that
 * ships. The design property being asserted here is that nothing negotiates:
 * an old server and a new client, or a new server and an old client, both fall
 * back to the coarse refetch that shipped before either.
 *
 * An invalidation rides `CUSTOM` rather than `ACTIVITY_SNAPSHOT` because it is
 * an imperative, not content. Activities are materialised into messages,
 * persisted and replayed on every thread restore -- which for an invalidation is
 * a refetch storm. That absence is asserted.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  CUSTOM_AGENT_EVENT,
  ELEMENT_TAG,
  INVALIDATE_CUSTOM_NAME,
  INVALIDATE_EVENT,
  RUN_FINISHED_EVENT,
} from "../src/constants.js";
import type { AgUiChat, InvalidateDetail, RunFinishedDetail } from "../src/core/ag_ui_chat.js";
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

function invalidations(el: AgUiChat): InvalidateDetail[] {
  const seen: InvalidateDetail[] = [];
  el.addEventListener(INVALIDATE_EVENT, (event) => {
    seen.push((event as CustomEvent<InvalidateDetail>).detail);
  });
  return seen;
}

function runFinishes(el: AgUiChat): RunFinishedDetail[] {
  const seen: RunFinishedDetail[] = [];
  el.addEventListener(RUN_FINISHED_EVENT, (event) => {
    seen.push((event as CustomEvent<RunFinishedDetail>).detail);
  });
  return seen;
}

function announce(keys: string[], reason: string | null = null): unknown {
  return { keys, reason };
}

describe("an invalidation arriving during the run", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("reaches the host as soon as it is announced", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders", "orders/42"], "place_order"));
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen).toEqual([{ keys: ["orders", "orders/42"], reason: "place_order" }]);
  });

  it("fires per announcement, not once at the end", async () => {
    // The point of the live event: a long multi-step run refreshes the list as
    // its third write lands, not five minutes later.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["a"]));
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["b"]));
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["c"]));
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen.map((d) => d.keys)).toEqual([["a"], ["b"], ["c"]]);
  });

  it("reports a missing reason as null rather than undefined", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, { keys: ["orders"] });
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen[0]?.reason).toBeNull();
  });

  it("crosses the shadow boundary", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders"]));
    });
    const seen: string[][] = [];
    document.body.addEventListener(INVALIDATE_EVENT, (event) => {
      seen.push([...(event as CustomEvent<InvalidateDetail>).detail.keys]);
    });

    await send(el, "hi");

    expect(seen).toEqual([["orders"]]);
  });

  it("puts nothing in the transcript", async () => {
    // An imperative, not content. Anything rendered here would also be persisted
    // and replayed, and an invalidation replayed on every thread load is a
    // refetch storm -- which is the whole reason it rides CUSTOM.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders"], "place_order"));
      emit.textStart("m1");
      emit.textEnd("Ordered.", "m1");
    });

    await send(el, "hi");

    const transcript = shadow(el).querySelector(".messages")?.textContent ?? "";
    expect(transcript).not.toContain("orders");
    expect(transcript).toContain("Ordered.");
  });
});

describe("a malformed announcement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("is ignored when it names nothing", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce([]));
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen).toEqual([]);
  });

  it.each([
    ["a null value", null],
    ["no keys at all", { reason: "x" }],
    ["keys that are not a list", { keys: "orders" }],
  ])("survives %s", async (_label, value) => {
    // `value` is typed unknown by the protocol, so a server can put anything
    // there. A malformed announcement must not take the run down with it.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, value);
      emit.textStart("m1");
      emit.textEnd("the run carried on", "m1");
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen).toEqual([]);
    expect(shadow(el).textContent).toContain("the run carried on");
  });

  it("keeps the string keys out of a mixed list", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, { keys: ["orders", 42, null, "orders/1"] });
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(seen[0]?.keys).toEqual(["orders", "orders/1"]);
  });
});

describe("the run-finished summary", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("carries every key announced, de-duplicated in first-seen order", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders", "orders/42"]));
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders", "invoices"]));
    });
    const seen = runFinishes(el);

    await send(el, "hi");

    expect(seen[0]?.invalidated).toEqual(["orders", "orders/42", "invoices"]);
  });

  it("is empty against a server that announces nothing", async () => {
    // The old-server, new-client corner. The host's `else` branch runs and the
    // coarse refetch that shipped before either end still fires: no regression.
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("nothing to do", "m1");
    });
    const seen = runFinishes(el);

    await send(el, "hi");

    expect(seen[0]?.invalidated).toEqual([]);
  });

  it("does not carry one run's keys into the next", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders"]));
    });
    const seen = runFinishes(el);

    await send(el, "first");
    await send(el, "second");

    expect(seen[0]?.invalidated).toEqual(["orders"]);
    expect(seen[1]?.invalidated).toEqual(["orders"]);
    expect(seen).toHaveLength(2);
  });
});

describe("every other custom name", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("still arrives on the generic event, untouched", async () => {
    const el = mount((emit) => {
      emit.runStart();
      emit.custom("something.else", { a: 1 });
    });
    const generic: string[] = [];
    el.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
      generic.push((event as CustomEvent<{ name: string }>).detail.name);
    });
    const seen = invalidations(el);

    await send(el, "hi");

    expect(generic).toEqual(["something.else"]);
    expect(seen).toEqual([]);
  });

  it("does not also fire the generic event for an invalidation", async () => {
    // Routed, not duplicated: a host listening to both would otherwise refetch
    // twice for one announcement.
    const el = mount((emit) => {
      emit.runStart();
      emit.custom(INVALIDATE_CUSTOM_NAME, announce(["orders"]));
    });
    const generic: string[] = [];
    el.addEventListener(CUSTOM_AGENT_EVENT, (event) => {
      generic.push((event as CustomEvent<{ name: string }>).detail.name);
    });

    await send(el, "hi");

    expect(generic).toEqual([]);
  });
});
