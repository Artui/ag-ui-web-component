import { afterEach, describe, expect, it, vi } from "vitest";
import { RunIndex, type RunRow } from "../src/core/run_index.js";

function row(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: "2026-07-27T12:00:00+00:00",
    continuable: true,
    ...overrides,
  };
}

function mockFetch(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const spy = vi.fn(async () => ({ ok, json: async () => body }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("list", () => {
  it("returns the server's rows", async () => {
    mockFetch({ runs: [row(), row({ run_id: "r2" })] });
    expect((await new RunIndex("/agent/runs/").list()).map((r) => r.run_id)).toEqual(["r1", "r2"]);
  });

  it("sends the live headers", async () => {
    const spy = mockFetch({ runs: [] });
    await new RunIndex("/agent/runs/", () => ({ "X-CSRFToken": "abc" })).list();

    expect(spy.mock.calls[0]?.[1]).toMatchObject({
      headers: { Accept: "application/json", "X-CSRFToken": "abc" },
    });
  });

  it("re-reads headers per call, so a rotated token still lands", async () => {
    let token = "one";
    const spy = mockFetch({ runs: [] });
    const index = new RunIndex("/agent/runs/", () => ({ "X-CSRFToken": token }));

    await index.list();
    token = "two";
    await index.list();

    expect(spy.mock.calls[1]?.[1]).toMatchObject({ headers: { "X-CSRFToken": "two" } });
  });

  it("re-reads the credentials mode per call, so a cross-origin index sends cookies", async () => {
    let mode: RequestCredentials | undefined;
    const spy = mockFetch({ runs: [] });
    const index = new RunIndex(
      "/agent/runs/",
      () => ({}),
      () => mode,
    );

    await index.list();
    // Configured after the index was built and cached — the shape a host ref
    // produces, which a captured value would have missed.
    mode = "include";
    await index.list();

    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("credentials");
    expect(spy.mock.calls[1]?.[1]).toMatchObject({ credentials: "include" });
  });

  it("is empty rather than broken when the endpoint errors", async () => {
    mockFetch({}, false);
    expect(await new RunIndex("/agent/runs/").list()).toEqual([]);
  });

  it("is empty rather than broken when the request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await new RunIndex("/agent/runs/").list()).toEqual([]);
  });

  it("tolerates a body with no runs key", async () => {
    mockFetch({});
    expect(await new RunIndex("/agent/runs/").list()).toEqual([]);
  });
});

describe("continuable", () => {
  it("keeps only the runs with a snapshot", async () => {
    mockFetch({
      runs: [row({ run_id: "r1" }), row({ run_id: "r2", continuable: false })],
    });
    expect((await new RunIndex("/agent/runs/").continuable()).map((r) => r.run_id)).toEqual(["r1"]);
  });

  it("is empty when nothing can be continued", async () => {
    mockFetch({ runs: [row({ continuable: false })] });
    expect(await new RunIndex("/agent/runs/").continuable()).toEqual([]);
  });
});

describe("sibling endpoints", () => {
  it("derives resume and fork from the index prefix", () => {
    const index = new RunIndex("/agent/runs/");
    expect(index.resumeUrl("abc")).toBe("/agent/resume/abc/");
    expect(index.forkUrl("abc")).toBe("/agent/fork/abc/");
  });

  it("normalises a URL given without its trailing slash", () => {
    expect(new RunIndex("/agent/runs").resumeUrl("abc")).toBe("/agent/resume/abc/");
  });

  it("works with an absolute URL", () => {
    expect(new RunIndex("https://x.test/agent/runs/").forkUrl("abc")).toBe(
      "https://x.test/agent/fork/abc/",
    );
  });

  it("encodes a run id so a stray slash cannot escape the path", () => {
    expect(new RunIndex("/agent/runs/").resumeUrl("a/b")).toBe("/agent/resume/a%2Fb/");
  });
});
