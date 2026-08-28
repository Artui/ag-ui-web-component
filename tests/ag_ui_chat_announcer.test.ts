/**
 * What a screen reader is told, and how often.
 *
 * The transcript carried both `role="log"` and an explicit
 * `aria-live="polite"`, and the streaming bubble's `innerHTML` is replaced
 * inside it on every animation frame. `role="log"` already implies polite
 * announcement whose default `aria-relevant` includes text additions, so a
 * reader was asked to re-announce the whole answer tens of times per turn --
 * not merely unhelpful but actively hostile.
 *
 * The fix demotes the transcript out of live-region duty and puts a handful of
 * short statuses into a separate invisible region, which is what Microsoft's
 * Bot Framework WebChat did for this exact bug (#3236) and what MDN and Scott
 * O'Hara prescribe.
 *
 * These cases are about *which statuses land and when*, which is ordinary
 * logic. The claims happy-dom cannot decide -- that the announcer is in the
 * accessibility tree at all, and that the transcript is genuinely not a live
 * region -- are asserted against a real engine in
 * `tests/browser/announcer.browser.test.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ANNOUNCE_CLEAR_MS, ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

function mountWithAgent(script: (emit: Emit) => void | Promise<void>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
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

function announcer(el: AgUiChat): HTMLElement {
  const node = shadow(el).querySelector<HTMLElement>(".sr-only");
  if (node === null) {
    throw new Error("expected an announcer");
  }
  return node;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
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

/** Every string the announcer received, in order, across one or more turns. */
function recordAnnouncements(el: AgUiChat): string[] {
  const seen: string[] = [];
  const node = announcer(el);
  const observer = new MutationObserver(() => {
    const text = node.textContent ?? "";
    if (text !== "") {
      seen.push(text);
    }
  });
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  return seen;
}

describe("the transcript is not a live region", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("keeps role=log for navigation but turns announcing off", () => {
    // The role is not the defect and carries the log semantics that let the
    // transcript be navigated as one. aria-live="off" explicitly overrides the
    // polite value the role implies -- dropping the role instead would lose
    // structure to fix announcing.
    const el = mountWithAgent(() => {});
    const messages = shadow(el).querySelector(".messages");

    expect(messages?.getAttribute("role")).toBe("log");
    expect(messages?.getAttribute("aria-live")).toBe("off");
  });

  it("does not announce the answer as it streams", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.text("Once");
      emit.text("Once upon");
      emit.text("Once upon a time");
      emit.textEnd("Once upon a time", "m1");
    });
    const seen = recordAnnouncements(el);

    await send(el, "tell me a story");

    // The answer's own words must never reach the announcer -- that is the
    // whole defect, restated as an assertion.
    expect(seen.some((text) => text.includes("Once upon"))).toBe(false);
  });
});

describe("what a turn announces", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("says the assistant is responding, then that it answered", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("hello", "m1");
    });
    const seen = recordAnnouncements(el);

    await send(el, "hi");

    expect(seen).toEqual([
      DEFAULT_UI_STRINGS.announceResponding,
      DEFAULT_UI_STRINGS.announceAnswerReady,
    ]);
  });

  it("announces the start once for a turn that runs several rounds", async () => {
    // onRunStart fires per round. A turn calling two tools would otherwise open
    // with three identical announcements.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("t1", "noop", {});
      emit.toolResult("t1", "{}");
      emit.runStart();
      emit.textStart("m1");
      emit.textEnd("done", "m1");
    });
    const seen = recordAnnouncements(el);

    await send(el, "do the thing");

    expect(seen.filter((text) => text === DEFAULT_UI_STRINGS.announceResponding)).toHaveLength(1);
  });

  it("says the run failed, and does not also claim an answer", async () => {
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.error("upstream exploded");
    });
    const seen = recordAnnouncements(el);

    await send(el, "hi");

    expect(seen).toContain(DEFAULT_UI_STRINGS.announceFailed);
    expect(seen).not.toContain(DEFAULT_UI_STRINGS.announceAnswerReady);
  });

  it("never leaks the error's own text", async () => {
    // The message goes in a bubble the user can read. An exception string is
    // written for an operator, and reading one aloud is its own hostility.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.error("ECONNREFUSED 10.0.0.4:5432");
    });
    const seen = recordAnnouncements(el);

    await send(el, "hi");

    expect(seen.some((text) => text.includes("ECONNREFUSED"))).toBe(false);
  });

  it("says a decision is waiting, and how many", async () => {
    // The cards render inside the transcript, which is deliberately silent now.
    // Without this the run simply goes quiet and the user has no reason to look.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.interrupt([
        { id: "i1", reason: "tool_call", toolCallId: "c1", message: "Delete it?" },
        { id: "i2", reason: "tool_call", toolCallId: "c2", message: "Delete it?" },
      ]);
    });
    const seen = recordAnnouncements(el);

    await send(el, "delete both");

    expect(seen).toContain(DEFAULT_UI_STRINGS.announceAwaitingDecision.replace("{count}", "2"));
  });
});

describe("the announcer empties itself", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clears the status so an identical one announces next time", async () => {
    // A live region is read on *change*. Two turns in a row both open with
    // "Assistant is responding", and setting the same string twice is not a
    // change -- so without the clear the second turn is announced silently.
    vi.useFakeTimers();
    try {
      const el = mountWithAgent((emit) => {
        emit.runStart();
        emit.textStart("m1");
        emit.textEnd("hello", "m1");
      });
      const node = announcer(el);

      await send(el, "hi");
      expect(node.textContent).not.toBe("");

      vi.advanceTimersByTime(ANNOUNCE_CLEAR_MS);
      expect(node.textContent).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a pending clear when the element leaves the document", () => {
    vi.useFakeTimers();
    try {
      const el = mountWithAgent(() => {});
      el.remove();

      // Nothing to assert but the absence of a timer firing into a detached
      // element; advancing past the delay would throw if it did.
      expect(() => vi.advanceTimersByTime(ANNOUNCE_CLEAR_MS * 2)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});
