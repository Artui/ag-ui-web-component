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
  /** Where it sits in the viewport, for placing the affordance beside it. */
  readonly rect: DOMRect;
}

/** A `Selection` on an engine new enough to reach into a shadow tree. */
type ComposedSelection = Selection & {
  getComposedRanges?: (...args: readonly unknown[]) => readonly AbstractRange[];
};

/**
 * The current selection, when it lies wholly inside `container`.
 *
 * `null` for no selection, a collapsed one, whitespace only, or one that
 * starts or ends outside `container` -- a drag that ran off the transcript and
 * into the page is not a quotation from the transcript.
 */
export function quotableSelection(
  container: HTMLElement,
  root: ShadowRoot,
): QuotableSelection | null {
  for (const endpoints of endpointCandidates(root)) {
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
    const text = range.toString().trim();
    if (text === "") {
      continue;
    }
    return { text, rect: range.getBoundingClientRect() };
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
  const trimmed = text.trim();
  if (trimmed === "") {
    return "";
  }
  const capped =
    trimmed.length > MAX_QUOTE_CHARS
      ? `${trimmed.slice(0, MAX_QUOTE_CHARS).trimEnd()}...`
      : trimmed;
  const quoted = capped
    .split(/\r\n?|\n/)
    // `trimEnd` so a blank line inside the selection becomes a bare ">" rather
    // than "> " -- trailing whitespace markdown treats as a line break.
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
  return `${quoted}\n\n`;
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
function endpointCandidates(root: ShadowRoot): readonly AbstractRange[] {
  const selection = window.getSelection();
  if (selection === null) {
    return [];
  }
  const candidates = [...composedRanges(selection, root)];
  if (selection.rangeCount > 0) {
    candidates.push(selection.getRangeAt(0));
  }
  return candidates;
}

/** The shadow-aware read, or nothing on an engine that does not have it. */
function composedRanges(selection: Selection, root: ShadowRoot): readonly AbstractRange[] {
  const composed = (selection as ComposedSelection).getComposedRanges;
  if (composed === undefined) {
    return [];
  }
  try {
    return composed.call(selection, { shadowRoots: [root] });
  } catch {
    // The method shipped first with the shadow roots as rest parameters and
    // only later as a dictionary member, and the earlier form rejects the
    // options object outright rather than ignoring it. Lexical resolves the
    // same split the same way, by trying both shapes at runtime.
    return composed.call(selection, root);
  }
}
