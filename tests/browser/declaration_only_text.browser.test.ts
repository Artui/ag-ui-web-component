import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The empty bubble is a visual defect, so it is measured in a real engine.
 *
 * `tests/ag_ui_chat_declaration_only_text.test.ts` pins the rule -- a text
 * message carrying no content draws no bubble, and the live transcript agrees
 * with the reloaded one. What happy-dom cannot say is whether the bubble a
 * reader would have seen was actually visible: an element with no text could
 * plausibly collapse to nothing and cost the reader nothing.
 *
 * It does not. Measured here before the fix, the empty assistant bubble was
 * 16px tall and laid out between the question and the tool card, so it read as
 * a gap rather than as nothing. This asserts the height of what sits in the
 * transcript, which is the property the reader actually has.
 */

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe("a declaration-only text message before a tool call", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    defineAgUiChat();
  });

  it("occupies no height in the transcript, because it is never drawn", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-start-open", "");
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.textStart("message-1");
        emit.textEnd("", "message-1");
        emit.toolCall("call-1", "lookup_docs", { q: "settlement" });
        emit.toolResult("call-1", "three mentions");
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.append(el);

    const root = el.shadowRoot;
    const input = root?.querySelector<HTMLTextAreaElement>(".input");
    if (input) {
      input.value = "check the handbook";
    }
    root?.querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    const assistants = [...(root?.querySelectorAll<HTMLElement>(".message--assistant") ?? [])];
    // Not "there is no empty one" but "there is no assistant bubble at all":
    // this run's only assistant part was the declaration, so any bubble here is
    // the defect, whatever it measures.
    expect(assistants).toHaveLength(0);
    // The card is what the reader should see instead, and it must be real
    // rather than merely present -- a zero-height card would satisfy a
    // presence check and show nothing.
    const card = root?.querySelector<HTMLElement>(".tool-call");
    expect(card).not.toBeNull();
    expect(card?.getBoundingClientRect().height).toBeGreaterThan(0);
  });
});
