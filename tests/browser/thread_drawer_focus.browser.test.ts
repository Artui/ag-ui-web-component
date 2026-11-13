import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

function part(el: AgUiChat, selector: string): HTMLElement {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found;
}

function mount(): { chat: AgUiChat; opener: HTMLButtonElement } {
  const opener = document.createElement("button");
  opener.textContent = "host history";
  document.body.appendChild(opener);
  const chat = document.createElement(ELEMENT_TAG) as AgUiChat;
  chat.setAttribute("endpoint", "/agent/");
  chat.setAttribute("placement", "page");
  chat.setAttribute("data-start-open", "");
  chat.setAttribute("data-runs-url", "/runs/");
  document.body.appendChild(chat);
  chat.conversationStore.saveMessages("t1", [
    { id: "u1", role: "user", content: "a thread worth listing" },
  ] as never);
  return { chat, opener };
}

const PANELS = {
  threads: {
    open: (el: AgUiChat) => el.openThreads(),
    root: ".drawer",
    dialog: ".drawer-panel",
  },
  checkpoints: {
    open: (el: AgUiChat) => el.openCheckpoints(),
    root: ".checkpoints",
    dialog: ".checkpoints",
  },
} as const;

describe("focus returns to a host's own opener (real browser)", () => {
  const original = globalThis.fetch;

  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({ runs: [] }),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    for (const el of document.querySelectorAll("body > button")) {
      el.remove();
    }
    globalThis.fetch = original;
  });

  it.each(Object.keys(PANELS) as (keyof typeof PANELS)[])(
    "%s: Escape gives focus back to a light-DOM button",
    async (name) => {
      const spec = PANELS[name];
      const { chat, opener } = mount();
      await settle();
      opener.focus();
      expect(document.activeElement).toBe(opener);

      spec.open(chat);
      await settle();
      expect(document.activeElement).toBe(chat);

      part(chat, spec.dialog).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
      );
      expect(part(chat, spec.root).hidden).toBe(true);
      expect(document.activeElement).toBe(opener);
    },
  );

  it("threads: picking a row gives focus back to a light-DOM button", async () => {
    const { chat, opener } = mount();
    await settle();
    opener.focus();
    chat.openThreads();
    await settle();
    await settle();

    part(chat, ".drawer-row-select").click();
    expect(part(chat, ".drawer").hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("checkpoints: picking a run gives focus back to a light-DOM button", async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        runs: [
          {
            run_id: "r1",
            thread_id: "t1",
            parent_run_id: null,
            started_at: new Date().toISOString(),
            continuable: true,
          },
        ],
      }),
    })) as unknown as typeof fetch;
    const { chat, opener } = mount();
    await settle();
    // A pick with an empty composer is refused and puts the caret there, so
    // the next turn is typed first, as a person picking a run to continue has.
    (part(chat, ".input") as HTMLTextAreaElement).value = "and then?";
    opener.focus();
    chat.openCheckpoints();
    await settle();
    await settle();

    part(chat, ".checkpoint-resume").click();
    expect(part(chat, ".checkpoints").hidden).toBe(true);
    expect(document.activeElement).toBe(opener);
  });

  it("threads: an opener inside another shadow root gets focus back", async () => {
    const { chat, opener } = mount();
    const host = document.createElement("div");
    const inner = document.createElement("button");
    host.attachShadow({ mode: "open" }).appendChild(inner);
    document.body.appendChild(host);
    opener.remove();
    await settle();
    inner.focus();
    chat.openThreads();
    await settle();

    part(chat, ".drawer-panel").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(host.shadowRoot?.activeElement).toBe(inner);
    host.remove();
  });

  it("threads: the built-in history button still gets focus back", async () => {
    const { chat } = mount();
    await settle();
    const button = part(chat, ".header-btn--history");
    button.focus();
    button.click();
    await settle();

    part(chat, ".drawer-panel").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    expect(chat.shadowRoot?.activeElement).toBe(button);
  });
});
