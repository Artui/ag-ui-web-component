import { describe, expect, it } from "vitest";
import { ToolCallCard } from "../src/ui/tool_call_card.js";
import { mergeUiStrings } from "../src/ui/ui_strings.js";

describe("ToolCallCard", () => {
  it("renders the tool name, args, and a pending status", () => {
    const card = new ToolCallCard("fill_field", { name: "city", value: "Paris" });
    expect(card.element.getAttribute("data-tool-name")).toBe("fill_field");
    expect(card.element.getAttribute("data-status")).toBe("pending");
    expect(card.element.getAttribute("part")).toBe("tool-card");
    expect(card.element.querySelector(".tool-call-name")?.textContent).toBe("fill_field");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("running");
    expect(card.element.querySelector(".tool-call-args")?.textContent).toContain(
      '"value": "Paris"',
    );
    // No result body until settled.
    expect(card.element.querySelector(".tool-call-result")).toBeNull();
  });

  it("renders a status icon element keyed off data-status (themed by CSS)", () => {
    const card = new ToolCallCard("fill_field", {});
    const icon = card.element.querySelector(".tool-call-icon");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("part")).toBe("tool-card-icon");
    // The icon carries no text of its own — the glyph/spinner is pure CSS.
    expect(icon?.textContent).toBe("");
    // Its appearance follows the card's status, which the CSS selects on.
    expect(card.element.getAttribute("data-status")).toBe("pending");
    card.settle("done", "ok");
    expect(card.element.getAttribute("data-status")).toBe("done");
    expect(icon?.textContent).toBe("");
  });

  it("inline mode shows no args but keeps a collapsible result", () => {
    const card = new ToolCallCard("count_users", { active: true }, "inline");
    expect(card.element.getAttribute("data-display")).toBe("inline");
    // Like minimal/compact, args aren't shown inline…
    expect(card.element.querySelector(".tool-call-args")).toBeNull();
    card.settle("done", "42");
    // …but unlike minimal, the result is reachable behind its own toggle.
    const toggle = card.element.querySelector<HTMLButtonElement>(".tool-call-toggle");
    const output = card.element.querySelector<HTMLElement>(".tool-call-result");
    expect(toggle?.textContent).toBe("Result");
    expect(output?.textContent).toBe("42");
    expect(output?.hidden).toBe(true);
    // Result only — no args bundled in (that's compact's behaviour).
    expect(output?.textContent).not.toContain("args:");
  });

  it("reports its settled state for the terminal sweep", () => {
    const card = new ToolCallCard("count_users", {});
    expect(card.settled).toBe(false);
    card.settle("done", "42");
    expect(card.settled).toBe(true);
  });

  it("marks a minimal-mode card settled even with no body", () => {
    const card = new ToolCallCard("ping", {}, "minimal");
    card.settle("done", "pong");
    expect(card.settled).toBe(true);
    expect(card.element.querySelector(".tool-call-result")).toBeNull();
  });

  it("draws all visible text from the string table", () => {
    const strings = mergeUiStrings({
      toolRunning: "läuft…",
      toolDone: "fertig",
      resultLabel: "Ergebnis",
    });
    const card = new ToolCallCard("count_users", {}, "full", undefined, strings);
    expect(card.element.querySelector(".tool-call-status")?.textContent).toBe("läuft…");
    card.settle("done", "42");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toBe("fertig");
    expect(card.element.querySelector(".tool-call-toggle")?.textContent).toBe("Ergebnis");
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

  it("shows the x-summary label instead of the tool name when given", () => {
    const card = new ToolCallCard("query_model", { model: "Order" }, "full", "Query orders");
    expect(card.element.querySelector(".tool-call-name")?.textContent).toBe("Query orders");
    // The raw name is still on the data attribute for selectors.
    expect(card.element.getAttribute("data-tool-name")).toBe("query_model");
  });

  it("minimal mode shows only the name + pill, no args or result body", () => {
    const card = new ToolCallCard("count_users", { active: true }, "minimal");
    expect(card.element.getAttribute("data-display")).toBe("minimal");
    expect(card.element.querySelector(".tool-call-args")).toBeNull();
    card.settle("done", "42");
    expect(card.element.getAttribute("data-status")).toBe("done");
    expect(card.element.querySelector(".tool-call-toggle")).toBeNull();
    expect(card.element.querySelector(".tool-call-result")).toBeNull();
  });

  it("compact mode hides args until a single Details toggle reveals args + result", () => {
    const card = new ToolCallCard("count_users", { active: true }, "compact");
    expect(card.element.getAttribute("data-display")).toBe("compact");
    expect(card.element.querySelector(".tool-call-args")).toBeNull();
    card.settle("done", "42");
    const toggle = card.element.querySelector<HTMLButtonElement>(".tool-call-toggle");
    const output = card.element.querySelector<HTMLElement>(".tool-call-result");
    expect(toggle?.textContent).toBe("Details");
    expect(output?.hidden).toBe(true);
    expect(output?.textContent).toContain('args: {"active":true}');
    expect(output?.textContent).toContain("42");
    toggle?.click();
    expect(output?.hidden).toBe(false);
  });
});
