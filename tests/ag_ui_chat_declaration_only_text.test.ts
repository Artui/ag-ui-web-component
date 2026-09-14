/**
 * A text message that opens and closes carrying nothing.
 *
 * `TOOL_CALL_START` names the assistant message a call belongs to, and a
 * response whose first part is a tool call has no text to open that message
 * with. pydantic-ai 2.37 started opening and closing an empty one there so the
 * `parentMessageId` names a message the stream actually announced -- before
 * that it named one no event carried, and a client could only answer by
 * inventing an id that matches nothing echoed back. The envelope is therefore a
 * correctness fix on the server side, it is legal AG-UI, and any server may
 * send one.
 *
 * What it must not do is draw a bubble. Rendering it puts an empty bubble above
 * every tool call, and `#renderHistoricMessage` has always declined to draw one
 * for the same message -- so the transcript on screen during a run disagreed
 * with the same conversation after a reload. The last case here asserts that
 * agreement as a relation between the two paths rather than as two snapshots
 * that could drift apart.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await Promise.resolve();
  }
}

function mountWithAgent(script: (emit: Emit) => void): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return el;
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  await flush();
}

function bubbleTexts(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".message")].map((node) => node.textContent ?? "");
}

/** The shape pydantic-ai emits: an empty envelope, the call, then the answer. */
function toolCallRun(emit: Emit): void {
  emit.runStart();
  emit.textStart("message-1");
  emit.textEnd("", "message-1");
  emit.toolCall("call-1", "lookup_docs", { q: "settlement" });
  emit.toolResult("call-1", "three mentions");
  emit.textStart("message-5");
  emit.textEnd("the handbook mentions it three times", "message-5");
  emit.runEnd();
}

describe("a text message that carried no content", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("draws no bubble, while the call it introduces still gets its card", async () => {
    const el = mountWithAgent(toolCallRun);
    await send(el, "check the handbook");

    // The user's message and the one real answer. An empty assistant bubble
    // between them is what this is about: it is 16px tall in a real engine, so
    // it reads as a gap in the transcript rather than as nothing.
    expect(bubbleTexts(el)).toEqual(["check the handbook", "the handbook mentions it three times"]);
    // Declining the bubble must not cost the card, which hangs off the tool
    // call rather than off the message that declared its parent.
    expect(shadow(el).querySelector(".tool-call")?.getAttribute("data-tool-name")).toBe(
      "lookup_docs",
    );
  });

  it("still draws a message that carried one space", async () => {
    // The guard tests the buffer for emptiness, not for blankness, and the
    // difference is deliberate: whitespace is content a server chose to send,
    // and trimming here would make the client the judge of what counts as an
    // answer. Sized to fail if the condition is ever widened to `.trim()`.
    const el = mountWithAgent((emit) => {
      emit.runStart();
      emit.textStart("message-1");
      emit.textEnd(" ", "message-1");
      emit.runEnd();
    });
    await send(el, "say nothing");

    expect(shadow(el).querySelectorAll(".message--assistant")).toHaveLength(1);
  });

  it("renders the same transcript live as the reload of that conversation does", async () => {
    const live = mountWithAgent(toolCallRun);
    await send(live, "check the handbook");
    const duringTheRun = bubbleTexts(live);

    // Unmount and let anything the live element persists on disconnect settle,
    // then start the stored conversation from scratch. Without both, the live
    // run's own thread is still in session storage and answers for the reload.
    document.body.innerHTML = "";
    await flush();
    sessionStorage.clear();

    const store = new SessionStorageStore();
    store.saveMessages(store.threadId(), [
      { id: "user-1", role: "user", content: "check the handbook" },
      // The declaration, as a stored history carries it: an assistant message
      // whose content is empty.
      { id: "message-1", role: "assistant", content: "" },
      { id: "message-5", role: "assistant", content: "the handbook mentions it three times" },
    ] as never);
    const reloaded = document.createElement(ELEMENT_TAG) as AgUiChat;
    reloaded.setAttribute("endpoint", "/agent/");
    reloaded.conversationStore = store;
    document.body.appendChild(reloaded);
    await flush();

    // Asserted against each other, not against a literal. Two snapshots can
    // both be updated when one path changes; this fails unless they move
    // together.
    expect(duringTheRun).toEqual(bubbleTexts(reloaded));
  });
});
