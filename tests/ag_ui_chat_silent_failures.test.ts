/**
 * Two failures the component used to keep to itself.
 *
 * Both were found by a downstream consumer running the component against a real
 * Django backend and watching it do nothing -- neither the competitive survey
 * that produced the transcript defects nor the 2026-08 audit wave saw them,
 * because one leaves the DOM correct while corrupting storage and the other
 * only fires on a data shape our own fixtures never produce.
 *
 * A failure with no console call and nothing on screen is not reported as a
 * bug. It is reported as "the charts are flaky", or "the chat lost my
 * messages".
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { CHART_ACTIVITY_TYPE, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
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

function mount(
  script: (emit: Emit) => void | Promise<void>,
  store?: unknown,
  charts = false,
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (store !== undefined) {
    el.conversationStore = store as never;
  }
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  // Charts are a host opt-in; without this the push path is never reached and
  // every assertion below would pass against any implementation at all.
  if (charts) {
    el.enableCharts(["activity"]);
  }
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

/** A store that records what it was asked to persist. */
function recordingStore(): { saved: unknown[][]; store: Record<string, unknown> } {
  const saved: unknown[][] = [];
  return {
    saved,
    store: {
      threadId: () => "t1",
      setActiveThread: () => {},
      saveMessages: (_t: string, m: unknown[]) => {
        saved.push([...m]);
      },
      loadMessages: () => [],
      list: () => [],
      clear: () => {},
      saveCheckpoint: () => {},
      loadCheckpoint: () => null,
    },
  };
}

describe("a server that replaces the whole conversation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("persists the server's list, because the client already replaced it", async () => {
    // Not a choice the host gets to make quietly: `@ag-ui/client` applies
    // MESSAGES_SNAPSHOT before any subscriber runs, and the run loop persists
    // `agent.messages`. The store follows the server either way.
    const { saved, store } = recordingStore();
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("the real answer", "m1");
      emit.messagesSnapshot([{ id: "s1", role: "assistant", content: "server rewrote this" }]);
    }, store);

    await send(el, "hi");

    expect(JSON.stringify(saved.at(-1))).toContain("server rewrote this");
  });

  it("says so, instead of letting the screen and the store disagree in silence", async () => {
    // The defect. The DOM was untouched, so nothing looked wrong until a reload
    // in a different session served a transcript the user had never seen, with
    // no event that could be correlated to it.
    const { store } = recordingStore();
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("the real answer", "m1");
      emit.messagesSnapshot([{ id: "s1", role: "assistant", content: "server rewrote this" }]);
    }, store);

    await send(el, "hi");

    const notice = shadow(el).querySelector(".run-notice--history-replaced");
    expect(notice?.textContent).toContain(DEFAULT_UI_STRINGS.historyReplaced);
  });

  it("leaves the in-flight transcript standing", async () => {
    // Re-rendering from the snapshot was the other candidate and is declined: a
    // snapshot can land mid-run, and rebuilding then destroys the streaming
    // bubble, the open answer group and every tool card keyed by call id.
    const { store } = recordingStore();
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("the real answer", "m1");
      emit.messagesSnapshot([{ id: "s1", role: "assistant", content: "server rewrote this" }]);
    }, store);

    await send(el, "hi");

    const transcript = shadow(el).textContent ?? "";
    expect(transcript).toContain("the real answer");
  });

  it("stays quiet when no snapshot arrives", async () => {
    const { store } = recordingStore();
    const el = mount((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("an ordinary answer", "m1");
    }, store);

    await send(el, "hi");

    expect(shadow(el).querySelector(".run-notice--history-replaced")).toBeNull();
  });
});

describe("a pushed chart that cannot be drawn", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const drawable = { labels: ["a", "b"], series: [{ label: "s", points: [1, 2] }] };
  // A Django `Sum` over a DecimalField serialises as a JSON string. Money is
  // the most common chart input there is.
  const decimalPoints = { labels: ["a", "b"], series: [{ label: "s", points: ["1234.50", 2] }] };

  it("removes the chart, which is the right answer", async () => {
    // Live and reload should agree. Leaving retracted numbers up, reading as
    // current, is worse -- and a reload drops the chart anyway, because the
    // *stored* content is the version that could not be drawn.
    const el = mount(
      (emit) => {
        emit.activity(CHART_ACTIVITY_TYPE, drawable, "c1");
        emit.activityReplace(CHART_ACTIVITY_TYPE, decimalPoints, "c1");
      },
      undefined,
      true,
    );

    await send(el, "chart it");

    expect(shadow(el).querySelector(".chart-block")).toBeNull();
  });

  it("tells the reader why the chart went, instead of just deleting it", async () => {
    const el = mount(
      (emit) => {
        emit.activity(CHART_ACTIVITY_TYPE, drawable, "c1");
        emit.activityReplace(CHART_ACTIVITY_TYPE, decimalPoints, "c1");
      },
      undefined,
      true,
    );

    await send(el, "chart it");

    const notice = shadow(el).querySelector(".run-notice--chart-undrawable");
    expect(notice?.textContent).toContain(DEFAULT_UI_STRINGS.chartUndrawable);
  });

  it("names the likely cause on the console, for whoever has to fix the server", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = mount(
        (emit) => {
          emit.activity(CHART_ACTIVITY_TYPE, decimalPoints, "c1");
        },
        undefined,
        true,
      );

      await send(el, "chart it");

      const said = warn.mock.calls.map((c) => String(c[0])).join(" ");
      expect(said).toContain("c1");
      expect(said).toContain("string");
    } finally {
      warn.mockRestore();
    }
  });

  it("does not post a notice for a chart that was never on screen", async () => {
    // Nothing disappeared, so there is nothing to explain, and a notice for
    // every rejected push would be noise. The console still carries it.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const el = mount(
        (emit) => {
          emit.activity(CHART_ACTIVITY_TYPE, decimalPoints, "c1");
        },
        undefined,
        true,
      );

      await send(el, "chart it");

      expect(shadow(el).querySelector(".run-notice--chart-undrawable")).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("draws a chart whose points are all finite numbers", async () => {
    const el = mount(
      (emit) => {
        emit.activity(CHART_ACTIVITY_TYPE, drawable, "c1");
      },
      undefined,
      true,
    );

    await send(el, "chart it");

    expect(shadow(el).querySelector(".chart-block")).not.toBeNull();
    expect(shadow(el).querySelector(".run-notice--chart-undrawable")).toBeNull();
  });
});
