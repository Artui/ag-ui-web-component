/**
 * Reading a text selection out of the shadow tree, and shaping it for the
 * composer.
 *
 * Selection is the one DOM API shadow encapsulation genuinely broke, and it
 * broke it in two different directions. WebKit rescopes a selection made inside
 * a shadow tree to the **host** element, so `document.getSelection()` reports
 * the whole widget and none of the words; Chromium exposes the shadow nodes
 * directly, so the same call reports exactly the words. `getComposedRanges` is
 * the settled answer to both -- it hands back real endpoints for each shadow
 * root it is *given permission to see* -- but it is recent enough that the
 * direct read has to stay behind it.
 */

/**
 * The longest quotation put into the composer, in characters.
 *
 * A cap rather than no cap because the point of a quotation is to say *which*
 * part of an answer the next question is about. Select-all-then-quote is a
 * gesture the transcript already answers -- it is the whole conversation, which
 * the model has -- and pasting it back costs the user tokens to say nothing.
 */
export const MAX_QUOTE_CHARS = 500;

/** A selection worth offering to quote. */
export interface QuotableSelection {
  /** The selected text, trimmed. Never empty. */
  readonly text: string;
  /**
   * One **line** of the selection, for placing the affordance beside it.
   *
   * Deliberately not the selection's bounding box. See {@link lineToHangFrom}:
   * the union of a selection spanning several elements has a centre with no
   * selected text anywhere near it.
   */
  readonly rect: DOMRect;
}

/** Where a gesture ended, in viewport coordinates. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A `Selection` on an engine new enough to reach into a shadow tree. */
type ComposedSelection = Selection & {
  getComposedRanges?: (...args: readonly unknown[]) => readonly AbstractRange[];
};

/**
 * The current selection, when it lies wholly inside `container`.
 *
 * `roots` are the shadow roots the read is allowed to look inside, in the shape
 * `getComposedRanges` itself takes. Pass the one holding `container` for a
 * selection made in a shadow tree, or nothing at all for one made in the page.
 *
 * `near` is where the gesture ended, when a pointer made it -- it decides which
 * line of a multi-line selection the offer is hung from.
 *
 * `null` for no selection, a collapsed one, whitespace only, or one that
 * starts or ends outside `container` -- a drag that ran off the transcript and
 * into the page is not a quotation from the transcript.
 */
export function quotableSelection(
  container: HTMLElement,
  roots: readonly ShadowRoot[] = [],
  near?: Point,
): QuotableSelection | null {
  for (const endpoints of endpointCandidates(roots)) {
    if (!container.contains(endpoints.startContainer)) {
      continue;
    }
    if (!container.contains(endpoints.endContainer)) {
      continue;
    }
    // A live `Range` regardless of what the engine handed back: `getComposedRanges`
    // returns `StaticRange`s, which carry endpoints and nothing else -- no text,
    // no geometry. Both are what this is for.
    const range = document.createRange();
    range.setStart(endpoints.startContainer, endpoints.startOffset);
    range.setEnd(endpoints.endContainer, endpoints.endOffset);
    const text = renderedText(range).trim();
    if (text === "") {
      continue;
    }
    return { text, rect: lineToHangFrom(range, near) };
  }
  return null;
}

/**
 * Wrap `text` as a markdown blockquote, ready to be followed by a question.
 *
 * Markdown rather than a bespoke fence because the transcript renders markdown
 * and the server reads markdown: a quotation that survives both ends without a
 * convention to agree on first. The trailing blank line is what leaves the
 * caret on a fresh paragraph, which is the whole point of quoting into a
 * composer rather than sending straight away.
 */
export function asQuote(text: string): string {
  const lines = tidy(text);
  if (lines.length === 0) {
    return "";
  }
  const capped = cap(lines.join("\n"));
  const quoted = capped
    .split("\n")
    // `trimEnd` so a blank line inside the selection becomes a bare ">" rather
    // than "> " -- trailing whitespace markdown treats as a line break.
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
  return `${quoted}\n\n`;
}

/**
 * The selection's lines, with the *markup's* whitespace taken back out.
 *
 * A selection crossing block elements carries the source's own layout with it:
 * every newline and every run of indentation between one element and the next
 * is a text node like any other. Quoting a form as marked up produced twenty-
 * four lines of which twelve were a bare ">", the rest indented by wherever
 * they happened to sit in the HTML. That is not a quotation of anything.
 *
 * Two rules, and deliberately only two. Runs of blank lines collapse to one,
 * because the gap between two blocks is one gap however it was written. And the
 * indentation every line shares is removed, not each line's own -- a quotation
 * from a code block keeps its shape, which trimming each line would flatten.
 */
function tidy(text: string): readonly string[] {
  const lines = text.split(/\r\n?|\n/).map((line) => line.trimEnd());
  const indents = lines.filter((line) => line !== "").map(indentOf);
  const shared = indents.length === 0 ? 0 : Math.min(...indents);
  const kept: string[] = [];
  for (const line of lines) {
    const dedented = line.slice(shared);
    // No leading blank lines, and never two in a row.
    if (dedented === "" && (kept.length === 0 || kept[kept.length - 1] === "")) {
      continue;
    }
    kept.push(dedented);
  }
  while (kept[kept.length - 1] === "") {
    kept.pop();
  }
  return kept;
}

/** How many spaces of indentation `line` opens with. */
function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** `text`, cut to {@link MAX_QUOTE_CHARS} if it runs past it. */
function cap(text: string): string {
  return text.length > MAX_QUOTE_CHARS ? `${text.slice(0, MAX_QUOTE_CHARS).trimEnd()}...` : text;
}

/**
 * The selected text **as rendered**, which is not what `Range.toString()` says.
 *
 * `toString()` concatenates the text nodes in the range and asks no questions
 * about CSS, so a drag across an ordinary form quotes back the values of every
 * `<option>` in a closed `<select>` -- words the user has never seen, presented
 * to the model as something they pointed at. `checkVisibility()` is the
 * platform's own answer to "is this actually rendered", and it reports exactly
 * those options as hidden.
 *
 * Older engines without it keep the previous behaviour rather than a guess:
 * quoting a few invisible words is a smaller failure than dropping visible ones
 * because a hand-rolled visibility test was wrong.
 */
function renderedText(range: Range): string {
  let text = "";
  for (const node of textNodesIn(range)) {
    // The element carries the styles; the text node has none of its own.
    const parent = node.parentElement as HTMLElement;
    if (!isRendered(parent)) {
      continue;
    }
    // The end nodes are only partly inside the range; everything between them
    // is wholly inside it.
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.data.length;
    text += collapse(node.data.slice(from, to), parent);
  }
  return text;
}

/**
 * Squeeze the runs of spaces the renderer squeezes, and keep the ones it keeps.
 *
 * Indentation between block elements is markup, not content: it is in the DOM
 * as text nodes and it is on screen as nothing at all, because a collapsing
 * `white-space` reduces it. Carrying it into a quotation is not merely untidy --
 * four leading spaces inside a blockquote is a markdown **code block**, so a
 * form quoted as marked up renders as source listing.
 *
 * Newlines survive on purpose, where CSS would collapse those too. They are the
 * only record left of where one block ended and the next began, and a quotation
 * of six form rows run together on one line is worse than one that keeps them
 * apart. Preformatted text is passed through untouched: there the indentation
 * *is* the content.
 */
function collapse(text: string, parent: HTMLElement): string {
  if (PREFORMATTED.has(whiteSpaceOf(parent))) {
    return text;
  }
  return (
    text
      // Whitespace *around* a newline goes with it. Leaving a space behind
      // would indent every line of the quotation by one, for nothing.
      .replace(/[^\S\n]*\n[^\S\n]*/g, "\n")
      .replace(/[^\S\n]+/g, " ")
  );
}

/** The `white-space` values under which every space is content. */
const PREFORMATTED = new Set(["pre", "pre-wrap", "break-spaces"]);

/** The computed `white-space` of `element`, or `""` where it cannot be read. */
function whiteSpaceOf(element: HTMLElement): string {
  return window.getComputedStyle(element).whiteSpace;
}

/** Every text node the range touches, in document order. */
function textNodesIn(range: Range): readonly Text[] {
  const root = range.commonAncestorContainer;
  // A selection inside a single text node has that node as its own common
  // ancestor, and a `TreeWalker` never visits its root.
  if (root.nodeType === Node.TEXT_NODE) {
    return [root as Text];
  }
  const found: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    // The walker covers the whole subtree, which reaches past both ends of the
    // range -- a sibling paragraph above the selection is in it too.
    if (range.intersectsNode(node)) {
      found.push(node as Text);
    }
  }
  return found;
}

/** Whether `element` is actually drawn, where the engine will say. */
function isRendered(element: HTMLElement): boolean {
  if (typeof element.checkVisibility !== "function") {
    return true;
  }
  return element.checkVisibility({
    contentVisibilityAuto: true,
    opacityProperty: true,
    visibilityProperty: true,
  });
}

/**
 * The line of the selection to hang the offer from.
 *
 * **Not the bounding box.** A drag from a narrow column of a form down to a
 * full-width line running under the chat panel beside it produced a union
 * reaching from the column's left edge to the far end of that line -- and its
 * centre landed most of the way across the page, behind the panel, on a line
 * the user had not been looking at, while the pointer had let go by the column.
 *
 * Note what the fix is *not*: that centre was over selected text. It was over
 * selected text nobody could see. A union is a shape the selection does not
 * have, so no point derived from it belongs to any particular line.
 *
 * `near` is where the pointer let go. The line under it is where the user is
 * looking, and it needs no engine-specific way to ask which end of the
 * selection is its focus -- which the shadow-aware read does not carry anyway.
 * Without a pointer -- a keyboard selection -- the first line is the one that
 * exists whichever way the selection was made.
 *
 * The bounding box remains the fallback for a range that reports no line boxes
 * at all, which is what a DOM with no layout does.
 */
function lineToHangFrom(range: Range, near: Point | undefined): DOMRect {
  const lines = [...range.getClientRects()];
  if (lines.length === 0) {
    return range.getBoundingClientRect();
  }
  if (near === undefined) {
    return lines[0] as DOMRect;
  }
  let closest = lines[0] as DOMRect;
  let shortest = distanceTo(closest, near);
  for (const line of lines.slice(1)) {
    const distance = distanceTo(line, near);
    if (distance < shortest) {
      shortest = distance;
      closest = line;
    }
  }
  return closest;
}

/** How far `point` is from the nearest edge of `rect`, or 0 inside it. */
function distanceTo(rect: DOMRect, point: Point): number {
  const dx = Math.max(rect.left - point.x, 0, point.x - rect.right);
  const dy = Math.max(rect.top - point.y, 0, point.y - rect.bottom);
  return Math.hypot(dx, dy);
}

/**
 * Endpoint pairs to consider, best first.
 *
 * Both reads are offered rather than one being chosen, because which is correct
 * is a property of the engine *and* of where the user dragged: an engine that
 * rescopes to the host returns endpoints outside the transcript, and the caller
 * rejects those on the same test it uses for a selection that genuinely ran off
 * the transcript. One rule, no engine sniffing.
 */
function endpointCandidates(roots: readonly ShadowRoot[]): readonly AbstractRange[] {
  const selection = window.getSelection();
  if (selection === null) {
    return [];
  }
  const candidates = [...composedRanges(selection, roots)];
  if (selection.rangeCount > 0) {
    candidates.push(selection.getRangeAt(0));
  }
  return candidates;
}

/** The shadow-aware read, or nothing on an engine that does not have it. */
function composedRanges(
  selection: Selection,
  roots: readonly ShadowRoot[],
): readonly AbstractRange[] {
  const composed = (selection as ComposedSelection).getComposedRanges;
  if (composed === undefined) {
    return [];
  }
  try {
    return composed.call(selection, { shadowRoots: roots });
  } catch {
    // The method shipped first with the shadow roots as rest parameters and
    // only later as a dictionary member, and the earlier form rejects the
    // options object outright rather than ignoring it. Lexical resolves the
    // same split the same way, by trying both shapes at runtime.
    return composed.call(selection, ...roots);
  }
}
