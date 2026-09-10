import { quotableSelection } from "./quote_selection.js";

/**
 * The same select-then-offer gesture the transcript has, in the **host page**.
 *
 * This exists because the recipe version of it is a trap, and a specific one.
 * Chrome reports the internal selection of an `<input>` or `<textarea>` through
 * `document.getSelection()` as an ordinary `Range` whose endpoints are the
 * field's *wrapper* -- not the field. So the text reads back perfectly and the
 * range is indistinguishable from a selection over the surrounding prose: a
 * host listening for a page selection quotes the user's own half-typed form
 * field back at them, and nothing about the selection says why. The only signal
 * is `document.activeElement`, which is not where anyone looks.
 *
 * That, plus "do not fire for the widget's own transcript, which already offers
 * this", plus "a fixed-position affordance strands itself on the first scroll",
 * is three non-obvious guards. Three guards is a component feature, not a
 * documentation snippet.
 */

/** Pixels between a selection and the offer to quote it. */
const GAP = 6;

/**
 * The offer's own appearance.
 *
 * Deliberately plain and deliberately overridable: this element lands in the
 * host's page, not in our shadow tree, so it has no theme to inherit and no
 * business imposing one. Everything here is a single class a host stylesheet
 * outranks by adding one more selector.
 */
const OFFER_CSS = `
.ag-ui-quote-offer {
  position: fixed;
  z-index: 2147483000;
  transform: translate(-50%, -100%);
  margin: 0;
  padding: 0.25em 0.7em;
  border: 1px solid rgb(0 0 0 / 0.15);
  border-radius: 999px;
  background: Canvas;
  color: CanvasText;
  font: inherit;
  font-size: 0.8rem;
  line-height: 1.6;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 2px 10px rgb(0 0 0 / 0.18);
}

.ag-ui-quote-offer[data-below="true"] {
  transform: translate(-50%, 0);
}
`;

/** A live page-side offer. */
export interface PageQuoteOffer {
  /** The button itself, for a host that wants to style or inspect it. */
  readonly element: HTMLButtonElement;
  /** Stop offering: every listener removed, the button and its styles gone. */
  detach(): void;
}

/** What {@link attachQuoteOffer} needs to know. */
export interface PageQuoteOfferOptions {
  /** Where a selection is worth offering to quote. */
  within: HTMLElement;
  /** What the offer says. */
  label: string;
  /**
   * A subtree to stay out of -- the chat widget itself.
   *
   * Its transcript runs this same gesture on the inside, so without this a
   * selection there would be offered twice and quoted twice.
   */
  exclude: Node;
  /** Take the offer. */
  onQuote: (text: string) => void;
}

/**
 * Offer to quote what the user selects inside `within`.
 *
 * Nothing is quoted until the offer is taken -- which is the whole point. An
 * automatic version of this is easy to write and horrible to use: every drag
 * made to read, to copy, or to fix a typo silently appends to whatever the user
 * was in the middle of typing.
 */
export function attachQuoteOffer(options: PageQuoteOfferOptions): PageQuoteOffer {
  const { within, exclude, onQuote } = options;

  // A constructed sheet rather than an injected `<style>`: a host with a strict
  // `style-src` drops the second one silently, leaving an unstyled pill in the
  // middle of their page. Per attachment rather than at module scope, which
  // this package forbids.
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(OFFER_CSS);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

  const button = document.createElement("button");
  button.type = "button";
  button.className = "ag-ui-quote-offer";
  button.textContent = options.label;
  button.hidden = true;
  document.body.append(button);

  let quoting = "";

  const hide = (): void => {
    button.hidden = true;
    quoting = "";
  };

  const settled = (event: Event): void => {
    // The widget's own gesture, tested on the **event path** rather than on the
    // selection. The path crosses shadow boundaries and the selection does not:
    // `Node.contains` is false for a node in a shadow tree, and the shadow-aware
    // read, given no roots, hands back endpoints rescoped up into the page --
    // so both selection-side tests would let a transcript drag through here and
    // quote it a second time.
    if (event.composedPath().includes(exclude)) {
      hide();
      return;
    }
    if (fieldHasFocus()) {
      // The user is selecting inside their own form, to edit or to copy. See
      // the module comment: nothing about the range itself says so.
      hide();
      return;
    }
    // The pointer's own coordinates, where there was one: they decide which
    // line of a multi-line selection the offer hangs from.
    const near = event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : undefined;
    const selected = quotableSelection(within, [], near);
    if (selected === null) {
      hide();
      return;
    }
    quoting = selected.text;
    place(button, selected.rect);
  };

  const onMouseDown = (event: MouseEvent): void => {
    if (!button.contains(event.target as Node)) {
      hide();
    }
  };

  within.addEventListener("mouseup", settled);
  within.addEventListener("keyup", settled);
  within.addEventListener("mousedown", onMouseDown);
  // Capture, so a scrolling pane counts and not only the window: the offer is
  // positioned in viewport coordinates, so anything that moves the words out
  // from under it leaves it pointing at the wrong thing.
  document.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);

  // Without this the press collapses the selection before the click reads it.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  button.addEventListener("click", () => {
    const text = quoting;
    window.getSelection()?.removeAllRanges();
    hide();
    onQuote(text);
  });

  return {
    element: button,
    detach(): void {
      within.removeEventListener("mouseup", settled);
      within.removeEventListener("keyup", settled);
      within.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      button.remove();
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((each) => each !== sheet);
    },
  };
}

/**
 * Whether focus is in something the user types into.
 *
 * `activeElement` rather than the selection, because the selection does not
 * say. A focused shadow host reports as the host, which is why the widget's own
 * composer is caught by the `exclude` subtree test instead -- the two guards
 * each cover the other's blind spot.
 */
function fieldHasFocus(): boolean {
  const active = document.activeElement;
  if (active === null) {
    return false;
  }
  return (
    active.tagName === "INPUT" ||
    active.tagName === "TEXTAREA" ||
    (active as HTMLElement).isContentEditable === true
  );
}

/** Float the offer beside `rect`, kept inside the viewport. */
function place(button: HTMLButtonElement, rect: DOMRect): void {
  // Unhidden first: a hidden element measures zero, and its own size decides
  // both whether it fits above the selection and how far to pull it left.
  button.hidden = false;
  const below = rect.top < GAP + button.offsetHeight;
  button.dataset["below"] = String(below);
  button.style.top = `${below ? rect.bottom + GAP : rect.top - GAP}px`;
  const half = button.offsetWidth / 2;
  const centre = rect.left + rect.width / 2;
  const width = document.documentElement.clientWidth;
  button.style.left = `${Math.min(Math.max(centre, half), width - half)}px`;
}
