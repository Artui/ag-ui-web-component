/**
 * What Copy actually puts on the clipboard.
 *
 * The bar used to hand over `bubble.textContent`, which is the obvious answer
 * and loses every piece of structure the message had: a table arrives as one
 * unbroken run of cells, and the code blocks' own copy buttons -- real
 * descendants of the bubble, appended inside their `pre` -- contribute their
 * label to the middle of it.
 */

import { describe, expect, it } from "vitest";
import { copyPayload } from "../src/ui/copy_payload.js";

/** A bubble holding `html`, the way a rendered markdown answer looks. */
function bubble(html: string): HTMLElement {
  const element = document.createElement("div");
  element.innerHTML = html;
  return element;
}

describe("copyPayload", () => {
  it("keeps a table's rows and columns, tab separated", () => {
    const payload = copyPayload(
      bubble(
        "<table><thead><tr><th>Region</th><th>Q1</th><th>Q2</th></tr></thead>" +
          "<tbody><tr><td>North</td><td>12</td><td>18</td></tr>" +
          "<tr><td>South</td><td>9</td><td>21</td></tr></tbody></table>",
      ),
    );

    // Tabs are what a spreadsheet splits on, so this pastes as three columns
    // rather than as one cell of digits.
    expect(payload.text).toBe("Region\tQ1\tQ2\nNorth\t12\t18\nSouth\t9\t21");
  });

  it("offers the table as markup too, so it pastes as a table", () => {
    const payload = copyPayload(bubble("<table><tr><td>a</td></tr></table>"));

    expect(payload.html).toContain("<table>");
    expect(payload.html).toContain("<td>a</td>");
  });

  it("drops the copy buttons the component put inside the message", () => {
    // Exactly the shape attachCopyButtons leaves behind: the button is a child
    // of the pre, so it is a descendant of the bubble.
    const payload = copyPayload(
      bubble('<pre><code>const x = 1;</code><button class="code-copy">Copy</button></pre>'),
    );

    expect(payload.text).toBe("const x = 1;");
    expect(payload.text).not.toContain("Copy");
    expect(payload.html).not.toContain("button");
  });

  it("leaves the bubble it was given untouched", () => {
    const source = bubble('<p>hi</p><button class="code-copy">Copy</button>');

    copyPayload(source);

    // The stripping happens on a clone: doing it in place would delete the
    // buttons the reader is still looking at.
    expect(source.querySelector("button")).not.toBeNull();
  });

  it("keeps a code block's own whitespace", () => {
    const payload = copyPayload(bubble("<pre><code>if (x) {\n  go();\n}</code></pre>"));

    expect(payload.text).toBe("if (x) {\n  go();\n}");
  });

  it("puts paragraphs on their own lines", () => {
    const payload = copyPayload(bubble("<p>First para.</p><p>Second para.</p>"));

    expect(payload.text).toBe("First para.\n\nSecond para.");
  });

  it("marks bulleted and numbered items the way they are read", () => {
    const bulleted = copyPayload(bubble("<ul><li>alpha</li><li>beta</li></ul>"));
    expect(bulleted.text).toBe("- alpha\n- beta");

    const numbered = copyPayload(bubble("<ol><li>first</li><li>second</li></ol>"));
    expect(numbered.text).toBe("1. first\n2. second");
  });

  it("breaks a line where the markup does", () => {
    expect(copyPayload(bubble("<p>one<br>two</p>")).text).toBe("one\ntwo");
  });

  it("collapses the whitespace the renderer collapses", () => {
    // Indented markup would otherwise copy its own indentation.
    expect(copyPayload(bubble("<p>\n   spaced     out\n</p>")).text).toBe("spaced out");
  });

  it("keeps inline emphasis as part of the sentence", () => {
    expect(copyPayload(bubble("<p>a <strong>bold</strong> word</p>")).text).toBe("a bold word");
  });

  it("ignores nodes that are neither text nor elements", () => {
    const element = bubble("<p>kept</p>");
    element.appendChild(document.createComment("dropped"));

    expect(copyPayload(element).text).toBe("kept");
  });

  it("returns nothing for an empty message rather than whitespace", () => {
    expect(copyPayload(bubble("")).text).toBe("");
  });
});
