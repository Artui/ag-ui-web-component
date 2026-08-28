import { afterEach, describe, expect, it } from "vitest";
import { asQuote, MAX_QUOTE_CHARS, quotableSelection } from "../src/ui/quote_selection.js";

/**
 * Reading a selection out of a shadow tree, without a browser's help.
 *
 * happy-dom has neither `getComposedRanges` nor the legacy
 * `ShadowRoot.getSelection`, and it does not rescope a shadow selection to the
 * host -- so it is precisely the *fallback* engine, and the direct read is what
 * most of these exercise. The composed read is real in Chromium and covered
 * there; the two stubs below stand in for engine behaviours Chromium cannot be
 * made to produce, and each describes something a shipped engine does.
 */

interface Fixture {
  /** The element a selection has to lie inside to be quotable. */
  container: HTMLElement;
  root: ShadowRoot;
  /** The shadow host -- what an engine that rescopes reports instead. */
  host: HTMLElement;
  /** The transcript's text. */
  inner: Text;
  /** Text in the same shadow tree, but outside the transcript -- the composer. */
  sibling: Text;
  /** Text in the light DOM, outside the transcript entirely. */
  outer: Text;
}

/** A shadow tree holding one paragraph, plus a paragraph outside it. */
function fixture(text = "the second paragraph of the answer"): Fixture {
  const host = document.createElement("div");
  document.body.append(host);
  const root = host.attachShadow({ mode: "open" });
  const container = document.createElement("div");
  const p = document.createElement("p");
  p.textContent = text;
  container.append(p);
  const beside = document.createElement("p");
  beside.textContent = "composer text, same tree, not the transcript";
  root.append(container, beside);

  const outside = document.createElement("p");
  outside.textContent = "page text, not transcript text";
  document.body.append(outside);

  return {
    container,
    root,
    host,
    inner: p.firstChild as Text,
    sibling: beside.firstChild as Text,
    outer: outside.firstChild as Text,
  };
}

/** Select `[start, end)` of `node`, as a drag would. */
function select(node: Node, start: number, end: number, endNode: Node = node): void {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(endNode, end);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** An endpoint pair shaped as `getComposedRanges` hands them back. */
function endpoints(node: Node, start: number, end: number): StaticRange {
  return {
    startContainer: node,
    startOffset: start,
    endContainer: node,
    endOffset: end,
    collapsed: start === end,
  } as StaticRange;
}

/** Give this engine a `getComposedRanges`, and take it away again after. */
function withComposedRanges(read: (...args: readonly unknown[]) => readonly StaticRange[]): void {
  const selection = window.getSelection() as unknown as Record<string, unknown>;
  selection["getComposedRanges"] = read;
}

afterEach(() => {
  const selection = window.getSelection() as unknown as Record<string, unknown>;
  delete selection["getComposedRanges"];
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = "";
});

describe("quotableSelection", () => {
  it("reads a selection made inside the shadow tree", () => {
    const { container, root, inner } = fixture();

    select(inner, 4, 10);

    expect(quotableSelection(container, root)?.text).toBe("second");
  });

  it("returns null when nothing is selected", () => {
    const { container, root } = fixture();

    expect(quotableSelection(container, root)).toBeNull();
  });

  it("returns null for a collapsed selection", () => {
    const { container, root, inner } = fixture();

    select(inner, 4, 4);

    expect(quotableSelection(container, root)).toBeNull();
  });

  it("returns null when the selection is only whitespace", () => {
    const { container, root, inner } = fixture("word   word");

    select(inner, 4, 7);

    expect(quotableSelection(container, root)).toBeNull();
  });

  it("returns null for a selection outside the container", () => {
    const { container, root, outer } = fixture();

    select(outer, 0, 4);

    expect(quotableSelection(container, root)).toBeNull();
  });

  it("returns null for a selection that starts inside and ends outside", () => {
    const { container, root, inner, sibling } = fixture();

    // A drag that began in the transcript and ran on past its foot. Both
    // endpoints are in the same tree, so the range is real -- it is only the
    // second one that disqualifies it.
    select(inner, 4, 8, sibling);

    expect(quotableSelection(container, root)).toBeNull();
  });

  it("returns null when the document has no selection at all", () => {
    const { container, root } = fixture();
    const original = window.getSelection;
    window.getSelection = () => null;

    try {
      expect(quotableSelection(container, root)).toBeNull();
    } finally {
      window.getSelection = original;
    }
  });

  it("falls back to the direct read when the composed one rescopes to the host", () => {
    const { container, root, host, inner } = fixture();
    // What an engine hands back for a shadow root it was not given permission
    // to see: endpoints on the host element, which is outside the transcript.
    withComposedRanges(() => [endpoints(host, 0, 1)]);

    select(inner, 4, 10);

    expect(quotableSelection(container, root)?.text).toBe("second");
  });

  it("retries with the earlier signature when the options object is rejected", () => {
    const { container, root, inner } = fixture();
    const shapes: string[] = [];
    withComposedRanges((...args) => {
      const arg = args[0];
      if (arg instanceof ShadowRoot) {
        shapes.push("variadic");
        return [endpoints(inner, 4, 10)];
      }
      shapes.push("dictionary");
      throw new TypeError("not a ShadowRoot");
    });
    // A *different* range from the composed one, so the answer says which read
    // it came from rather than agreeing by coincidence.
    select(inner, 0, 3);

    expect(quotableSelection(container, root)?.text).toBe("second");
    expect(shapes).toEqual(["dictionary", "variadic"]);
  });
});

describe("asQuote", () => {
  it("prefixes each line and leaves a blank line after", () => {
    expect(asQuote("one\ntwo")).toBe("> one\n> two\n\n");
  });

  it("is empty for text with nothing in it", () => {
    expect(asQuote("   \n  ")).toBe("");
  });

  it("leaves a blank line inside the quotation as a bare marker", () => {
    expect(asQuote("one\n\ntwo")).toBe("> one\n>\n> two\n\n");
  });

  it("treats CRLF and CR as line breaks", () => {
    expect(asQuote("one\r\ntwo\rthree")).toBe("> one\n> two\n> three\n\n");
  });

  it("caps a long selection", () => {
    const quoted = asQuote("x".repeat(MAX_QUOTE_CHARS + 50));

    expect(quoted).toBe(`> ${"x".repeat(MAX_QUOTE_CHARS)}...\n\n`);
  });
});
