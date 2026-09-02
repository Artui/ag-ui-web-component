/**
 * Pasting a file, through a real ClipboardEvent.
 *
 * The happy-dom tests hand the element a hand-built object with a `files`
 * array, which proves the wiring and nothing about the shape a browser
 * actually delivers. This builds a genuine `DataTransfer`, puts a real `File`
 * on it, and dispatches a real `ClipboardEvent` -- the same object a paste
 * produces, minus the user.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

const settle = (ms = 60): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-attachments-url", "/agent/attachments/");
  // Nothing is uploaded here: the assertion is that the file reaches the tray
  // as a chip, and an upload that never resolves leaves it on the uploading
  // chip, which is exactly the state a paste should produce.
  el.uploadHandler = () => new Promise(() => {});
  document.body.appendChild(el);
  return el;
}

/** A real paste event carrying `files` and, optionally, text. */
function pasteEvent(files: File[], text = ""): ClipboardEvent {
  const data = new DataTransfer();
  for (const file of files) {
    data.items.add(file);
  }
  if (text !== "") {
    data.setData("text/plain", text);
  }
  return new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true });
}

function chips(el: AgUiChat): string[] {
  return [...(el.shadowRoot?.querySelectorAll(".attachment-chip-name") ?? [])].map(
    (chip) => chip.textContent ?? "",
  );
}

beforeAll(() => {
  defineAgUiChat();
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("pasting a file in a real browser", () => {
  it("puts a genuinely pasted file on the tray", async () => {
    const el = mount();
    const chat = el.shadowRoot?.querySelector(".chat") as HTMLElement;

    const event = pasteEvent([new File(["png-bytes"], "screenshot.png", { type: "image/png" })]);
    chat.dispatchEvent(event);
    await settle();

    expect(chips(el)).toEqual(["screenshot.png"]);
    // Files and no text: nothing was going to be typed, so the composer does
    // not also receive the paste.
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps the words when the clipboard carries both", async () => {
    const el = mount();
    const chat = el.shadowRoot?.querySelector(".chat") as HTMLElement;

    const event = pasteEvent(
      [new File(["png-bytes"], "inline.png", { type: "image/png" })],
      "the surrounding sentence",
    );
    chat.dispatchEvent(event);
    await settle();

    expect(chips(el)).toEqual(["inline.png"]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("leaves a plain text paste to the composer", async () => {
    const el = mount();
    const chat = el.shadowRoot?.querySelector(".chat") as HTMLElement;

    const event = pasteEvent([], "just some words");
    chat.dispatchEvent(event);
    await settle();

    expect(chips(el)).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it("takes several files from one paste", async () => {
    const el = mount();
    const chat = el.shadowRoot?.querySelector(".chat") as HTMLElement;

    chat.dispatchEvent(
      pasteEvent([
        new File(["a"], "one.png", { type: "image/png" }),
        new File(["b"], "two.txt", { type: "text/plain" }),
      ]),
    );
    await settle();

    expect(chips(el)).toEqual(["one.png", "two.txt"]);
  });
});
