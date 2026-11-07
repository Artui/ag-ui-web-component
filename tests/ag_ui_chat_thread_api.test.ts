/**
 * The conversation, driven from a host's own chrome.
 *
 * A host that lists conversations in its own bar could open the built-in
 * drawer and start a new chat, and nothing else: switching to a thread it
 * listed meant patching the element, knowing which thread was on screen meant
 * a read that minted one, and knowing a run was going meant inferring it from
 * the submit event, which a retry and a checkpoint continuation never raise.
 * These pin the public answer: `switchThread`, `deleteThread`, `threadId`,
 * `running` and its `data-running` stamp, one `ag-ui-thread` event per change
 * of conversation, and the thread on the run-finished detail.
 */

import type { Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, RUN_FINISHED_EVENT, SUBMIT_EVENT, THREAD_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunFinishedDetail } from "../src/core/events/run_finished_detail.js";
import type { ThreadDetail } from "../src/core/events/thread_detail.js";
import { type Emit, type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

/** What a listener saw: the detail, and the user turns on screen as it ran. */
interface Seen {
  readonly detail: ThreadDetail;
  readonly onScreen: readonly string[];
}

interface Mounted {
  readonly el: AgUiChat;
  readonly seen: Seen[];
  readonly agents: FakeAgentHandle[];
  /** Lets the run currently waiting on its gate finish. */
  readonly release: () => void;
}

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function userTurns(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".message--user")].map((node) => node.textContent ?? "");
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

function listen(el: AgUiChat, seen: Seen[]): void {
  el.addEventListener(THREAD_EVENT, (event) => {
    seen.push({ detail: (event as CustomEvent<ThreadDetail>).detail, onScreen: userTurns(el) });
  });
}

/**
 * An element whose runs each wait on a gate when `gated` is set, so a test can
 * look at it mid-run. The listener is attached before connecting, so the
 * restore at connect is seen too.
 */
function mount(attributes: Record<string, string> = {}, gated = false): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  const gates: (() => void)[] = [];
  const agents: FakeAgentHandle[] = [];
  el.agentFactory = () => {
    const handle = makeFakeAgent({
      script: async (emit: Emit) => {
        // What the real client reports as a run begins, and what the composer
        // turns to Stop on.
        emit.runStart();
        if (gated) {
          await new Promise<void>((resolve) => gates.push(resolve));
        }
        emit.textEnd("answer");
        emit.runEnd();
      },
    });
    agents.push(handle);
    return handle.agent;
  };
  const seen: Seen[] = [];
  listen(el, seen);
  document.body.appendChild(el);
  return { el, seen, agents, release: () => gates.shift()?.() };
}

function turn(id: string, content: string): Message {
  return { id, role: "user", content } as Message;
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe("switchThread", () => {
  it("switches to the thread and replays it before the event fires", async () => {
    const { el, seen } = mount();
    await flush();
    const before = el.threadId;
    el.conversationStore.saveMessages("t1", [turn("u1", "hello t1")]);
    seen.length = 0;

    await el.switchThread("t1");

    expect(el.threadId).toBe("t1");
    expect(userTurns(el)).toEqual(["hello t1"]);
    expect(seen).toEqual([
      {
        detail: { threadId: "t1", previousThreadId: before, reason: "switch" },
        onScreen: ["hello t1"],
      },
    ]);
  });

  it("does nothing, and says nothing, for the thread already on screen", async () => {
    const { el, seen } = mount();
    await flush();
    seen.length = 0;

    await el.switchThread(el.threadId as string);

    expect(seen).toEqual([]);
  });

  it("reports a drawer pick the same way", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "picked")]);
    seen.length = 0;

    shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await flush();
    shadow(el).querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
    await flush();

    expect(seen.map((entry) => entry.detail.reason)).toEqual(["switch"]);
    expect(seen[0]?.onScreen).toEqual(["picked"]);
  });

  it("cancels a run in flight, as the drawer does", async () => {
    const { el, agents, release } = mount({}, true);
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "elsewhere")]);
    void el.sendMessage("a long question");
    await flush();
    expect(el.running).toBe(true);

    await el.switchThread("t1");
    release();
    await flush();

    expect(agents[0]?.abortRuns).toBe(1);
    expect(el.running).toBe(false);
    expect(el.hasAttribute("data-running")).toBe(false);
    expect(userTurns(el)).toEqual(["elsewhere"]);
    expect(shadow(el).querySelector(".message--assistant")).toBeNull();
  });

  it("reports only the last of two switches made before the first had replayed", async () => {
    // And names the thread that was on screen as the one it replaced: the
    // first switch's thread was never drawn, so a host unmarking it would
    // leave the thread that was shown still marked.
    const { el, seen } = mount();
    await flush();
    const before = el.threadId;
    el.conversationStore.saveMessages("t1", [turn("u1", "first")]);
    el.conversationStore.saveMessages("t2", [turn("u2", "second")]);
    seen.length = 0;

    const first = el.switchThread("t1");
    const second = el.switchThread("t2");
    await Promise.all([first, second]);

    expect(seen.map((entry) => entry.detail)).toEqual([
      { threadId: "t2", previousThreadId: before, reason: "switch" },
    ]);
    expect(userTurns(el)).toEqual(["second"]);
  });

  it("keeps the thread on screen, and says nothing, when the store rejects the load", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t0", [turn("u0", "on screen")]);
    await el.switchThread("t0");
    const failure = new Error("store is down");
    const load = el.conversationStore.loadMessages.bind(el.conversationStore);
    el.conversationStore.loadMessages = (id) => (id === "t1" ? Promise.reject(failure) : load(id));
    seen.length = 0;

    await expect(el.switchThread("t1")).rejects.toBe(failure);
    await flush();

    expect(el.threadId).toBe("t0");
    expect(el.conversationStore.threadId()).toBe("t0");
    expect(seen).toEqual([]);
    // The failed switch had already cleared the transcript; the thread it
    // stayed on is drawn again, so the screen and threadId agree.
    expect(userTurns(el)).toEqual(["on screen"]);
    expect(el.hasAttribute("data-restoring")).toBe(false);
  });

  it("still rejects with the store's error when the thread it stays on cannot be redrawn", async () => {
    const { el, seen } = mount();
    await flush();
    const before = el.threadId;
    const failure = new Error("store is down");
    el.conversationStore.loadMessages = () => Promise.reject(failure);
    seen.length = 0;

    await expect(el.switchThread("t1")).rejects.toBe(failure);
    await flush();

    expect(el.threadId).toBe(before);
    expect(seen).toEqual([]);
  });

  it("does not undo a newer switch when an older one's load rejects late", async () => {
    const { el } = mount();
    await flush();
    el.conversationStore.saveMessages("t2", [turn("u2", "newer")]);
    const load = el.conversationStore.loadMessages.bind(el.conversationStore);
    let fail: (reason: Error) => void = () => undefined;
    el.conversationStore.loadMessages = (id) =>
      id === "t1"
        ? new Promise((_resolve, reject) => {
            fail = reject;
          })
        : load(id);

    const first = el.switchThread("t1");
    const settled = expect(first).rejects.toThrow("late");
    await el.switchThread("t2");
    fail(new Error("late"));
    await settled;
    await flush();

    expect(el.threadId).toBe("t2");
    expect(userTurns(el)).toEqual(["newer"]);
  });

  it("hands a second switch to the same thread the load already under way", async () => {
    const { el } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "replayed")]);
    const load = el.conversationStore.loadMessages.bind(el.conversationStore);
    let answer: () => void = () => undefined;
    el.conversationStore.loadMessages = (id) =>
      new Promise((resolve) => {
        answer = () => resolve(load(id));
      });

    const first = el.switchThread("t1");
    const second = el.switchThread("t1");
    answer();
    await second;

    expect(userTurns(el)).toEqual(["replayed"]);
    await first;
  });

  it("resolves a repeat at once when no switch is under way", async () => {
    const { el } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "replayed")]);
    await el.switchThread("t1");

    await el.switchThread("t1");

    expect(userTurns(el)).toEqual(["replayed"]);
  });
});

describe("deleteThread", () => {
  it("replaces the active thread with a fresh one and says so", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "going")]);
    await el.switchThread("t1");
    seen.length = 0;

    el.deleteThread("t1");

    expect(el.threadId).not.toBe("t1");
    expect(await el.conversationStore.loadMessages("t1")).toBeNull();
    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: "t1", reason: "delete" },
        onScreen: [],
      },
    ]);
  });

  it("deletes another thread without touching the one on screen", async () => {
    const { el, seen } = mount();
    await flush();
    const active = el.threadId;
    el.conversationStore.saveMessages("t1", [turn("u1", "elsewhere")]);
    seen.length = 0;

    el.deleteThread("t1");

    expect(el.threadId).toBe(active);
    expect(await el.conversationStore.loadMessages("t1")).toBeNull();
    expect(seen).toEqual([]);
  });
});

describe("the thread event", () => {
  it("fires for a new chat, after the transcript is cleared", async () => {
    const { el, seen } = mount();
    await el.sendMessage("first question");
    await flush();
    const before = el.threadId;
    seen.length = 0;

    el.newChat();

    expect(el.threadId).not.toBe(before);
    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: before, reason: "new" },
        onScreen: [],
      },
    ]);
  });

  it("reports the restore at connect, with no thread before it", async () => {
    const first = mount();
    await first.el.sendMessage("asked before the reload");
    await flush();
    const thread = first.el.threadId;
    first.el.remove();

    const { el, seen } = mount();
    await flush();

    expect(el.threadId).toBe(thread);
    expect(seen).toEqual([
      {
        detail: { threadId: thread, previousThreadId: null, reason: "restore" },
        onScreen: ["asked before the reload"],
      },
    ]);
  });

  it("reports the element connecting again as a restore of the same thread", async () => {
    const { el, seen } = mount();
    await el.sendMessage("moved with it");
    await flush();
    seen.length = 0;

    el.remove();
    document.body.appendChild(el);
    await flush();

    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: el.threadId, reason: "restore" },
        onScreen: ["moved with it"],
      },
    ]);
  });

  it("reports a reload as a restore of the same thread", async () => {
    const { el, seen } = mount();
    await el.sendMessage("kept");
    await flush();
    seen.length = 0;

    await el.reload();

    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: el.threadId, reason: "restore" },
        onScreen: ["kept"],
      },
    ]);
  });

  it("reports a user-key handover as a rescope", async () => {
    const { el, seen } = mount({ "user-key": "alice" });
    await el.sendMessage("alice's question");
    await flush();
    const before = el.threadId;
    seen.length = 0;

    el.setAttribute("user-key", "bob");
    await flush();

    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: before, reason: "rescope" },
        onScreen: [],
      },
    ]);
  });
});

describe("a user-key changed while the element was away", () => {
  it("reports the restore it comes back to as a rescope", async () => {
    const { el, seen } = mount({ "user-key": "alice" });
    await el.sendMessage("alice's question");
    await flush();
    const before = el.threadId;
    seen.length = 0;

    el.remove();
    el.setAttribute("user-key", "bob");
    document.body.appendChild(el);
    await flush();

    expect(el.threadId).not.toBe(before);
    expect(seen).toEqual([
      {
        detail: { threadId: el.threadId, previousThreadId: before, reason: "rescope" },
        onScreen: [],
      },
    ]);
  });

  it("reports a key arriving for the first time as a restore of the same thread", async () => {
    // Absent to present is the late configuration shape: the conversation on
    // screen is this principal's and moves with them, so nothing was handed over.
    const { el, seen } = mount();
    await el.sendMessage("asked before sign-in");
    await flush();
    const before = el.threadId;
    seen.length = 0;

    el.remove();
    el.setAttribute("user-key", "alice");
    document.body.appendChild(el);
    await flush();

    expect(seen).toEqual([
      {
        detail: { threadId: before, previousThreadId: before, reason: "restore" },
        onScreen: ["asked before sign-in"],
      },
    ]);
  });
});

describe("before the element connects", () => {
  it("switches nothing and deletes nothing, having no store to read", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.conversationStore.saveMessages("t1", [turn("u1", "kept")]);
    const seen: Seen[] = [];
    listen(el, seen);

    await el.switchThread("t1");
    el.deleteThread("t1");

    expect(el.threadId).toBeNull();
    expect(await el.conversationStore.loadMessages("t1")).toEqual([turn("u1", "kept")]);
    expect(seen).toEqual([]);
  });
});

describe("threadId", () => {
  it("is null before the element connects", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    expect(el.threadId).toBeNull();
  });

  it("is the thread on screen, and reading it writes nothing", async () => {
    const { el } = mount();
    await flush();
    sessionStorage.clear();

    const thread = el.threadId;

    expect(thread).toEqual(expect.any(String));
    expect(sessionStorage.length).toBe(0);
  });
});

describe("running", () => {
  it("covers a typed send", async () => {
    const { el, release } = mount({}, true);
    await flush();
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "typed";
    (shadow(el).querySelector(".send") as HTMLButtonElement).click();
    await flush();

    expect(el.running).toBe(true);
    expect(el.hasAttribute("data-running")).toBe(true);

    release();
    await flush();
    expect(el.running).toBe(false);
    expect(el.hasAttribute("data-running")).toBe(false);
  });

  it("covers a programmatic send", async () => {
    const { el, release } = mount({}, true);
    await flush();
    void el.sendMessage("from the host");
    await flush();

    expect(el.hasAttribute("data-running")).toBe(true);

    release();
    await flush();
    expect(el.hasAttribute("data-running")).toBe(false);
  });

  it("covers a retry, which raises no submit event", async () => {
    const { el, release } = mount({}, true);
    await flush();
    void el.sendMessage("ask once");
    await flush();
    release();
    await flush();
    const submits: unknown[] = [];
    el.addEventListener(SUBMIT_EVENT, (event) => submits.push(event));

    void el.retryLastTurn();
    await flush();

    expect(el.running).toBe(true);
    expect(el.hasAttribute("data-running")).toBe(true);
    expect(submits).toEqual([]);

    release();
    await flush();
    expect(el.hasAttribute("data-running")).toBe(false);
  });

  it("covers a checkpoint continuation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          runs: [
            {
              run_id: "r1",
              thread_id: "t1",
              parent_run_id: null,
              started_at: "2026-07-27T12:00:00+00:00",
              continuable: true,
            },
          ],
        }),
      })),
    );
    const { el, release } = mount({ "data-runs-url": "/agent/runs/" }, true);
    await flush();
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await flush();
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = "and now sort them";
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
    await flush();

    expect(el.running).toBe(true);
    expect(el.hasAttribute("data-running")).toBe(true);

    release();
    await flush();
    expect(el.hasAttribute("data-running")).toBe(false);
  });
});

describe("the run-finished detail", () => {
  it("names the thread the run belonged to", async () => {
    const { el } = mount();
    await flush();
    const thread = el.conversationStore.threadId();
    const seen: RunFinishedDetail[] = [];
    el.addEventListener(RUN_FINISHED_EVENT, (event) => {
      seen.push((event as CustomEvent<RunFinishedDetail>).detail);
    });

    await el.sendMessage("which thread?");
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0]?.threadId).toBe(thread);
  });

  it("names the thread a stopped run belonged to, not the next one", async () => {
    // A stopped run still reports once its request closes, which is after the
    // new chat that stopped it has put another thread on screen.
    const { el, release } = mount({}, true);
    await flush();
    const thread = el.conversationStore.threadId();
    const seen: RunFinishedDetail[] = [];
    el.addEventListener(RUN_FINISHED_EVENT, (event) => {
      seen.push((event as CustomEvent<RunFinishedDetail>).detail);
    });
    void el.sendMessage("stopped part-way");
    await flush();

    el.newChat();
    release();
    await flush();

    expect(el.threadId).not.toBe(thread);
    expect(seen.map((detail) => detail.threadId)).toEqual([thread]);
  });
});
