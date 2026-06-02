import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { Skill } from "../src/skills/skill.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

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

function input(el: AgUiChat): HTMLTextAreaElement {
  const node = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (node === null) {
    throw new Error("expected an input");
  }
  return node;
}

function typeQuery(el: AgUiChat, value: string): void {
  const node = input(el);
  node.value = value;
  node.dispatchEvent(new Event("input", { bubbles: true }));
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

const SUM: Skill = { name: "summarize", title: "Summarize", prompt: "Summarize this.", chip: true };
const DRAFT: Skill = { name: "draft", title: "Draft", prompt: "Draft it." };
const FIND: Skill = { name: "find", title: "Find", prompt: "Find {q}.", chip: true };

function embed(skills: Skill[]): string {
  return JSON.stringify(skills);
}

describe("AgUiChat skills", () => {
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

  it("renders only chip:true skills when chips are enabled", () => {
    const el = mount({ "data-skills": embed([SUM, DRAFT, FIND]), "data-prompt-chips": "true" });
    const chips = shadow(el).querySelectorAll(".skill-chip");
    expect([...chips].map((c) => c.textContent)).toEqual(["Summarize", "Find"]);
  });

  it("ignores malformed data-skills", () => {
    const el = mount({ "data-skills": "{not json", "data-prompt-chips": "true" });
    expect(shadow(el).querySelectorAll(".skill-chip")).toHaveLength(0);
  });

  it("opens the slash palette and picks with Enter, pre-filling the input", () => {
    const el = mount({ "data-skills": embed([SUM]), "data-slash-commands": "true" });
    typeQuery(el, "/");
    expect(shadow(el).querySelectorAll(".skill-item")).toHaveLength(1);
    input(el).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    expect(input(el).value).toBe("Summarize this.");
    expect(shadow(el).querySelector<HTMLElement>(".skill-palette")?.hidden).toBe(true);
  });

  it("blocks the pick and shows a hint when a placeholder is unfilled", () => {
    const el = mount({ "data-skills": embed([FIND]), "data-prompt-chips": "true" });
    shadow(el).querySelector<HTMLButtonElement>(".skill-chip")?.click();
    const hint = shadow(el).querySelector<HTMLElement>(".skill-hint");
    expect(hint?.hidden).toBe(false);
    expect(hint?.textContent).toContain("q");
    expect(input(el).value).toBe("");
    // typing clears the hint
    typeQuery(el, "x");
    expect(hint?.hidden).toBe(true);
  });

  it("fills placeholders from skillContext", () => {
    const el = mount({ "data-skills": embed([FIND]), "data-prompt-chips": "true" });
    el.skillContext = () => ({ q: "widgets" });
    shadow(el).querySelector<HTMLButtonElement>(".skill-chip")?.click();
    expect(input(el).value).toBe("Find widgets.");
  });

  it("sends immediately when the skill opts in", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-prompt-chips", "true");
    el.setAttribute("data-skills", embed([{ ...SUM, sendImmediately: true }]));
    el.agentFactory = () => makeFakeAgent({ script: () => {} }).agent;
    document.body.appendChild(el);

    shadow(el).querySelector<HTMLButtonElement>(".skill-chip")?.click();
    await flush();
    const user = shadow(el).querySelector(".message--user");
    expect(user?.textContent).toBe("Summarize this.");
    expect(input(el).value).toBe("");
  });

  it("merges client skills over embedded ones by name", () => {
    const el = mount({
      "data-skills": embed([{ name: "x", title: "Embed X", prompt: "e", chip: true }]),
      "data-prompt-chips": "true",
    });
    el.setSkills([{ name: "x", title: "Client X", prompt: "c", chip: true }]);
    expect(shadow(el).querySelector(".skill-chip")?.textContent).toBe("Client X");
  });

  it("fetches backend skills from data-skills-url and merges them", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve([{ name: "b", title: "Backend", prompt: "p", chip: true }]),
      }),
    );
    const el = mount({ "data-skills-url": "/skills/", "data-prompt-chips": "true" });
    await flush();
    expect(shadow(el).querySelector(".skill-chip")?.textContent).toBe("Backend");
  });

  it("ignores a failed skills fetch", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const el = mount({ "data-skills-url": "/skills/", "data-prompt-chips": "true" });
    await flush();
    expect(shadow(el).querySelectorAll(".skill-chip")).toHaveLength(0);
  });
});
