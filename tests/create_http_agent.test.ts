import { HttpAgent } from "@ag-ui/client";
import { describe, expect, it } from "vitest";
import { createHttpAgent } from "../src/create_http_agent.js";

describe("createHttpAgent", () => {
  it("builds an HttpAgent pointed at the endpoint with headers", () => {
    const agent = createHttpAgent({
      endpoint: "/agent/",
      headers: { "X-CSRFToken": "abc" },
    });
    expect(agent).toBeInstanceOf(HttpAgent);
    expect((agent as HttpAgent).url).toBe("/agent/");
    expect((agent as HttpAgent).headers).toMatchObject({ "X-CSRFToken": "abc" });
  });

  it("defaults headers to an empty object", () => {
    const agent = createHttpAgent({ endpoint: "/agent/" });
    expect((agent as HttpAgent).headers).toEqual({});
  });
});
