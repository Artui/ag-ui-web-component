import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import type { HttpAgentOptions } from "../src/core/create_http_agent.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";
import { installFakeMedia } from "./helpers/fake_media.js";
import { type FakeXhrController, installFakeXhr } from "./helpers/fake_xhr.js";

/** One recorded `fetch`. */
interface Call {
  readonly url: string;
  readonly init: RequestInit | undefined;
}

/**
 * Every endpoint the element can be given. The transport tests configure all of
 * them at once, so "does this setting reach every request?" is asked of the
 * whole surface rather than one call site at a time — a new endpoint added
 * without threading the configuration through shows up here as an unauthorised
 * call, not as a defect a consumer finds in production.
 */
const ENDPOINTS: Record<string, string> = {
  endpoint: "/agent/",
  "data-tools-url": "/agent/tools/",
  "data-skills-url": "/agent/skills/",
  "data-threads-url": "/agent/threads/",
  "data-runs-url": "/agent/runs/",
  "data-transcribe-url": "/agent/transcribe/",
  "data-attachments-url": "/agent/attachments/",
};

/** A plausible body per endpoint, so each parse path succeeds. */
function bodyFor(url: string): unknown {
  switch (url) {
    case "/agent/threads/":
      return { threads: [] };
    case "/agent/runs/":
      return { runs: [] };
    case "/agent/transcribe/":
      return { text: "spoken" };
    default:
      // A thread's messages (`/agent/threads/<id>/`), or a catalog.
      return url.startsWith("/agent/threads/") ? { messages: [] } : [];
  }
}

function installFetch(): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return { ok: true, json: async () => bodyFor(url) } as unknown as Response;
    }),
  );
  return calls;
}

/** The request's headers, normalised (names lowercase) however they were given. */
function headersOf(init: RequestInit | undefined): Record<string, string> {
  const named: Record<string, string> = {};
  new Headers(init?.headers ?? {}).forEach((value, name) => {
    named[name.toLowerCase()] = value;
  });
  return named;
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

/** Build (but do not insert) a fully-wired element with a fake agent. */
function build(setup?: (el: AgUiChat) => void): {
  el: AgUiChat;
  agentOptions: HttpAgentOptions[];
} {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [name, value] of Object.entries(ENDPOINTS)) {
    el.setAttribute(name, value);
  }
  const handle = makeFakeAgent({
    script: (emit) => {
      emit.runStart();
      emit.runEnd();
    },
  });
  const agentOptions: HttpAgentOptions[] = [];
  el.agentFactory = (options) => {
    agentOptions.push(options);
    return handle.agent;
  };
  setup?.(el);
  return { el, agentOptions };
}

let xhr: FakeXhrController;

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  xhr = installFakeXhr();
});

afterEach(() => {
  xhr.restore();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Make the tab's active thread one that has been used, so its history is fetched.
 *
 * The element skips the history request for a thread it just minted, so a mount
 * on a virgin tab has no `/agent/threads/:id/` call to inspect. Written through
 * the store's own API rather than by poking `sessionStorage`, so it keeps working
 * if the keys change.
 */
function seedUsedThread(): void {
  const store = new SessionStorageStore();
  store.saveMessages(store.threadId(), [{ id: "m1", role: "user", content: "earlier" }] as never);
}

/**
 * Drive every request the element can make, once, and report what went out.
 *
 * Deliberately one helper rather than a test per endpoint: the property under
 * test is "all of them", and a per-endpoint test cannot fail for the endpoint
 * nobody remembered to add.
 */
async function driveEveryRequest(el: AgUiChat): Promise<void> {
  const media = installFakeMedia();
  try {
    // Pre-seed the tab's active thread with a saved message, so mounting fetches
    // that thread's history. A freshly minted thread deliberately makes no such
    // request -- the server cannot have it -- and this helper's whole point is
    // that every request site the element has is exercised once.
    seedUsedThread();
    document.body.appendChild(el);
    // The startup catalogs (deferred a microtask) and the thread's history.
    await flush();
    // The thread index, and the run index behind the checkpoints panel.
    el.openThreads();
    el.openCheckpoints();
    await flush();
    // Transcription: record, then stop, which posts the clip.
    const mic = shadow(el).querySelector<HTMLButtonElement>(".voice-btn");
    mic?.click();
    await flush();
    mic?.click();
    await flush();
    // The attachment upload (XMLHttpRequest, not fetch).
    el.attachFile(new File(["hello"], "notes.txt", { type: "text/plain" }));
    xhr.last().succeed(201, JSON.stringify({ id: "a1", name: "n", mime: "text/plain", size: 5 }));
    await flush();
    // The agent run itself.
    await el.sendMessage("hi");
  } finally {
    media.restore();
  }
}

describe("AgUiChat transport — getHeaders", () => {
  it("reaches every request the element makes, not just the agent run", async () => {
    const calls = installFetch();
    const { el, agentOptions } = build((e) => {
      e.getHeaders = () => ({ Authorization: "Bearer live" });
    });

    await driveEveryRequest(el);

    // Every endpoint was actually exercised; a request site that stopped being
    // driven here would drop out of this set rather than pass silently.
    const seen = new Set(
      calls.map((call) => call.url.replace(/\/agent\/threads\/[^/]+\/$/, "/agent/threads/:id/")),
    );
    expect(seen).toEqual(
      new Set([
        "/agent/tools/",
        "/agent/skills/",
        "/agent/threads/",
        "/agent/threads/:id/",
        "/agent/runs/",
        "/agent/transcribe/",
      ]),
    );
    for (const call of calls) {
      expect(headersOf(call.init)).toMatchObject({ authorization: "Bearer live" });
    }
    // The two transports that are not fetch: the upload's XHR, and the agent,
    // which receives the live source itself.
    expect(xhr.last().headers["Authorization"]).toBe("Bearer live");
    expect(agentOptions.at(-1)?.getHeaders?.()).toEqual({ Authorization: "Bearer live" });
  });

  it("is consulted again for each request, so a rotated token lands", async () => {
    const calls = installFetch();
    let token = "one";
    const { el } = build((e) => {
      e.getHeaders = () => ({ Authorization: token });
    });
    document.body.appendChild(el);
    await flush();

    el.openThreads();
    await flush();
    token = "two";
    el.openThreads();
    await flush();

    const threadLists = calls.filter((call) => call.url === "/agent/threads/");
    expect(threadLists.map((call) => headersOf(call.init)["authorization"])).toEqual([
      "one",
      "two",
    ]);
  });

  it("merges over the static headers per key, with getHeaders winning", async () => {
    const calls = installFetch();
    const { el } = build((e) => {
      e.headers = { "X-Client": "admin", Authorization: "Bearer stale" };
      e.getHeaders = () => ({ Authorization: "Bearer fresh" });
    });
    document.body.appendChild(el);
    await flush();

    const sent = headersOf(calls[0]?.init);
    // The static header survives (it would be lost if getHeaders replaced the
    // map wholesale) and the rotating one wins.
    expect(sent).toMatchObject({ "x-client": "admin", authorization: "Bearer fresh" });
  });

  it("keeps the plain headers field working on its own", async () => {
    const calls = installFetch();
    const { el } = build((e) => {
      e.headers = { "X-CSRFToken": "abc" };
    });
    document.body.appendChild(el);
    await flush();

    expect(headersOf(calls[0]?.init)).toMatchObject({ "x-csrftoken": "abc" });
  });
});

describe("AgUiChat transport — credentials", () => {
  it("reaches every request the element makes", async () => {
    const calls = installFetch();
    const { el, agentOptions } = build((e) => {
      e.credentials = "include";
    });

    await driveEveryRequest(el);

    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call.init?.credentials).toBe("include");
    }
    // XHR has no `credentials`; `include` maps onto its two-state switch.
    expect(xhr.last().withCredentials).toBe(true);
    expect(agentOptions.at(-1)?.credentials).toBe("include");
  });

  it("stays absent when unconfigured, leaving the browser default alone", async () => {
    const calls = installFetch();
    const { el, agentOptions } = build();

    await driveEveryRequest(el);

    for (const call of calls) {
      expect(call.init).not.toHaveProperty("credentials");
    }
    expect(xhr.last().withCredentials).toBe(false);
    expect(agentOptions.at(-1)).not.toHaveProperty("credentials");
  });

  it("mirrors the property to the attribute, and back", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    expect(el.credentials).toBeNull();

    el.credentials = "include";
    expect(el.getAttribute("credentials")).toBe("include");
    expect(el.credentials).toBe("include");

    el.setAttribute("credentials", "omit");
    expect(el.credentials).toBe("omit");

    el.credentials = null;
    expect(el.hasAttribute("credentials")).toBe(false);
    expect(el.credentials).toBeNull();
  });

  it("throws on an unknown mode assigned as a property", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    // Fails where the mistake was made. Left to request time it would be inert,
    // and the 401 that followed would look like a server fault.
    expect(() => {
      el.credentials = "true" as RequestCredentials;
    }).toThrow(/credentials must be one of/);
    expect(el.hasAttribute("credentials")).toBe(false);
  });

  it("reports an unknown mode written as an attribute, and ignores it", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = installFetch();
    const { el } = build((e) => {
      e.setAttribute("credentials", "yes-please");
    });

    expect(error).toHaveBeenCalledWith(expect.stringContaining("not a fetch credentials mode"));
    expect(el.credentials).toBeNull();

    document.body.appendChild(el);
    await flush();
    for (const call of calls) {
      expect(call.init).not.toHaveProperty("credentials");
    }
  });

  it("says nothing for a valid attribute, or for removing it", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("credentials", "same-origin");
    el.removeAttribute("credentials");
    expect(error).not.toHaveBeenCalled();
  });
});

describe("AgUiChat transport — startup timing", () => {
  it("honours configuration assigned right after insertion (the React ref shape)", async () => {
    const calls = installFetch();
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-tools-url", "/agent/tools/");
    el.setAttribute("data-skills-url", "/agent/skills/");

    document.body.appendChild(el);
    // What React does: insert, then attach the ref and configure. The catalog
    // requests must not already be in flight by now.
    el.getHeaders = () => ({ Authorization: "Bearer late" });
    el.credentials = "include";
    await flush();

    expect(calls.map((call) => call.url).sort()).toEqual(["/agent/skills/", "/agent/tools/"]);
    for (const call of calls) {
      expect(headersOf(call.init)).toMatchObject({ authorization: "Bearer late" });
      expect(call.init?.credentials).toBe("include");
    }
  });

  it("issues nothing for an element removed again in the same task", async () => {
    const calls = installFetch();
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-tools-url", "/agent/tools/");

    document.body.appendChild(el);
    el.remove();
    await flush();

    expect(calls).toEqual([]);
  });

  it("reload() re-runs the startup requests with the configuration as it now stands", async () => {
    const calls = installFetch();
    const { el } = build();
    document.body.appendChild(el);
    await flush();
    const before = calls.length;

    // The host could only authenticate late (an awaited token, a passive
    // effect); this is how it says "try that again, properly".
    el.getHeaders = () => ({ Authorization: "Bearer late" });
    await el.reload();
    await flush();

    const reissued = calls.slice(before);
    expect(reissued.map((call) => call.url)).toContain("/agent/tools/");
    expect(reissued.map((call) => call.url)).toContain("/agent/skills/");
    for (const call of reissued) {
      expect(headersOf(call.init)).toMatchObject({ authorization: "Bearer late" });
    }
  });

  it("reload() rebuilds the transcript from the stored history rather than doubling it", async () => {
    installFetch();
    const { el } = build();
    document.body.appendChild(el);
    await flush();
    await el.sendMessage("hi");
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(1);

    await el.reload();
    await flush();

    // The server-backed store answers with no messages, so the reload clears
    // what was on screen instead of appending a second copy of it.
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(0);
  });
});

describe("AgUiChat — routes out of the header", () => {
  it("opens the thread drawer without the header button", async () => {
    installFetch();
    const { el } = build();
    document.body.appendChild(el);
    await flush();

    // A host that hides ::part(header) loses the button; the method is the
    // route that survives it.
    el.openThreads();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".drawer")?.hidden).toBe(false);
  });

  it("opens the checkpoints panel without the header button", async () => {
    installFetch();
    const { el } = build();
    document.body.appendChild(el);
    await flush();

    el.openCheckpoints();
    await flush();

    expect(shadow(el).querySelector<HTMLElement>(".checkpoints")?.hidden).toBe(false);
  });
});
