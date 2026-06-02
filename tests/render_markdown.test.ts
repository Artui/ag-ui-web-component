import { beforeAll, describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/ui/render_markdown.js";

// happy-dom eagerly executes inline <script> while DOMPurify parses the input
// into its scratch document — a real browser uses an inert context, so this
// never happens in production. Stub `alert` so the env doesn't throw; the
// assertions below verify the script is stripped from the *output* regardless.
beforeAll(() => {
  (globalThis as unknown as { alert: () => void }).alert = () => {};
});

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

  it("keeps a sanitized img but strips its inline event handlers", () => {
    const html = renderMarkdown('<img src="https://ex.com/i.png" alt="pic" onerror="alert(1)">');
    expect(html).toContain("<img");
    expect(html).toContain('src="https://ex.com/i.png"');
    expect(html).not.toContain("onerror");
  });

  it("neutralizes a javascript: image src", () => {
    const html = renderMarkdown('<img src="javascript:alert(1)">');
    expect(html).not.toContain("javascript:");
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
