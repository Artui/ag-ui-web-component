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
    bar.appendChild(copyButton(options.strings, text));
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

/** Build one action button, labelled for screen readers rather than by glyph. */
export function messageActionButton(
  modifier: string,
  label: string,
  glyph: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `message-action message-action--${modifier}`;
  button.setAttribute("part", `message-action message-action-${modifier}`);
  button.title = label;
  button.setAttribute("aria-label", label);
  const icon = document.createElement("span");
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = glyph;
  button.appendChild(icon);
  return button;
}

function copyButton(strings: UiStrings, text: () => string): HTMLButtonElement {
  const button = messageActionButton("copy", strings.copyMessage, "⎘");
  button.addEventListener("click", () => {
    void navigator.clipboard.writeText(text()).then(
      () => flash(button, strings.copied, strings.copyMessage),
      // A denied clipboard permission is the common case, not an exception:
      // say so on the button rather than throwing into an unhandled rejection.
      () => flash(button, strings.copyFailed, strings.copyMessage),
    );
  });
  return button;
}

function feedbackButton(
  rating: "up" | "down",
  label: string,
  report: (rating: "up" | "down") => void,
): HTMLButtonElement {
  const button = messageActionButton(
    rating === "up" ? "up" : "down",
    label,
    rating === "up" ? "\u{1F44D}" : "\u{1F44E}",
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
  button.title = message;
  button.setAttribute("aria-label", message);
  button.classList.add("message-action--confirmed");
  setTimeout(() => {
    button.title = label;
    button.setAttribute("aria-label", label);
    button.classList.remove("message-action--confirmed");
  }, CONFIRM_MS);
}
