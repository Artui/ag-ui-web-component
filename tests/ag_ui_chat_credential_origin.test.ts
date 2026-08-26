import { afterEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

/** Let the element's deferred startup fetches resolve. */
const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

/**
 * Seven attributes on this element name a URL, and every one of them carries the
 * host's `headers` / `getHeaders`. Covering only the agent endpoint would report
 * the least interesting of the seven, so these mount an element whose *other*
 * endpoints point somewhere foreign.
 */
function mount(attrs: Record<string, string>): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  el.headers = { Authorization: "Bearer host-token" };
  el.agentFactory = () => makeFakeAgent().agent;
  return el;
}

function warnings(spy: { mock: { calls: unknown[][] } }): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("credentials leaving the page's origin", () => {
  it("reports a foreign tool-catalog endpoint before the headers reach it", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ "data-tools-url": "https://catalog.example/tools/" });
    document.body.appendChild(el);
    await flush();

    const hits = warnings(warn).filter((m) => m.includes("https://catalog.example"));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain("Authorization");
  });

  it("stays quiet about an origin the host has named as trusted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ "data-skills-url": "https://catalog.example/skills/" });
    el.trustedOrigins = ["https://catalog.example"];
    document.body.appendChild(el);
    await flush();

    expect(warnings(warn).filter((m) => m.includes("catalog.example"))).toHaveLength(0);
  });

  it("says nothing for a same-origin endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const el = mount({ "data-tools-url": "/agent/tools/" });
    document.body.appendChild(el);
    await flush();

    expect(warnings(warn).filter((m) => m.includes("host credentials"))).toHaveLength(0);
    expect(el.isConnected).toBe(true);
  });
});
