import { describe, expect, it } from "vitest";
import { type ClientTool, ClientToolRegistry } from "../src/tools/client_tool_registry.js";

function tool(name: string, parameters: Record<string, unknown> = { type: "object" }): ClientTool {
  return { name, description: `does ${name}`, parameters, handler: () => name };
}

describe("ClientToolRegistry", () => {
  it("registers, reports membership, and looks up tools", () => {
    const reg = new ClientToolRegistry();
    reg.register(tool("fill_field"));
    expect(reg.has("fill_field")).toBe(true);
    expect(reg.has("ghost")).toBe(false);
    expect(reg.get("fill_field").description).toBe("does fill_field");
  });

  it("replaces a tool registered again under the same name (idempotent)", () => {
    const reg = new ClientToolRegistry();
    reg.register(tool("x"));
    const replacement: ClientTool = {
      name: "x",
      description: "replaced",
      parameters: { type: "object" },
      handler: () => "new",
    };
    expect(() => reg.register(replacement)).not.toThrow();
    expect(reg.get("x").description).toBe("replaced");
    expect(reg.tools()).toHaveLength(1);
  });

  it("throws when getting an unknown tool", () => {
    expect(() => new ClientToolRegistry().get("ghost")).toThrow(/not registered/);
  });

  it("produces AG-UI tool definitions without the handler", () => {
    const reg = new ClientToolRegistry();
    reg.register(tool("fill_field", { type: "object", "x-destructive": true }));
    reg.register(tool("count"));
    const defs = reg.tools();
    expect(defs).toEqual([
      {
        name: "fill_field",
        description: "does fill_field",
        parameters: { type: "object", "x-destructive": true },
      },
      { name: "count", description: "does count", parameters: { type: "object" } },
    ]);
    expect(defs[0]).not.toHaveProperty("handler");
  });
});
