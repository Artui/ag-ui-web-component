import { HttpAgent } from "@ag-ui/client";
import { describe, expect, it } from "vitest";
import { createHttpAgent } from "../src/core/create_http_agent.js";

describe("createHttpAgent", () => {
  it("builds an HttpAgent pointed at the endpoint with headers", () => {
    const agent = createHttpAgent({
      endpoint: "/agent/",
      headers: { "X-CSRFToken": "abc" },
    });
    expect(agent).toBeInstanceOf(HttpAgent);
    expect((agent as HttpAgent).url).toBe("/agent/");
    expect((agent as HttpAgent).headers).toMatchObject({ "X-CSRFToken": "abc" });
  });

  it("defaults headers to an empty object", () => {
    const agent = createHttpAgent({ endpoint: "/agent/" });
    expect((agent as HttpAgent).headers).toEqual({});
  });

  it("threads a thread id and seeds initial messages when supplied", () => {
    const agent = createHttpAgent({
      endpoint: "/agent/",
      threadId: "t-123",
      initialMessages: [{ id: "m1", role: "user", content: "hi" } as never],
    });
    expect((agent as HttpAgent).threadId).toBe("t-123");
    expect((agent as HttpAgent).messages).toEqual([{ id: "m1", role: "user", content: "hi" }]);
  });

  it("provides a fetch wrapper that calls the global fetch as a free function", async () => {
    const agent = createHttpAgent({ endpoint: "/agent/" });
    const wrapped = (agent as HttpAgent).fetch;
    const original = globalThis.fetch;
    const calls: Array<[string, RequestInit]> = [];
    // Replace the global fetch with a recorder; the wrapper must reach it
    // without an illegal-invocation receiver error.
    globalThis.fetch = ((url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    try {
      const res = await wrapped("/agent/", { method: "POST" });
      expect(await res.text()).toBe("ok");
      expect(calls).toEqual([["/agent/", { method: "POST" }]]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
