import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";

const fetchMock = vi.fn();

function ok(body: unknown): Response {
  return { ok: true, json: async () => body } as unknown as Response;
}

function notOk(): Response {
  return { ok: false, json: async () => ({}) } as unknown as Response;
}

/** A 200 whose body isn't JSON (e.g. a proxy's HTML error page). */
function badJson(): Response {
  return {
    ok: true,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  } as unknown as Response;
}

/** Drain microtasks so a fire-and-forget mutation's fetch settles. */
async function flush(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await Promise.resolve();
  }
}

describe("RemoteConversationStore", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists threads from the endpoint, mapping the wire shape", async () => {
    fetchMock.mockResolvedValue(
      ok({
        threads: [
          {
            thread_id: "t1",
            title: "Trip",
            updated_at: "2026-06-24T00:00:00+00:00",
            preview: "hi",
          },
          { thread_id: "t2", title: "Other", updated_at: null, preview: "" },
        ],
      }),
    );
    const store = new RemoteConversationStore("https://x/threads", () => ({ "X-CSRF": "tok" }));
    const metas = await store.listThreads();
    // URL gets a trailing slash; the live headers ride along.
    expect(fetchMock).toHaveBeenCalledWith("https://x/threads/", { headers: { "X-CSRF": "tok" } });
    expect(metas).toEqual([
      {
        threadId: "t1",
        title: "Trip",
        updatedAt: Date.parse("2026-06-24T00:00:00+00:00"),
        preview: "hi",
      },
      // A null `updated_at` maps to NaN (a neutral "no meaningful age" signal),
      // not epoch 0 — which `relativeTime` would render as "~2950w ago".
      { threadId: "t2", title: "Other", updatedAt: Number.NaN, preview: "" },
    ]);
  });

  it("keeps a URL that already ends in a slash and defaults headers to empty", async () => {
    fetchMock.mockResolvedValue(ok({ threads: [] }));
    await new RemoteConversationStore("https://x/threads/").listThreads();
    expect(fetchMock).toHaveBeenCalledWith("https://x/threads/", { headers: {} });
  });

  it("treats a missing threads field as an empty list", async () => {
    fetchMock.mockResolvedValue(ok({}));
    expect(await new RemoteConversationStore("https://x/threads/").listThreads()).toEqual([]);
  });

  it("falls back to the local list when the index responds not-ok", async () => {
    const local = new SessionStorageStore();
    local.saveMessages("t1", [{ role: "user", content: "local" }] as never);
    fetchMock.mockResolvedValue(notOk());
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect((await store.listThreads()).map((m) => m.threadId)).toEqual(["t1"]);
  });

  it("falls back to the local list on a network error", async () => {
    const local = new SessionStorageStore();
    local.saveMessages("t1", [{ role: "user", content: "local" }] as never);
    fetchMock.mockRejectedValue(new Error("offline"));
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect((await store.listThreads()).map((m) => m.threadId)).toEqual(["t1"]);
  });

  it("loads a thread's messages from the endpoint", async () => {
    fetchMock.mockResolvedValue(
      ok({ thread_id: "t1", messages: [{ id: "m", role: "user", content: "hi" }] }),
    );
    const store = new RemoteConversationStore("https://x/threads/", () => ({ k: "v" }));
    expect(await store.loadMessages("t1")).toEqual([{ id: "m", role: "user", content: "hi" }]);
    expect(fetchMock).toHaveBeenCalledWith("https://x/threads/t1/", { headers: { k: "v" } });
  });

  it("does not ask the server for a thread the local store just minted", async () => {
    // Every first visit spent a request to be told 404, and logged one in the
    // console of a page where nothing had gone wrong.
    const local = new SessionStorageStore();
    const minted = local.threadId();

    expect(
      await new RemoteConversationStore("https://x/threads/", () => ({}), local).loadMessages(
        minted,
      ),
    ).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for it once something has been sent in it", async () => {
    const local = new SessionStorageStore();
    const minted = local.threadId();
    local.saveMessages(minted, [{ id: "m", role: "user", content: "hi" }] as never);
    fetchMock.mockResolvedValue(ok({ messages: [{ id: "m", role: "user", content: "hi" }] }));

    await new RemoteConversationStore("https://x/threads/", () => ({}), local).loadMessages(minted);

    expect(fetchMock).toHaveBeenCalledWith(`https://x/threads/${minted}/`, { headers: {} });
  });

  it("asks for a thread it did not mint, which is how another device's thread loads", async () => {
    // The narrow predicate matters here: "no local messages" is not the same
    // claim as "new". A drawer row from another device has neither.
    const local = new SessionStorageStore();
    fetchMock.mockResolvedValue(
      ok({ messages: [{ id: "m", role: "user", content: "elsewhere" }] }),
    );

    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect(await store.loadMessages("from-another-device")).toEqual([
      { id: "m", role: "user", content: "elsewhere" },
    ]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("asks again after a minted thread is cleared and re-minted, having saved once", async () => {
    // `clear` drops the marker, so the next mint is the only thing that can set
    // it: a cleared-then-reused id must not inherit the old answer.
    const local = new SessionStorageStore();
    const first = local.threadId();
    local.saveMessages(first, [{ id: "m", role: "user", content: "hi" }] as never);
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);

    expect(store.isUnsent(first)).toBe(false);
    local.clear(first);
    expect(store.isUnsent(first)).toBe(false);
    expect(store.isUnsent(local.threadId())).toBe(true);
  });

  it("reports nothing unsent when the wrapped store cannot tell", () => {
    const store = new RemoteConversationStore("https://x/threads/");
    expect(store.isUnsent("anything")).toBe(false);
  });

  it("returns null when a loaded thread has no messages", async () => {
    fetchMock.mockResolvedValue(ok({ thread_id: "t1" }));
    expect(await new RemoteConversationStore("https://x/threads/").loadMessages("t1")).toBeNull();
  });

  it("falls back to local messages when a load responds not-ok", async () => {
    const local = new SessionStorageStore();
    local.saveMessages("t1", [{ id: "c", role: "user", content: "cached" }] as never);
    fetchMock.mockResolvedValue(notOk());
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect(await store.loadMessages("t1")).toEqual([{ id: "c", role: "user", content: "cached" }]);
  });

  it("falls back to local messages on a network error", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const store = new RemoteConversationStore("https://x/threads/");
    expect(await store.loadMessages("absent")).toBeNull();
  });

  it("falls back to local messages on a 200 with an unreadable body", async () => {
    const local = new SessionStorageStore();
    local.saveMessages("t1", [{ id: "c", role: "user", content: "cached" }] as never);
    fetchMock.mockResolvedValue(badJson());
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect(await store.loadMessages("t1")).toEqual([{ id: "c", role: "user", content: "cached" }]);
  });

  it("falls back to the local list on a 200 with an unreadable body", async () => {
    const local = new SessionStorageStore();
    local.saveMessages("t1", [{ role: "user", content: "local" }] as never);
    fetchMock.mockResolvedValue(badJson());
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    expect((await store.listThreads()).map((m) => m.threadId)).toEqual(["t1"]);
  });

  it("carries a live credentials mode on both reads and writes", async () => {
    let mode: RequestCredentials | undefined;
    fetchMock.mockResolvedValue(ok({ threads: [] }));
    const store = new RemoteConversationStore(
      "https://x/threads/",
      () => ({}),
      new SessionStorageStore(),
      () => mode,
    );

    await store.listThreads();
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("credentials");

    // Configured after the store was wired, as a host ref does.
    mode = "include";
    await store.listThreads();
    await store.loadMessages("t1");
    store.renameThread("t1", "Renamed");
    store.clear("t2");
    await flush();

    for (const call of fetchMock.mock.calls.slice(1)) {
      expect(call[1]).toMatchObject({ credentials: "include" });
    }
  });

  it("renames optimistically and PATCHes the server", async () => {
    fetchMock.mockResolvedValue(
      ok({ threads: [{ thread_id: "t1", title: "Old", updated_at: null, preview: "" }] }),
    );
    const store = new RemoteConversationStore("https://x/threads/", () => ({ h: "1" }));
    store.renameThread("t1", "Renamed");
    expect(fetchMock).toHaveBeenCalledWith("https://x/threads/t1/", {
      method: "PATCH",
      headers: { h: "1", "content-type": "application/json" },
      body: JSON.stringify({ title: "Renamed" }),
    });
    // The server list still says "Old"; the optimistic overlay shows "Renamed".
    const [meta] = await store.listThreads();
    expect(meta?.title).toBe("Renamed");
  });

  it("deletes optimistically and DELETEs the server", async () => {
    fetchMock.mockResolvedValue(
      ok({
        threads: [
          { thread_id: "t1", title: "A", updated_at: null, preview: "" },
          { thread_id: "t2", title: "B", updated_at: null, preview: "" },
        ],
      }),
    );
    const store = new RemoteConversationStore("https://x/threads/");
    store.clear("t1");
    expect(fetchMock).toHaveBeenCalledWith("https://x/threads/t1/", {
      method: "DELETE",
      headers: {},
      body: null,
    });
    // The server still lists t1; the optimistic overlay drops it.
    expect((await store.listThreads()).map((m) => m.threadId)).toEqual(["t2"]);
  });

  it("tolerates a failed server mutation", async () => {
    fetchMock.mockRejectedValue(new Error("net down"));
    const store = new RemoteConversationStore("https://x/threads/");
    expect(() => store.renameThread("t1", "x")).not.toThrow();
    expect(() => store.clear("t1")).not.toThrow();
    await flush(); // let the rejected mutations settle (the catch swallows them)
  });

  it("delegates the client-only operations to the local store", () => {
    const local = new SessionStorageStore();
    const store = new RemoteConversationStore("https://x/threads/", () => ({}), local);
    store.setActiveThread("t9");
    expect(store.threadId()).toBe("t9");
    store.saveMessages("t9", [{ id: "m", role: "user", content: "hi" }] as never);
    store.saveCheckpoint("t9", { toolCallId: "c1" });
    expect(store.loadCheckpoint("t9")).toEqual({ toolCallId: "c1" });
  });
});
