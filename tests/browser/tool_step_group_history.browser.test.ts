import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../../src/core/conversation_store.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * A conversation restored from the store comes back folded, the way it was
 * drawn live.
 *
 * Replay draws each restored call through the same card path as the live
 * stream, so it should group the same way; this holds that it does, since a
 * reload that unfolded every past run into per-call cards would make the
 * default look different after a refresh than before it. In the browser for
 * the same reason as the live cases: the fold is CSS.
 */

const HISTORY: readonly Message[] = [
  { id: "u1", role: "user", content: "fill the form" },
  {
    id: "a1",
    role: "assistant",
    content: "",
    toolCalls: [
      {
        id: "c1",
        type: "function",
        function: { name: "fill_field", arguments: '{"field":"title"}' },
      },
      {
        id: "c2",
        type: "function",
        function: { name: "fill_field", arguments: '{"field":"slug"}' },
      },
      { id: "c3", type: "function", function: { name: "click_save", arguments: "{}" } },
    ],
  },
  { id: "t1", role: "tool", toolCallId: "c1", content: "ok" },
  { id: "t2", role: "tool", toolCallId: "c2", content: "ok" },
  { id: "t3", role: "tool", toolCallId: "c3", content: "saved" },
  { id: "a2", role: "assistant", content: "Saved." },
] as Message[];

function seededStore(messages: readonly Message[]): ClientConversationStore {
  return {
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> => Promise.resolve(messages),
    saveMessages: () => {},
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

function part(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 30));
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe("a restored conversation under the default display", () => {
  it("comes back with its run's calls folded into one row", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("placement", "embedded");
    el.conversationStore = seededStore(HISTORY);
    el.agentFactory = () => makeFakeAgent().agent;
    document.body.appendChild(el);
    await settle();

    const root = el.shadowRoot as ShadowRoot;
    const groups = root.querySelectorAll(".tool-group");
    expect(groups).toHaveLength(1);
    const group = groups[0] as HTMLElement;
    expect(group.getAttribute("data-open")).toBe("false");
    expect(part(group, ".tool-group-label").textContent).toBe("Worked through 3 steps");
    expect(part(group, ".tool-group-head").getBoundingClientRect().height).toBeGreaterThan(0);

    const cards = [...root.querySelectorAll<HTMLElement>(".tool-call")];
    expect(cards).toHaveLength(3);
    for (const card of cards) {
      expect(card.closest(".tool-group")).toBe(group);
      expect(card.getAttribute("data-status")).toBe("done");
      expect(card.getBoundingClientRect().height).toBe(0);
    }
    expect(part(cards[1] as HTMLElement, ".tool-call-repeat").textContent).toBe("(2)");
    // The answer after the run is not folded with it.
    expect(part(root, ".message--assistant").closest(".tool-group")).toBeNull();
  });
});
