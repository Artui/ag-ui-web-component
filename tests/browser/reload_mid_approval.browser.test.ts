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
 * A card restored from a reload mid-approval, as it is drawn.
 *
 * The spinner is not an element: it is a CSS animation keyed on the card's
 * `data-status`, so what a person sees spinning is decided by the cascade. The
 * happy-dom tests assert the attribute; this asserts that the running ring is
 * really gone, which only a browser computing the styles can answer.
 *
 * The stored state is captured from a real run at the open confirmation card,
 * before the element that ran it is removed -- removing it stops the run, which a
 * reload does not.
 */

/** A store that serialises, readable at the instant a reload would read it. */
function memoryStore(): ClientConversationStore & { saved: () => readonly Message[] } {
  let saved: readonly Message[] = [];
  return {
    saved: () => saved,
    threadId: () => "t1",
    setActiveThread: () => {},
    loadMessages: (): Promise<readonly Message[] | null> =>
      Promise.resolve(saved.length === 0 ? null : saved),
    saveMessages: (_threadId: string, messages: readonly Message[]): void => {
      saved = JSON.parse(JSON.stringify(messages)) as readonly Message[];
    },
    loadCheckpoint: (): NavigationCheckpoint | null => null,
    saveCheckpoint: () => {},
    clear: () => {},
    listThreads: (): Promise<readonly ThreadMeta[]> => Promise.resolve([]),
    renameThread: () => {},
  };
}

function mount(store: ClientConversationStore, script: (emit: Emit) => void): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-tool-display", "full");
  el.conversationStore = store;
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  document.body.appendChild(el);
  return el;
}

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

describe("a tool card restored from a reload mid-approval (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("is not drawn running", async () => {
    const live = memoryStore();
    let round = 0;
    const first = mount(live, (emit) => {
      emit.runStart();
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    first.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => "deleted",
    });
    const input = part(first, ".input") as HTMLTextAreaElement;
    input.value = "delete user 7";
    part(first, ".send").click();
    await settle();
    // The control: at the open confirmation the card really is spinning, so the
    // assertion below is about the restore and not about a rule that never
    // applied to this card.
    expect(getComputedStyle(part(first, ".tool-call-icon")).animationName).toBe("ag-ui-tool-spin");

    const reloaded = memoryStore();
    reloaded.saveMessages("t1", live.saved());
    document.body.innerHTML = "";
    const second = mount(reloaded, () => {});
    await settle();

    expect(getComputedStyle(part(second, ".tool-call-icon")).animationName).toBe("none");
    expect(part(second, ".tool-call").getAttribute("data-status")).toBe("declined");
  });
});
