import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

/**
 * The prompts offered on an empty transcript.
 *
 * Different from the suggestion chips a run pushes, which are follow-ups to
 * something already said. These answer the blank-page question, and they are
 * the host's rather than the model's -- only the host knows what its page is
 * for.
 */

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  document.body.appendChild(el);
  return el;
}

const chips = (el: AgUiChat): string[] =>
  [...(el.shadowRoot?.querySelectorAll(".suggestion-chip") ?? [])].map((n) => n.textContent ?? "");

describe("starter prompts", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("offers nothing unless the host said what to offer", () => {
    expect(chips(mount())).toEqual([]);
  });

  it("draws the host's prompts on an empty transcript", () => {
    const el = mount({ "data-starters": '["Summarise this page", "What can you do?"]' });

    expect(chips(el)).toEqual(["Summarise this page", "What can you do?"]);
  });

  it("sends the prompt it shows, since the label is the message", () => {
    const el = mount({ "data-starters": '["Summarise this page"]' });
    const sent: string[] = [];
    el.sendMessage = async (content: string) => {
      sent.push(content);
    };

    const chip = el.shadowRoot?.querySelector(".suggestion-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("no starter chip to press");
    }
    chip.click();

    expect(sent).toEqual(["Summarise this page"]);
  });

  it("goes away once the conversation starts, and comes back on a new chat", () => {
    // It answers the blank page, so it belongs to the blank page.
    const el = mount({ "data-starters": '["Summarise this page"]' });
    const empty = el.shadowRoot?.querySelector(".empty") as HTMLElement;
    expect(empty.hidden).toBe(false);

    el.appendMessage("user", "hello");
    expect(empty.hidden).toBe(true);

    el.newChat();
    expect(empty.hidden).toBe(false);
    expect(chips(el)).toEqual(["Summarise this page"]);
  });

  it("shares the count and length limits with the chips a run pushes", () => {
    // Two rows of prompt chips that behaved differently would be the harder
    // thing to explain.
    //
    // Sized so each limit is the only thing that can explain its own drop. The
    // length filter runs before the count is applied, so a list of six short
    // prompts plus one long one loses the long one to the *count* -- and the
    // length cap could be deleted from that `and`-chain with the assertion
    // still passing and the branch gate still reporting every arc taken.
    const el = mount({
      "data-starters": JSON.stringify(["a", "b", "x".repeat(200), "c"]),
    });

    // Under the count, so the over-length one is dropped by length alone.
    expect(chips(el)).toEqual(["a", "b", "c"]);
  });

  it("caps the count once the lengths are all fine", () => {
    const el = mount({ "data-starters": JSON.stringify(["a", "b", "c", "d", "e"]) });

    expect(chips(el)).toEqual(["a", "b", "c", "d"]);
  });

  it("says so rather than failing silently when the JSON is wrong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const el = mount({ "data-starters": "not json" });

    expect(chips(el)).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("data-starters");
  });

  it("leaves the slot to a host that fills it", () => {
    // Fallback content: slotting your own gets exactly that and none of ours.
    const el = mount({ "data-starters": '["Summarise this page"]' });
    const own = document.createElement("p");
    own.slot = "empty";
    own.textContent = "Ask me anything";
    el.appendChild(own);

    const slot = el.shadowRoot?.querySelector('slot[name="empty"]') as HTMLSlotElement;
    expect(slot.assignedNodes().map((n) => n.textContent)).toEqual(["Ask me anything"]);
  });
});
