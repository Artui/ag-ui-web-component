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
