import { ICON_COPY, ICON_THUMB_DOWN, ICON_THUMB_UP } from "../constants.js";
import type { UiStrings } from "./ui_strings.js";

/** How long a button shows its confirmation before reverting. */
const CONFIRM_MS = 1500;

/** What an action bar can do, beyond copying. */
export interface MessageActionsOptions {
  /** Localized strings. */
  strings: UiStrings;
  /**
   * The text Copy puts on the clipboard. Absent means no copy button.
   *
   * A function rather than a string because a bubble's content is rewritten
   * while it streams, and the bar is attached to the element rather than to a
   * snapshot of it. Optional for the same reason `onFeedback` is: what a button
   * needs to do its job is also the statement that the button belongs here, so
   * there is no second flag saying the same thing and no way for the two to
   * disagree.
   */
  text?: () => string;
  /**
   * The rich flavour to copy alongside `text`, as an HTML fragment. Absent
   * means the clipboard gets plain text only, which is what this did before
   * the option existed.
   *
   * It is what makes a copied table paste as a table: a spreadsheet or a chat
   * client reads `text/html` when it is offered and falls back to the plain
   * flavour when it is not, so the two are the same content at two fidelities
   * rather than a choice the caller has to make.
   */
  html?: () => string;
  /**
   * Report a rating for this message. Absent means no feedback buttons.
   *
   * The component stores nothing: a rating is the host's to keep, and a
   * write-only table nobody reads is not worth a schema.
   */
  onFeedback?: (rating: "up" | "down") => void;
}

/**
 * Give one finished message bubble its row of actions.
 *
 * **Finished** is load-bearing. A streaming bubble reassigns its `innerHTML` on
 * every delta, so anything attached mid-stream is discarded and rebuilt for
 * each one -- the same constraint `attachCopyButtons` records, one level up.
 *
 * Retry is deliberately **not** here: it belongs to the last turn only, so the
 * element owns it and moves it as the transcript grows. Everything on this bar
 * is safe to offer on any message, however old.
 *
 * Idempotent -- a bubble already given a bar is skipped, so a re-render or a
 * second call cannot stack rows.
 *
 * Each button is present because the option it needs was passed: `text` for
 * Copy, `onFeedback` for the rating pair. Passing neither builds an empty row,
 * which is a caller's mistake rather than a state to guard against -- the
 * element skips the call entirely when a host has turned both off.
 */
export function attachMessageActions(bubble: HTMLElement, options: MessageActionsOptions): void {
  if (existingBar(bubble) !== null) {
    return;
  }
  const bar = messageActionBar(bubble, options.strings);
  const text = options.text;
  if (text !== undefined) {
    bar.appendChild(copyButton(options.strings, text, options.html));
  }
  if (options.onFeedback !== undefined) {
    bar.append(
      feedbackButton("up", options.strings.feedbackUp, options.onFeedback),
      feedbackButton("down", options.strings.feedbackDown, options.onFeedback),
    );
  }
}

/**
 * The empty action row on `bubble`, created if it has none yet.
 *
 * Shared so a bubble that wants *only* Retry -- a failed run, which has nothing
 * worth copying and nothing to rate -- gets the same row, the same part name
 * and the same accessible grouping as every other message, rather than a
 * second thing that looks like one.
 */
export function messageActionBar(bubble: HTMLElement, strings: UiStrings): HTMLElement {
  const existing = existingBar(bubble);
  if (existing !== null) {
    return existing;
  }
  const bar = document.createElement("div");
  bar.className = "message-actions";
  bar.setAttribute("part", "message-actions");
  // A group rather than a toolbar: these are independent actions on the message
  // above, not a set the user arrows between.
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", strings.messageActions);
  // A **sibling**, never a child. Inside the bubble the buttons join its
  // `textContent`, which is what Copy reads, what history persists and what
  // every existing assertion about a message's text compares against -- so an
  // answer would be copied back with the glyphs of the buttons that copied it.
  // The bubble must therefore already be in the tree when this is called.
  bubble.after(bar);
  return bar;
}

/** The action row belonging to `bubble`, if it has one. */
function existingBar(bubble: HTMLElement): HTMLElement | null {
  const next = bubble.nextElementSibling;
  return next?.classList.contains("message-actions") === true ? (next as HTMLElement) : null;
}

/**
 * Build one action button, labelled for screen readers rather than by glyph.
 *
 * `icon` is icon markup rather than a text glyph, because the text glyphs these
 * carried are the obscure end of the character set -- the copy mark in
 * particular has no font behind it on most systems, so it rendered as a mark
 * nobody could name on a control small enough that nobody could hit it either.
 *
 * The label is carried three ways, and each has a reader the others miss:
 * `aria-label` for assistive technology, `title` for the browser's own
 * tooltip, and `data-tooltip` for the one this component draws. The last is
 * not redundant with the second -- a `title` never appears on keyboard focus,
 * so without it a keyboard user has no way to see what the control does.
 *
 * The icon sits in its own part, so a host can restyle or replace it. A slot
 * would be the better channel and cannot be used here: these repeat once per
 * message, and a named slot can only be filled once.
 */
export function messageActionButton(
  modifier: string,
  label: string,
  icon: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `message-action message-action--${modifier}`;
  button.setAttribute("part", `message-action message-action-${modifier}`);
  setLabel(button, label);
  const holder = document.createElement("span");
  holder.className = "message-action-icon";
  holder.setAttribute("part", `message-action-icon message-action-icon-${modifier}`);
  holder.setAttribute("aria-hidden", "true");
  // Author-written markup from constants, never message content.
  holder.innerHTML = icon;
  button.appendChild(holder);
  return button;
}

/** Put `label` on every channel that names this button. */
function setLabel(button: HTMLButtonElement, label: string): void {
  button.title = label;
  button.setAttribute("aria-label", label);
  button.dataset["tooltip"] = label;
}

function copyButton(
  strings: UiStrings,
  text: () => string,
  html: (() => string) | undefined,
): HTMLButtonElement {
  const button = messageActionButton("copy", strings.copyMessage, ICON_COPY);
  button.addEventListener("click", () => {
    void write(text(), html?.()).then((ok) => {
      // A denied clipboard permission is the common case, not an exception:
      // say so on the button rather than throwing into an unhandled rejection.
      flash(button, ok ? strings.copied : strings.copyFailed, strings.copyMessage);
    });
  });
  return button;
}

/**
 * Put the message on the clipboard, richest flavour first.
 *
 * Writing both flavours needs `ClipboardItem`, which not every engine that has
 * `writeText` also has -- and even where the constructor exists the write can
 * be refused. Neither is a failure worth reporting as one while the plain text
 * would still have landed, so both fall through to `writeText` and only that
 * decides what the button says.
 */
async function write(text: string, html: string | undefined): Promise<boolean> {
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) {
    return false;
  }
  if (html !== undefined && typeof ClipboardItem === "function") {
    try {
      await clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([text], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return true;
    } catch {
      // Fall through to the plain flavour.
    }
  }
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function feedbackButton(
  rating: "up" | "down",
  label: string,
  report: (rating: "up" | "down") => void,
): HTMLButtonElement {
  const button = messageActionButton(
    rating === "up" ? "up" : "down",
    label,
    rating === "up" ? ICON_THUMB_UP : ICON_THUMB_DOWN,
  );
  button.addEventListener("click", () => {
    // Pressed rather than removed: the rating is a standing statement about the
    // message, and a button that vanishes leaves no record of what was said.
    const pressed = button.getAttribute("aria-pressed") === "true";
    button.setAttribute("aria-pressed", pressed ? "false" : "true");
    report(rating);
  });
  button.setAttribute("aria-pressed", "false");
  return button;
}

/**
 * Flash `message` on the button, then restore `label`.
 *
 * The label to restore is passed rather than read back off the element: the
 * caller is the one that set it, and reading it would introduce a null arm that
 * cannot happen and cannot be covered.
 */
function flash(button: HTMLButtonElement, message: string, label: string): void {
  setLabel(button, message);
  button.classList.add("message-action--confirmed");
  setTimeout(() => {
    setLabel(button, label);
    button.classList.remove("message-action--confirmed");
  }, CONFIRM_MS);
}
