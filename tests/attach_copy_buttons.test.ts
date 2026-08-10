import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachCopyButtons } from "../src/ui/attach_copy_buttons.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

function block(code = "print('hi')"): HTMLDivElement {
  const host = document.createElement("div");
  host.innerHTML = `<pre><code>${code}</code></pre>`;
  return host;
}

function copyButton(host: ParentNode): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(".code-copy");
  if (button === null) {
    throw new Error("no copy button");
  }
  return button;
}

let written: string[];

beforeEach(() => {
  vi.useFakeTimers();
  written = [];
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: (text: string) => (written.push(text), Promise.resolve()) },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(navigator, "clipboard");
});

describe("attachCopyButtons", () => {
  it("copies the block's text", async () => {
    const host = block("const x = 1;");
    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    copyButton(host).click();
    await vi.advanceTimersByTimeAsync(0);

    expect(written).toEqual(["const x = 1;"]);
    expect(copyButton(host).textContent).toBe(DEFAULT_UI_STRINGS.copied);
  });

  it("reverts to the idle label after the confirmation", async () => {
    const host = block();
    attachCopyButtons(host, DEFAULT_UI_STRINGS);
    copyButton(host).click();
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(1500);

    expect(copyButton(host).textContent).toBe(DEFAULT_UI_STRINGS.copyCode);
    expect(copyButton(host).dataset["state"]).toBeUndefined();
  });

  it("says so when the clipboard refuses", async () => {
    // A button that always claims success is worse than no button: the reader
    // pastes stale clipboard content and finds out somewhere else entirely.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new Error("denied")) },
      configurable: true,
    });
    const host = block();
    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    copyButton(host).click();
    await vi.advanceTimersByTimeAsync(0);

    expect(copyButton(host).textContent).toBe(DEFAULT_UI_STRINGS.copyFailed);
    expect(copyButton(host).dataset["state"]).toBe("failed");
  });

  it("says so when there is no Clipboard API at all", async () => {
    // Absent outside a secure context, and in some embeddings — an ordinary
    // outcome, not an error to throw at the host page. Defined as `undefined`
    // rather than deleted: happy-dom serves `clipboard` from the prototype, so
    // removing the own property just falls back to the working one.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const host = block();
    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    copyButton(host).click();
    await vi.advanceTimersByTimeAsync(0);

    expect(copyButton(host).textContent).toBe(DEFAULT_UI_STRINGS.copyFailed);
  });

  it("is idempotent — a second pass does not stack buttons", () => {
    const host = block();

    attachCopyButtons(host, DEFAULT_UI_STRINGS);
    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    expect(host.querySelectorAll(".code-copy")).toHaveLength(1);
  });

  it("ignores a pre with no code element", () => {
    const host = document.createElement("div");
    host.innerHTML = "<pre>plain preformatted text</pre>";

    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    expect(host.querySelector(".code-copy")).toBeNull();
    expect(host.querySelector("pre")?.classList.contains("has-copy")).toBe(false);
  });

  it("handles every block in one bubble", () => {
    const host = document.createElement("div");
    host.innerHTML = "<pre><code>one</code></pre><pre><code>two</code></pre>";

    attachCopyButtons(host, DEFAULT_UI_STRINGS);

    expect(host.querySelectorAll(".code-copy")).toHaveLength(2);
  });

  it("uses the host's overridden strings", () => {
    const host = block();

    attachCopyButtons(host, { ...DEFAULT_UI_STRINGS, copyCode: "Kopieren" });

    expect(copyButton(host).textContent).toBe("Kopieren");
    expect(copyButton(host).getAttribute("aria-label")).toBe("Kopieren");
  });
});
