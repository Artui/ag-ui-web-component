import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientConversationStore } from "../src/core/conversation_store.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { mintThread, withCredentials } from "../src/core/utils.js";

describe("withCredentials", () => {
  it("hands back the very same init when no mode is configured", () => {
    const init = { method: "GET", headers: { a: "1" } };
    // Identity, not equality: an unconfigured call must reach fetch exactly as
    // the caller built it, with no `credentials` key at all — an explicit
    // `undefined` would state a policy where the point is to leave the
    // browser's own default alone.
    expect(withCredentials(init, undefined)).toBe(init);
    expect(withCredentials(undefined, undefined)).toBeUndefined();
  });

  it("overlays the mode, keeping every other init field", () => {
    expect(withCredentials({ method: "POST", headers: { a: "1" } }, "include")).toEqual({
      method: "POST",
      headers: { a: "1" },
      credentials: "include",
    });
  });

  it("builds an init from nothing when only a mode is given", () => {
    expect(withCredentials(undefined, "omit")).toEqual({ credentials: "omit" });
  });
});

describe("mintThread", () => {
  beforeEach(() => sessionStorage.clear());

  it("uses the store's own newThread when it has one", () => {
    const store = new SessionStorageStore();
    const first = store.threadId();
    const second = mintThread(store);
    expect(second).not.toBe(first);
    expect(store.threadId()).toBe(second);
    expect(store.isUnsent(second)).toBe(true);
  });

  it("mints and activates an id for a store that predates newThread", () => {
    let active = "seeded";
    const store = {
      threadId: () => active,
      setActiveThread: (threadId: string) => {
        active = threadId;
      },
    } as unknown as ClientConversationStore;

    const minted = mintThread(store);

    expect(minted).not.toBe("seeded");
    expect(active).toBe(minted);
  });

  it("never clears the thread it moves off", () => {
    const clear = vi.fn();
    const store = {
      threadId: () => "t1",
      setActiveThread: () => {},
      clear,
    } as unknown as ClientConversationStore;

    mintThread(store);

    expect(clear).not.toHaveBeenCalled();
  });
});
