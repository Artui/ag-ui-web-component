import { afterEach, describe, expect, it } from "vitest";
import { wrapWords } from "../src/ui/reveal_words.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("wrapWords", () => {
  it("wraps words in indexed spans, preserving whitespace and nesting", () => {
    const el = document.createElement("div");
    // Leading space + double space exercise the empty + whitespace branches;
    // the <strong> exercises the recurse-into-element branch.
    el.innerHTML = "<p> hello  <strong>brave</strong> world</p>";
    wrapWords(el);

    const words = el.querySelectorAll(".word");
    expect([...words].map((w) => w.textContent)).toEqual(["hello", "brave", "world"]);
    // Indices are assigned in document order across nested elements.
    expect(
      [...words].map((w) => (w as HTMLElement).style.getPropertyValue("--ag-ui-word-index")),
    ).toEqual(["0", "1", "2"]);
    // The full text still reads correctly (whitespace kept).
    expect(el.textContent).toBe(" hello  brave world");
  });

  it("handles a plain text node with no words gracefully", () => {
    const el = document.createElement("div");
    el.textContent = "   ";
    wrapWords(el);
    expect(el.querySelectorAll(".word")).toHaveLength(0);
    expect(el.textContent).toBe("   ");
  });
});
