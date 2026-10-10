/**
 * A frontend tool call whose run ends while it waits.
 *
 * Dispatch awaits three things on the way to a result: the host's
 * `confirmPredicate`, the confirmation card, and the handler. Any of them can
 * be pending when the run ends -- by Stop, by New chat, or by a `user-key`
 * handover, which stops the run, purges and rescopes storage and changes the
 * thread. These hold what the call may still do once it resumes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

/** Mount an element whose first round makes one call to `toolName`, and no more. */
function mountCalling(
  toolName: string,
  userKey: string | null = null,
): { el: AgUiChat; handle: FakeAgentHandle } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  if (userKey !== null) {
    el.setAttribute("user-key", userKey);
  }
  let round = 0;
  const handle = makeFakeAgent({
    script: (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("call-1", toolName, { id: 7 });
      }
      round += 1;
      emit.runEnd();
    },
  });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return { el, handle };
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
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

/** Press Stop, which is the send button while a run is in flight. */
function stop(el: AgUiChat): void {
  const button = shadow(el).querySelector<HTMLButtonElement>(".send");
  expect(button?.dataset["state"]).toBe("running");
  button?.click();
}

/** A promise and the two ways to settle it, for a step the test decides the timing of. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function toolCard(el: AgUiChat): HTMLElement | null {
  return shadow(el).querySelector<HTMLElement>(".tool-call");
}

/** Every checkpoint any principal's store holds, by storage key. */
function storedCheckpoints(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const key = sessionStorage.key(i);
    if (key?.includes("checkpoint:") === true) {
      keys.push(key);
    }
  }
  return keys;
}

describe("a confirmPredicate that answers after the run ended", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("draws no card when the predicate answers after Stop", async () => {
    // The host's predicate asks its server whether this call needs a person.
    // The user presses Stop while it is still asking: the answer that comes
    // back is about a run that is over, and must not put a question to them.
    const handler = vi.fn(() => "deleted");
    const { el, handle } = mountCalling("delete_record");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object" },
      handler,
    });
    const answer = deferred<boolean>();
    el.confirmPredicate = () => answer.promise;

    await send(el, "delete record 7");
    stop(el);
    await flush();
    answer.resolve(true);
    await flush();

    expect(shadow(el).querySelector(".confirm")).toBeNull();
    expect(handler).not.toHaveBeenCalled();
    // Settled rather than left reading "running…": dispatch took the card out
    // of the end-of-run sweep before it waited.
    expect(toolCard(el)?.getAttribute("data-status")).toBe("interrupted");
    expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
    expect(handle.runParams).toHaveLength(1);
  });

  it("does not run the handler when the predicate waives the card after Stop", async () => {
    const handler = vi.fn(() => "deleted");
    const { el, handle } = mountCalling("delete_record");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object" },
      handler,
    });
    const answer = deferred<boolean>();
    el.confirmPredicate = () => answer.promise;

    await send(el, "delete record 7");
    stop(el);
    await flush();
    answer.resolve(false);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(toolCard(el)?.getAttribute("data-status")).toBe("interrupted");
    // Nothing reached the agent for it: the next request answers it as not
    // finished, in the words the card now shows.
    expect(handle.messages.find((message) => message.role === "tool")).toBeUndefined();
    expect(handle.runParams).toHaveLength(1);
  });

  it("does not run the previous principal's handler after a handover", async () => {
    // A navigating tool, so running it would reload the page out from under the
    // principal who just signed in, and checkpoint first -- into their store.
    const handler = vi.fn(() => ({ ok: true }));
    const { el } = mountCalling("open_changelist", "alice");
    el.registerTool({
      name: "open_changelist",
      description: "Open a changelist",
      parameters: { type: "object", "x-navigates": true },
      handler,
    });
    const answer = deferred<boolean>();
    el.confirmPredicate = () => answer.promise;

    await send(el, "open the books");
    el.setAttribute("user-key", "bob");
    await flush();
    answer.resolve(false);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    expect(storedCheckpoints()).toEqual([]);
  });
});

describe("a confirmation card open when the run ends", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("draws nothing for the next principal when a handover declines the card", async () => {
    // A Stop with the card open declines it and shows the run waiting on its
    // next round. After a handover that indicator would land in the next
    // principal's empty transcript, and the run that would take it down again
    // is detached from it.
    const handler = vi.fn(() => "deleted");
    const { el } = mountCalling("delete_record", "alice");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object", "x-destructive": true },
      handler,
    });

    await send(el, "delete record 7");
    expect(shadow(el).querySelector(".confirm")).not.toBeNull();
    el.setAttribute("user-key", "bob");
    await flush();

    expect(shadow(el).querySelector(".confirm")).toBeNull();
    expect(shadow(el).querySelector(".pending")).toBeNull();
    expect(toolCard(el)).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not run a call confirmed in the same task as Stop", async () => {
    // The card resolves on the click, before the Stop's abort reaches it, so
    // the decision comes back as accepted for a run that has already ended.
    const handler = vi.fn(() => "deleted");
    const { el, handle } = mountCalling("delete_record");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object", "x-destructive": true },
      handler,
    });

    await send(el, "delete record 7");
    const confirm = shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--confirm");
    expect(confirm).not.toBeNull();
    confirm?.click();
    stop(el);
    await flush();

    expect(handler).not.toHaveBeenCalled();
    // The person did approve it, and the card still says so; it did not run.
    expect(toolCard(el)?.getAttribute("data-decision")).toBe("approved");
    expect(toolCard(el)?.getAttribute("data-status")).toBe("interrupted");
    expect(handle.runParams).toHaveLength(1);
  });
});

describe("a handler still running when the run ends", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("keeps a handler's result when Stop lands while it runs", async () => {
    // A handler cannot be aborted. What it did on the page happened, so a plain
    // Stop keeps the result and the agent hears about it on the next request.
    const result = deferred<string>();
    const { el, handle } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });

    await send(el, "highlight row 7");
    stop(el);
    await flush();
    result.resolve("highlighted");
    await flush();

    expect(toolCard(el)?.getAttribute("data-status")).toBe("done");
    expect(handle.messages.find((message) => message.role === "tool")?.content).toBe(
      JSON.stringify("highlighted"),
    );
  });

  it("draws nothing for the next principal when a handler resolves after a handover", async () => {
    const result = deferred<string>();
    const handler = vi.fn(() => result.promise);
    const { el } = mountCalling("highlight", "alice");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler,
    });

    await send(el, "highlight row 7");
    expect(handler).toHaveBeenCalledOnce();
    el.setAttribute("user-key", "bob");
    await flush();
    result.resolve("highlighted");
    await flush();

    // The handover cleared the transcript for bob, and the run that would have
    // taken this indicator down again has been detached from it.
    expect(shadow(el).querySelector(".pending")).toBeNull();
    expect(toolCard(el)).toBeNull();
  });

  it("leaves the next principal's checkpoint alone when a handler fails after a handover", async () => {
    const result = deferred<unknown>();
    const { el } = mountCalling("open_changelist", "alice");
    el.registerTool({
      name: "open_changelist",
      description: "Open a changelist",
      parameters: { type: "object", "x-navigates": true },
      handler: () => result.promise,
    });

    await send(el, "open the books");
    expect(storedCheckpoints()).toHaveLength(1);
    el.setAttribute("user-key", "bob");
    await flush();
    // The purge took alice's checkpoint with the rest of her storage.
    expect(storedCheckpoints()).toEqual([]);
    const next = el.conversationStore;
    const save = vi.spyOn(next, "saveCheckpoint");
    result.reject(new Error("navigation blocked"));
    await flush();

    expect(save).not.toHaveBeenCalled();
    expect(shadow(el).querySelector(".pending")).toBeNull();
    expect(toolCard(el)).toBeNull();
  });

  it("clears a failed navigation's checkpoint from the thread it was written to", async () => {
    // New chat while a navigating handler runs moves the active thread on. The
    // checkpoint was written under the thread the call belonged to, and that
    // is where its failure has to clear it from.
    const result = deferred<unknown>();
    const { el } = mountCalling("open_changelist");
    el.registerTool({
      name: "open_changelist",
      description: "Open a changelist",
      parameters: { type: "object", "x-navigates": true },
      handler: () => result.promise,
    });

    await send(el, "open the books");
    const first = el.conversationStore.threadId();
    expect(el.conversationStore.loadCheckpoint(first)).toEqual({ toolCallId: "call-1" });
    el.newChat();
    const second = el.conversationStore.threadId();
    expect(second).not.toBe(first);
    result.reject(new Error("navigation blocked"));
    await flush();

    expect(el.conversationStore.loadCheckpoint(first)).toBeNull();
    expect(storedCheckpoints()).toEqual([]);
  });
});

/** Run every queued task, deep enough for a drawer to list and a thread to replay. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/**
 * Whether the conversation reads as empty: the greeting region showing and the
 * host stamped `data-empty`. A stray answer group hides both.
 */
function emptyStateShowing(el: AgUiChat): boolean {
  const empty = shadow(el).querySelector<HTMLElement>(".empty");
  return empty !== null && !empty.hidden && el.hasAttribute("data-empty");
}

describe("a call still waiting when the conversation is reset", () => {
  // New chat, a drawer switch, reload() and re-insertion all stop the run and
  // clear the transcript, and none of them is a change of principal. A handler
  // cannot be aborted and a declined card still resolves, so the call resumes
  // after the reset. What it did is still settled and still returned; what it
  // must not do is show the run waiting on a next round in a conversation that
  // has no run, where nothing would ever take the indicator down.
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("draws nothing into the new chat when a handler resolves after New chat", async () => {
    const result = deferred<string>();
    const drawn = document.createElement("div");
    const { el, handle } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
      render: () => drawn,
    });

    await send(el, "highlight row 7");
    const card = toolCard(el);
    expect(card).not.toBeNull();
    el.newChat();
    expect(emptyStateShowing(el)).toBe(true);
    result.resolve("highlighted");
    await flush();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
    // The output a rendering tool draws beside its card has no card to go
    // beside: the reset forgot it, so the anchor is detached.
    expect(drawn.isConnected).toBe(false);
    // Only the drawing is skipped. The call still settled, and the result
    // still reached the run it belonged to.
    expect(card?.getAttribute("data-status")).toBe("done");
    expect(handle.messages.find((message) => message.role === "tool")?.content).toBe(
      JSON.stringify("highlighted"),
    );
  });

  it("draws nothing into the new chat when a handler fails after New chat", async () => {
    const result = deferred<string>();
    const { el, handle } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });

    await send(el, "highlight row 7");
    const card = toolCard(el);
    el.newChat();
    result.reject(new Error("row 7 is gone"));
    await flush();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
    expect(card?.getAttribute("data-status")).toBe("error");
    expect(handle.messages.find((message) => message.role === "tool")?.content).toBe(
      "Error: row 7 is gone",
    );
  });

  it("draws nothing into the new chat when New chat declines the open card", async () => {
    const handler = vi.fn(() => "deleted");
    const { el, handle } = mountCalling("delete_record");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object", "x-destructive": true },
      handler,
    });

    await send(el, "delete record 7");
    expect(shadow(el).querySelector(".confirm")).not.toBeNull();
    const card = toolCard(el);
    el.newChat();
    await flush();

    expect(shadow(el).querySelector(".confirm")).toBeNull();
    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    // Declined, and said so to the run it belonged to.
    expect(card?.getAttribute("data-decision")).toBe("declined");
    expect(card?.getAttribute("data-status")).toBe("declined");
    expect(handle.messages.find((message) => message.role === "tool")).toBeDefined();
  });

  it("draws nothing into the picked thread when a handler resolves after a drawer switch", async () => {
    const result = deferred<string>();
    const { el } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });
    // A thread with nothing in it yet, so the picked conversation is empty and
    // anything drawn into it is the stray.
    el.conversationStore.saveMessages("picked", []);

    await send(el, "highlight row 7");
    el.openThreads();
    await settle();
    const row = [...shadow(el).querySelectorAll<HTMLElement>(".drawer-row")].find(
      (candidate) => !candidate.classList.contains("drawer-row--active"),
    );
    expect(row).toBeDefined();
    row?.querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
    await settle();
    expect(el.conversationStore.threadId()).toBe("picked");
    result.resolve("highlighted");
    await settle();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
  });

  it("draws nothing into the picked thread when a drawer switch declines the open card", async () => {
    const handler = vi.fn(() => "deleted");
    const { el } = mountCalling("delete_record");
    el.registerTool({
      name: "delete_record",
      description: "Delete a record",
      parameters: { type: "object", "x-destructive": true },
      handler,
    });
    el.conversationStore.saveMessages("picked", []);

    await send(el, "delete record 7");
    expect(shadow(el).querySelector(".confirm")).not.toBeNull();
    const card = toolCard(el);
    el.openThreads();
    await settle();
    const row = [...shadow(el).querySelectorAll<HTMLElement>(".drawer-row")].find(
      (candidate) => !candidate.classList.contains("drawer-row--active"),
    );
    expect(row).toBeDefined();
    row?.querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
    await settle();
    expect(el.conversationStore.threadId()).toBe("picked");

    expect(shadow(el).querySelector(".confirm")).toBeNull();
    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
    expect(handler).not.toHaveBeenCalled();
    expect(card?.getAttribute("data-decision")).toBe("declined");
  });

  it("draws nothing into the fresh chat when a handler resolves after its thread is deleted", async () => {
    const result = deferred<string>();
    const { el } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });

    await send(el, "highlight row 7");
    const deleted = el.conversationStore.threadId();
    el.openThreads();
    await settle();
    const remove = shadow(el).querySelector<HTMLButtonElement>(
      ".drawer-row--active .drawer-row-delete",
    );
    expect(remove).not.toBeNull();
    remove?.click();
    shadow(el).querySelector<HTMLButtonElement>(".drawer-confirm-yes")?.click();
    await settle();
    expect(el.conversationStore.threadId()).not.toBe(deleted);
    result.resolve("highlighted");
    await settle();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(emptyStateShowing(el)).toBe(true);
  });

  // reload() and re-insertion rebuild the same thread from what is stored, so
  // the conversation on screen is not empty afterwards. What the call must not
  // do is add to it: the transcript stays exactly as the replay drew it.

  it("adds nothing to the replay when a handler resolves after reload()", async () => {
    const result = deferred<string>();
    const { el } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });

    await send(el, "highlight row 7");
    void el.reload();
    await settle();
    const replayed = shadow(el).querySelector(".messages")?.innerHTML;
    expect(replayed).toBeDefined();
    result.resolve("highlighted");
    await settle();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(shadow(el).querySelector(".messages")?.innerHTML).toBe(replayed);
  });

  it("adds nothing to the replay when a handler resolves after re-insertion", async () => {
    // Re-insertion clears the conversation without clearing the composer's
    // recall history, so it is the one path that reaches the seam without
    // passing through New chat's own reset.
    const result = deferred<string>();
    const { el } = mountCalling("highlight");
    el.registerTool({
      name: "highlight",
      description: "Highlight a row",
      parameters: { type: "object" },
      handler: () => result.promise,
    });

    await send(el, "highlight row 7");
    el.remove();
    document.body.appendChild(el);
    await settle();
    const replayed = shadow(el).querySelector(".messages")?.innerHTML;
    expect(replayed).toBeDefined();
    result.resolve("highlighted");
    await settle();

    expect.soft(shadow(el).querySelector(".pending")).toBeNull();
    expect(shadow(el).querySelector(".messages")?.innerHTML).toBe(replayed);
  });
});
