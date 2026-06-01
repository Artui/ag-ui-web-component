import { beforeEach, describe, expect, it } from "vitest";
import { SessionStorageStore } from "../src/conversation_store.js";

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
});
