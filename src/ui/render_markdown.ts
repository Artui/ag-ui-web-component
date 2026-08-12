// This module's sanitisation is verified only by the `chromium` project in
// vitest.config.ts, and must stay there. DOMPurify 3.4.8+ silently sanitises
// nothing under happy-dom (every element resolves to an empty tag name), so a
// happy-dom-only suite goes green while this module strips nothing at all.
// Moving those assertions back under happy-dom for speed removes the only check
// that this module does anything. CLAUDE.md records the upstream root cause.
import DOMPurify from "dompurify";
import { Marked } from "marked";

// A local parser instance, so configuration never leaks into the shared
// `marked` singleton a host app's deduped copy would share. Built once at module
// scope and never mutated; per-call construction would re-pay setup on every
// streaming re-render.
const parser = new Marked({ gfm: true, breaks: true });

// Conservative allowlist for assistant chat content. Rendering untrusted
// model/tool output as HTML is an XSS surface and this sanitiser is the only
// thing standing in front of it, so `iframe`, `style` and all scripting stay
// out.
//
// `img` is excluded by default: a model-controlled image URL is fetched with no
// user interaction, turning prompt-injected page data into a zero-click
// exfiltration channel. Hosts that trust their content opt in via `allowImages`.
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
   * Permit `<img>` tags (and their `src`/`alt`/`width`/`height` attributes) in
   * the sanitised output. Off by default; see the exfiltration note on the
   * allowlist above. Only enable for trusted content sources.
   */
  readonly allowImages?: boolean;
}

/**
 * Render markdown (and any embedded raw HTML) to a sanitised HTML string.
 *
 * Markdown syntax and literal HTML share one path: `marked` emits HTML, then
 * DOMPurify strips everything outside {@link ALLOWED_TAGS} /
 * {@link ALLOWED_ATTR} — scripts, event handlers, `javascript:` URLs. Links are
 * hardened with `target="_blank"` and `rel="noopener noreferrer"`.
 *
 * The result is trimmed so a single-paragraph message round-trips to clean
 * `textContent`, without the wrapping paragraph's trailing newline.
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
