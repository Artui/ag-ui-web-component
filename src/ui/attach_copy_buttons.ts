import type { UiStrings } from "./ui_strings.js";

/** How long the button shows its "copied" confirmation before reverting. */
const CONFIRM_MS = 1500;

/**
 * Give every fenced code block in `root` a copy button.
 *
 * Call only on finished bubbles: the streaming bubble reassigns its `innerHTML`
 * on every delta, so a button attached mid-stream is discarded and rebuilt for
 * each one.
 *
 * Idempotent — a bubble already processed is skipped, so a re-render or a second
 * call cannot stack buttons.
 */
export function attachCopyButtons(root: ParentNode, strings: UiStrings): void {
  for (const pre of Array.from(root.querySelectorAll("pre"))) {
    const code = pre.querySelector("code");
    if (code === null || pre.querySelector(".code-copy") !== null) {
      continue;
    }
    pre.classList.add("has-copy");
    pre.append(button(code, strings));
  }
}

function button(code: Element, strings: UiStrings): HTMLButtonElement {
  // Never null: `textContent` is nullable only on documents and doctypes,
  // and this is always the `code` element `querySelector` just returned.
  const text = code.textContent as string;
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "code-copy";
  copy.setAttribute("part", "code-copy");
  copy.textContent = strings.copyCode;
  copy.title = strings.copyCode;
  copy.setAttribute("aria-label", strings.copyCode);
  copy.addEventListener("click", () => {
    void writeText(text).then((ok) => {
      // Report the real outcome: a button that always claims success leaves the
      // reader pasting stale clipboard content.
      confirm(copy, ok ? strings.copied : strings.copyFailed, strings);
    });
  });
  return copy;
}

/**
 * Copy `text`, reporting whether it landed. The Clipboard API needs a secure
 * context and a user gesture and is absent in some embeddings, so failure is an
 * ordinary outcome rather than an error to throw at the host page.
 */
async function writeText(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) {
    return false;
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function confirm(copy: HTMLButtonElement, message: string, strings: UiStrings): void {
  copy.textContent = message;
  copy.dataset["state"] = message === strings.copied ? "copied" : "failed";
  setTimeout(() => {
    copy.textContent = strings.copyCode;
    delete copy.dataset["state"];
  }, CONFIRM_MS);
}
