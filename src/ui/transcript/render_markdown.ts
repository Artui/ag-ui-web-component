// This module's sanitisation is verified only by the `chromium` project in
// vitest.config.ts, and must stay there. DOMPurify 3.4.8+ silently sanitises
// nothing under happy-dom (every element resolves to an empty tag name), so a
// happy-dom-only suite goes green while this module strips nothing at all.
// Moving those assertions back under happy-dom for speed removes the only check
// that this module does anything. CLAUDE.md records the upstream root cause.
import DOMPurify, { type Config, type DOMPurify as Purifier } from "dompurify";
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

// `target` and `rel` are on the list because {@link harden} writes them onto
// every link. An attribute the returned markup carries but the config does not
// name would be markup the sanitiser never approved — which is the whole defect
// the hook exists to avoid.
//
// `class` is here only for marked's `language-*` code-fence hint, and `harden`
// narrows it to exactly that. Left wide, it is a chrome-forgery channel: the
// shadow stylesheet's component classes are unscoped selectors, so a `<span
// class="approval-btn approval-btn--approve">` in model output resolves to the
// same pixels as the real human-in-the-loop approval button, inside the surface
// where the user decides whether to approve.
const ALLOWED_ATTR = ["href", "title", "class", "target", "rel"];

/**
 * The sanitiser's declared allowlist — and, because {@link harden} runs inside
 * the sanitiser rather than after it, its *effective* one too.
 *
 * `ALLOW_DATA_ATTR` and `ALLOW_ARIA_ATTR` default to `true`, which would admit
 * every `data-*` and `aria-*` attribute on top of the five named above. Both
 * matter here: the cards drive their resolved / expanded / status appearance off
 * `[data-resolved]`, `[data-status]` and `[data-expanded]`, and an `aria-label`
 * on model output makes a screen reader announce something other than what is on
 * screen. Turning them off is what makes the declared list the real one.
 *
 * Exported so a test can assert the returned markup is a fixed point of it.
 */
export const SANITIZE_CONFIG: Config = {
  ALLOWED_TAGS,
  ALLOWED_ATTR,
  ALLOW_DATA_ATTR: false,
  ALLOW_ARIA_ATTR: false,
};

/** {@link SANITIZE_CONFIG} plus the images a host opts into. */
export const SANITIZE_CONFIG_WITH_IMAGES: Config = {
  ...SANITIZE_CONFIG,
  ALLOWED_TAGS: [...ALLOWED_TAGS, "img"],
  ALLOWED_ATTR: [...ALLOWED_ATTR, "src", "alt", "width", "height"],
};

/** The one class value markdown is allowed to carry, and where it may sit. */
const LANGUAGE_CLASS = /^language-[A-Za-z0-9_+#.-]+$/;
const LANGUAGE_HOSTS = new Set(["CODE", "PRE"]);

/**
 * Per-element hardening, run *inside* the sanitiser.
 *
 * It belongs here rather than in a pass over the finished string because
 * DOMPurify must be the last thing to touch the markup: anything edited in
 * afterwards is inserted into the document without the sanitiser ever having
 * seen it, and re-parsing sanitiser output is the shape every mXSS bypass takes.
 * Running as a hook means DOMPurify serialises the result of these edits, so
 * what the caller inserts is exactly what it approved.
 *
 * Two jobs:
 *
 * - links open in a new tab and never hand over their opener. `target`/`rel` are
 *   this module's to write, so they are stripped from everything else rather
 *   than inherited from the model's own markup;
 * - `class` is narrowed to the code-fence language hint on `code`/`pre`, the
 *   only thing it is allowed for, and dropped everywhere else so model output
 *   cannot adopt the component's own chrome.
 */
function harden(node: Element): void {
  if (node.nodeName === "A" && node.hasAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  } else {
    node.removeAttribute("target");
    node.removeAttribute("rel");
  }
  const classes = node.getAttribute("class");
  if (classes === null) {
    return;
  }
  const kept = LANGUAGE_HOSTS.has(node.nodeName)
    ? classes.split(/\s+/).filter((token) => LANGUAGE_CLASS.test(token))
    : [];
  if (kept.length === 0) {
    node.removeAttribute("class");
    return;
  }
  node.setAttribute("class", kept.join(" "));
}

// DOMPurify's default export is a singleton, and `addHook` mutates it for every
// caller sharing that copy — including the host app, if its bundler deduped to
// ours. So this module builds its own instance, for the same reason `parser`
// above is a local `Marked`.
//
// Built on first render rather than at module scope: a DOMPurify instance
// created without a DOM has no `addHook` at all, and doing this eagerly would
// turn a server-side `import` of the package into a throw.
let purifier: Purifier | null = null;

function sanitizer(): Purifier {
  if (purifier === null) {
    purifier = DOMPurify();
    purifier.addHook("afterSanitizeAttributes", harden);
  }
  return purifier;
}

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
 * DOMPurify strips everything outside {@link SANITIZE_CONFIG} — scripts, event
 * handlers, `javascript:` URLs, `data-*`/`aria-*`, and every class but a code
 * fence's `language-*` hint. Links come out with `target="_blank"` and
 * `rel="noopener noreferrer"`.
 *
 * The returned string is the sanitiser's own output, trimmed. Nothing edits it
 * afterwards, so what a caller inserts is what DOMPurify approved.
 */
export function renderMarkdown(text: string, options?: RenderMarkdownOptions): string {
  const allowImages = options?.allowImages === true;
  const rendered = parser.parse(text, { async: false });
  return sanitizer()
    .sanitize(rendered, allowImages ? SANITIZE_CONFIG_WITH_IMAGES : SANITIZE_CONFIG)
    .trim();
}
