/** Collect the text nodes under ``root`` with their parents (depth-first). */
function collectTextNodes(root: Node, out: { node: Text; parent: Node }[]): void {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push({ node: child as Text, parent: root });
    } else {
      collectTextNodes(child, out);
    }
  }
}

/**
 * Wrap each word under ``root`` in `<span class="word" style="--ag-ui-word-index: N">`
 * so CSS can reveal them one-by-one (staggered by the index). Whitespace is
 * preserved as plain text. Used for the `word` text-animation mode on a
 * completed assistant message; pure DOM, idempotent enough to re-run.
 */
export function wrapWords(root: HTMLElement): void {
  const texts: { node: Text; parent: Node }[] = [];
  collectTextNodes(root, texts);
  let index = 0;
  for (const { node, parent } of texts) {
    const fragment = document.createDocumentFragment();
    for (const part of node.data.split(/(\s+)/)) {
      if (part === "") {
        continue;
      }
      if (/\s/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }
      const span = document.createElement("span");
      span.className = "word";
      span.style.setProperty("--ag-ui-word-index", String(index));
      span.textContent = part;
      fragment.appendChild(span);
      index += 1;
    }
    parent.replaceChild(fragment, node);
  }
}
