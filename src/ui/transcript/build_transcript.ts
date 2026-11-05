import type { UiStrings } from "../ui_strings.js";

/** The transcript's parts, owned by the element, and what fills them. */
export interface TranscriptOptions {
  readonly messages: HTMLElement;
  readonly jumpButton: HTMLButtonElement;
  readonly emptyWrap: HTMLElement;
  /** The greeting's text node, kept by the element so a new user name updates it. */
  readonly greetingText: HTMLElement;
  /** The starter chips, or `null` when the host configured none. */
  readonly starters: HTMLElement | null;
  readonly strings: UiStrings;
}

/**
 * Ready the message list, its jump-to-latest control and the empty state.
 *
 * The empty state is built but not put into the list: the element mounts the
 * scroller, the quote offer and the announcer first and appends it after, so
 * the scroller's observers see the list fill exactly as they always have.
 */
export function buildTranscript(options: TranscriptOptions): void {
  const { messages, jumpButton, emptyWrap, strings } = options;
  messages.className = "messages";
  messages.setAttribute("part", "messages");
  messages.setAttribute("role", "log");
  // NOT a live region. The streaming bubble's innerHTML is replaced inside
  // this element on every animation frame, and `role="log"` already implies
  // polite announcement whose default `aria-relevant` includes text
  // additions -- so a screen reader was asked to re-announce the whole answer
  // tens of times as it streamed. `aria-live="off"` is an explicit override
  // of the role's implicit value, which is why the role can stay: the log
  // semantics are what let the transcript be navigated as one, and only the
  // announcing is the defect. Status goes to the announcer instead.
  messages.setAttribute("aria-live", "off");
  messages.setAttribute("aria-label", strings.conversation);

  jumpButton.className = "jump-latest";
  jumpButton.type = "button";
  jumpButton.setAttribute("part", "jump-latest");
  jumpButton.textContent = strings.jumpToLatest;

  // Empty-state region: a host slot at the top of the list, hidden as soon as
  // anything renders.
  emptyWrap.className = "empty";
  emptyWrap.setAttribute("part", "empty");
  // The greeting heads the empty state, in a slot of its own: a host that
  // replaces the starters keeps the greeting, and a host that replaces the
  // greeting keeps the starters. A div rather than a heading, because this
  // sits inside somebody else's page, which owns the document outline.
  const greeting = document.createElement("div");
  greeting.className = "greeting";
  greeting.setAttribute("part", "greeting");
  const greetingSlot = document.createElement("slot");
  greetingSlot.name = "greeting";
  greetingSlot.append(options.greetingText);
  greeting.append(greetingSlot);
  const emptySlot = document.createElement("slot");
  emptySlot.name = "empty";
  // Fallback content, so a host that slots its own gets exactly that and
  // nothing of ours: the starters live *inside* the slot rather than beside
  // it, which is the difference between an offer and an imposition.
  if (options.starters !== null) {
    emptySlot.append(options.starters);
  }
  emptyWrap.replaceChildren(greeting, emptySlot);
}
