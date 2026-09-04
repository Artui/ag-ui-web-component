import { beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The snapshot notice is really on screen, in a real engine.
 *
 * `tests/ag_ui_chat_silent_failures.test.ts` proves the rest: that the host
 * persists whatever `agent.messages` holds after a `MESSAGES_SNAPSHOT`, and
 * that the in-flight transcript survives. Those use a stub store on purpose --
 * what is being asserted there is *our call*, not `sessionStorage` semantics,
 * and the store's own round-trip is covered by the store's own tests.
 *
 * What could not be asserted there is that the notice explaining the
 * replacement actually renders. happy-dom will confirm the element exists and
 * carries a class; only a real cascade says whether a reader would ever see it,
 * and this whole defect is about a divergence nobody was told about. A notice
 * that is present but not displayed is the same defect with more code.
 */

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe("the history-replaced notice", () => {
  beforeEach(() => {
    sessionStorage.clear();
    // Layout preferences are durable on purpose, so the per-tab clear no longer
    // reaches all of them. Without this a dragged position leaks into the next
    // test, which reads as a drag that travelled the wrong distance.
    localStorage.clear();
    document.body.innerHTML = "";
    defineAgUiChat();
  });

  it("is rendered and visible when the server replaces the conversation", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-start-open", "");
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.textStart("m1");
        emit.textEnd("the real answer", "m1");
        emit.messagesSnapshot([{ id: "s1", role: "assistant", content: "server rewrote this" }]);
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.append(el);

    const input = el.shadowRoot?.querySelector<HTMLTextAreaElement>(".input");
    if (input) {
      input.value = "hi";
    }
    el.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    const notice = el.shadowRoot?.querySelector(".run-notice--history-replaced");
    expect(notice).not.toBeNull();
    const style = getComputedStyle(notice as Element);
    expect(style.display).not.toBe("none");
    expect(style.visibility).not.toBe("hidden");
    expect((notice as Element).getBoundingClientRect().height).toBeGreaterThan(0);
  });

  it("is absent from an ordinary run", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("data-start-open", "");
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.textStart("m1");
        emit.textEnd("an ordinary answer", "m1");
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.append(el);

    const input = el.shadowRoot?.querySelector<HTMLTextAreaElement>(".input");
    if (input) {
      input.value = "hi";
    }
    el.shadowRoot?.querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    expect(el.shadowRoot?.querySelector(".run-notice--history-replaced")).toBeNull();
  });
});
