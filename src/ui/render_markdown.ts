import DOMPurify from "dompurify";
import { marked } from "marked";

// GitHub-flavoured markdown with single-newline line breaks (chat-like).
marked.setOptions({ gfm: true, breaks: true });

// Conservative allowlist for assistant chat content: inline emphasis, code,
// lists, quotes, headings, links, tables, and images. Deliberately excludes
// `iframe`, `style`, and any scripting — rendering untrusted model/tool output
// as HTML is an XSS surface, so the sanitiser is the load-bearing safety net.
const ALLOWED_TAGS = [
  "a",
  "p",
  "br",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "del",
  "code",
  "pre",
  "ul",
  "ol",
  "li",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "span",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
  "img",
];

const ALLOWED_ATTR = ["href", "title", "class", "src", "alt", "width", "height"];

/**
 * Render markdown (and any embedded raw HTML) to a sanitised HTML string.
 *
 * Both markdown syntax and literal HTML flow through one path: `marked` emits
 * HTML, then DOMPurify strips everything outside {@link ALLOWED_TAGS} /
 * {@link ALLOWED_ATTR} (scripts, event handlers, `javascript:` URLs, etc.).
 * Links are hardened with `target="_blank"` + `rel="noopener noreferrer"`.
 *
 * The result is trimmed so a single-paragraph message round-trips to clean
 * `textContent` (no trailing newline from the wrapping `<p>`).
 */
export function renderMarkdown(text: string): string {
  const rendered = marked.parse(text, { async: false });
  const clean = DOMPurify.sanitize(rendered, { ALLOWED_TAGS, ALLOWED_ATTR });
  const template = document.createElement("template");
  template.innerHTML = clean;
  for (const anchor of template.content.querySelectorAll("a[href]")) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  return template.innerHTML.trim();
}
