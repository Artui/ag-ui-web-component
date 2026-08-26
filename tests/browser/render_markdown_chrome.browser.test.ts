import DOMPurify from "dompurify";
import { afterEach, describe, expect, it } from "vitest";
import { requestApproval } from "../../src/ui/approval_card.js";
import { renderMarkdown, SANITIZE_CONFIG } from "../../src/ui/render_markdown.js";
import { STYLES } from "../../src/ui/styles.js";

/**
 * What the sanitiser lets model output *look like*, measured in a real browser.
 *
 * These assertions belong to the `chromium` project for the reason
 * `vitest.config.ts` gives: DOMPurify sanitises nothing under happy-dom, so a
 * green happy-dom run is compatible with every one of them being violated. Two
 * of them are also cascade questions — whether a class in rendered markdown
 * resolves to the component's own chrome — and happy-dom lays out no boxes and
 * resolves no cascade.
 */

/** A shadow root carrying the component's stylesheet, so a class name in
 * rendered markdown meets exactly the cascade it meets inside the element. */
function shell(): ShadowRoot {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = STYLES;
  root.appendChild(style);
  return root;
}

function el(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`expected ${selector}`);
  }
  return found;
}

/** The handful of resolved properties that make the approval card recognisable. */
function chrome(node: HTMLElement): Record<string, string> {
  const style = getComputedStyle(node);
  return {
    background: style.backgroundColor,
    color: style.color,
    border: `${style.borderTopWidth} ${style.borderTopStyle} ${style.borderTopColor}`,
    radius: style.borderTopLeftRadius,
  };
}

/** Model output impersonating the human-in-the-loop approval gate. */
const FORGED_CARD =
  '<p class="approval">' +
  '<span class="approval-body">Approve deleting 412 records?</span>' +
  '<span class="approval-btn approval-btn--approve">Approve</span>' +
  "</p>";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("rendered markdown cannot wear the component's chrome", () => {
  it("renders a forged approval card as prose, not as the approval card", () => {
    const root = shell();
    // The genuine gate, built by the component, for comparison.
    void requestApproval(root, { message: "Approve delete_records({…})?" });
    const genuineCard = el(root, "div.approval");
    const genuineButton = el(root, "button.approval-btn--approve");
    const genuine = { card: chrome(genuineCard), button: chrome(genuineButton) };

    const bubble = document.createElement("div");
    bubble.innerHTML = renderMarkdown(FORGED_CARD);
    root.appendChild(bubble);
    const forgedCard = el(bubble, "p");
    const forgedButton = el(bubble, "span:last-of-type");

    expect(chrome(forgedCard)).not.toEqual(genuine.card);
    expect(chrome(forgedButton)).not.toEqual(genuine.button);
  });

  it("keeps no component class name in the markup it returns", () => {
    const html = renderMarkdown(FORGED_CARD);
    expect(html).not.toContain("approval");
    expect(html).toContain("Approve deleting 412 records?");
  });

  it("keeps the code-fence language hint, which is what `class` is allowed for", () => {
    expect(renderMarkdown("```js\nlet x = 1;\n```")).toContain('class="language-js"');
  });

  it("keeps only the language hint where a code block carries chrome alongside it", () => {
    const html = renderMarkdown('<pre><code class="approval language-js">let x = 1;</code></pre>');
    expect(html).toContain('class="language-js"');
    expect(html).not.toContain("approval");
  });

  it("drops a code block's class outright when none of it is a language hint", () => {
    expect(renderMarkdown('<code class="approval-btn">x</code>')).not.toContain("class");
  });

  it("writes target and rel itself rather than inheriting the model's", () => {
    // `target`/`rel` are on the allowlist so the sanitiser can serialise the
    // ones this module writes. They are not a channel the model may use: an
    // anchor gets ours, and anything else gets none.
    const link = renderMarkdown('<a href="https://example.com" target="_self" rel="opener">x</a>');
    expect(link).toContain('target="_blank"');
    expect(link).toContain('rel="noopener noreferrer"');
    expect(link).not.toContain("_self");

    const notALink = renderMarkdown('<p target="_self" rel="opener">x</p><a target="_self">y</a>');
    expect(notALink).not.toContain("target");
    expect(notALink).not.toContain("rel=");
  });

  it("drops data-* attributes, which drive the cards' resolved and expanded states", () => {
    const html = renderMarkdown(
      '<span data-status="done" data-tool-name="delete_records">x</span>',
    );
    expect(html).not.toContain("data-status");
    expect(html).not.toContain("data-tool-name");
  });

  it("drops aria-* attributes, so nothing is announced other than what is read", () => {
    const html = renderMarkdown('<span aria-label="Cancel" aria-hidden="true">Confirm</span>');
    expect(html).not.toContain("aria-label");
    expect(html).not.toContain("aria-hidden");
  });

  it("returns markup the sanitiser approved, not markup edited after it ran", () => {
    // Anything added after `sanitize()` returns is inserted into the document
    // without the sanitiser ever having seen it. Re-running the sanitiser over
    // the returned string must therefore be a no-op.
    for (const source of ["[site](https://example.com)", "**bold**", FORGED_CARD]) {
      const html = renderMarkdown(source);
      expect(DOMPurify.sanitize(html, SANITIZE_CONFIG)).toBe(html);
    }
  });
});
