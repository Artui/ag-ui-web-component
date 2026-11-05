import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cdp } from "vitest/browser";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * A wheel turned over a small scrolling block inside the transcript.
 *
 * The block has more room to scroll or none at all; either way the wheel is
 * the reader's, and a block that cannot use it hands it on to the transcript
 * around it. Contained, it swallowed the wheel instead, and the transcript sat
 * still under a pointer resting on a tool call's arguments.
 *
 * Driven with a real wheel through the browser's input pipeline, because a
 * dispatched WheelEvent scrolls nothing and so proves nothing. Held to the
 * `full` card display so it does not depend on grouping.
 */

const LONG = Array.from({ length: 60 }, (_, i) => `Line ${i} of a long answer.`).join("\n\n");

/** Each block that scrolls inside the transcript, with a run that draws it short. */
const BLOCKS: Record<
  string,
  { selector: string; run: (emit: Emit) => void; setup?: (el: AgUiChat) => void }
> = {
  "a tool call's arguments": {
    selector: ".tool-call-args",
    run: (emit) => {
      emit.toolCall("c1", "fill_field", { field: "title" });
      emit.toolResult("c1", "ok");
    },
  },
  "a tool call's result": {
    selector: ".tool-call-result",
    run: (emit) => {
      emit.toolCall("c1", "fill_field", { field: "title" });
      emit.toolResult("c1", "ok");
    },
  },
  "a code block in an answer": {
    selector: ".message--assistant pre",
    run: (emit) => {
      const code = "```\nprint(1)\n```";
      emit.text(code);
      emit.textEnd(code);
    },
  },
  "a confirmation's arguments": {
    selector: ".confirm-args",
    run: (emit) => emit.toolCall("w1", "wipe", { id: 7 }),
    setup: (el) =>
      el.registerTool({
        name: "wipe",
        description: "Wipe a record",
        parameters: { type: "object", "x-destructive": true },
        handler: () => "wiped",
      }),
  },
  "the reasoning being shown": {
    selector: ".thoughts-body",
    run: (emit) => {
      emit.reasoningStart();
      emit.reasoning("Weighing the two options.");
    },
  },
};

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.replaceChildren();
});

function shadowOf(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

/** Mount a transcript tall enough to scroll, ending in the block under test. */
async function mountWith(
  run: (emit: Emit) => void,
  setup?: (el: AgUiChat) => void,
): Promise<AgUiChat> {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.setAttribute("data-tool-display", "full");
  el.style.width = "470px";
  el.style.height = "480px";
  el.agentFactory = () =>
    makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.text(LONG);
        emit.textEnd(LONG);
        run(emit);
        emit.runEnd();
      },
    }).agent;
  document.body.appendChild(el);
  setup?.(el);
  void el.sendMessage("go");
  await settle();
  return el;
}

describe("a wheel turned over a block inside the transcript", () => {
  for (const [name, { selector, run, setup }] of Object.entries(BLOCKS)) {
    it(`scrolls the transcript when it is over ${name}`, async () => {
      const el = await mountWith(run, setup);
      const messages = shadowOf(el).querySelector<HTMLElement>(".messages");
      const block = shadowOf(el).querySelector<HTMLElement>(selector);
      if (messages === null || block === null) {
        throw new Error(`expected the transcript and ${selector}`);
      }
      // The result is folded away until the card is opened.
      shadowOf(el).querySelector<HTMLElement>(".tool-call")?.setAttribute("data-expanded", "true");
      expect(messages.scrollHeight).toBeGreaterThan(messages.clientHeight);
      // Short enough that it has nowhere to scroll: the wheel is no use to it.
      expect(block.scrollHeight).toBeLessThanOrEqual(block.clientHeight);
      block.scrollIntoView({ block: "center" });
      await settle();
      // The reasoning sits at the top of the answer, where it cannot be
      // centred: from there the only way to scroll is down.
      const before = messages.scrollTop;
      const down = before === 0;

      const box = block.getBoundingClientRect();
      const inside = messages.getBoundingClientRect();
      expect(box.height).toBeGreaterThan(0);
      expect(box.top).toBeGreaterThanOrEqual(inside.top);
      expect(box.bottom).toBeLessThanOrEqual(inside.bottom);
      await cdp().send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
        deltaX: 1,
        deltaY: down ? 120 : -120,
      });
      await settle();

      if (down) {
        expect(messages.scrollTop).toBeGreaterThan(before);
      } else {
        expect(messages.scrollTop).toBeLessThan(before);
      }
      // No nested box contains anything. Chromium stops a wheel with any
      // sideways delta at a box that contains x, even a short one, and real
      // wheels and trackpads almost always send some. The transcript's own
      // containment is what holds the page.
      const style = getComputedStyle(block);
      expect(style.overscrollBehaviorX).toBe("auto");
      expect(style.overscrollBehaviorY).toBe("auto");
      const outer = getComputedStyle(messages);
      expect(outer.overscrollBehaviorX).toBe("contain");
      expect(outer.overscrollBehaviorY).toBe("contain");
    });
  }
});
