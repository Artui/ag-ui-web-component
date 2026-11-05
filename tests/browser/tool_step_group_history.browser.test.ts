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
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

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

/** A store that keeps what the live element saved, for a second element to restore. */
function memoryStore(): ClientConversationStore & { saved: () => readonly Message[] } {
  let saved: readonly Message[] = [];
  return {
    ...seededStore([]),
    saved: () => saved,
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : saved),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = JSON.parse(JSON.stringify(messages)) as readonly Message[];
    },
  };
}

function mount(store: ClientConversationStore, script: (emit: Emit) => void): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.conversationStore = store;
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  // Drawn as a fragment, the shape that leaves no node of its own behind once
  // placed, so the group's run has to be followed through its children.
  el.registerTool({
    name: "draw",
    description: "draws its number",
    parameters: { type: "object", properties: { n: { type: "number" } } },
    handler: () => "drawn",
    render: (args) => {
      const fragment = document.createDocumentFragment();
      const node = document.createElement("div");
      node.className = "drawn";
      node.textContent = String(args["n"]);
      fragment.append(node);
      return fragment;
    },
  });
  document.body.appendChild(el);
  return el;
}

/** The groups, outputs and messages of each answer, in the order the reader meets them. */
function layout(el: AgUiChat): string[] {
  const answers = [...(el.shadowRoot as ShadowRoot).querySelectorAll(".answer")];
  return answers.flatMap((answer) =>
    [...answer.querySelectorAll(":scope > :is(.tool-group, .drawn, .message)")].map((child) =>
      child.classList.contains("tool-group")
        ? `group of ${child.querySelectorAll(".tool-call").length}`
        : child.className,
    ),
  );
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

  it("draws a run whose call rendered output the way the live stream drew it", async () => {
    const live = memoryStore();
    let round = 0;
    const first = mount(live, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("d1", "draw", { n: 1 });
        emit.toolCall("f1", "fill_field", { field: "title" });
        emit.toolResult("f1", "ok");
      }
      round += 1;
      emit.runEnd();
    });
    void first.sendMessage("draw and fill");
    await settle();
    await settle();
    const drawnLive = layout(first);
    expect(drawnLive).toEqual(["group of 2", "drawn"]);

    const reloaded = seededStore(live.saved());
    document.body.replaceChildren();
    const second = mount(reloaded, () => {});
    await settle();
    expect(layout(second)).toEqual(drawnLive);
  });
});
