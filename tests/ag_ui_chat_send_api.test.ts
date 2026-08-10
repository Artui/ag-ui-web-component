import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ATTACHMENT_EVENT, ELEMENT_TAG, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat, AttachmentsDetail, SubmitDetail } from "../src/core/ag_ui_chat.js";
import type { AttachmentRef } from "../src/core/attachment.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
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
