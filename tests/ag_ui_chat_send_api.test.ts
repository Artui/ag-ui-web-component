import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ATTACHMENT_EVENT,
  ELEMENT_TAG,
  RUN_FINISHED_EVENT,
  SUBMIT_EVENT,
} from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { AttachmentRef } from "../src/core/attachment.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { AttachmentsDetail } from "../src/core/events/attachments_detail.js";
import type { SubmitDetail } from "../src/core/events/submit_detail.js";
import type { RunRow } from "../src/core/run_index.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";
import { type Emit, type FakeAgentHandle, makeFakeAgent } from "./helpers/fake_agent.js";
import { type FakeXhrController, installFakeXhr } from "./helpers/fake_xhr.js";

const REF: AttachmentRef = { id: "a1", name: "notes.txt", mime: "text/plain", size: 5 };
const REF_JSON = JSON.stringify(REF);

let xhr: FakeXhrController;

function shadow(el: AgUiChat): ShadowRoot {
  if (el.shadowRoot === null) {
    throw new Error("expected a shadow root");
  }
  return el.shadowRoot;
}

function mount(
  attrs: Record<string, string> = {},
  script: (emit: Emit) => void | Promise<void> = () => {},
): { el: AgUiChat; handle: ReturnType<typeof makeFakeAgent> } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return { el, handle };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

function bubbles(el: AgUiChat): string[] {
  return [...shadow(el).querySelectorAll(".message--user")].map((n) => n.textContent ?? "");
}

beforeAll(() => {
  defineAgUiChat();
});

beforeEach(() => {
  document.body.innerHTML = "";
  sessionStorage.clear();
  xhr = installFakeXhr();
});

afterEach(() => {
  xhr.restore();
  vi.unstubAllGlobals();
});

describe("AgUiChat.sendMessage", () => {
  it("sends programmatically, exactly as the composer does", async () => {
    const { el, handle } = mount();
    const seen: SubmitDetail[] = [];
    el.addEventListener(SUBMIT_EVENT, (e) => seen.push((e as CustomEvent<SubmitDetail>).detail));

    await el.sendMessage("from the host");

    expect(bubbles(el)).toEqual(["from the host"]);
    expect(seen).toEqual([{ content: "from the host", attachments: [] }]);
    expect(handle.runParams).toHaveLength(1);
  });

  it("carries attachments the host supplies", async () => {
    const { el } = mount();
    const seen: SubmitDetail[] = [];
    el.addEventListener(SUBMIT_EVENT, (e) => seen.push((e as CustomEvent<SubmitDetail>).detail));

    await el.sendMessage("see this", [REF]);

    expect(seen[0]?.attachments).toEqual([REF]);
    // The refs render as chips on the user bubble, like a composer send.
    expect(shadow(el).querySelector(".attachment-chip")).not.toBeNull();
  });

  it("allows an attachments-only message but ignores an empty one", async () => {
    const { el, handle } = mount();

    await el.sendMessage("");
    expect(handle.runParams).toHaveLength(0);

    await el.sendMessage("", [REF]);
    expect(handle.runParams).toHaveLength(1);
  });

  it("does not consult the tray — what the host passes is what is sent", async () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
    el.attachFile(new File(["xxxxx"], "notes.txt", { type: "text/plain" }));
    xhr.last().succeed(201, REF_JSON);
    await flush();
    const seen: SubmitDetail[] = [];
    el.addEventListener(SUBMIT_EVENT, (e) => seen.push((e as CustomEvent<SubmitDetail>).detail));

    await el.sendMessage("no files please");

    // A ready chip is sitting in the tray and deliberately does not ride along:
    // a host composer stays in charge of its own state.
    expect(seen[0]?.attachments).toEqual([]);
  });

  it("ignores a send while a run is in flight", async () => {
    // A second concurrent run would orphan the first (unabortable) and let its
    // settle sweep corrupt the first's pending tool cards — the same guard the
    // composer's Send has, applied to the programmatic entry point too.
    const { el, handle } = mount({}, (emit) => {
      emit.runStart();
      return new Promise<void>(() => {});
    });

    void el.sendMessage("first");
    await flush();
    await el.sendMessage("second");

    expect(handle.runParams).toHaveLength(1);
    expect(bubbles(el)).toEqual(["first"]);
  });
});

/** Each run request as the real `HttpAgent` put it on the wire: its messages' roles and text. */
type SentTurns = readonly [string, unknown][];

/**
 * Stand in for the AG-UI endpoint, so the element's own `HttpAgent` runs.
 *
 * The real agent rather than the fake, because what these tests are about ends
 * when the client starts the run, and the real one starts it a microtask after
 * it is asked, as it does in a page; the fake starts it only when its script
 * says so. Every request is recorded and answered with "answer N", framed as
 * the SSE stream an endpoint writes, after whatever `during` adds to run N.
 */
function stubEndpoint(
  runs: readonly RunRow[] = [],
  during: (n: number) => readonly object[] = () => [],
): SentTurns[] {
  const sent: SentTurns[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      // The runs index, which the checkpoint panel reads, is the one request
      // with no body. It answers `runs` and records nothing: only a run counts.
      if (init?.body === undefined) {
        return new Response(JSON.stringify({ runs }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      const body = JSON.parse(String(init?.body)) as { messages: readonly Message[] };
      sent.push(body.messages.map((message) => [message.role, message.content]));
      const n = sent.length;
      const events = [
        { type: "RUN_STARTED", threadId: "t1", runId: `run-${n}` },
        ...during(n),
        { type: "TEXT_MESSAGE_START", messageId: `a${n}`, role: "assistant" },
        { type: "TEXT_MESSAGE_CONTENT", messageId: `a${n}`, delta: `answer ${n}` },
        { type: "TEXT_MESSAGE_END", messageId: `a${n}` },
        { type: "RUN_FINISHED", threadId: "t1", runId: `run-${n}` },
      ];
      return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }),
  );
  return sent;
}

/** Mount with the element's own agent, against whatever `fetch` is stubbed to. */
function mountReal(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

/**
 * Each bubble's role and text, in the order drawn. The action row under an
 * answer is chrome rather than text, so it is left out.
 */
function transcript(el: AgUiChat): [string, string][] {
  return [...shadow(el).querySelectorAll<HTMLElement>(".message")].map((bubble) => {
    const shown = bubble.cloneNode(true) as HTMLElement;
    for (const bar of shown.querySelectorAll(".message-actions")) {
      bar.remove();
    }
    const role = bubble.classList.contains("message--user") ? "user" : "assistant";
    return [role, shown.textContent?.trim() ?? ""];
  });
}

/** Type `text` and press Send. */
function sendTurn(el: AgUiChat, text: string): void {
  (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = text;
  (shadow(el).querySelector(".send") as HTMLButtonElement).click();
}

/** Macrotask ticks: the real `HttpAgent` hands events on across timers. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

describe("a send is in flight from the moment it is taken", () => {
  it("refuses a send its own submit listener makes", async () => {
    const sent = stubEndpoint();
    const el = mountReal();
    const seen: string[] = [];
    // One-shot, so a send that is let through fails the assertions below
    // rather than firing the event again until the stack runs out.
    el.addEventListener(SUBMIT_EVENT, (event) => {
      seen.push((event as CustomEvent<SubmitDetail>).detail.content);
      if (seen.length === 1) {
        void el.sendMessage("from the listener");
      }
    });

    await el.sendMessage("first");
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
    ]);
    expect(seen).toEqual(["first"]);
  });

  it("refuses a second send made before the first one's run has started", async () => {
    // In the same task, because the client starts the run a microtask after
    // it is asked; from then on the run is in flight and refuses it anyway.
    const sent = stubEndpoint();
    const el = mountReal();

    const first = el.sendMessage("first");
    await el.sendMessage("second");
    await first;
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
    ]);
  });

  it("queues what the built-in Send takes in that time, and sends it once the answer is in", async () => {
    const sent = stubEndpoint();
    const el = mountReal();
    // Past the restore connecting starts, which holds the composer until it
    // has drawn the stored conversation, so the send below is not parked.
    await flush();

    sendTurn(el, "first");
    sendTurn(el, "second");
    const queued = [...shadow(el).querySelectorAll(".queued-chip")].map((chip) => chip.textContent);
    await settle();

    expect(queued).toEqual(["second"]);
    expect(sent).toEqual([
      [["user", "first"]],
      [
        ["user", "first"],
        ["assistant", "answer 1"],
        ["user", "second"],
      ],
    ]);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
      ["user", "second"],
      ["assistant", "answer 2"],
    ]);
  });

  it("still sends what it queued when the send fails before its run starts", async () => {
    // No run started, so no run settles: the turn waiting behind the send has
    // to be released by the send ending, or it waits for a run that never
    // comes. A store that refuses the first save is one way to get there --
    // the client saves the turn before it asks for the run.
    const sent = stubEndpoint();
    const el = mountReal();
    const store = el.conversationStore;
    const save = store.saveMessages.bind(store);
    let refuse = true;
    store.saveMessages = (threadId, messages) => {
      if (refuse) {
        refuse = false;
        throw new Error("the store refused the save");
      }
      save(threadId, messages);
    };

    const first = el.sendMessage("first").catch((error: unknown) => error);
    sendTurn(el, "second");
    const failure = await first;
    await settle();

    expect(failure).toBeInstanceOf(Error);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.at(-1)).toEqual(["user", "second"]);
    expect(transcript(el).at(-1)).toEqual(["assistant", "answer 1"]);
  });

  it("lets a run-finished listener send the next turn", async () => {
    // The event fires as the run settles. A send still held at that point
    // refused the host's follow-up without a word.
    const sent = stubEndpoint();
    const el = mountReal();
    el.addEventListener(RUN_FINISHED_EVENT, () => void el.sendMessage("follow-up"), {
      once: true,
    });

    await el.sendMessage("first");
    await settle();

    expect(sent).toHaveLength(2);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
      ["user", "follow-up"],
      ["assistant", "answer 2"],
    ]);
  });

  it.each([
    ["starts a new chat", {}, (el: AgUiChat) => el.newChat()],
    ["removes the element", {}, (el: AgUiChat) => el.remove()],
    [
      "moves the element",
      {},
      (el: AgUiChat) => {
        const dock = document.createElement("aside");
        document.body.appendChild(dock);
        dock.appendChild(el);
      },
    ],
    // The one with consequences beyond a lost turn: sent anyway, the first
    // principal's words opened the next principal's conversation.
    [
      "changes the principal",
      { "user-key": "alice" },
      (el: AgUiChat) => el.setAttribute("user-key", "bob"),
    ],
  ])("sends nothing once a submit listener that %s has stopped it", async (_, attrs, stop) => {
    const sent = stubEndpoint();
    const el = mountReal(attrs);
    await settle();
    el.addEventListener(SUBMIT_EVENT, () => stop(el), { once: true });

    await el.sendMessage("first");
    await settle();

    expect(sent).toEqual([]);
  });

  it("stays in flight when a send stopped before it ends behind it", async () => {
    // A stopped send still ends, once its request closes, and by then the next
    // send may be the one held. Each run here waits to be let through before
    // it starts, so the second is still short of it when the first ends.
    const gates: (() => void)[] = [];
    const handles: FakeAgentHandle[] = [];
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.agentFactory = () => {
      const handle = makeFakeAgent({
        script: async (emit) => {
          await new Promise<void>((resolve) => gates.push(resolve));
          emit.runStart();
        },
      });
      handles.push(handle);
      return handle.agent;
    };
    document.body.appendChild(el);

    void el.sendMessage("first");
    await flush();
    el.newChat();
    void el.sendMessage("second");
    await flush();
    gates[0]?.();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Not awaited: let through, it would wait at its gate like the others.
    void el.sendMessage("third");
    await flush();

    expect(handles.flatMap((handle) => handle.runParams)).toHaveLength(2);
    expect(bubbles(el)).toEqual(["second"]);
  });
});

/**
 * Retry and a checkpoint pick start runs too, so they keep the same rules a
 * send does: neither starts while a send is held or a continuation is out, and
 * a Retry is held from the call, as a send is, until its run starts.
 */
describe("a Retry and a checkpoint pick count a held send", () => {
  const RUN: RunRow = {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: "2026-07-27T12:00:00+00:00",
    continuable: true,
  };

  /** Open the checkpoint panel and wait for its rows. */
  async function openCheckpoints(el: AgUiChat): Promise<void> {
    (shadow(el).querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
    await settle();
  }

  /** Put `text` in the composer and pick Resume on the listed run. */
  function pickResume(el: AgUiChat, text: string): void {
    (shadow(el).querySelector("textarea") as HTMLTextAreaElement).value = text;
    (shadow(el).querySelector(".checkpoint-resume") as HTMLButtonElement).click();
  }

  it("refuses a send made before a Retry's run has started", async () => {
    // A Retry asks the client for a run exactly as a send does, a microtask
    // before it starts, so it is held from the call as a send is.
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();

    const retried = el.retryLastTurn();
    await el.sendMessage("second");
    expect(await retried).toBe(true);
    await settle();

    expect(sent).toEqual([[["user", "first"]], [["user", "first"]]]);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 2"],
    ]);
  });

  it("queues what the built-in Send takes before a Retry's run has started", async () => {
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();

    void el.retryLastTurn();
    sendTurn(el, "second");
    await settle();

    expect(sent).toEqual([
      [["user", "first"]],
      [["user", "first"]],
      [
        ["user", "first"],
        ["assistant", "answer 2"],
        ["user", "second"],
      ],
    ]);
  });

  it("refuses a Retry made before a send's run has started", async () => {
    const sent = stubEndpoint();
    const el = mountReal();

    const first = el.sendMessage("first");
    expect(await el.retryLastTurn()).toBe(false);
    await first;
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
    ]);
  });

  it("refuses a Retry while a picked checkpoint is in flight", async () => {
    // The continuation runs on a client of its own, so the conversation's
    // client is idle, and a Retry on it was a second run beside the first.
    const sent = stubEndpoint([RUN]);
    const el = mountReal({ "data-runs-url": "/agent/runs/" });
    await el.sendMessage("first");
    await settle();
    await openCheckpoints(el);

    pickResume(el, "and now sort them");
    expect(await el.retryLastTurn()).toBe(false);
    await settle();

    expect(sent).toEqual([[["user", "first"]], [["user", "and now sort them"]]]);
  });

  it("refuses a checkpoint pick made before a send's run has started", async () => {
    // Said at the composer, as a pick during a run is, and the composer keeps
    // the turn for when the run is done.
    const sent = stubEndpoint([RUN]);
    const el = mountReal({ "data-runs-url": "/agent/runs/" });
    await openCheckpoints(el);

    const first = el.sendMessage("first");
    pickResume(el, "and now sort them");
    await first;
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect((shadow(el).querySelector("textarea") as HTMLTextAreaElement).value).toBe(
      "and now sort them",
    );
    expect(shadow(el).querySelector(".skill-hint")?.textContent).toBe(
      DEFAULT_UI_STRINGS.continueWhileRunning,
    );
  });

  it("refuses a checkpoint pick made before a Retry's run has started", async () => {
    const sent = stubEndpoint([RUN]);
    const el = mountReal({ "data-runs-url": "/agent/runs/" });
    await el.sendMessage("first");
    await settle();
    await openCheckpoints(el);

    const retried = el.retryLastTurn();
    pickResume(el, "and now sort them");
    await retried;
    await settle();

    expect(sent).toEqual([[["user", "first"]], [["user", "first"]]]);
  });

  it("lets a run-finished listener send after a Retry", async () => {
    // Held only until its run starts, as a send is. Held to the Retry's end,
    // it would still be held when the run-finished event fires, and refuse a
    // follow-up from it.
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();
    let followed = false;
    el.addEventListener(RUN_FINISHED_EVENT, () => {
      if (!followed) {
        followed = true;
        void el.sendMessage("next");
      }
    });

    await el.retryLastTurn();
    await settle();

    expect(sent).toHaveLength(3);
    expect(sent[2]?.at(-1)).toEqual(["user", "next"]);
  });

  it.each([
    ["starts a new chat", {}, (el: AgUiChat) => el.newChat()],
    // Gone ahead, it drew the first principal's turns into the next one's
    // conversation and asked their answer again under the next one's headers.
    [
      "changes the principal",
      { "user-key": "alice" },
      (el: AgUiChat) => el.setAttribute("user-key", "bob"),
    ],
  ])("does nothing more once a store that %s has stopped it", async (_, attrs, stop) => {
    // The client saves the shortened history before the Retry asks it for a
    // run, and the store is the host's, so it is host code running inside the
    // Retry, as a submit listener is inside a send.
    const sent = stubEndpoint();
    const el = mountReal(attrs);
    await el.sendMessage("first");
    await settle();
    const store = el.conversationStore;
    const save = store.saveMessages.bind(store);
    let stopping = true;
    store.saveMessages = (threadId, messages) => {
      save(threadId, messages);
      if (stopping) {
        stopping = false;
        stop(el);
      }
    };

    expect(await el.retryLastTurn()).toBe(false);
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([]);
  });

  it("still sends what it queued when the Retry's run never starts", async () => {
    // No run started, so none settles to send the turn waiting behind it, and
    // the Retry's end is what lets it go. Each run here waits to be let
    // through and then ends without ever reporting a start.
    const gates: (() => void)[] = [];
    const handle = makeFakeAgent({
      script: async () => {
        await new Promise<void>((resolve) => gates.push(resolve));
      },
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    const first = el.sendMessage("first");
    await flush();
    gates.shift()?.();
    await first;

    const retried = el.retryLastTurn();
    await flush();
    sendTurn(el, "second");
    expect(handle.runParams).toHaveLength(2);
    gates.shift()?.();
    expect(await retried).toBe(true);
    await flush();

    expect(handle.runParams).toHaveLength(3);
    expect(handle.messages.at(-1)).toMatchObject({ role: "user", content: "second" });
  });

  it("leaves alone the hold of the turn its run released from the queue", async () => {
    // The Retry ends after its run settles, and that settling sent the turn
    // queued behind it, which by then holds the field for a run of its own.
    // Every run after the Retry's waits to be let through before it starts,
    // so that turn is still short of its run when the Retry ends.
    const gates: (() => void)[] = [];
    let runs = 0;
    const handle = makeFakeAgent({
      script: async (emit) => {
        runs += 1;
        if (runs <= 2) {
          emit.runStart();
          await new Promise<void>((resolve) => gates.push(resolve));
          return;
        }
        await new Promise<void>((resolve) => gates.push(resolve));
        emit.runStart();
      },
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    const first = el.sendMessage("first");
    await flush();
    gates.shift()?.();
    await first;

    const retried = el.retryLastTurn();
    await flush();
    // Enter rather than the button, which is Stop while the Retry's run goes.
    const input = shadow(el).querySelector("textarea") as HTMLTextAreaElement;
    input.value = "second";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );
    gates.shift()?.();
    expect(await retried).toBe(true);
    await flush();
    expect(handle.runParams).toHaveLength(3);
    // Not awaited: let through, it would wait at its gate like the turn above.
    void el.sendMessage("third");
    await flush();

    expect(handle.runParams).toHaveLength(3);
  });

  it("refuses a second Retry made before the first one's run has started", async () => {
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();

    const first = el.retryLastTurn();
    expect(await el.retryLastTurn()).toBe(false);
    expect(await first).toBe(true);
    await settle();

    expect(sent).toEqual([[["user", "first"]], [["user", "first"]]]);
  });

  it("does nothing more once a renderer it replays through has stopped it", async () => {
    // The replay draws through the host's renderers, which can start a new
    // chat as the store's save can. Here the activity sits ahead of two more
    // messages, so the check after each replay is what keeps them out of the
    // new chat, rather than one made once the replay is done.
    const sent = stubEndpoint([], (n) =>
      n === 1
        ? [{ type: "ACTIVITY_SNAPSHOT", messageId: "act1", activityType: "probe", content: {} }]
        : [],
    );
    const el = mountReal();
    let armed = false;
    el.registerActivityRenderer({
      type: "probe",
      render: () => {
        if (armed) {
          armed = false;
          el.newChat();
        }
        return document.createElement("div");
      },
    });
    await el.sendMessage("first");
    await settle();
    await el.sendMessage("second");
    await settle();

    armed = true;
    expect(await el.retryLastTurn()).toBe(false);
    await settle();

    expect(sent).toHaveLength(2);
    expect(transcript(el)).toEqual([]);
  });

  it("refuses a Retry from a run-finished listener while a picked checkpoint still holds", async () => {
    // A continuation settles its run before the element lets go of it, so the
    // run-finished event fires with the continuation still recorded. A send
    // from there is refused for that, and a Retry keeps the same rule.
    const sent = stubEndpoint([RUN]);
    const el = mountReal({ "data-runs-url": "/agent/runs/" });
    await el.sendMessage("first");
    await settle();
    await openCheckpoints(el);
    // Once, so a Retry that went ahead fails here rather than retrying from
    // its own run's end until the worker runs out of memory.
    const answers: Promise<boolean>[] = [];
    el.addEventListener(RUN_FINISHED_EVENT, () => {
      if (answers.length === 0) {
        answers.push(el.retryLastTurn());
      }
    });

    pickResume(el, "and now sort them");
    await settle();

    expect(await Promise.all(answers)).toEqual([false]);
    expect(sent).toEqual([[["user", "first"]], [["user", "and now sort them"]]]);
  });

  it("lets go of its hold when there is nothing to retry", async () => {
    const sent = stubEndpoint();
    const el = mountReal();
    // Past the restore connecting starts, which refuses a Retry at the guard
    // until it has drawn the stored conversation, so this reaches the truncation.
    await settle();

    expect(await el.retryLastTurn()).toBe(false);
    await el.sendMessage("first");
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
  });
});

describe("host code that stops a turn before its request is made", () => {
  /**
   * Have the element's store call `stop` from the first save `when` accepts,
   * after writing it, as a store that starts a new chat on some condition would.
   */
  function stopFromSave(
    el: AgUiChat,
    stop: (el: AgUiChat) => void,
    when: (messages: readonly Message[]) => boolean = () => true,
  ): void {
    const store = el.conversationStore;
    const save = store.saveMessages.bind(store);
    let stopping = true;
    store.saveMessages = (threadId, messages) => {
      save(threadId, messages);
      if (stopping && when(messages)) {
        stopping = false;
        stop(el);
      }
    };
  }

  it.each([
    ["starts a new chat", {}, (el: AgUiChat) => el.newChat()],
    [
      "changes the principal",
      { "user-key": "alice" },
      (el: AgUiChat) => el.setAttribute("user-key", "bob"),
    ],
  ])(
    "sends nothing once a store that %s has stopped it from the turn's save",
    async (_, attrs, stop) => {
      // The client saves the turn before it asks for the run, so the store is
      // host code running inside the send, after every check the element makes.
      // The run used to forget the Stop as it started, so the turn went out into
      // the conversation being left, with all of its history, and its answer was
      // filed there with nobody looking.
      const sent = stubEndpoint();
      const el = mountReal(attrs);
      stopFromSave(el, stop);

      await el.sendMessage("first");
      await settle();

      expect(sent).toEqual([]);
      expect(transcript(el)).toEqual([]);
      // And the conversation that replaced it takes a turn as a fresh one does.
      await el.sendMessage("second");
      await settle();
      expect(sent).toEqual([[["user", "second"]]]);
      expect(transcript(el)).toEqual([
        ["user", "second"],
        ["assistant", "answer 1"],
      ]);
    },
  );

  it("sends nothing once the context provider has started a new chat", async () => {
    // Read inside the run's first round, after the turn's save, so it is the
    // last host code a send runs before its request.
    const sent = stubEndpoint();
    const el = mountReal();
    let stopping = true;
    el.getContext = () => {
      if (stopping) {
        stopping = false;
        el.newChat();
      }
      return [];
    };

    await el.sendMessage("first");
    await settle();

    expect(sent).toEqual([]);
    expect(transcript(el)).toEqual([]);
  });

  it("asks nothing again once the context provider has stopped a Retry", async () => {
    // A Retry runs no save of its own after the replay; the context is read
    // inside the resumed run, past every check the element can make.
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();
    let stopping = true;
    el.getContext = () => {
      if (stopping) {
        stopping = false;
        el.newChat();
      }
      return [];
    };

    await el.retryLastTurn();
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([]);
  });

  it("sends nothing once the save answering a call left open has stopped it", async () => {
    // Every request first answers the tool calls history left open, and saves
    // the answers: the store's code again, after the context has been read and
    // just before the request. Left open here by a call to a tool no page owns,
    // which ends the round with nothing to send back.
    const sent = stubEndpoint([], (n) =>
      n === 1
        ? [
            { type: "TOOL_CALL_START", toolCallId: "tc1", toolCallName: "unowned_tool" },
            { type: "TOOL_CALL_ARGS", toolCallId: "tc1", delta: "{}" },
            { type: "TOOL_CALL_END", toolCallId: "tc1" },
          ]
        : [],
    );
    const el = mountReal();
    await el.sendMessage("first");
    await settle();
    stopFromSave(
      el,
      (chat) => chat.newChat(),
      (messages) => messages.some((message) => message.role === "tool"),
    );

    await el.sendMessage("second");
    await settle();

    expect(sent).toEqual([[["user", "first"]]]);
    expect(transcript(el)).toEqual([]);
  });

  it("still runs the turn after one the user stopped", async () => {
    // A Stop is remembered until the next turn begins, so the turn after a
    // stopped one must start by forgetting it, or a Stop would reach forward
    // and cancel a run nobody had asked to stop.
    const sent = stubEndpoint([], (n) =>
      n === 1
        ? [{ type: "ACTIVITY_SNAPSHOT", messageId: "act1", activityType: "probe", content: {} }]
        : [],
    );
    const el = mountReal();
    let stopping = true;
    el.registerActivityRenderer({
      type: "probe",
      render: () => {
        if (stopping) {
          stopping = false;
          // The composer's own Stop, which the button is while a run is in flight.
          (shadow(el).querySelector(".send") as HTMLButtonElement).click();
        }
        return document.createElement("div");
      },
    });
    await el.sendMessage("first");
    await settle();
    // Stopped, rather than finished with the renderer never reached.
    expect(shadow(el).querySelectorAll(".stopped-note")).toHaveLength(1);

    await el.sendMessage("second");
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1]?.at(-1)).toEqual(["user", "second"]);
    expect(transcript(el).at(-1)).toEqual(["assistant", "answer 2"]);
  });

  it("leaves the answer standing when the store refuses a Retry's save", async () => {
    // The Retry saves the shortened history before it re-renders. A store that
    // throws there used to leave the client already shortened, under a
    // transcript still showing the answer: the next request then left out an
    // answer the user could see, and the agent was asked a follow-up about
    // something it had never said.
    const sent = stubEndpoint();
    const el = mountReal();
    await el.sendMessage("first");
    await settle();
    const store = el.conversationStore;
    const save = store.saveMessages.bind(store);
    let refuse = true;
    store.saveMessages = (threadId, messages) => {
      if (refuse) {
        refuse = false;
        throw new Error("the store refused the save");
      }
      save(threadId, messages);
    };

    const failure = await el.retryLastTurn().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect(transcript(el)).toEqual([
      ["user", "first"],
      ["assistant", "answer 1"],
    ]);

    await el.sendMessage("second");
    await settle();

    expect(sent).toEqual([
      [["user", "first"]],
      [
        ["user", "first"],
        ["assistant", "answer 1"],
        ["user", "second"],
      ],
    ]);
    expect(transcript(el).at(-1)).toEqual(["assistant", "answer 2"]);
  });
});

describe("AgUiChat.attachFile", () => {
  it("queues a file into the tray, like the picker", async () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });

    expect(el.attachFile(new File(["xxxxx"], "notes.txt", { type: "text/plain" }))).toBe(true);
    xhr.last().succeed(201, REF_JSON);
    await flush();

    expect(shadow(el).querySelector(".attachment-chip--ready")).not.toBeNull();
  });

  it("reports false when uploads are not configured", () => {
    // The only way for a host to tell: with no tray there is nothing to report
    // through, so silence would read as a queued file that never uploads.
    const { el } = mount();

    expect(el.attachFile(new File(["x"], "notes.txt", { type: "text/plain" }))).toBe(false);
  });
});

describe("the attachment event", () => {
  it("reports ready refs and how many are still uploading", async () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
    const seen: AttachmentsDetail[] = [];
    el.addEventListener(ATTACHMENT_EVENT, (e) =>
      seen.push((e as CustomEvent<AttachmentsDetail>).detail),
    );

    el.attachFile(new File(["xxxxx"], "notes.txt", { type: "text/plain" }));
    await flush();
    // Queued: nothing ready, one in flight — the state a host must not send in.
    expect(seen.at(-1)).toEqual({ attachments: [], pending: 1 });

    xhr.last().succeed(201, REF_JSON);
    await flush();
    expect(seen.at(-1)).toEqual({ attachments: [REF], pending: 0 });
  });

  it("bubbles and crosses the shadow boundary", async () => {
    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });
    const seen: Event[] = [];
    document.addEventListener(ATTACHMENT_EVENT, (e) => seen.push(e));

    el.attachFile(new File(["xxxxx"], "notes.txt", { type: "text/plain" }));
    await flush();

    expect(seen.length).toBeGreaterThan(0);
  });
});

describe("connect-time-only attributes", () => {
  it("warns when one is changed after the element connected", () => {
    const { el } = mount();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    el.setAttribute("data-attachments-url", "/agent/attachments/");

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("data-attachments-url");
    // The affordance genuinely did not appear — which is the point of saying so.
    expect(shadow(el).querySelector(".attachment-tray")).toBeNull();
    warn.mockRestore();
  });

  it("stays silent for the same attributes set before connecting", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { el } = mount({ "data-attachments-url": "/agent/attachments/" });

    expect(warn).not.toHaveBeenCalled();
    expect(shadow(el).querySelector(".attachment-tray")).not.toBeNull();
    warn.mockRestore();
  });

  it("stays silent when the value did not actually change", () => {
    // Connecting with a tools URL fetches the catalog. Left real, that request
    // goes to a localhost port nobody listens on, and happy-dom prints the
    // refused connection after this test has already passed, attributed to no
    // test at all. The catalog is not what this asserts, so an empty one stands
    // in.
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
    const { el } = mount({ "data-tools-url": "/agent/tools/" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    el.setAttribute("data-tools-url", "/agent/tools/");

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("stays silent once the element has been removed from the DOM", () => {
    // Configure, then re-insert: the documented way to apply a new value, so it
    // must not warn about the very assignment it is recommending.
    const { el } = mount();
    el.remove();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    el.setAttribute("data-attachments-url", "/agent/attachments/");
    document.body.appendChild(el);

    expect(warn).not.toHaveBeenCalled();
    expect(shadow(el).querySelector(".attachment-tray")).not.toBeNull();
    warn.mockRestore();
  });

  it("still updates the header title, which is observed to be applied", () => {
    const { el } = mount();

    el.setAttribute("title-text", "Support");

    expect(shadow(el).querySelector(".header-title")?.textContent).toBe("Support");
  });
});
