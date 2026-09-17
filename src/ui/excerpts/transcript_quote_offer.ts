import type { UiStrings } from "../ui_strings.js";
import { attachQuoteOffer, type PageQuoteOffer } from "./page_quote_offer.js";
import { asQuote, quotableSelection } from "./quote_selection.js";

/** Pixels between a selection and the offer to quote it. */
const QUOTE_GAP = 6;

/** What the quote offer needs from the element that owns it. */
export interface TranscriptQuoteHost {
  /** The custom element: its opt-out attribute, and what a page offer excludes. */
  readonly element: HTMLElement;
  /** The shadow root a transcript selection is read through. */
  readonly root: ShadowRoot;
  /** The transcript, whose selections are offered. */
  readonly messages: HTMLElement;
  /** The transcript's positioning box, which the offer floats inside. */
  readonly messagesWrap: HTMLElement;
  /** The composer a quotation is written into. */
  readonly input: HTMLTextAreaElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Resize the composer to what it now holds. */
  readonly autoGrow: () => void;
  /** The element's public `quote`, so a host that replaced it is the one called. */
  readonly quote: (text: string) => void;
}

/**
 * Quoting a selection into the composer: the offer floated beside a selection
 * in the transcript, the same offer over the host page, and the quotation
 * itself.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class TranscriptQuoteOffer {
  /**
   * Offer to quote the current selection, floated beside it.
   *
   * Shares the transcript's positioning box with the jump button for the same
   * reason: it is positioned against the transcript, and must not scroll away
   * with the words it is pointing at.
   */
  readonly button: HTMLButtonElement = document.createElement("button");

  readonly #host: TranscriptQuoteHost;
  /** What {@link button} would quote, while it is showing. */
  #quoting = "";
  /** The host-page offer, while one is attached; see {@link offerInPage}. */
  #pageQuote: PageQuoteOffer | null = null;

  constructor(host: TranscriptQuoteHost) {
    this.#host = host;
  }

  /** The quotation behind `AgUiChat.quote`, whose doc is the contract. */
  insert(text: string): void {
    const quoted = asQuote(text);
    if (quoted === "") {
      return;
    }
    const input = this.#host.input;
    // Appended after whatever is already typed, on a fresh paragraph: a second
    // quotation is a second thing being asked about, not a replacement for the
    // first. Trailing blank lines are dropped so repeated quoting does not
    // accumulate gaps.
    const current = input.value.replace(/\s+$/, "");
    input.value = current === "" ? quoted : `${current}\n\n${quoted}`;
    this.#host.autoGrow();
    input.focus();
    const end = input.value.length;
    input.setSelectionRange(end, end);
  }

  /** The offer behind `AgUiChat.offerQuoteInPage`, whose doc is the contract. */
  offerInPage(within: HTMLElement): () => void {
    this.#pageQuote?.detach();
    const offer = attachQuoteOffer({
      within,
      label: this.#host.strings().quoteSelection,
      exclude: this.#host.element,
      onQuote: (text) => this.#host.quote(text),
    });
    this.#pageQuote = offer;
    return () => {
      offer.detach();
      if (this.#pageQuote === offer) {
        this.#pageQuote = null;
      }
    };
  }

  /**
   * Take the host-page offer down. It listens on the host's document, not on
   * anything of ours, so nothing else would ever take it down.
   */
  detachPageOffer(): void {
    this.#pageQuote?.detach();
    this.#pageQuote = null;
  }

  /**
   * Build the offer and listen for settled selections in the transcript.
   *
   * The button and the transcript outlive a connection, so the listeners go
   * under `signal`, which the element aborts when it leaves the document.
   */
  mount(signal: AbortSignal): void {
    const button = this.button;
    button.className = "quote-selection";
    button.type = "button";
    button.setAttribute("part", "quote-selection");
    button.textContent = this.#host.strings().quoteSelection;
    button.hidden = true;
    // `mousedown` rather than `click`: pressing anywhere else collapses the
    // selection first, and by the time a click lands there is nothing left to
    // quote. Preventing the default keeps the selection alive long enough to
    // read it.
    button.addEventListener(
      "mousedown",
      (event) => {
        event.preventDefault();
      },
      { signal },
    );
    button.addEventListener(
      "click",
      () => {
        this.#host.quote(this.#quoting);
        window.getSelection()?.removeAllRanges();
        this.#hide();
      },
      { signal },
    );

    // A settled selection, by either input. `mouseup` rather than
    // `selectionchange` so the offer does not chase the pointer mid-drag; the
    // second half of the same gesture, `mousedown`, retires the previous offer
    // before the new selection exists.
    const messages = this.#host.messages;
    messages.addEventListener("mouseup", (event) => this.#onSelectionSettled(event), { signal });
    messages.addEventListener("keyup", () => this.#onSelectionSettled(), { signal });
    messages.addEventListener("mousedown", () => this.#hide(), { signal });
  }

  /** Whether the transcript offers to quote what the user selects. */
  #enabled(): boolean {
    return this.#host.element.getAttribute("data-quote-selection") !== "false";
  }

  /**
   * Offer to quote the settled selection, or retire the offer.
   *
   * `event` is passed for its coordinates and only those: they say which line
   * of a selection spanning several messages the offer should hang from. A
   * keyboard selection has none, and the first line is used instead.
   */
  #onSelectionSettled(event?: MouseEvent): void {
    if (!this.#enabled()) {
      return;
    }
    const near = event === undefined ? undefined : { x: event.clientX, y: event.clientY };
    const selected = quotableSelection(this.#host.messages, [this.#host.root], near);
    if (selected === null) {
      this.#hide();
      return;
    }
    this.#quoting = selected.text;
    this.#place(selected.rect);
  }

  /** Float the offer beside `rect`, kept inside the transcript's own box. */
  #place(rect: DOMRect): void {
    const button = this.button;
    // Unhidden first: a hidden element measures zero, and its own size is what
    // decides whether it fits above the selection and how far to pull it left.
    button.hidden = false;
    const wrap = this.#host.messagesWrap.getBoundingClientRect();
    const top = rect.top - wrap.top;
    // Above the selection by default, below it when there is no room --
    // selecting the first line of the transcript is the ordinary case, not an
    // edge one, and an offer clipped by the header is an offer nobody takes.
    const below = top < QUOTE_GAP + button.offsetHeight;
    button.dataset["below"] = String(below);
    button.style.top = `${below ? rect.bottom - wrap.top + QUOTE_GAP : top - QUOTE_GAP}px`;
    // Centred on the selection, then pulled back by its own half-width so a
    // selection at either margin does not push the offer out of the panel.
    const half = button.offsetWidth / 2;
    const centre = rect.left + rect.width / 2 - wrap.left;
    button.style.left = `${Math.min(Math.max(centre, half), wrap.width - half)}px`;
  }

  /** Retire the offer, and forget what it was pointing at. */
  #hide(): void {
    this.button.hidden = true;
    this.#quoting = "";
  }
}
