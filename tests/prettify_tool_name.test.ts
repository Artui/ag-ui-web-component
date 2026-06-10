import { describe, expect, it } from "vitest";
import { prettifyToolName } from "../src/ui/prettify_tool_name.js";

describe("prettifyToolName", () => {
  it("turns snake_case into a capitalised phrase", () => {
    expect(prettifyToolName("list_projects")).toBe("List projects");
  });

  it("handles dots and dashes as separators", () => {
    expect(prettifyToolName("invoices.retrieve")).toBe("Invoices retrieve");
    expect(prettifyToolName("fill-field")).toBe("Fill field");
  });

  it("collapses runs of separators", () => {
    expect(prettifyToolName("a__weird--name")).toBe("A weird name");
  });

  it("returns the input unchanged when only separators remain", () => {
    expect(prettifyToolName("___")).toBe("___");
  });

  it("leaves an already-readable name capitalised only", () => {
    expect(prettifyToolName("search")).toBe("Search");
  });
});
