import type { Tool } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "../src/ui/ui_strings.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";
import { installFakeMedia } from "./helpers/fake_media.js";

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

/** Mount the element, applying attributes and a pre-connect setup hook. */
function mount(attrs: Record<string, string> = {}, setup?: (el: AgUiChat) => void): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  setup?.(el);
  document.body.appendChild(el);
  return el;
}

/** Mount with a fake agent + run script (optionally a dropped stream). */
function mountWithAgent(
  script: (emit: Emit) => void | Promise<void>,
  dropStream = false,
): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script, dropStream });
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return el;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

function clickSend(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
}

/** The rendered shadow chrome (everything but the <style> block). */
function chromeHtml(el: AgUiChat): string {
  return Array.from(shadow(el).children)
    .filter((child) => child.tagName !== "STYLE")
    .map((child) => child.outerHTML)
    .join("");
}

describe("AgUiChat — UX & customization", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  describe("string table (i18n)", () => {
    it("routes chrome through the `strings` property override", () => {
      const el = mount({}, (e) => {
        e.strings = { inputPlaceholder: "Frag mich…", send: "Senden", chatHistory: "Verlauf" };
      });
      expect(shadow(el).querySelector<HTMLTextAreaElement>(".input")?.placeholder).toBe(
        "Frag mich…",
      );
      expect(shadow(el).querySelector(".send")?.textContent).toBe("Senden");
      expect(shadow(el).querySelector(".header-btn--history")?.getAttribute("aria-label")).toBe(
        "Verlauf",
      );
    });

    it("reads overrides from the `data-strings` JSON attribute", () => {
      const el = mount({ "data-strings": JSON.stringify({ send: "Go" }) });
      expect(shadow(el).querySelector(".send")?.textContent).toBe("Go");
    });

    it("lets the property win over the attribute key-by-key", () => {
      const el = mount(
        { "data-strings": JSON.stringify({ send: "Attr", collapse: "Zu" }) },
        (e) => {
          e.strings = { send: "Prop" };
        },
      );
      expect(shadow(el).querySelector(".send")?.textContent).toBe("Prop");
      expect(shadow(el).querySelector(".header-btn--collapse")?.getAttribute("aria-label")).toBe(
        "Zu",
      );
    });

    it("falls back to defaults on malformed `data-strings`", () => {
      const el = mount({ "data-strings": "{not json" });
      expect(shadow(el).querySelector<HTMLTextAreaElement>(".input")?.placeholder).toBe(
        "Ask anything…",
      );
    });

    it("ignores a non-object `data-strings` payload", () => {
      const el = mount({ "data-strings": "42" });
      expect(shadow(el).querySelector(".send")?.textContent).toBe("Send");
    });

    it("renders no default literals under a full override (regression guard)", () => {
      // Opaque, word-free sentinels so the negative grep can't false-match the
      // English inside a camelCase key (e.g. "noConversations" → "Conversation").
      const keys = Object.keys(DEFAULT_UI_STRINGS);
      const fullOverride = Object.fromEntries(
        keys.map((key, index) => [key, `OVR${index}`]),
      ) as Partial<UiStrings>;
      const el = mount({}, (e) => {
        e.strings = fullOverride;
      });
      const html = chromeHtml(el);
      for (const literal of [
        "Assistant",
        "Ask anything…",
        "Chat history",
        "New chat",
        "Conversation",
        "Message",
      ]) {
        expect(html).not.toContain(literal);
      }
      // The overrides are what render instead.
      expect(shadow(el).querySelector(".send")?.textContent).toBe(fullOverride.send);
      expect(shadow(el).querySelector<HTMLTextAreaElement>(".input")?.placeholder).toBe(
        fullOverride.inputPlaceholder,
      );
    });

    it("localizes the drawer chrome via setStrings on connect", () => {
      const el = mount({}, (e) => {
        e.strings = { chats: "Unterhaltungen", newChat: "Neu" };
      });
      shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
      expect(shadow(el).querySelector(".drawer-title")?.textContent).toBe("Unterhaltungen");
      expect(shadow(el).querySelector(".drawer-new")?.textContent).toBe("Neu");
    });
  });

  describe("parts & slots", () => {
    it("exposes structural `part` attributes", () => {
      const el = mount();
      const parts = Array.from(shadow(el).querySelectorAll("[part]")).map((node) =>
        node.getAttribute("part"),
      );
      for (const part of ["panel", "header", "title", "messages", "composer", "input", "send"]) {
        expect(parts).toContain(part);
      }
    });

    it("renders the coarse replaceable slots", () => {
      const el = mount();
      for (const name of ["header-actions", "footer", "empty"]) {
        expect(shadow(el).querySelector(`slot[name="${name}"]`)).not.toBeNull();
      }
    });

    it("hides the empty-state region once content renders, restoring it on new chat", () => {
      const el = mount();
      const empty = shadow(el).querySelector<HTMLElement>(".empty");
      expect(empty?.hidden).toBe(false);
      el.appendMessage(MESSAGE_ROLE.USER, "hi");
      expect(empty?.hidden).toBe(true);
      shadow(el).querySelector<HTMLButtonElement>(".header-btn--new")?.click();
      expect(shadow(el).querySelector<HTMLElement>(".empty")?.hidden).toBe(false);
    });
  });

  describe("header & launcher icon", () => {
    it("renders a data-icon-url image as the header icon", () => {
      const el = mount({ "data-icon-url": "/logo.png" });
      const img = shadow(el).querySelector<HTMLImageElement>(".header .icon-img");
      expect(img).not.toBeNull();
      expect(img?.getAttribute("src")).toBe("/logo.png");
    });

    it("renders a header icon slot when the host slots one", () => {
      const el = mount({}, (e) => {
        const icon = document.createElement("span");
        icon.setAttribute("slot", "icon");
        icon.textContent = "🤖";
        e.appendChild(icon);
      });
      expect(shadow(el).querySelector('.header slot[name="icon"]')).not.toBeNull();
    });

    it("omits the header icon holder when neither slot nor url is given", () => {
      const el = mount();
      expect(shadow(el).querySelector('.header slot[name="icon"]')).toBeNull();
    });
  });

  describe("sliding sidebar & rail", () => {
    it("renders the rail and reflects collapsed on aria-expanded", () => {
      const el = mount({ placement: "sidebar" });
      const rail = shadow(el).querySelector<HTMLButtonElement>(".rail");
      expect(rail).not.toBeNull();
      expect(rail?.getAttribute("aria-expanded")).toBe("true");
      el.setCollapsed(true);
      expect(rail?.getAttribute("aria-expanded")).toBe("false");
    });

    it("expands the sidebar when the rail is clicked", () => {
      const el = mount({ placement: "sidebar" });
      el.setCollapsed(true);
      expect(el.collapsed).toBe(true);
      shadow(el).querySelector<HTMLButtonElement>(".rail")?.click();
      expect(el.collapsed).toBe(false);
      expect(shadow(el).querySelector(".rail")?.getAttribute("aria-expanded")).toBe("true");
    });

    it("gives the rail a launcher part with a default glyph", () => {
      const el = mount({ placement: "sidebar" });
      const rail = shadow(el).querySelector(".rail");
      expect(rail?.getAttribute("part")).toBe("launcher");
      expect(rail?.querySelector('slot[name="launcher"]')?.textContent).toBe("💬");
    });
  });

  describe("page-action tools", () => {
    function toolNames(el: AgUiChat): string[] {
      return el.getTools().map((tool: Tool) => tool.name);
    }

    it("registers no page-action tools without the opt-in", () => {
      const el = mount();
      expect(toolNames(el)).not.toContain("scroll_to");
      expect(toolNames(el)).not.toContain("drag_and_drop");
    });

    it("registers the opted-in page actions", () => {
      const el = mount({ "data-page-actions": "scroll, drag" });
      expect(toolNames(el)).toContain("scroll_to");
      expect(toolNames(el)).toContain("drag_and_drop");
    });

    it("registers only the named subset", () => {
      const el = mount({ "data-page-actions": "scroll" });
      expect(toolNames(el)).toContain("scroll_to");
      expect(toolNames(el)).not.toContain("drag_and_drop");
    });

    it("default resolvePageTarget queries the document", () => {
      const el = mount();
      const target = document.createElement("div");
      target.id = "needle";
      document.body.appendChild(target);
      expect(el.resolvePageTarget("#needle")).toBe(target);
      expect(el.resolvePageTarget("#absent")).toBeNull();
      target.remove();
    });
  });

  describe("stuck tool card swept at settle", () => {
    it("settles a pending tool card and shows the error when the stream drops", async () => {
      // A server tool card opens, then the stream closes with no terminal event.
      const el = mountWithAgent((emit) => {
        emit.toolCall("srv1", "server_tool", {});
      }, true);
      clickSend(el, "do it");
      await flush();

      // The pending indicator is gone, the connection-loss bubble is shown,
      const root = shadow(el);
      expect(root.querySelector(".pending")).toBeNull();
      const error = Array.from(root.querySelectorAll(".message--assistant")).find((m) =>
        m.textContent?.includes("Connection lost"),
      );
      expect(error).toBeDefined();
      // and the orphaned tool card is settled rather than stuck on "running…".
      const card = root.querySelector(".tool-call");
      expect(card?.getAttribute("data-status")).toBe("done");
      expect(card?.querySelector(".tool-call-result")?.textContent).toBe("No result returned.");
    });
  });

  describe("voice input", () => {
    it("hides the mic until transcription is wired", () => {
      expect(shadow(mount()).querySelector(".voice-btn")).toBeNull();
    });

    it("reveals the mic with data-transcribe-url", () => {
      const el = mount({ "data-transcribe-url": "/agent/transcribe/" });
      expect(shadow(el).querySelector(".voice-btn")).not.toBeNull();
    });

    it("reveals the mic with a custom transcribeHandler and no url", () => {
      const el = mount({}, (e) => {
        e.transcribeHandler = async () => "x";
      });
      expect(shadow(el).querySelector(".voice-btn")).not.toBeNull();
    });

    it("drops a transcript into the composer, appending to typed text", async () => {
      const media = installFakeMedia();
      try {
        const el = mount({}, (e) => {
          e.transcribeHandler = async () => "from voice";
        });
        const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
        if (input === null) {
          throw new Error("expected an input");
        }
        input.value = "typed";
        const mic = shadow(el).querySelector<HTMLButtonElement>(".voice-btn");
        mic?.click(); // start
        await flush();
        mic?.click(); // stop → transcribe → insert
        await flush();
        expect(input.value).toBe("typed from voice");
      } finally {
        media.restore();
      }
    });

    it("sets the transcript as-is when the composer is empty", async () => {
      const media = installFakeMedia();
      try {
        const el = mount({}, (e) => {
          e.transcribeHandler = async () => "just voice";
        });
        const mic = shadow(el).querySelector<HTMLButtonElement>(".voice-btn");
        mic?.click();
        await flush();
        mic?.click();
        await flush();
        expect(shadow(el).querySelector<HTMLTextAreaElement>(".input")?.value).toBe("just voice");
      } finally {
        media.restore();
      }
    });
  });

  describe("built-in theme toggle", () => {
    it("is absent unless opted in", () => {
      expect(shadow(mount()).querySelector(".header-btn--theme")).toBeNull();
    });

    it("flips the theme attribute and persists it per tab", () => {
      const el = mount({ "data-theme-toggle": "" });
      const toggle = shadow(el).querySelector<HTMLButtonElement>(".header-btn--theme");
      expect(toggle?.getAttribute("part")).toBe("header-button theme-toggle");
      expect(toggle?.textContent).toBe("🌙"); // light → offer dark

      toggle?.click();
      expect(el.getAttribute("theme")).toBe("dark");
      expect(sessionStorage.getItem("ag-ui-chat:theme")).toBe("dark");
      expect(toggle?.textContent).toBe("☀️"); // dark → offer light

      toggle?.click();
      expect(el.getAttribute("theme")).toBe("light");
    });

    it("restores a persisted theme on connect (opt-in only)", () => {
      sessionStorage.setItem("ag-ui-chat:theme", "dark");
      // Without the opt-in the persisted value is ignored…
      expect(mount().getAttribute("theme")).toBeNull();
      // …with it, the theme is restored.
      expect(mount({ "data-theme-toggle": "" }).getAttribute("theme")).toBe("dark");
    });
  });
});
