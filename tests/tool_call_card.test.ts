import { describe, expect, it } from "vitest";
import { ToolCallCard } from "../src/tool_call_card.js";

describe("ToolCallCard", () => {
  it("renders the tool name, args, and a pending status", () => {
    const card = new ToolCallCard("fill_field", { name: "city", value: "Paris" });
    expect(card.element.getAttribute("data-tool-name")).toBe("fill_field");
    expect(card.element.getAttribute("data-status")).toBe("pending");
    expect(card.element.querySelector(".tool-call-name")?.textContent).toBe("🔧 fill_field");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("running");
    expect(card.element.querySelector(".tool-call-args")?.textContent).toContain(
      '"value": "Paris"',
    );
    // No result body until settled.
    expect(card.element.querySelector(".tool-call-result")).toBeNull();
  });

  it("settles to done with a collapsed result body", () => {
    const card = new ToolCallCard("count_users", {});
    card.settle("done", "42");
    expect(card.element.getAttribute("data-status")).toBe("done");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("done");
    const toggle = card.element.querySelector<HTMLButtonElement>(".tool-call-toggle");
    const output = card.element.querySelector<HTMLElement>(".tool-call-result");
    expect(toggle?.textContent).toBe("Result");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(output?.textContent).toBe("42");
    expect(output?.hidden).toBe(true);
  });

  it("expands and collapses the result when the toggle is clicked", () => {
    const card = new ToolCallCard("count_users", {});
    card.settle("done", "42");
    const toggle = card.element.querySelector<HTMLButtonElement>(".tool-call-toggle");
    const output = card.element.querySelector<HTMLElement>(".tool-call-result");

    toggle?.click();
    expect(output?.hidden).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    toggle?.click();
    expect(output?.hidden).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("labels an error outcome", () => {
    const card = new ToolCallCard("boom", {});
    card.settle("error", "kaboom");
    expect(card.element.getAttribute("data-status")).toBe("error");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("error");
    expect(card.element.querySelector(".tool-call-toggle")?.textContent).toBe("Error");
    expect(card.element.querySelector(".tool-call-result")?.textContent).toBe("kaboom");
  });

  it("labels a declined outcome", () => {
    const card = new ToolCallCard("delete_user", { id: 7 });
    card.settle("declined", "User declined the action.");
    expect(card.element.getAttribute("data-status")).toBe("declined");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("declined");
    expect(card.element.querySelector(".tool-call-toggle")?.textContent).toBe("Declined");
  });
});
