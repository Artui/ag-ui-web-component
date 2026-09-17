import { describe, expect, it } from "vitest";
import { fillUiString } from "../src/ui/fill_ui_string.js";

/**
 * The one fill every string-table template goes through.
 *
 * The call-site tests beside each consumer are what failed first against the
 * `String.replace` fills this replaced; these pin the helper's own contract,
 * including the two edges no call site happens to reach.
 */
describe("fillUiString", () => {
  it("fills a token", () => {
    expect(fillUiString("Delegated to {agent}", { agent: "researcher" })).toBe(
      "Delegated to researcher",
    );
  });

  it("inserts every dollar pattern literally", () => {
    // Each of these means something to a string replacement: the match, the
    // text before it, the text after it, and a literal dollar.
    const value = "a $& b $` c $' d $$ e";
    expect(fillUiString('Do not send "{text}"', { text: value })).toBe(`Do not send "${value}"`);
  });

  it("fills a token used more than once", () => {
    expect(fillUiString("{n} of {n}", { n: 3 })).toBe("3 of 3");
  });

  it("fills several tokens in one pass, without filling what a value inserted", () => {
    // A skill titled with a token of its own must reach the screen as written.
    expect(fillUiString("{title} needs {fields}", { title: "Fill {fields}", fields: "q, r" })).toBe(
      "Fill {fields} needs q, r",
    );
  });

  it("formats a number", () => {
    expect(fillUiString("{count} removed", { count: 0 })).toBe("0 removed");
  });

  it("leaves a token it has no value for as written", () => {
    expect(fillUiString("{known} and {unknown}", { known: "x" })).toBe("x and {unknown}");
  });

  it("does not reach an inherited property for a token", () => {
    // `{constructor}` and `{toString}` name properties every object inherits.
    // A lookup that followed the prototype would print a function's source.
    expect(fillUiString("{constructor} {toString}", {})).toBe("{constructor} {toString}");
  });
});
