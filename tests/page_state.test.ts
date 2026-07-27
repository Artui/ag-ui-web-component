import { describe, expect, it } from "vitest";
import {
  createPageStateTools,
  createStateHookTools,
  type PageState,
  type StateHook,
} from "../src/tools/page_state.js";

describe("createPageStateTools", () => {
  it("creates a read-only tool when no write is given", () => {
    const tools = createPageStateTools({ name: "cart", read: () => ({ items: 2 }) });
    expect(tools).toHaveLength(1);
    expect(tools[0]?.name).toBe("read_cart");
    expect(tools[0]?.parameters?.["x-summary"]).toBe("Read cart");
    expect(tools[0]?.handler({})).toEqual({ items: 2 });
  });

  it("adds a destructive set tool when write is given, honouring the schema", () => {
    const writes: unknown[] = [];
    const tools = createPageStateTools({
      name: "cart",
      read: () => null,
      write: (args) => {
        writes.push(args);
        return "ok";
      },
      schema: { type: "object", properties: { qty: { type: "number" } }, required: ["qty"] },
    });
    expect(tools.map((t) => t.name)).toEqual(["read_cart", "set_cart"]);
    expect(tools[1]?.parameters?.["x-destructive"]).toBe(true);
    expect(tools[1]?.parameters?.["x-summary"]).toBe("Update cart");
    expect(tools[1]?.parameters?.["properties"]).toEqual({ qty: { type: "number" } });
    expect(tools[1]?.handler({ qty: 3 })).toBe("ok");
    expect(writes).toEqual([{ qty: 3 }]);
  });

  it("defaults the set-tool schema to an open object", () => {
    const tools = createPageStateTools({ name: "x", read: () => 1, write: () => 2 });
    expect(tools[1]?.parameters).toEqual({
      type: "object",
      "x-destructive": true,
      "x-summary": "Update x",
    });
  });
});

describe("the deprecated aliases", () => {
  it("createStateHookTools is the same function", () => {
    // A consumer on the old spelling keeps working; the rename is a signal,
    // not a break.
    expect(createStateHookTools).toBe(createPageStateTools);
  });

  it("StateHook still types a binding", () => {
    const binding: StateHook = { name: "cart", read: () => 1 };
    const alsoValid: PageState = binding;

    expect(createStateHookTools(alsoValid)[0]?.name).toBe("read_cart");
  });
});
