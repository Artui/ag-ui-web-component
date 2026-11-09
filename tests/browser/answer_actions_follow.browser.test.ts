import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
  ThreadMeta,
} from "../../src/core/conversation_store.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "../helpers/fake_agent.js";

/**
 * The last answer's action row is part of what the transcript follows.
 *
 * The row is added under a bubble after the bubble itself has been followed,
 * so a transcript pinned to its foot came to rest one row short of it: 32px
 * in the admin, with Retry and Copy under the composer until the reader
 * scrolled. Measured in Chromium because the row only has a height under a
 * real layout; under happy-dom every transcript is trivially at its foot.
 *
 * Each case measures the distance to the foot against the same 4px slack the
 * follower itself uses, and the row's box against the list's, so a fix that
 * reached the foot by some other route than showing the row would still fail.
 */

const SLACK_PX = 4;

function gap(messages: HTMLElement): number {
  return messages.scrollHeight - messages.scrollTop - messages.clientHeight;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

/** Scroll and wait for the event, which a real engine dispatches async. */
async function scrollTo(messages: HTMLElement, top: number): Promise<void> {
  messages.scrollTop = top;
  await new Promise((resolve) => {
    setTimeout(resolve, 50);
  });
}

function storeOf(messages: readonly Message[] | null): ClientConversationStore {
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

interface Mounted {
  readonly el: AgUiChat;
  readonly root: ShadowRoot;
  readonly messages: HTMLElement;
}

/**
 * An embedded chat in a 300px box, so the transcript overflows; without a
 * constrained height nothing scrolls and every gap is vacuously zero.
 */
function mount(
  store: ClientConversationStore,
  script: (emit: Emit) => void | Promise<void>,
): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("placement", "embedded");
  el.conversationStore = store;
  el.agentFactory = () => makeFakeAgent({ script }).agent;
  const wrapper = document.createElement("div");
  wrapper.style.setProperty("height", "300px");
  wrapper.append(el);
  document.body.append(wrapper);
  const root = el.shadowRoot as ShadowRoot;
  const messages = root.querySelector<HTMLElement>(".messages");
  if (!messages) {
    throw new Error("expected a message list");
  }
  return { el, root, messages };
}

function send({ root }: Mounted, text: string): void {
  const input = root.querySelector<HTMLTextAreaElement>(".input");
  if (input) {
    input.value = text;
  }
  root.querySelector<HTMLButtonElement>(".send")?.click();
}

function lastActionRow({ root }: Mounted): HTMLElement {
  const rows = root.querySelectorAll<HTMLElement>(".message-actions");
  const row = rows.item(rows.length - 1);
  if (!row) {
    throw new Error("expected an action row");
  }
  return row;
}

function jumpButton({ root }: Mounted): HTMLButtonElement {
  const button = root.querySelector<HTMLButtonElement>(".jump-latest");
  if (!button) {
    throw new Error("expected a jump button");
  }
  return button;
}

/** Fill the transcript past its box, as a long conversation would. */
function overflow({ el, messages }: Mounted): void {
  for (let i = 0; i < 30; i += 1) {
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, `earlier message ${i}`);
  }
  expect(messages.scrollHeight).toBeGreaterThan(messages.clientHeight * 2);
}

/** The row's box ends inside the list's, so the reader can reach Retry without scrolling. */
function expectRowShown(mounted: Mounted): void {
  const row = lastActionRow(mounted).getBoundingClientRect();
  const list = mounted.messages.getBoundingClientRect();
  expect(row.height).toBeGreaterThan(0);
  expect(row.bottom).toBeLessThanOrEqual(list.bottom);
  expect(row.top).toBeGreaterThanOrEqual(list.top);
}

const LONG_HISTORY: readonly Message[] = Array.from({ length: 30 }, (_, i) => [
  { id: `u${i}`, role: "user", content: `question ${i}` },
  { id: `a${i}`, role: "assistant", content: `answer ${i}` },
]).flat() as Message[];

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the last answer's action row, after the transcript stops growing", () => {
  it("is followed when a run ends with an answer", async () => {
    const mounted = mount(storeOf(null), (emit) => {
      emit.runStart();
      emit.textStart("m1");
      // Streamed, as a real answer is. The first delta takes the pending dots
      // away; a text end with none would remove them only at run end, and the
      // list shrinking under a pinned view would hide the gap this measures.
      emit.text("the final");
      emit.text("the final answer");
      emit.textEnd("the final answer", "m1");
      emit.runEnd();
    });
    await flush();
    overflow(mounted);

    send(mounted, "one more question");
    await flush();

    expect(gap(mounted.messages)).toBeLessThanOrEqual(SLACK_PX);
    expectRowShown(mounted);
  });

  it("is followed when a run ends in an error", async () => {
    const mounted = mount(storeOf(null), (emit) => {
      emit.runStart();
      emit.error("the connection dropped");
    });
    await flush();
    overflow(mounted);

    send(mounted, "one more question");
    await flush();

    expect(lastActionRow(mounted).previousElementSibling?.classList).toContain("message--failed");
    expect(gap(mounted.messages)).toBeLessThanOrEqual(SLACK_PX);
    expectRowShown(mounted);
  });

  it("is followed when a thread is restored", async () => {
    const mounted = mount(storeOf(LONG_HISTORY), () => {});
    await flush();

    expect(mounted.messages.scrollHeight).toBeGreaterThan(mounted.messages.clientHeight * 2);
    expect(lastActionRow(mounted).previousElementSibling?.textContent).toContain("answer 29");
    expect(gap(mounted.messages)).toBeLessThanOrEqual(SLACK_PX);
    expectRowShown(mounted);
  });

  it("leaves a reader who scrolled up where they are, with the jump offered", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const mounted = mount(storeOf(null), async (emit) => {
      emit.runStart();
      emit.textStart("m1");
      emit.text("the answer so far");
      await gate;
      emit.textEnd("the answer so far, and the rest", "m1");
      emit.runEnd();
    });
    await flush();
    overflow(mounted);
    send(mounted, "one more question");
    await flush();
    await scrollTo(mounted.messages, 0);

    release();
    await flush();

    // The row was added, so this is not passing for want of anything to follow.
    expect(lastActionRow(mounted).previousElementSibling?.textContent).toContain("and the rest");
    // This is the check that answers: a fix that scrolled to the foot
    // unconditionally fails here. The button below was already offered before
    // the fix, because the streamed text had been missed; it holds that the
    // row does not take the offer away.
    expect(mounted.messages.scrollTop).toBe(0);
    expect(getComputedStyle(jumpButton(mounted)).display).not.toBe("none");

    jumpButton(mounted).click();

    expect(gap(mounted.messages)).toBeLessThanOrEqual(SLACK_PX);
    expectRowShown(mounted);
  });
});
