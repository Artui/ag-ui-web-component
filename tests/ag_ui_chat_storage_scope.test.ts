/**
 * What the element's client-side state is scoped to.
 *
 * Three separate questions, all of them "which state is whose":
 *
 * - **Whose conversation is it?** `user-key` names the principal, so a second
 *   principal in the same tab cannot read the first one's transcript.
 * - **Which element's conversation is it?** Two id-less elements pointed at one
 *   endpoint must not collapse onto one set of keys.
 * - **What happens when the browser refuses to store it?** A failed write is a
 *   lost preference, never a broken conversation.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import {
  type ClientConversationStore,
  SessionStorageStore,
} from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
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

/**
 * Every key and value in `sessionStorage`, as one string.
 *
 * The leak these tests are about is content surviving *anywhere* on the origin,
 * so they assert against the whole store rather than against the one key the
 * implementation happens to use today.
 */
function dumpStorage(): string {
  const lines: string[] = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    lines.push(`${key}=${key === null ? "" : sessionStorage.getItem(key)}`);
  }
  return lines.join("\n");
}

/**
 * Make every `sessionStorage` write throw, the way an exhausted quota (or a
 * privacy mode that refuses storage) does.
 *
 * Replaces the global rather than spying on the object: happy-dom's `Storage`
 * hands out its methods through a proxy, so neither an instance nor a prototype
 * spy is ever consulted. Undone with `vi.unstubAllGlobals()`.
 */
function failEveryWrite(): void {
  const real = sessionStorage;
  vi.stubGlobal(
    "sessionStorage",
    new Proxy(real, {
      get(target, property) {
        if (property === "setItem") {
          return () => {
            throw new DOMException("exceeded the quota", "QuotaExceededError");
          };
        }
        const value = Reflect.get(target, property, target) as unknown;
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  );
}

/** Drain microtasks so an attribute change's async re-read settles. */
async function flush(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await Promise.resolve();
  }
}

const ALICE_SECRET = "alice's account balance is 12345";

function transcript(text: string): never[] {
  return [{ id: "m1", role: "user", content: text }] as never;
}

describe("client state scoping", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  describe("user-key", () => {
    it("does not carry a transcript across a principal change in the same tab", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));
      el.appendMessage(MESSAGE_ROLE.USER, ALICE_SECRET);

      // The single-page-app logout: the element is never remounted, the host
      // simply names the new principal.
      el.setAttribute("user-key", "bob");
      await flush();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      const bob = el.conversationStore;
      expect(await bob.loadMessages(bob.threadId())).toBeNull();
      expect(shadow(el).querySelector(".message--user")).toBeNull();
    });

    it("purges the principal's state when the key is removed rather than replaced", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));

      // A host that signs out by dropping the attribute must not leave the
      // transcript behind for the next, key-less mount to adopt.
      el.removeAttribute("user-key");
      await flush();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
    });

    it("keeps two principals apart across a full remount", async () => {
      const first = mount({ endpoint: "/agent/", "user-key": "alice" });
      const alice = first.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));
      first.remove();

      const second = mount({ endpoint: "/agent/", "user-key": "bob" });
      const bob = second.conversationStore;
      expect(await bob.loadMessages(bob.threadId())).toBeNull();
    });

    it("adopts the running conversation when the key first arrives", async () => {
      // The documented late-configuration shape: the element mounts, the host's
      // auth handshake resolves, and only then is the principal known. That is
      // not a handover, so the conversation on screen must survive it.
      const el = mount({ endpoint: "/agent/" });
      const anonymous = el.conversationStore;
      const thread = anonymous.threadId();
      anonymous.saveMessages(thread, transcript("before auth resolved"));
      el.appendMessage(MESSAGE_ROLE.USER, "before auth resolved");

      el.setAttribute("user-key", "alice");
      await flush();

      const scoped = el.conversationStore;
      expect(scoped.threadId()).toBe(thread);
      expect(await scoped.loadMessages(thread)).toEqual(transcript("before auth resolved"));
      expect(shadow(el).querySelector(".message--user")).not.toBeNull();
      // Adoption moves the state rather than copying it, so a later key-less
      // mount cannot pick the conversation back up.
      expect(await new SessionStorageStore("/agent/").loadMessages(thread)).toBeNull();
    });

    it("purges only the previous principal, not other elements or the host", async () => {
      sessionStorage.setItem("shop:cart", "keep me");
      const neighbour = new SessionStorageStore("other-chat");
      neighbour.saveMessages("t9", transcript("another element's conversation"));

      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));
      el.setAttribute("user-key", "bob");
      await flush();

      expect(sessionStorage.getItem("shop:cart")).toBe("keep me");
      expect(await neighbour.loadMessages("t9")).not.toBeNull();
    });

    it("ignores a re-assignment of the same key", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));

      el.userKey = "alice";
      await flush();

      expect(await alice.loadMessages(alice.threadId())).toEqual(transcript(ALICE_SECRET));
    });

    it("leaves a host-injected store alone", async () => {
      // The element does not own it and cannot know how it is keyed; a store
      // that holds its data somewhere else has to scope itself.
      const injected: ClientConversationStore = {
        threadId: () => "host-thread",
        loadMessages: () => Promise.resolve(null),
        saveMessages: () => undefined,
        loadCheckpoint: () => null,
        saveCheckpoint: () => undefined,
        clear: () => undefined,
        listThreads: () => Promise.resolve([]),
        setActiveThread: () => undefined,
        renameThread: () => undefined,
      };
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.setAttribute("endpoint", "/agent/");
      el.setAttribute("user-key", "alice");
      el.conversationStore = injected;
      document.body.appendChild(el);
      el.appendMessage(MESSAGE_ROLE.USER, ALICE_SECRET);

      el.setAttribute("user-key", "bob");
      await flush();

      expect(el.conversationStore).toBe(injected);
      // The transcript on screen is still cleared: the host swapped principals.
      expect(shadow(el).querySelector(".message--user")).toBeNull();
    });

    it("mirrors the attribute through the property", () => {
      const el = mount({ endpoint: "/agent/" });
      expect(el.userKey).toBe("");
      el.userKey = "alice";
      expect(el.getAttribute("user-key")).toBe("alice");
    });
  });

  describe("namespace collisions", () => {
    it("gives a second id-less element on the same endpoint its own conversation", () => {
      const first = mount({ endpoint: "/agent/" });
      const second = mount({ endpoint: "/agent/" });
      expect(second.conversationStore.threadId()).not.toBe(first.conversationStore.threadId());
    });

    it("does not rehydrate one panel's transcript into the other", async () => {
      const first = mount({ endpoint: "/agent/" });
      const docked = first.conversationStore;
      docked.saveMessages(docked.threadId(), transcript("the support panel's conversation"));

      const second = mount({ endpoint: "/agent/" });
      const inline = second.conversationStore;
      expect(await inline.loadMessages(inline.threadId())).toBeNull();
    });

    it("warns, naming the id that fixes it", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      mount({ endpoint: "/agent/" });
      mount({ endpoint: "/agent/" });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("id"));
      warn.mockRestore();
    });

    it("lets a remounted element reclaim its own namespace", async () => {
      const el = mount({ endpoint: "/agent/" });
      const store = el.conversationStore;
      const thread = store.threadId();
      store.saveMessages(thread, transcript("still mine"));

      // A move within the DOM is a disconnect followed by a connect; the claim
      // must be released, or the element loses its own conversation.
      el.remove();
      document.body.appendChild(el);

      expect(el.conversationStore.threadId()).toBe(thread);
      expect(await el.conversationStore.loadMessages(thread)).toEqual(transcript("still mine"));
    });

    it("keeps its fallback namespace across a remount, and warns only once", async () => {
      const first = mount({ endpoint: "/agent/" });
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const second = mount({ endpoint: "/agent/" });
      const displaced = second.conversationStore;
      const thread = displaced.threadId();
      displaced.saveMessages(thread, transcript("the inline assistant"));

      // Even once the element that won the claim has gone, the one that lost it
      // stays where its conversation is rather than drifting onto the freed
      // namespace and picking up the other panel's transcript.
      first.remove();
      second.remove();
      document.body.appendChild(second);

      expect(second.conversationStore.threadId()).toBe(thread);
      expect(await second.conversationStore.loadMessages(thread)).toEqual(
        transcript("the inline assistant"),
      );
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it("still shares the pre-namespacing global keys when there is nothing to key on", () => {
      const first = mount();
      const second = mount();
      expect(second.conversationStore.threadId()).toBe(first.conversationStore.threadId());
    });
  });

  describe("storage that refuses to write", () => {
    it("keeps the conversation alive when a write fails", () => {
      const el = mount({ endpoint: "/agent/" });
      const store = el.conversationStore;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      failEveryWrite();

      expect(() => store.saveMessages("t1", transcript("a very long conversation"))).not.toThrow();
      expect(() => store.setActiveThread("t1")).not.toThrow();
      expect(() => store.saveCheckpoint("t1", { toolCallId: "tc1" })).not.toThrow();
      expect(() => store.newThread?.()).not.toThrow();
      expect(() => el.setCollapsed(true)).not.toThrow();
      expect(() => el.toggleTheme()).not.toThrow();

      vi.unstubAllGlobals();
      warn.mockRestore();
    });
  });
});
