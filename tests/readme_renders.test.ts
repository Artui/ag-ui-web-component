/**
 * The README is the documentation, so it has to render where it is read.
 *
 * There is no docs site here: this file is what GitHub shows and what npm puts
 * on the package page. Neither understands MkDocs admonitions, and the failure
 * is worse than a missed callout -- `!!! note` renders as a literal line and
 * its indented body becomes a *code block*, so a warning is displayed as
 * something to copy.
 *
 * Two of them were live at once, one of them a warning about a silent failure
 * that a reader then hit anyway. That is the whole reason this file exists: the
 * note was written, was correct, and did not reach anybody, and nothing in the
 * suite could tell.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const README = readFileSync(join(__dirname, "..", "README.md"), "utf8");

describe("the README renders where it is read", () => {
  it("uses no MkDocs admonitions", () => {
    const admonitions = README.split("\n").filter((line) => /^!!!\s/.test(line));

    expect(admonitions).toEqual([]);
  });

  it("keeps the registration warning, because forgetting the call is silent", () => {
    // Named rather than left to the admonition check: this is the one a reader
    // reaches the package through, and a callout that renders is only useful
    // while it is still there.
    expect(README).toContain("[!IMPORTANT]");
    expect(README).toContain("defineAgUiChat()` ran");
    expect(README).toContain('customElements.get("ag-ui-chat")');
  });
});
