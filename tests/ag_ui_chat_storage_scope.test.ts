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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE, STATE_EVENT, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import {
  type ClientConversationStore,
  SessionStorageStore,
} from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { installFakeMedia } from "./helpers/fake_media.js";

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

/** An SSE body for one run, carrying `events` between its start and its finish. */
function sseRun(events: readonly Record<string, unknown>[] = []): Response {
  const all = [
    { type: "RUN_STARTED", threadId: "t1", runId: "r1" },
    ...events,
    { type: "RUN_FINISHED", threadId: "t1", runId: "r1" },
  ];
  const body = all.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

/** Drain real tasks, which a streamed response body needs and microtasks alone do not reach. */
async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function send(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

function transcript(text: string): never[] {
  return [{ id: "m1", role: "user", content: text }] as never;
}

const RUNS_URL = "/agent/runs/";

/**
 * Answer every run with a stream the server is still writing: `RUN_STARTED`,
 * then `events`, then nothing until the request is aborted or `finish` ends it.
 *
 * Through the real `HttpAgent`, because what these tests are about is when a
 * stopped run makes its last save, and that is the real client's timing: the
 * abort errors the body, `runAgent` settles a few tasks later, and the client
 * saves what it had once it does -- long after the code that stopped it has
 * moved on.
 */
function holdRuns(events: readonly Record<string, unknown>[]): {
  /** Send more of the run, leaving it open. */
  write: (more: readonly Record<string, unknown>[]) => void;
  /** Send the rest of the run and close it. */
  finish: (tail: readonly Record<string, unknown>[]) => void;
} {
  const encoder = new TextEncoder();
  const frame = (event: Record<string, unknown>): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
  let open: ReadableStreamDefaultController<Uint8Array> | null = null;
  vi.stubGlobal(
    "fetch",
    vi.fn((url: unknown, init?: RequestInit) => {
      // The checkpoint index, for the continuation case: one run to resume.
      if (String(url) === RUNS_URL) {
        return Promise.resolve(
          Response.json({
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
        );
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          open = controller;
          controller.enqueue(frame({ type: "RUN_STARTED", threadId: "t1", runId: "r1" }));
          for (const event of events) {
            controller.enqueue(frame(event));
          }
          // What a closed connection does to a body still being read.
          init?.signal?.addEventListener("abort", () => {
            controller.error(new DOMException("The operation was aborted.", "AbortError"));
          });
        },
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      );
    }),
  );
  const write = (more: readonly Record<string, unknown>[]): void => {
    const controller = open as ReadableStreamDefaultController<Uint8Array> | null;
    for (const event of more) {
      controller?.enqueue(frame(event));
    }
  };
  return {
    write,
    finish: (tail) => {
      write([...tail, { type: "RUN_FINISHED", threadId: "t1", runId: "r1" }]);
      (open as ReadableStreamDefaultController<Uint8Array> | null)?.close();
    },
  };
}

/** The opening of an answer the server is still streaming. */
function answerBegins(text: string): Record<string, unknown>[] {
  return [
    { type: "TEXT_MESSAGE_START", messageId: "a1", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: text },
  ];
}

describe("client state scoping", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("user-key", () => {
    it("does not send the previous principal's shared state on the next principal's first run", async () => {
      // Read off the body of the real request: shared state is sent as
      // `RunAgentInput.state` on every run, so the question is what goes out.
      const bodies: { state?: unknown }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: unknown, init?: RequestInit) => {
          bodies.push(JSON.parse(String(init?.body)) as { state?: unknown });
          // Alice's run is where the agent writes her data into shared state.
          return Promise.resolve(
            sseRun(
              bodies.length === 1
                ? [{ type: "STATE_SNAPSHOT", snapshot: { balance: ALICE_SECRET } }]
                : [],
            ),
          );
        }),
      );
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      send(el, "what is my balance?");
      await settle();
      // The control: her state really reached the element.
      expect(el.sharedState).toEqual({ balance: ALICE_SECRET });

      el.setAttribute("user-key", "bob");
      await settle();
      send(el, "hello");
      await settle();

      expect(bodies).toHaveLength(2);
      expect(JSON.stringify(bodies[1])).not.toContain(ALICE_SECRET);
      expect(bodies[1]?.state).toEqual({});
      expect(el.sharedState).toEqual({});
    });

    it("keeps shared state when the key first arrives, as it keeps the conversation", async () => {
      // Not a handover: the person on screen is the one the key now names.
      const el = mount({ endpoint: "/agent/" });
      el.sharedState = { document: "draft before auth resolved" };

      el.setAttribute("user-key", "alice");
      await flush();

      expect(el.sharedState).toEqual({ document: "draft before auth resolved" });
    });

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

    it("rescopes its own store under data-threads-url, inside the remote it wrapped", async () => {
      // The store in use is the remote wrapper connecting put around the
      // element's own store. That is still the element's store to move, so the
      // question of whose it is has to be asked of what is inside.
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(Response.json({ threads: [] }))),
      );
      const el = mount({
        endpoint: "/agent/",
        "user-key": "alice",
        "data-threads-url": "/agent/threads/",
      });

      el.setAttribute("user-key", "bob");
      await flush();
      const store = el.conversationStore;
      store.saveMessages(store.threadId(), transcript("bob's question"));

      expect(store).toBeInstanceOf(RemoteConversationStore);
      expect(dumpStorage()).toMatch(/#bob:messages:[^=]+=.*bob's question/);
      expect(dumpStorage()).not.toContain("#alice");
    });

    it("leaves alone a store the host assigned after connecting", async () => {
      // Connecting remembered the element's own store; the host's, assigned
      // since, is not that one, and a key change must not swap it back out.
      const saved: string[] = [];
      const injected: ClientConversationStore = {
        threadId: () => "host-thread",
        loadMessages: () => Promise.resolve(null),
        saveMessages: (threadId) => {
          saved.push(threadId);
        },
        loadCheckpoint: () => null,
        saveCheckpoint: () => undefined,
        clear: () => undefined,
        listThreads: () => Promise.resolve([]),
        setActiveThread: () => undefined,
        renameThread: () => undefined,
      };
      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      el.conversationStore = injected;

      el.setAttribute("user-key", "bob");
      await flush();

      expect(el.conversationStore).toBe(injected);
      // And it keeps being the one written to.
      el.conversationStore.saveMessages("host-thread", transcript("bob's question"));
      expect(saved).toEqual(["host-thread"]);
      expect(dumpStorage()).not.toContain("bob's question");
    });

    it("keeps a host's no-cache remote store across a key change", async () => {
      // The privacy-relevant case: the host chose to keep message bodies off
      // the client, and a key change swapping in the element's own store
      // started caching every one of them in sessionStorage again.
      //
      // The handover lists the arriving principal's threads, which against
      // this store is a request; an empty answer is all it needs.
      vi.stubGlobal(
        "fetch",
        vi.fn(() => Promise.resolve(Response.json({ threads: [] }))),
      );
      const injected = new RemoteConversationStore(
        "/agent/threads/",
        () => ({}),
        new SessionStorageStore("host-ns"),
        () => "same-origin",
        false,
      );
      const el = mount({ endpoint: "/agent/", "user-key": "alice" });
      el.conversationStore = injected;

      el.setAttribute("user-key", "bob");
      await flush();
      el.conversationStore.saveMessages("t1", transcript("bob's question"));

      expect(dumpStorage()).not.toContain("bob's question");
      expect(el.conversationStore).toBe(injected);
    });

    it("mirrors the attribute through the property", () => {
      const el = mount({ endpoint: "/agent/" });
      expect(el.userKey).toBe("");
      el.userKey = "alice";
      expect(el.getAttribute("user-key")).toBe("alice");
    });
  });

  /**
   * A run still streaming when the principal changes.
   *
   * The handover stops it, but a stopped run is not over: it saves what it had
   * once its request closes, and by then the store has been purged and scoped
   * to whoever arrived. The thread id that save is filed under was fixed when
   * the client was built, so it was the previous principal's conversation
   * written, whole, into the next one's namespace -- a row in their history
   * drawer, titled with the question they never asked.
   */
  describe("a run in flight across a handover", () => {
    function sendButton(el: AgUiChat): HTMLButtonElement | null {
      return shadow(el).querySelector<HTMLButtonElement>(".send");
    }

    it("saves nothing into the next principal's storage once the stopped run closes", async () => {
      holdRuns(answerBegins(ALICE_SECRET));
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      send(el, "what is my balance?");
      await settle();
      // The control: the run is in flight, and her turn is in her own storage.
      expect(sendButton(el)?.title).toBe("Stop");
      expect(dumpStorage()).toContain("what is my balance?");

      el.setAttribute("user-key", "bob");
      await settle();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      expect(dumpStorage()).not.toContain("what is my balance?");
      expect(await el.conversationStore.listThreads()).toEqual([]);
    });

    it("saves nothing into the next principal's storage when the key changed while detached", async () => {
      // Leaving stopped the run, and the save it makes on closing lands after
      // the element is back, scoped to the principal who arrived.
      holdRuns(answerBegins(ALICE_SECRET));
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      send(el, "what is my balance?");
      await settle();
      expect(sendButton(el)?.title).toBe("Stop");

      el.remove();
      el.setAttribute("user-key", "bob");
      document.body.appendChild(el);
      await settle();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      expect(dumpStorage()).not.toContain("what is my balance?");
      expect(await el.conversationStore.listThreads()).toEqual([]);
    });

    it("does not apply a state snapshot read off the wire after the handover", async () => {
      // Bytes that arrived just before the key changed are read and applied a
      // few microtasks later, after the handover emptied shared state for the
      // principal who arrived -- whose first run then sent it as theirs.
      const run = holdRuns(answerBegins("one moment"));
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      const heard: unknown[] = [];
      el.addEventListener(STATE_EVENT, (event) => {
        heard.push((event as CustomEvent<{ state: unknown }>).detail.state);
      });
      send(el, "what is my balance?");
      await settle();
      expect(sendButton(el)?.title).toBe("Stop");

      run.write([{ type: "STATE_SNAPSHOT", snapshot: { balance: ALICE_SECRET } }]);
      el.setAttribute("user-key", "bob");
      await settle();

      expect(el.sharedState).toEqual({});
      // Nor is the host told about it, after it has signed her out.
      expect(JSON.stringify(heard)).not.toContain(ALICE_SECRET);
    });

    it("saves nothing into the next principal's storage when a tool returns after the handover", async () => {
      // A handler cannot be aborted, and the client keeps what it returns: the
      // result is added and saved once the handler settles, however long after
      // the Stop that was.
      let release: (value: string) => void = () => undefined;
      const gate = new Promise<string>((resolve) => {
        release = resolve;
      });
      vi.stubGlobal(
        "fetch",
        vi.fn(() =>
          Promise.resolve(
            sseRun([
              { type: "TOOL_CALL_START", toolCallId: "c1", toolCallName: "read_ledger" },
              { type: "TOOL_CALL_ARGS", toolCallId: "c1", delta: "{}" },
              { type: "TOOL_CALL_END", toolCallId: "c1" },
            ]),
          ),
        ),
      );
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      el.registerTool({
        name: "read_ledger",
        description: "read the ledger",
        parameters: { type: "object", properties: {} },
        handler: () => gate,
      });
      send(el, "read my ledger");
      await settle();
      expect(sendButton(el)?.title).toBe("Stop");

      el.setAttribute("user-key", "bob");
      release(ALICE_SECRET);
      await settle();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      expect(dumpStorage()).not.toContain("read my ledger");
      expect(await el.conversationStore.listThreads()).toEqual([]);
    });

    it("saves nothing into the next principal's storage once a stopped continuation closes", async () => {
      // A checkpoint continuation is built by the same construction and saves
      // the same way -- the conversation it continues, then its own turn.
      holdRuns(answerBegins(ALICE_SECRET));
      const el = mount({
        endpoint: "/agent/",
        "user-key": "alice",
        "data-runs-url": RUNS_URL,
        "data-start-open": "",
      });
      shadow(el).querySelector<HTMLButtonElement>(".header-btn--checkpoints")?.click();
      await settle();
      const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
      if (input === null) {
        throw new Error("expected an input");
      }
      input.value = "and what did I spend?";
      shadow(el).querySelector<HTMLButtonElement>(".checkpoint-resume")?.click();
      await settle();
      expect(sendButton(el)?.title).toBe("Stop");

      el.setAttribute("user-key", "bob");
      await settle();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      expect(dumpStorage()).not.toContain("and what did I spend?");
      expect(await el.conversationStore.listThreads()).toEqual([]);
    });

    it("still files a run New chat stopped under the conversation it left", async () => {
      // The control on the other side: New chat is not a handover, and the
      // stopped run's last save -- the only one carrying the partial answer --
      // is the same person's, and lands where it always did.
      holdRuns(answerBegins("the answer so far"));
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      send(el, "the question that was left");
      await settle();
      const left = el.conversationStore.threadId();

      el.newChat();
      await settle();

      expect(await el.conversationStore.loadMessages(left)).toEqual([
        expect.objectContaining({ content: "the question that was left" }),
        expect.objectContaining({ content: "the answer so far" }),
      ]);
    });

    it("keeps saving a run across the key's first arrival, into the namespace it moved to", async () => {
      // Not a handover: the person on screen is the one the key now names, so
      // the run is not stopped, and what it says after the key arrives is
      // theirs to keep. A gate keyed on the principal rather than on the
      // handover would drop it.
      const run = holdRuns(answerBegins("the answer begins"));
      const el = mount({ endpoint: "/agent/", "data-start-open": "" });
      send(el, "asked before auth resolved");
      await settle();
      const thread = el.conversationStore.threadId();

      el.setAttribute("user-key", "alice");
      await flush();
      run.finish([
        { type: "TEXT_MESSAGE_CONTENT", messageId: "a1", delta: " and ends" },
        { type: "TEXT_MESSAGE_END", messageId: "a1" },
      ]);
      await settle();

      expect(sendButton(el)?.title).toBe("Send");
      expect(await el.conversationStore.loadMessages(thread)).toEqual([
        expect.objectContaining({ content: "asked before auth resolved" }),
        expect.objectContaining({ content: "the answer begins and ends" }),
      ]);
    });
  });

  /**
   * What the composer holds for the turn being written, across a handover.
   *
   * The transcript and the recall history were cleared so the previous
   * principal's words are not in front of the next one, and a turn they had
   * typed and not sent is their words too. Everything else a person can put
   * in the box -- a quotation, a skill's template -- is text in it, and the
   * tray goes with the transcript. Only a handover clears it: an adoption, a
   * move and New chat all leave the same person typing.
   */
  describe("the composer across a handover", () => {
    function composer(el: AgUiChat): HTMLTextAreaElement {
      const found = shadow(el).querySelector(".input");
      if (!(found instanceof HTMLTextAreaElement)) {
        throw new Error("expected a composer");
      }
      return found;
    }

    function typeUnsent(el: AgUiChat, text: string): void {
      composer(el).value = text;
      composer(el).dispatchEvent(new Event("input", { bubbles: true }));
    }

    it("clears the previous principal's unsent text on a live change", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      typeUnsent(el, ALICE_SECRET);

      el.setAttribute("user-key", "bob");
      await flush();

      expect(composer(el).value).toBe("");
    });

    it("clears it when the key changed while detached", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      typeUnsent(el, ALICE_SECRET);

      el.remove();
      el.setAttribute("user-key", "bob");
      document.body.appendChild(el);
      await flush();

      expect(composer(el).value).toBe("");
    });

    it("clears a quotation waiting in the composer", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      el.quote(ALICE_SECRET);
      expect(composer(el).value).toContain(ALICE_SECRET);

      el.setAttribute("user-key", "bob");
      await flush();

      expect(composer(el).value).toBe("");
    });

    it("clears a skill's template and takes down the hint over it", async () => {
      const el = mount({
        endpoint: "/agent/",
        "user-key": "alice",
        "data-start-open": "",
        "data-prompt-chips": "true",
        "data-skills": JSON.stringify([
          { name: "find", title: "Find", prompt: "Find {q}.", chip: true },
        ]),
      });
      shadow(el).querySelector<HTMLButtonElement>(".skill-chip")?.click();
      const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
      expect(hint?.hidden).toBe(false);

      el.setAttribute("user-key", "bob");
      await flush();

      expect(composer(el).value).toBe("");
      expect(hint?.hidden).toBe(true);
    });

    it("closes a slash palette the previous principal's typing opened", async () => {
      const el = mount({
        endpoint: "/agent/",
        "user-key": "alice",
        "data-start-open": "",
        "data-slash-commands": "true",
        "data-skills": JSON.stringify([{ name: "sum", title: "Sum", prompt: "Sum it." }]),
      });
      typeUnsent(el, "/");
      const palette = shadow(el).querySelector<HTMLElement>(".skill-palette");
      expect(palette?.hidden).toBe(false);

      el.setAttribute("user-key", "bob");
      await flush();

      expect(palette?.hidden).toBe(true);
    });

    it("stops a recording in progress, so it lands in nobody's composer", async () => {
      const media = installFakeMedia();
      try {
        const transcribe = vi.fn(async () => ALICE_SECRET);
        const el = document.createElement(ELEMENT_TAG) as AgUiChat;
        el.setAttribute("endpoint", "/agent/");
        el.setAttribute("user-key", "alice");
        el.setAttribute("data-start-open", "");
        el.transcribeHandler = transcribe;
        document.body.appendChild(el);
        shadow(el).querySelector<HTMLButtonElement>(".voice-btn")?.click();
        await flush();
        expect(media.recorder().state).toBe("recording");

        el.setAttribute("user-key", "bob");
        await flush();

        // Her mic is released and the clip is never transcribed.
        expect(media.recorder().stream.track.stopped).toBe(true);
        expect(transcribe).not.toHaveBeenCalled();
        expect(composer(el).value).toBe("");
        // The next principal still has a mic, and it is not mid-recording.
        const mics = shadow(el).querySelectorAll<HTMLButtonElement>(".voice-btn");
        expect(mics).toHaveLength(1);
        expect(mics[0]?.dataset["state"]).toBe("idle");
      } finally {
        media.restore();
      }
    });

    it("keeps the text when the key first arrives", async () => {
      // The person typing is the one the key now names.
      const el = mount({ endpoint: "/agent/", "data-start-open": "" });
      typeUnsent(el, "typed before auth resolved");

      el.setAttribute("user-key", "alice");
      await flush();

      expect(composer(el).value).toBe("typed before auth resolved");
    });

    it("keeps the text on a move that keeps the key", async () => {
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      typeUnsent(el, "still typing");

      el.remove();
      document.body.appendChild(el);
      await flush();

      expect(composer(el).value).toBe("still typing");
    });

    it("keeps the text on New chat", () => {
      // The same person, starting over: what they were typing is still theirs.
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      typeUnsent(el, "still typing");

      el.newChat();

      expect(composer(el).value).toBe("still typing");
    });
  });

  /**
   * A `user-key` change made while the element is out of the document.
   *
   * A router that keeps a view alive detaches the element rather than
   * destroying it, so a sign-out that runs while the chat is off screen renames
   * the principal on an element that is not connected. Putting it back is the
   * first moment it can act on that, and it has to do everything a live change
   * does: a plain move is a reload that keeps what the user typed, because the
   * same person is still there, and this is the case where they are not.
   */
  describe("user-key changed while detached", () => {
    /** Mount with a fake agent; by default every run answers once and ends. */
    function mountRunning(
      attrs: Record<string, string>,
      script: (emit: Emit) => void = (emit) => {
        emit.runStart();
        emit.textEnd("an answer");
        emit.runEnd();
      },
    ): AgUiChat {
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
      }
      const handle = makeFakeAgent({ script });
      el.agentFactory = () => handle.agent;
      document.body.appendChild(el);
      return el;
    }

    /** Take the element out, rename the principal (`null` drops it), put it back. */
    function moveAs(el: AgUiChat, key: string | null): void {
      el.remove();
      if (key === null) {
        el.removeAttribute("user-key");
      } else {
        el.setAttribute("user-key", key);
      }
      document.body.appendChild(el);
    }

    function composer(el: AgUiChat): HTMLTextAreaElement {
      const found = shadow(el).querySelector(".input");
      if (!(found instanceof HTMLTextAreaElement)) {
        throw new Error("expected a composer");
      }
      return found;
    }

    /** Type and press Enter, the route that records the turn for recall. */
    async function type(el: AgUiChat, text: string): Promise<void> {
      const input = composer(el);
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
      );
      await settle();
    }

    /** What one ArrowUp from an empty composer brings back. */
    function recall(el: AgUiChat): string {
      composer(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }),
      );
      return composer(el).value;
    }

    /** A store of the host's own kind, counting how often its threads are listed. */
    function hostStore(): ClientConversationStore & { lists: () => number } {
      let lists = 0;
      return {
        threadId: () => "host-thread",
        loadMessages: () => Promise.resolve(null),
        saveMessages: () => undefined,
        loadCheckpoint: () => null,
        saveCheckpoint: () => undefined,
        clear: () => undefined,
        listThreads: () => {
          lists += 1;
          return Promise.resolve([]);
        },
        setActiveThread: () => undefined,
        renameThread: () => undefined,
        lists: () => lists,
      };
    }

    it.each([
      ["replaced", "bob"],
      ["removed", null],
    ])("purges the previous principal's stored conversation when the key is %s", async (_, key) => {
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));

      moveAs(el, key);
      await flush();

      expect(dumpStorage()).not.toContain(ALICE_SECRET);
      // Nothing at all is left under her namespace -- not even a fresh thread
      // pointer minted there by reading the store before it was re-scoped.
      expect(dumpStorage()).not.toContain("#alice");
      const next = el.conversationStore;
      expect(await next.loadMessages(next.threadId())).toBeNull();
      expect(shadow(el).querySelector(".message--user")).toBeNull();
    });

    it("forgets the composer's recall history", async () => {
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      await type(el, "alice's message");

      moveAs(el, "bob");

      expect(recall(el)).toBe("");
    });

    it("asks the next principal again for a tool the previous one always allowed", async () => {
      let calls = 0;
      let round = 0;
      const el = mountRunning(
        { endpoint: "/agent/", "user-key": "alice", "data-start-open": "" },
        (emit) => {
          emit.runStart();
          if (round === 0) {
            emit.toolCall(`call-${calls}`, "delete_record", { id: 7 });
          }
          round += 1;
          emit.runEnd();
        },
      );
      // One call per send: the round counter restarts on every submit.
      el.addEventListener(SUBMIT_EVENT, () => {
        round = 0;
      });
      el.registerTool({
        name: "delete_record",
        description: "Delete a record",
        parameters: { type: "object", "x-destructive": true },
        handler: () => {
          calls += 1;
          return "deleted";
        },
      });
      send(el, "delete record 7");
      await flush();
      shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--always")?.click();
      await flush();
      expect(calls).toBe(1);

      moveAs(el, "bob");
      await flush();
      send(el, "delete record 7");
      await flush();

      expect(calls).toBe(1);
      expect(shadow(el).querySelector(".confirm")).not.toBeNull();
      shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
      await flush();
    });

    it("does not send the previous principal's shared state on the next one's first run", async () => {
      // Read off the real request, as the live-change test above does.
      const bodies: { state?: unknown }[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_url: unknown, init?: RequestInit) => {
          bodies.push(JSON.parse(String(init?.body)) as { state?: unknown });
          return Promise.resolve(
            sseRun(
              bodies.length === 1
                ? [{ type: "STATE_SNAPSHOT", snapshot: { balance: ALICE_SECRET } }]
                : [],
            ),
          );
        }),
      );
      const el = mount({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      send(el, "what is my balance?");
      await settle();
      expect(el.sharedState).toEqual({ balance: ALICE_SECRET });

      moveAs(el, "bob");
      await settle();
      send(el, "hello");
      await settle();

      expect(bodies).toHaveLength(2);
      expect(JSON.stringify(bodies[1])).not.toContain(ALICE_SECRET);
      expect(bodies[1]?.state).toEqual({});
      expect(el.sharedState).toEqual({});
    });

    it("clears the unread count the previous principal's answers left", async () => {
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      el.setCollapsed(true);
      send(el, "hi");
      await flush();
      expect(el.unread).toBe(1);

      moveAs(el, "bob");

      expect(el.unread).toBe(0);
      expect(shadow(el).querySelector<HTMLElement>(".launcher-badge")?.hidden).toBe(true);
    });

    it("replaces the previous principal's threads in a drawer left open", async () => {
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      const alice = el.conversationStore;
      alice.saveMessages(alice.threadId(), transcript(ALICE_SECRET));
      el.openThreads();
      await flush();
      const drawer = (): string => shadow(el).querySelector(".drawer-list")?.textContent ?? "";
      expect(drawer()).toContain(ALICE_SECRET);

      moveAs(el, "bob");
      await flush();

      expect(drawer()).not.toContain(ALICE_SECRET);
    });

    it("shows the next principal's own conversation", async () => {
      // The farewell must not land after the arrival and wipe it: bob's earlier
      // conversation in this tab is what the re-inserted element replays.
      const bob = new SessionStorageStore("/agent/#bob");
      bob.saveMessages(bob.threadId(), transcript("bob's earlier question"));
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });

      moveAs(el, "bob");
      await flush();

      expect(shadow(el).querySelector(".message--user")?.textContent).toContain(
        "bob's earlier question",
      );
    });

    it.each([
      ["first arrives", null, "alice"],
      ["changes hands", "alice", "bob"],
    ])(
      "keeps a store the host assigned while the element was out, when the key %s",
      (_, from, to) => {
        // A store the host assigned since is theirs, and comes back as it is --
        // the handover does not get to swap the element's own one back in.
        const injected = hostStore();
        const el = mountRunning(
          from === null ? { endpoint: "/agent/" } : { endpoint: "/agent/", "user-key": from },
        );
        el.remove();
        el.conversationStore = injected;
        el.setAttribute("user-key", to);
        document.body.appendChild(el);

        expect(el.conversationStore).toBe(injected);
      },
    );

    it("keeps recall and the transcript on a move that keeps the key", async () => {
      // The control for every test above: the same move, the same person.
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      await type(el, "alice's message");

      moveAs(el, "alice");
      await flush();

      expect(shadow(el).querySelector(".message--user")?.textContent).toContain("alice's message");
      expect(recall(el)).toBe("alice's message");
    });

    it("does not reload the thread list on a move that keeps the key", () => {
      // Against a `data-threads-url` store the list is a request to the host's
      // server, and one issued from connecting goes out before a framework ref
      // has set the headers -- see #startup. A move has nothing new to list.
      const injected = hostStore();
      const el = document.createElement(ELEMENT_TAG) as AgUiChat;
      el.setAttribute("endpoint", "/agent/");
      el.setAttribute("user-key", "alice");
      el.conversationStore = injected;
      document.body.appendChild(el);
      const before = injected.lists();

      moveAs(el, "alice");
      expect(injected.lists()).toBe(before);
      // The control: the same move with the key changed does reload it.
      moveAs(el, "bob");
      expect(injected.lists()).toBe(before + 1);
    });

    it("keeps everything when the key goes away and comes back while detached", async () => {
      // Only where the element ends up counts: nobody else saw this panel while
      // it was out of the document, so there is no one to hide it from.
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      await type(el, "alice's message");

      el.remove();
      el.setAttribute("user-key", "bob");
      el.setAttribute("user-key", "alice");
      document.body.appendChild(el);
      await flush();

      expect(dumpStorage()).toContain("alice's message");
      expect(recall(el)).toBe("alice's message");
    });

    it("hands over only once for a change it already made while connected", async () => {
      // The live change already said goodbye to alice. Moving the element after
      // it is not a second handover, which would take bob's own recall with it.
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice", "data-start-open": "" });
      el.setAttribute("user-key", "bob");
      await type(el, "bob's message");

      moveAs(el, "bob");

      expect(recall(el)).toBe("bob's message");
    });

    it("adopts the conversation rather than purging it when the key first arrives", async () => {
      // The late-configuration shape again, with the element moved in between:
      // the person on screen is the one the key now names.
      const el = mountRunning({ endpoint: "/agent/", "data-start-open": "" });
      const anonymous = el.conversationStore;
      const thread = anonymous.threadId();
      await type(el, "before auth resolved");
      expect(await anonymous.loadMessages(thread)).not.toBeNull();

      moveAs(el, "alice");
      await flush();

      const scoped = el.conversationStore;
      expect(scoped.threadId()).toBe(thread);
      expect(JSON.stringify(await scoped.loadMessages(thread))).toContain("before auth resolved");
      expect(await new SessionStorageStore("/agent/").loadMessages(thread)).toBeNull();
      expect(shadow(el).querySelector(".message--user")?.textContent).toContain(
        "before auth resolved",
      );
      expect(recall(el)).toBe("before auth resolved");
    });

    it("never purges a namespace another element claimed while this one was out", async () => {
      // Two id-less elements on one endpoint: the second to connect is given a
      // namespace of its own. One that takes this element's namespace while it
      // is detached keeps it, and the handover on the way back in is resolved
      // against the namespace this element holds then, not the one it left.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice" });
      el.remove();
      const other = mountRunning({ endpoint: "/agent/", "user-key": "alice" });
      const theirs = other.conversationStore;
      theirs.saveMessages(theirs.threadId(), transcript("the other panel's conversation"));

      el.setAttribute("user-key", "bob");
      document.body.appendChild(el);
      await flush();

      expect(await theirs.loadMessages(theirs.threadId())).toEqual(
        transcript("the other panel's conversation"),
      );
      warn.mockRestore();
    });

    it("does not treat the first connect as a change of principal", async () => {
      // A key-less conversation some earlier visitor left in this tab is not
      // the first principal's to adopt, and an element that has never been
      // connected has nothing of anyone's to hand over.
      const left = new SessionStorageStore("/agent/");
      const thread = left.threadId();
      left.saveMessages(thread, transcript("an earlier visitor's question"));

      const el = mountRunning({ endpoint: "/agent/", "user-key": "alice" });
      await flush();

      expect(el.conversationStore.threadId()).not.toBe(thread);
      expect(await left.loadMessages(thread)).toEqual(transcript("an earlier visitor's question"));
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
