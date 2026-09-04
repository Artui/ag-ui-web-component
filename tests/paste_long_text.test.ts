import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, PASTE_ATTACH_CHARS } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";

/**
 * A very long paste becomes an attachment rather than a wall of text.
 *
 * The composer is capped at 40vh, so a paste near this size is already taller
 * than the box holding it: the reader cannot see what they pasted, cannot edit
 * around it, and sends one enormous turn.
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

/** With uploads configured, which is the only case this can act in. */
function mountWithUploads(attrs: Record<string, string> = {}): AgUiChat {
  return mount({ "data-attachments-url": "/uploads/", ...attrs });
}

function paste(el: AgUiChat, text: string): { prevented: boolean } {
  const clipboard = new DataTransfer();
  clipboard.setData("text/plain", text);
  const event = new ClipboardEvent("paste", {
    clipboardData: clipboard,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  const shell = el.shadowRoot?.querySelector(".chat");
  if (!(shell instanceof HTMLElement)) {
    throw new Error("no chat shell to paste into");
  }
  shell.dispatchEvent(event);
  return { prevented: event.defaultPrevented };
}

const chips = (el: AgUiChat): string[] =>
  [...(el.shadowRoot?.querySelectorAll(".attachment-chip-name") ?? [])].map(
    (n) => n.textContent ?? "",
  );

describe("pasting a long block of text", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("leaves an ordinary paste alone", () => {
    const el = mountWithUploads();

    expect(paste(el, "a short question").prevented).toBe(false);
    expect(chips(el)).toEqual([]);
  });

  it("attaches a paste past the threshold instead", () => {
    const el = mountWithUploads();

    expect(paste(el, "x".repeat(PASTE_ATTACH_CHARS)).prevented).toBe(true);
    expect(chips(el).length).toBe(1);
    expect(chips(el)[0]).toMatch(/\.txt$/);
  });

  it("leaves it in the composer where the host configured no uploads", () => {
    // Without a tray there is nowhere for it to go, and quietly dropping a
    // paste for being long is far worse than an awkward composer.
    //
    // Structural rather than checked: the paste listener is wired inside the
    // attachment setup, so with no uploads there is no listener at all. Worth
    // saying, because this test would pass just as happily against a check
    // that had been deleted.
    const el = mount();
    expect(el.shadowRoot?.querySelector(".attachment-tray")).toBeNull();

    expect(paste(el, "x".repeat(PASTE_ATTACH_CHARS)).prevented).toBe(false);
  });

  it("takes a threshold from the host", () => {
    const el = mountWithUploads({ "data-paste-attach": "10" });

    expect(paste(el, "x".repeat(12)).prevented).toBe(true);
    expect(chips(el).length).toBe(1);
  });

  it("refuses entirely when the host says off", () => {
    const el = mountWithUploads({ "data-paste-attach": "off" });

    expect(paste(el, "x".repeat(PASTE_ATTACH_CHARS * 2)).prevented).toBe(false);
    expect(chips(el)).toEqual([]);
  });

  it("says so rather than silently meaning off when the value is a typo", () => {
    // A typo quietly disabling something is the failure this release keeps
    // finding, so the one value that is neither a number nor "off" complains
    // and falls back rather than switching itself off.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const el = mountWithUploads({ "data-paste-attach": "offf" });

    expect(paste(el, "x".repeat(PASTE_ATTACH_CHARS)).prevented).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("data-paste-attach");
  });
});
