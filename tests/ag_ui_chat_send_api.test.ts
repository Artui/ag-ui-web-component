import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_EVENT, ELEMENT_TAG, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { AttachmentRef } from "../src/core/attachment.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { AttachmentsDetail } from "../src/core/events/attachments_detail.js";
import type { SubmitDetail } from "../src/core/events/submit_detail.js";
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
 * The real agent rather than the fake, because what these tests are about is
 * the time before the server's first event, and only a real request has any:
 * the fake announces its run as soon as it is asked for one. Every request is
 * recorded and answered with "answer N", framed as the SSE stream an endpoint
 * writes. A request whose number is in `drop` fails before any event, as a
 * refused connection does.
 */
function stubEndpoint(drop: readonly number[] = []): SentTurns[] {
  const sent: SentTurns[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: readonly Message[] };
      sent.push(body.messages.map((message) => [message.role, message.content]));
      const n = sent.length;
      if (drop.includes(n)) {
        throw new TypeError("Failed to fetch");
      }
      const events = [
        { type: "RUN_STARTED", threadId: "t1", runId: `run-${n}` },
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
function mountReal(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
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

  it("still sends what it queued when the first request fails before its run starts", async () => {
    // No run started, so no run settles: the turn waiting behind the send has
    // to be released by the send ending, or it waits for a run that never comes.
    const sent = stubEndpoint([1]);
    const el = mountReal();

    sendTurn(el, "first");
    sendTurn(el, "second");
    await settle();

    expect(sent).toHaveLength(2);
    expect(sent[1]?.at(-1)).toEqual(["user", "second"]);
    expect(transcript(el).at(-1)).toEqual(["assistant", "answer 2"]);
  });

  it.each([
    ["starts a new chat", (el: AgUiChat) => el.newChat()],
    ["removes the element", (el: AgUiChat) => el.remove()],
    [
      "moves the element",
      (el: AgUiChat) => {
        const dock = document.createElement("aside");
        document.body.appendChild(dock);
        dock.appendChild(el);
      },
    ],
  ])("sends nothing once a submit listener that %s has stopped it", async (_, stop) => {
    const sent = stubEndpoint();
    const el = mountReal();
    el.addEventListener(SUBMIT_EVENT, () => stop(el), { once: true });

    await el.sendMessage("first");
    await settle();

    expect(sent).toEqual([]);
  });

  it("stays in flight when a send stopped before it ends behind it", async () => {
    // A stopped send still ends, once its request closes, and by then the next
    // send may be the one in flight. Each run here waits to be let through
    // before its first event, so the second is still short of it when the
    // first ends.
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
    await el.sendMessage("third");

    expect(handles.flatMap((handle) => handle.runParams)).toHaveLength(2);
    expect(bubbles(el)).toEqual(["second"]);
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
