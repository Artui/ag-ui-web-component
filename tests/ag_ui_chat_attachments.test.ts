import type { Context, Message } from "@ag-ui/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat, SubmitDetail } from "../src/core/ag_ui_chat.js";
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

interface Mounted {
  el: AgUiChat;
  handle: ReturnType<typeof makeFakeAgent>;
}

function mount(
  attrs: Record<string, string> = {},
  script: (emit: Emit) => void = () => {},
): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-attachments-url", "/agent/attachments/");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return { el, handle };
}

function file(name = "notes.txt", type = "text/plain", size = 5): File {
  return new File(["x".repeat(size)], name, { type });
}

/** Paste onto the chat shell, with whatever the clipboard is carrying. */
function paste(el: AgUiChat, files: File[], text = ""): Event {
  const chat = shadow(el).querySelector(".chat");
  const event = new Event("paste", { bubbles: true, cancelable: true });
  (event as { clipboardData?: unknown }).clipboardData = {
    files,
    getData: (type: string) => (type === "text/plain" ? text : ""),
  };
  chat?.dispatchEvent(event);
  return event;
}

/** Drop files onto the chat shell (the drag-and-drop path). */
function drop(el: AgUiChat, files: File[]): void {
  const chat = shadow(el).querySelector(".chat");
  const event = new Event("drop", { bubbles: true, cancelable: true });
  (event as { dataTransfer?: unknown }).dataTransfer = { files };
  chat?.dispatchEvent(event);
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await Promise.resolve();
  }
}

/** Drop a file and let its upload succeed, leaving a ready chip. */
async function attachReady(el: AgUiChat): Promise<void> {
  drop(el, [file()]);
  xhr.last().succeed(201, REF_JSON);
  await flush();
}

function submit(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("no input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
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

describe("AgUiChat — attachments", () => {
  it("hides the attach button without data-attachments-url", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    document.body.appendChild(el);
    expect(shadow(el).querySelector<HTMLButtonElement>(".attach-btn")?.hidden).toBe(true);
    expect(shadow(el).querySelector(".attachment-tray")).toBeNull();
  });

  it("uses a custom uploadHandler instead of the built-in multipart upload", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    // No data-attachments-url: the custom handler owns its own endpoint.
    const calls: File[] = [];
    el.uploadHandler = (f, onProgress) => {
      calls.push(f);
      onProgress(1);
      return Promise.resolve({ id: "custom1", name: f.name, mime: f.type, size: f.size });
    };
    document.body.appendChild(el);

    // The 📎 affordance appears purely from the handler being set.
    expect(shadow(el).querySelector<HTMLButtonElement>(".attach-btn")?.hidden).toBe(false);

    drop(el, [file()]);
    await flush();

    expect(calls).toHaveLength(1);
    expect(xhr.instances).toHaveLength(0); // the built-in XHR upload was never used
    expect(shadow(el).querySelector(".attachment-chip--ready")).not.toBeNull();
  });

  it("reveals the attach button and wires accept when configured", () => {
    const { el } = mount({ "data-attachment-accept": "image/*,.pdf" });
    expect(shadow(el).querySelector<HTMLButtonElement>(".attach-btn")?.hidden).toBe(false);
    expect(shadow(el).querySelector<HTMLInputElement>(".attach-input")?.accept).toBe(
      "image/*,.pdf",
    );
    expect(shadow(el).querySelector(".attachment-tray")).not.toBeNull();
  });

  it("uploads a dropped file into a ready chip", async () => {
    const { el } = mount();
    drop(el, [file()]);
    expect(shadow(el).querySelector(".attachment-chip--uploading")).not.toBeNull();
    expect(xhr.last().url).toBe("/agent/attachments/");
    xhr.last().succeed(201, REF_JSON);
    await flush();
    expect(shadow(el).querySelector(".attachment-chip--ready")).not.toBeNull();
  });

  it("sends ready refs: bubble chips, refs on the message, cleared tray", async () => {
    const { el, handle } = mount();
    await attachReady(el);

    const events: SubmitDetail[] = [];
    el.addEventListener(SUBMIT_EVENT, (e) => events.push((e as CustomEvent<SubmitDetail>).detail));

    submit(el, "summarise this");
    await flush();

    // The user bubble carries read-only chips; the tray is emptied.
    const bubble = shadow(el).querySelector(".message--user");
    expect(bubble?.querySelector(".attachment-chips")).not.toBeNull();
    expect(shadow(el).querySelector<HTMLElement>(".attachment-tray")?.hidden).toBe(true);

    // The refs ride on the persisted user message and on the submit event.
    expect(events[0]?.attachments).toEqual([REF]);
    const sent = handle.messages[0] as Message & { attachments?: AttachmentRef[] };
    expect(sent.attachments).toEqual([REF]);
  });

  it("leaves the attachment manifest to the server, sending none in context", async () => {
    // The server derives the manifest from the refs riding the messages, so a
    // client-side copy only duplicated it on the turn a file was attached.
    const { el, handle } = mount();
    await attachReady(el);
    submit(el, "summarise this");
    await flush();
    expect(handle.lastRunParams?.context as Context[]).toEqual([]);
  });

  it("allows an attachments-only message with no typed text", async () => {
    const { el, handle } = mount();
    await attachReady(el);
    submit(el, "");
    await flush();
    expect(shadow(el).querySelector(".message--user .attachment-chips")).not.toBeNull();
    expect(handle.messages[0]).toMatchObject({ content: "" });
  });

  it("does nothing on an empty submit with no attachments", async () => {
    const { el, handle } = mount();
    submit(el, "   ");
    await flush();
    expect(handle.messages).toHaveLength(0);
    expect(shadow(el).querySelector(".message--user")).toBeNull();
  });

  it("toggles a drag-over outline", () => {
    const { el } = mount();
    const chat = shadow(el).querySelector(".chat");
    chat?.dispatchEvent(new Event("dragover", { bubbles: true, cancelable: true }));
    expect(chat?.classList.contains("chat--dragover")).toBe(true);
    chat?.dispatchEvent(new Event("dragleave", { bubbles: true }));
    expect(chat?.classList.contains("chat--dragover")).toBe(false);
  });

  it("ignores a drop with no files", () => {
    const { el } = mount();
    const chat = shadow(el).querySelector(".chat");
    const event = new Event("drop", { bubbles: true, cancelable: true });
    chat?.dispatchEvent(event);
    expect(shadow(el).querySelector(".attachment-chip")).toBeNull();
  });

  it("the paperclip button opens the hidden file input", () => {
    // The button is the only way to reach the picker with a keyboard or a
    // click; the input itself is permanently hidden.
    const { el } = mount();
    const input = shadow(el).querySelector<HTMLInputElement>(".attach-input");
    const button = shadow(el).querySelector<HTMLButtonElement>(".attach-btn");
    if (input == null || button == null) {
      throw new Error("no attach control");
    }
    let opened = 0;
    input.click = () => {
      opened += 1;
    };
    button.click();
    expect(opened).toBe(1);
  });

  it("queues files picked through the hidden input and resets it", () => {
    const { el } = mount();
    const input = shadow(el).querySelector<HTMLInputElement>(".attach-input");
    if (input == null) {
      throw new Error("no file input");
    }
    Object.defineProperty(input, "files", { value: [file()], configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(shadow(el).querySelector(".attachment-chip")).not.toBeNull();
    expect(input.value).toBe("");
  });

  it("tolerates a file-input change with no files", () => {
    const { el } = mount();
    const input = shadow(el).querySelector<HTMLInputElement>(".attach-input");
    if (input == null) {
      throw new Error("no file input");
    }
    Object.defineProperty(input, "files", { value: null, configurable: true });
    input.dispatchEvent(new Event("change"));
    expect(shadow(el).querySelector(".attachment-chip")).toBeNull();
  });

  it("rejects an oversize file client-side from data-attachment-max-bytes", () => {
    const { el } = mount({ "data-attachment-max-bytes": "4" });
    drop(el, [file("big.txt", "text/plain", 10)]);
    expect(shadow(el).querySelector(".attachment-chip--error")).not.toBeNull();
    expect(xhr.instances).toHaveLength(0); // never uploaded
  });

  it("falls back to the default cap when the attribute is not a number", () => {
    const { el } = mount({ "data-attachment-max-bytes": "abc" });
    drop(el, [file()]);
    // A small file uploads (the bad attribute didn't set a tiny cap).
    expect(xhr.instances).toHaveLength(1);
  });

  it("re-renders attachment chips when restoring history", async () => {
    const stored: Message[] = [
      { id: "u1", role: "user", content: "look", attachments: [REF] } as Message,
    ];
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = {
      threadId: () => "t1",
      loadMessages: () => Promise.resolve(stored),
      saveMessages: () => {},
      loadCheckpoint: () => null,
      saveCheckpoint: () => {},
      clear: () => {},
      listThreads: () => Promise.resolve([]),
      setActiveThread: () => {},
      renameThread: () => {},
    };
    document.body.appendChild(el);
    await flush();
    expect(shadow(el).querySelector(".message--user .attachment-chips")).not.toBeNull();
  });

  it("drops pending attachments when starting a new chat", async () => {
    const { el } = mount();
    await attachReady(el);
    el.newChat();
    expect(shadow(el).querySelector(".attachment-chip")).toBeNull();
  });

  it("aborts an in-flight upload when the element is disconnected", async () => {
    const { el } = mount();
    drop(el, [file()]); // upload in flight (XHR pending, not settled)
    await flush();
    expect(xhr.last().aborted).toBe(false);
    el.remove(); // disconnectedCallback → tray.dispose → abort the upload XHR
    expect(xhr.last().aborted).toBe(true);
  });

  it("says so when Send runs while a file is still uploading", async () => {
    // `readyRefs()` returns only settled uploads and `clearReady()` deliberately
    // keeps the rest for a follow-up, so the file is not lost — but the message
    // went without it, and nothing said so. Attachments are frequently the
    // entire point of the message, which is what made the silence the defect.
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.uploadHandler = () => new Promise(() => {}); // never settles: stays uploading
    el.agentFactory = () => makeFakeAgent({ script: (emit: Emit) => emit.runEnd() }).agent;
    document.body.appendChild(el);

    drop(el, [file()]);
    await flush();
    expect(shadow(el).querySelector(".attachment-chip--ready")).toBeNull();

    const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
    if (input === null) {
      throw new Error("expected an input");
    }
    input.value = "here is the file";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    const notice = shadow(el).querySelector(".run-notice--attachment-pending");
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain("1");
    // Still attached, ready for a follow-up — the notice reports, it does not discard.
    expect(shadow(el).querySelectorAll(".attachment-chip")).toHaveLength(1);
  });

  it("stays quiet when every attachment settled before Send", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.uploadHandler = (f, onProgress) => {
      onProgress(1);
      return Promise.resolve({ id: "a1", name: f.name, mime: f.type, size: f.size });
    };
    el.agentFactory = () => makeFakeAgent({ script: (emit: Emit) => emit.runEnd() }).agent;
    document.body.appendChild(el);

    drop(el, [file()]);
    await flush();
    const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
    if (input === null) {
      throw new Error("expected an input");
    }
    input.value = "here is the file";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await flush();

    expect(shadow(el).querySelector(".run-notice--attachment-pending")).toBeNull();
  });
});

describe("pasting files into the composer", () => {
  it("queues a pasted file into the tray", async () => {
    const { el } = mount();
    paste(el, [file("shot.png", "image/png", 8)]);
    await flush();

    const chips = shadow(el).querySelectorAll(".attachment-chip");
    expect(chips).toHaveLength(1);
    expect(chips[0]?.textContent).toContain("shot.png");
  });

  it("leaves an ordinary text paste completely alone", () => {
    const { el } = mount();

    const event = paste(el, [], "some words");

    // No files, so nothing to attach and nothing to intercept: the textarea
    // gets the paste the browser was already going to give it.
    expect(shadow(el).querySelectorAll(".attachment-chip")).toHaveLength(0);
    expect(event.defaultPrevented).toBe(false);
  });

  it("intercepts a paste that is only files", () => {
    const { el } = mount();

    const event = paste(el, [file()]);

    expect(event.defaultPrevented).toBe(true);
  });

  it("attaches the file and still pastes the words when the clipboard has both", () => {
    const { el } = mount();

    // Copying a rich selection containing an image puts both on the clipboard.
    // Swallowing the words in order to attach a picture nobody asked for is the
    // worse of the two failures.
    const event = paste(el, [file()], "the surrounding sentence");

    expect(shadow(el).querySelectorAll(".attachment-chip")).toHaveLength(1);
    expect(event.defaultPrevented).toBe(false);
  });

  it("names a pasted blob that arrived without one", async () => {
    const { el } = mount();
    paste(el, [new File(["x"], "", { type: "image/png" })]);
    await flush();

    const label = shadow(el).querySelector(".attachment-chip-name")?.textContent ?? "";
    // An empty name reaches the server as an unidentifiable upload, and shows
    // in the tray as a chip with no label.
    expect(label).toMatch(/^pasted-.+\.png$/);
  });

  it("names one whose type says nothing either", async () => {
    const { el } = mount();
    paste(el, [new File(["x"], "", { type: "" })]);
    await flush();

    const label = shadow(el).querySelector(".attachment-chip-name")?.textContent ?? "";
    expect(label).toMatch(/^pasted-[^.]+$/);
  });

  it("ignores a paste carrying no clipboard at all", () => {
    const { el } = mount();
    const chat = shadow(el).querySelector(".chat");

    expect(() =>
      chat?.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true })),
    ).not.toThrow();
    expect(shadow(el).querySelectorAll(".attachment-chip")).toHaveLength(0);
  });
});
