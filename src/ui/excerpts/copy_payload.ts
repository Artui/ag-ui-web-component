/** What a copied message puts on the clipboard, in both flavours. */
export interface CopyPayload {
  /** The plain-text flavour, structured so a table survives a paste. */
  readonly text: string;
  /** The rich flavour, so a table pastes as a table. */
  readonly html: string;
}

/** Elements whose content starts on a line of its own. */
const BLOCK_TAGS = new Set([
  "ADDRESS",
  "ARTICLE",
  "ASIDE",
  "BLOCKQUOTE",
  "DD",
  "DIV",
  "DL",
  "DT",
  "FIGCAPTION",
  "FIGURE",
  "FOOTER",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HEADER",
  "HR",
  "MAIN",
  "NAV",
  "OL",
  "P",
  "SECTION",
  "UL",
]);

/**
 * What to copy from one rendered message, in both clipboard flavours.
 *
 * `textContent` was the obvious answer and the wrong one. It concatenates every
 * descendant with no separator at all, so a markdown table arrives as one run
 * of digits with the headers welded to the first row -- unusable in a
 * spreadsheet, and unreadable anywhere. Lists lose their bullets the same way,
 * and paragraphs run together.
 *
 * So the plain flavour is serialised structurally: table rows become tab
 * separated lines, which is the format spreadsheets parse on paste, and blocks
 * and list items get their own lines. The rich flavour carries the markup, so a
 * target that understands it -- a document, a chat client, a spreadsheet --
 * gets the real table rather than a reconstruction of one.
 *
 * Both are taken from a **clone with the component's own buttons removed**. The
 * code-block copy buttons are appended inside their own `pre`, so they are
 * descendants of the bubble and `textContent` was picking their label up: a
 * message containing a code block copied with the word for Copy sitting in the
 * middle of it.
 */
export function copyPayload(root: Element): CopyPayload {
  const clone = root.cloneNode(true) as Element;
  // The component's own affordances, not the message. Markdown cannot produce
  // a button, so anything matching here is chrome this element added.
  for (const control of Array.from(clone.querySelectorAll("button"))) {
    control.remove();
  }
  return { text: normalise(serialise(clone)), html: clone.innerHTML };
}

/**
 * Walk a subtree into text, inserting newlines where the layout implies them.
 *
 * Nothing recurses into a `pre` or a table: both are handled whole, because
 * their text is their layout. That is also why this needs no notion of being
 * inside preformatted content -- there is no such position to be in.
 */
function serialise(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    // Non-null for a text node; nodeValue is nullable only on document and
    // doctype nodes, which cannot appear inside a message. Outside a pre, runs
    // of whitespace collapse to one space -- the same collapsing the renderer
    // does, so what is copied matches what is read.
    return (node.nodeValue as string).replace(/\s+/g, " ");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return "";
  }
  const element = node as Element;
  const tag = element.tagName;
  if (tag === "BR") {
    return "\n";
  }
  if (tag === "PRE") {
    // Verbatim: its whitespace is its content.
    return `\n\n${text(element)}\n\n`;
  }
  if (tag === "TABLE") {
    return `\n\n${tableText(element)}\n\n`;
  }
  if (tag === "UL" || tag === "OL") {
    return `\n\n${listText(element, tag === "OL")}\n\n`;
  }
  const inner = children(element);
  return BLOCK_TAGS.has(tag) ? `\n\n${inner}\n\n` : inner;
}

/** Every child of `element`, serialised and joined. */
function children(element: Element): string {
  let joined = "";
  for (const child of Array.from(element.childNodes)) {
    joined += serialise(child);
  }
  return joined;
}

/**
 * A list, one item per line, marked the way it is rendered.
 *
 * Built here rather than at the item, so the marker comes from the list that
 * owns it and never from an item's parent lookup -- which has a null arm no
 * message can produce.
 */
function listText(list: Element, numbered: boolean): string {
  return Array.from(list.children)
    .map((item, index) => `${numbered ? `${index + 1}. ` : "- "}${children(item).trim()}`)
    .join("\n");
}

/**
 * A table as tab-separated rows.
 *
 * Tabs rather than a drawn grid because that is what spreadsheets parse: a
 * paste of tab-separated lines lands one value per cell, which is the whole
 * point of copying a table out of an answer.
 */
function tableText(table: Element): string {
  return Array.from(table.querySelectorAll("tr"))
    .map((row) =>
      Array.from(row.children)
        .map((cell) => text(cell).replace(/\s+/g, " ").trim())
        .join("\t"),
    )
    .join("\n");
}

/** An element's text. Never null: only documents and doctypes have none. */
function text(element: Element): string {
  return element.textContent as string;
}

/** Tidy the block boundaries the walk inserted generously. */
function normalise(text: string): string {
  return text
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
