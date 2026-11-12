import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

const TITLE_EVENT = "ag-ui-thread-title";

interface TitleSeen {
  readonly threadId: string;
  readonly title: string;
}

interface Mounted {
  readonly el: AgUiChat;
  readonly seen: TitleSeen[];
  readonly release: () => void;
}

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function header(el: AgUiChat): string | null | undefined {
  return shadow(el).querySelector(".header-title")?.textContent;
}

function railLabel(el: AgUiChat): string | null | undefined {
  return shadow(el).querySelector(".rail-label")?.textContent;
}

function threadTitle(el: AgUiChat): unknown {
  return (el as unknown as { threadTitle: unknown }).threadTitle;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

function mount(attributes: Record<string, string> = {}, gated = false): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  const gates: (() => void)[] = [];
  el.agentFactory = () =>
    makeFakeAgent({
      script: async (emit: Emit) => {
        emit.runStart();
        if (gated) {
          await new Promise<void>((resolve) => gates.push(resolve));
        }
        emit.textEnd("answer");
        emit.runEnd();
      },
    }).agent;
  const seen: TitleSeen[] = [];
  el.addEventListener(TITLE_EVENT, (event) => {
    seen.push((event as CustomEvent<TitleSeen>).detail);
  });
  document.body.appendChild(el);
  return { el, seen, release: () => gates.shift()?.() };
}

async function rename(el: AgUiChat, title: string): Promise<void> {
  shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
  await flush();
  shadow(el).querySelector<HTMLButtonElement>(".drawer-row-rename")?.click();
  const input = shadow(el).querySelector<HTMLInputElement>(".drawer-rename-input");
  if (input === null) {
    throw new Error("expected a rename input");
  }
  input.value = title;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
  await flush();
}

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
  sessionStorage.clear();
});

describe('title-text="auto"', () => {
  it("names the thread from its first send, before the run or any list answers", async () => {
    const { el, release } = mount({ "title-text": "auto" }, true);
    await flush();
    expect(header(el)).toBe("Assistant");
    expect(railLabel(el)).toBe("Assistant");

    const sent = el.sendMessage("  book   a flight ");
    await flush();

    expect(header(el)).toBe("book a flight");
    expect(railLabel(el)).toBe("book a flight");
    release();
    await sent;
  });

  it("names a bare skill token by the catalog's title, else in words", async () => {
    const skills = JSON.stringify([{ name: "summarize_draw", title: "Summarize the drawing" }]);
    const known = mount({ "title-text": "auto", "data-skills": skills });
    await known.el.sendMessage("/summarize_draw");
    expect(header(known.el)).toBe("Summarize the drawing");

    document.body.replaceChildren();
    sessionStorage.clear();
    const unknown = mount({ "title-text": "auto" });
    await unknown.el.sendMessage("/summarize_draw");
    expect(header(unknown.el)).toBe("Summarize draw");
  });

  it("follows a switch, a new chat, a rename and a delete", async () => {
    const { el } = mount({ "title-text": "auto" });
    await flush();
    el.conversationStore.saveMessages("t1", [
      { id: "u1", role: "user", content: "the other one" },
    ] as never);

    await el.switchThread("t1");
    expect(header(el)).toBe("the other one");

    await rename(el, "Renamed here");
    expect(header(el)).toBe("Renamed here");

    el.newChat();
    expect(header(el)).toBe("Assistant");

    await el.switchThread("t1");
    expect(header(el)).toBe("Renamed here");

    el.deleteThread("t1");
    expect(header(el)).toBe("Assistant");
  });

  it("keeps a renamed title across a reload on the default store", async () => {
    const first = mount({ "title-text": "auto" });
    await first.el.sendMessage("book a flight");
    await rename(first.el, "Renamed here");
    expect(header(first.el)).toBe("Renamed here");

    document.body.replaceChildren();
    const { el } = mount({ "title-text": "auto" });
    await flush();

    expect(header(el)).toBe("Renamed here");
    expect(threadTitle(el)).toBe("Renamed here");
  });

  it("falls back to the strings table's title, not a built-in name", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("title-text", "auto");
    el.strings = { title: "Helpdesk" };
    document.body.appendChild(el);
    await flush();
    expect(header(el)).toBe("Helpdesk");
  });

  it("is live: turning it on and off swaps the fixed title for the thread's", async () => {
    const { el } = mount();
    await el.sendMessage("book a flight");
    expect(header(el)).toBe("Assistant");

    el.setAttribute("title-text", "auto");
    expect(header(el)).toBe("book a flight");
    expect(railLabel(el)).toBe("book a flight");

    el.setAttribute("title-text", "Support");
    expect(header(el)).toBe("Support");
    el.removeAttribute("title-text");
    expect(header(el)).toBe("Assistant");
  });

  it("leaves any other value a fixed string", async () => {
    const { el } = mount({ "title-text": "Support" });
    await el.sendMessage("book a flight");
    expect(header(el)).toBe("Support");
    expect(railLabel(el)).toBe("Support");
  });
});

describe("threadTitle and the thread-title event", () => {
  it("is empty for an empty thread, and before the element connects", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    expect(threadTitle(el)).toBe("");
    const { el: mounted, seen } = mount();
    await flush();
    expect(threadTitle(mounted)).toBe("");
    expect(seen).toEqual([]);
  });

  it("reports each change once, whatever title-text says", async () => {
    const { el, seen } = mount();
    await flush();
    const first = el.threadId;

    await el.sendMessage("book a flight");
    await el.sendMessage("and a hotel");
    expect(threadTitle(el)).toBe("book a flight");

    el.newChat();
    expect(threadTitle(el)).toBe("");

    expect(seen).toEqual([
      { threadId: first, title: "book a flight" },
      { threadId: el.threadId, title: "" },
    ]);
  });

  it("reports a switch between two threads of the same title", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("a", [{ id: "u", role: "user", content: "same" }] as never);
    el.conversationStore.saveMessages("b", [{ id: "u", role: "user", content: "same" }] as never);
    await el.switchThread("a");
    await el.switchThread("b");
    expect(seen).toEqual([
      { threadId: "a", title: "same" },
      { threadId: "b", title: "same" },
    ]);
  });

  it("takes a stored title its messages do not derive, once the list answers", async () => {
    const { el, seen } = mount();
    await flush();
    el.conversationStore.saveMessages("t1", [
      { id: "u1", role: "user", content: "/summarize_draw" },
    ] as never);
    el.conversationStore.renameThread("t1", "From elsewhere");
    await el.switchThread("t1");
    await flush();

    expect(threadTitle(el)).toBe("From elsewhere");
    expect(seen.at(-1)).toEqual({ threadId: "t1", title: "From elsewhere" });
  });
});

describe("the thread on screen keeps its own title", () => {
  it("ignores a late save from a run in a conversation that is no longer on screen", async () => {
    let settleOld: () => void = () => {};
    const handler = new Promise<string>((resolve) => {
      settleOld = () => resolve("scrolled");
    });
    const scripts: ((emit: Emit) => void | Promise<void>)[] = [
      (emit) => {
        emit.runStart();
        emit.toolCall("old-1", "scroll_to", {});
      },
      async (emit) => {
        emit.runStart();
        await new Promise<void>(() => {});
      },
    ];
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("title-text", "auto");
    let built = 0;
    el.agentFactory = () => {
      const script = scripts[built] as (emit: Emit) => void | Promise<void>;
      built += 1;
      return makeFakeAgent({ script }).agent;
    };
    el.registerTool({
      name: "scroll_to",
      description: "Scroll a target into view.",
      parameters: { type: "object" },
      handler: () => handler,
    });
    document.body.appendChild(el);
    void el.sendMessage("scroll to Friday");
    await flush();
    el.newChat();
    void el.sendMessage("book a design sync");
    await flush();
    expect(header(el)).toBe("book a design sync");

    settleOld();
    await flush();

    expect(header(el)).toBe("book a design sync");
    expect(threadTitle(el)).toBe("book a design sync");
  });

  it("keeps a catalog skill's title when the list's own derivation answers", async () => {
    const skills = JSON.stringify([{ name: "summarize_draw", title: "Summarize the drawing" }]);
    const { el } = mount({ "title-text": "auto", "data-skills": skills });
    await el.sendMessage("/summarize_draw");
    expect(header(el)).toBe("Summarize the drawing");

    shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await flush();

    expect(shadow(el).querySelector(".drawer-row-title")?.textContent).toBe("Summarize draw");
    expect(header(el)).toBe("Summarize the drawing");
  });
});

describe("a title a server listed", () => {
  const FIRST = "x".repeat(58);
  const EMOJI_FIRST = `${"x".repeat(50)}😀 ${"y".repeat(30)}`;

  function remote(title: string, first: string): Mounted {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        url.endsWith("/s1/")
          ? { messages: [{ id: "u1", role: "user", content: first }] }
          : { threads: [{ thread_id: "s1", title, updated_at: null, preview: "" }] },
    }));
    vi.stubGlobal("fetch", fetchMock);
    return mount({ "title-text": "auto", "data-threads-url": "/agent/threads/" });
  }

  async function switched(title: string, first: string): Promise<AgUiChat> {
    const { el } = remote(title, first);
    await flush();
    await el.switchThread("s1");
    await flush();
    return el;
  }

  it("is not a rename when it is the first message the way the server cuts it", async () => {
    expect(header(await switched("/summarize_draw", "/summarize_draw"))).toBe("Summarize draw");
    document.body.replaceChildren();
    sessionStorage.clear();
    expect(header(await switched("hello there", "  hello \n there "))).toBe("hello there");
    document.body.replaceChildren();
    sessionStorage.clear();
    const cut = `${FIRST}${"z".repeat(20)}`;
    expect(header(await switched(`${FIRST}z…`, cut))).toBe(`${FIRST}z…`);
    document.body.replaceChildren();
    sessionStorage.clear();
    const server = `${Array.from(EMOJI_FIRST).slice(0, 59).join("").trimEnd()}…`;
    const own = `${EMOJI_FIRST.slice(0, 59).trimEnd()}…`;
    expect(server).not.toBe(own);
    expect(header(await switched(server, EMOJI_FIRST))).toBe(own);
  });

  it("is not a rename when it is the placeholder", async () => {
    expect(header(await switched("New conversation", "book a flight"))).toBe("book a flight");
  });

  it("is a rename when it differs, even as a prefix of the first message", async () => {
    expect(header(await switched("book", "book a flight"))).toBe("book");
    document.body.replaceChildren();
    sessionStorage.clear();
    expect(header(await switched("Trip planning", "/summarize_draw"))).toBe("Trip planning");
  });
});
