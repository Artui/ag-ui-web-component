import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionStorageStore } from "../src/core/conversation_store.js";

describe("SessionStorageStore", () => {
  beforeEach(() => sessionStorage.clear());

  it("generates a thread id once and reuses it", () => {
    const store = new SessionStorageStore();
    const id = store.threadId();
    expect(id).not.toBe("");
    expect(store.threadId()).toBe(id);
  });

  it("round-trips the message history", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ id: "m1", role: "user", content: "hi" }] as never);
    expect(await store.loadMessages("t1")).toEqual([{ id: "m1", role: "user", content: "hi" }]);
  });

  it("returns null when no history is stored", async () => {
    expect(await new SessionStorageStore().loadMessages("absent")).toBeNull();
  });

  it("returns null for corrupt stored JSON", async () => {
    sessionStorage.setItem("ag-ui-chat:messages:t1", "{not valid json");
    expect(await new SessionStorageStore().loadMessages("t1")).toBeNull();
  });

  it("sets, reads, and clears the navigation checkpoint", () => {
    const store = new SessionStorageStore();
    expect(store.loadCheckpoint("t1")).toBeNull();
    store.saveCheckpoint("t1", { toolCallId: "tc9" });
    expect(store.loadCheckpoint("t1")).toEqual({ toolCallId: "tc9" });
    store.saveCheckpoint("t1", null);
    expect(store.loadCheckpoint("t1")).toBeNull();
  });

  it("clear forgets the history, checkpoint, and thread id", async () => {
    const store = new SessionStorageStore();
    const id = store.threadId();
    store.saveMessages(id, [{ id: "m", role: "user", content: "x" }] as never);
    store.saveCheckpoint(id, { toolCallId: "tc" });

    store.clear(id);

    expect(await store.loadMessages(id)).toBeNull();
    expect(store.loadCheckpoint(id)).toBeNull();
    expect(store.threadId()).not.toBe(id);
  });

  it("lists nothing before any messages are saved", async () => {
    expect(await new SessionStorageStore().listThreads()).toEqual([]);
  });

  it("registers a thread with a derived title + preview on save", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [
      { id: "u1", role: "user", content: "  book a   flight " },
      { id: "a1", role: "assistant", content: "Sure — where to?" },
    ] as never);

    const [meta, ...rest] = await store.listThreads();
    expect(rest).toEqual([]);
    expect(meta?.threadId).toBe("t1");
    expect(meta?.title).toBe("book a flight"); // first user message, whitespace collapsed
    expect(meta?.preview).toBe("Sure — where to?"); // latest message
    expect(meta?.updatedAt).toBeGreaterThan(0);
  });

  it("orders threads newest-first by updatedAt", async () => {
    vi.useFakeTimers();
    const store = new SessionStorageStore();
    vi.setSystemTime(1000);
    store.saveMessages("old", [{ role: "user", content: "first" }] as never);
    vi.setSystemTime(2000);
    store.saveMessages("new", [{ role: "user", content: "second" }] as never);
    vi.useRealTimers();
    expect((await store.listThreads()).map((t) => t.threadId)).toEqual(["new", "old"]);
  });

  it("re-saving refreshes the preview and re-derives an underived title", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ role: "user", content: "book a flight" }] as never);
    store.saveMessages("t1", [
      { role: "user", content: "book a flight" },
      { role: "user", content: "actually, cancel it" },
    ] as never);

    const [meta] = await store.listThreads();
    expect(meta?.title).toBe("book a flight"); // first user message, unchanged
    expect(meta?.preview).toBe("actually, cancel it"); // latest message
  });

  it("rename freezes the title against later saves; missing thread is a no-op", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ role: "user", content: "book a flight" }] as never);
    store.renameThread("t1", "Trip planning");
    store.renameThread("absent", "ignored"); // no such thread → no-op
    store.saveMessages("t1", [
      { role: "user", content: "book a flight" },
      { role: "user", content: "and a hotel" },
    ] as never);

    const threads = await store.listThreads();
    expect(threads.map((t) => t.threadId)).toEqual(["t1"]);
    expect(threads[0]?.title).toBe("Trip planning"); // rename sticks
    expect(threads[0]?.preview).toBe("and a hotel");
  });

  it("setActiveThread makes a thread the active id", () => {
    const store = new SessionStorageStore();
    store.setActiveThread("chosen");
    expect(store.threadId()).toBe("chosen");
  });

  it("deleting a non-active thread leaves the active conversation intact", () => {
    const store = new SessionStorageStore();
    const active = store.threadId();
    store.saveMessages("other", [{ role: "user", content: "x" }] as never);
    store.clear("other");
    expect(store.threadId()).toBe(active); // active pointer untouched
  });

  it("falls back to a default title and empty preview without user text", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ role: "user", content: "" }] as never);
    const [meta] = await store.listThreads();
    expect(meta?.title).toBe("New conversation");
    expect(meta?.preview).toBe("");
  });

  it("ignores non-string message content when deriving metadata", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ role: "assistant", content: null }] as never);
    const [meta] = await store.listThreads();
    expect(meta?.title).toBe("New conversation");
    expect(meta?.preview).toBe("");
  });

  it("truncates long titles and previews with an ellipsis", async () => {
    const store = new SessionStorageStore();
    store.saveMessages("t1", [{ role: "user", content: "x".repeat(150) }] as never);
    const [meta] = await store.listThreads();
    expect(meta?.title).toHaveLength(60);
    expect(meta?.title.endsWith("…")).toBe(true);
    expect(meta?.preview).toHaveLength(100);
    expect(meta?.preview.endsWith("…")).toBe(true);
  });
});
