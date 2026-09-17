import { FEEDBACK_EVENT, ICON_RETRY, MESSAGE_ACTIONS } from "../../constants.js";
import type { FeedbackDetail } from "../../core/events/feedback_detail.js";
import { commaTokens } from "../../core/utils.js";
import { copyPayload } from "../excerpts/copy_payload.js";
import type { UiStrings } from "../ui_strings.js";
import { attachMessageActions, messageActionBar, messageActionButton } from "./message_actions.js";

/** What the answer actions need from the element that owns them. */
export interface AnswerActionsHost {
  /** The custom element: its `data-message-actions`, and where feedback is dispatched. */
  readonly element: HTMLElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Retry the last turn, as the element's public `retryLastTurn` does. */
  readonly retry: () => void;
}

/**
 * The action row under a finished answer -- copy, retry, feedback -- and the
 * one row currently holding Retry.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class AnswerActions {
  readonly #host: AnswerActionsHost;
  /**
   * The one action row currently carrying Retry, if any.
   *
   * Retry belongs to the **last** turn only: re-running an older one is
   * branching, and for a page-driving agent editing a past turn is not neutral
   * -- those turns clicked buttons, and re-running turn 3 does not un-save what
   * turn 5 saved. Holding a single owner is what keeps exactly one offer on
   * screen without per-bubble bookkeeping.
   */
  #retryOwner: HTMLElement | null = null;

  constructor(host: AnswerActionsHost) {
    this.#host = host;
  }

  /** Forget the row holding Retry, with the transcript it was in. */
  forget(): void {
    this.#retryOwner = null;
  }

  /**
   * Give a finished assistant bubble its action row, and hand it Retry.
   *
   * Every finished bubble gets copy and feedback -- both are safe on a message
   * of any age. Retry moves to the newest, because it is the only one where
   * re-running answers the same question rather than rewriting history.
   *
   * `data-message-actions` subtracts from that. The row is built only when
   * something survives to go in it: an empty row still takes its margin, still
   * answers to the `message-actions` part, and still reads to a screen reader
   * as a group of actions with none in it.
   */
  attach(bubble: HTMLDivElement, options: { rateable?: boolean } = {}): void {
    const enabled = this.#enabled();
    const copyable = enabled.has(MESSAGE_ACTIONS.COPY);
    // A failed run is copyable -- error text is what people paste into a bug
    // report -- but not rateable: a rating is a statement about an *answer*,
    // and mixing "the connection dropped" into that signal makes the host's
    // feedback data say less than it did before.
    const rateable = options.rateable !== false && enabled.has(MESSAGE_ACTIONS.FEEDBACK);
    if (copyable || rateable) {
      attachMessageActions(bubble, {
        strings: this.#host.strings(),
        // Read at click time, not captured: a bubble rendered from markdown
        // holds its text in the DOM, and that is what the user sees and means
        // to copy. Serialised rather than read off `textContent`, which welds
        // a table into one run of digits and picks up the code blocks' own
        // copy buttons on the way past.
        ...(copyable
          ? {
              text: () => copyPayload(bubble).text,
              html: () => copyPayload(bubble).html,
            }
          : {}),
        ...(rateable
          ? {
              onFeedback: (rating: "up" | "down") => {
                this.#host.element.dispatchEvent(
                  new CustomEvent<FeedbackDetail>(FEEDBACK_EVENT, {
                    detail: { content: copyPayload(bubble).text, rating },
                    bubbles: true,
                    composed: true,
                  }),
                );
              },
            }
          : {}),
      });
    }
    if (enabled.has(MESSAGE_ACTIONS.RETRY)) {
      this.#moveRetryTo(messageActionBar(bubble, this.#host.strings()));
    }
  }

  /** Move the Retry button onto `bar`, taking it off whoever held it. */
  #moveRetryTo(bar: HTMLElement): void {
    this.#retryOwner?.querySelector(".message-action--retry")?.remove();
    const retry = messageActionButton("retry", this.#host.strings().retryMessage, ICON_RETRY);
    retry.addEventListener("click", () => {
      this.#host.retry();
    });
    // First in the row: it is the action a reader reaches for when the answer
    // was wrong, which is when they are least inclined to hunt for a control.
    bar.prepend(retry);
    this.#retryOwner = bar;
  }

  /**
   * Which message actions a finished bubble offers, from
   * `data-message-actions`.
   *
   * **Absent means copy and retry, not all three.** Those two work with nothing
   * wired: copy reads the DOM, retry drives this element. The rating pair does
   * not -- it fires `ag-ui-feedback` and stores nothing by design, because a
   * rating belongs to whatever the host already uses for product signal. With no
   * listener the buttons still latch `aria-pressed`, so a reader is told their
   * rating was taken and a screen reader announces it, while nothing recorded
   * anything. This README has always said two buttons that lead nowhere are
   * worse than none; shipping them by default was that sentence being false.
   *
   * A host with a listener asks for them: `data-message-actions="copy,retry,feedback"`.
   * A value names the survivors, which makes `data-message-actions="false"` --
   * the spelling its sibling `data-quote-selection` uses -- an empty set by
   * falling out of the same rule rather than by a case of its own.
   */
  #enabled(): ReadonlySet<string> {
    const attr = this.#host.element.getAttribute("data-message-actions");
    if (attr === null) {
      return new Set([MESSAGE_ACTIONS.COPY, MESSAGE_ACTIONS.RETRY]);
    }
    return new Set(commaTokens(attr));
  }
}
