// DOMPurify is exercised in a **real browser** by the `chromium` project in
// vitest.config.ts, not by the happy-dom suite. That is deliberate: 3.4.8+ do
// not sanitise under happy-dom at all — `<script>` and `<img>` pass straight
// through — so a happy-dom-only suite can go green while this module ships no
// sanitisation whatsoever.
//
// **Root cause, upstream, and both are refusing to move.** DOMPurify 3.4.8
// changed one line, reading the tag name through
// `lookupGetter(Node.prototype, "nodeName")` instead of `currentNode.nodeName`
// (cure53/DOMPurify 3.4.7...3.4.8). happy-dom defines an *own* `nodeName`
// getter on **both** `Node.prototype` (returning `""`) and `Element.prototype`,
// so grabbing the base one defeats the dispatch and every element resolves to
// `tagName === ""`. Not in ALLOWED_TAGS, so the wrapper is stripped and its
// children are re-inserted as clones the NodeIterator never revisits — which is
// why nested payloads come back *entirely* unsanitised. Real browsers and jsdom
// define `nodeName` only on `Node.prototype` and are unaffected.
//
//   happy-dom bug:      capricorn86/happy-dom#2182 (open)
//   working fix:        capricorn86/happy-dom#2183 (closed, never merged)
//   DOMPurify's answer: cure53/DOMPurify#1457, #1496 (closed, wontfix —
//                       "happy-dom is not supported")
//
// ⚠ DOMPurify's README names happy-dom as **not safe**: combining them "will
// likely lead to XSS". jsdom is the only non-browser DOM it supports. So the
// old exact pin at 3.4.7 was never the safety it looked like — cure53 notes it
// "doesn't really work, it just appears so". Running these assertions in
// Chromium is the fix; the pin was a placebo.
//
// ⚠ If you ever move these assertions back under happy-dom to make them faster,
// you remove the only check that this module does anything at all.
import DOMPurify from "dompurify";
import { Marked } from "marked";

// Local parser instance so configuration never leaks into the shared `marked`
// singleton (a host app's deduped copy keeps its own options). GitHub-flavoured
// markdown with single-newline line breaks (chat-like). Constructed once at
// module scope — configured here and never mutated afterwards; per-call
// construction would re-pay setup on every streaming re-render.
const parser = new Marked({ gfm: true, breaks: true });

// Conservative allowlist for assistant chat content: inline emphasis, code,
// lists, quotes, headings, links, and tables. Deliberately excludes `iframe`,
// `style`, and any scripting — rendering untrusted model/tool output as HTML
// is an XSS surface, so the sanitiser is the load-bearing safety net.
//
// `img` is excluded by default: a model-controlled `<img src="https://...">`
// is fetched by the browser with **no user interaction**, which turns any
// prompt-injected page data into a zero-click exfiltration channel. Hosts
// that trust their content can opt back in via `allowImages`.
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
];

const ALLOWED_ATTR = ["href", "title", "class"];

// The image-permitting variants used when the host opts in.
const ALLOWED_TAGS_WITH_IMAGES = [...ALLOWED_TAGS, "img"];
const ALLOWED_ATTR_WITH_IMAGES = [...ALLOWED_ATTR, "src", "alt", "width", "height"];

/** Options for {@link renderMarkdown}. */
export interface RenderMarkdownOptions {
  /**
   * Permit `<img>` tags (and their `src`/`alt`/`width`/`height` attributes)
   * in the sanitised output. **Off by default** — see the allowlist note on
   * the exfiltration risk. Only enable for trusted content sources.
   */
  readonly allowImages?: boolean;
}

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
export function renderMarkdown(text: string, options?: RenderMarkdownOptions): string {
  const allowImages = options?.allowImages === true;
  const rendered = parser.parse(text, { async: false });
  const clean = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: allowImages ? ALLOWED_TAGS_WITH_IMAGES : ALLOWED_TAGS,
    ALLOWED_ATTR: allowImages ? ALLOWED_ATTR_WITH_IMAGES : ALLOWED_ATTR,
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  for (const anchor of template.content.querySelectorAll("a[href]")) {
    anchor.setAttribute("target", "_blank");
    anchor.setAttribute("rel", "noopener noreferrer");
  }
  return template.innerHTML.trim();
}
