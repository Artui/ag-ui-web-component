import { describe, expect, it } from "vitest";
import { ToolCallCard } from "../src/ui/tool_call_card.js";
import { mergeUiStrings } from "../src/ui/ui_strings.js";

const args = (card: ToolCallCard) => card.element.querySelector<HTMLElement>(".tool-call-args");
const result = (card: ToolCallCard) => card.element.querySelector<HTMLElement>(".tool-call-result");
const toggle = (card: ToolCallCard) =>
  card.element.querySelector<HTMLButtonElement>(".tool-call-toggle");
const section = (card: ToolCallCard, kind: string) =>
  card.element.querySelector<HTMLElement>(`.tool-call-section--${kind}`);

describe("ToolCallCard", () => {
  it("renders the tool name, pretty-printed args, and a pending status", () => {
    const card = new ToolCallCard("fill_field", { name: "city", value: "Paris" });
    expect(card.element.getAttribute("data-tool-name")).toBe("fill_field");
    expect(card.element.getAttribute("data-status")).toBe("pending");
    expect(card.element.getAttribute("part")).toBe("tool-card");
    expect(card.element.querySelector(".tool-call-name")?.textContent).toBe("fill_field");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toContain("running");
    expect(args(card)?.textContent).toContain('"value": "Paris"');
  });

  it("labels both regions, so the args and the result cannot run together", () => {
    // The defect this rework closes: compact mode used to emit
    // `args: {...}\n\n<result>` into one block, with nothing marking where the
    // call ended and the answer began.
    const card = new ToolCallCard("count_users", { active: true });
    card.settle("done", "42");

    const labels = [...card.element.querySelectorAll(".tool-call-section-label")].map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(["Arguments", "Result"]);
    expect(args(card)?.textContent).not.toContain("42");
    expect(result(card)?.textContent).not.toContain("active");
  });

  it("renders one DOM shape regardless of display mode", () => {
    // Both regions exist on every card; which of them shows is decided by the
    // shadow CSS from the host's `data-tool-display`. That is what lets the
    // setting reach cards already on screen instead of only later ones.
    const card = new ToolCallCard("count_users", { active: true });
    card.settle("done", "42");
    expect(section(card, "args")).not.toBeNull();
    expect(section(card, "result")).not.toBeNull();
    expect(toggle(card)).not.toBeNull();
  });

  it("pretty-prints a JSON result and passes plain text through", () => {
    const structured = new ToolCallCard("q", {});
    structured.settle("done", '{"count":42}');
    expect(result(structured)?.textContent).toBe('{\n  "count": 42\n}');

    const plain = new ToolCallCard("q", {});
    plain.settle("done", "not json at all");
    expect(result(plain)?.textContent).toBe("not json at all");
  });

  it("omits the arguments region for a call that takes none", () => {
    // An empty object in a box of its own is a frame around nothing.
    const card = new ToolCallCard("ping", {});
    expect(section(card, "args")?.hidden).toBe(true);
  });

  it("hides the result region until the call settles", () => {
    const card = new ToolCallCard("count_users", { active: true });
    expect(section(card, "result")?.hidden).toBe(true);
    card.settle("done", "42");
    expect(section(card, "result")?.hidden).toBe(false);
  });

  it("renders a status icon element keyed off data-status (themed by CSS)", () => {
    const card = new ToolCallCard("fill_field", {});
    const icon = card.element.querySelector(".tool-call-icon");
    expect(icon?.getAttribute("part")).toBe("tool-card-icon");
    // The icon carries no text of its own — the glyph/spinner is pure CSS.
    expect(icon?.textContent).toBe("");
    card.settle("done", "ok");
    expect(card.element.getAttribute("data-status")).toBe("done");
    expect(icon?.textContent).toBe("");
  });

  it("reports its settled state for the terminal sweep", () => {
    const card = new ToolCallCard("count_users", {});
    expect(card.settled).toBe(false);
    card.settle("done", "42");
    expect(card.settled).toBe(true);
  });

  it("ignores a second settle: first outcome wins", () => {
    const card = new ToolCallCard("count_users", {});
    card.settle("done", "42");
    // A duplicate TOOL_CALL_RESULT, or a replayed tool message for a card that
    // already settled, must not overwrite the first outcome.
    card.settle("error", "kaboom");
    expect(card.element.getAttribute("data-status")).toBe("done");
    expect(result(card)?.textContent).toBe("42");
  });

  it("draws all visible text from the string table", () => {
    const strings = mergeUiStrings({
      toolRunning: "läuft…",
      toolDone: "fertig",
      argumentsLabel: "Argumente",
      resultLabel: "Ergebnis",
      details: "Einzelheiten",
    });
    const card = new ToolCallCard("count_users", { a: 1 }, undefined, strings);
    expect(card.element.querySelector(".tool-call-status")?.textContent).toBe("läuft…");
    expect(card.element.querySelector(".tool-call-section-label")?.textContent).toBe("Argumente");
    expect(toggle(card)?.textContent).toBe("Einzelheiten");
    card.settle("done", "42");
    expect(card.element.querySelector(".tool-call-status")?.textContent).toBe("fertig");
    expect(section(card, "result")?.querySelector(".tool-call-section-label")?.textContent).toBe(
      "Ergebnis",
    );
  });

  it("expands and collapses the body when the toggle is clicked", () => {
    const card = new ToolCallCard("count_users", {});
    card.settle("done", "42");
    expect(card.element.getAttribute("data-expanded")).toBe("false");
    expect(toggle(card)?.getAttribute("aria-expanded")).toBe("false");

    toggle(card)?.click();
    expect(card.element.getAttribute("data-expanded")).toBe("true");
    expect(toggle(card)?.getAttribute("aria-expanded")).toBe("true");

    toggle(card)?.click();
    expect(card.element.getAttribute("data-expanded")).toBe("false");
  });

  it("names the outcome in the result heading", () => {
    const failed = new ToolCallCard("boom", {});
    failed.settle("error", "kaboom");
    expect(failed.element.getAttribute("data-status")).toBe("error");
    expect(section(failed, "result")?.querySelector(".tool-call-section-label")?.textContent).toBe(
      "Error",
    );

    const declined = new ToolCallCard("delete_user", { id: 7 });
    declined.settle("declined", "User declined the action.");
    expect(declined.element.getAttribute("data-status")).toBe("declined");
    expect(
      section(declined, "result")?.querySelector(".tool-call-section-label")?.textContent,
    ).toBe("Declined");
  });

  it("records a human decision on a gated call", () => {
    // Approval used to leave no trace: a declined call became a tool result
    // saying so, while an approved one simply ran, making a gated call's
    // transcript identical to one that was never gated.
    const approved = new ToolCallCard("delete_user", { id: 7 });
    approved.recordDecision("approved");
    expect(approved.element.getAttribute("data-decision")).toBe("approved");
    expect(approved.element.querySelector(".tool-call-decision")?.textContent).toBe(
      "approved by you",
    );

    const declined = new ToolCallCard("delete_user", { id: 7 });
    declined.recordDecision("declined");
    expect(declined.element.getAttribute("data-decision")).toBe("declined");
  });

  it("carries no decision note on a call nobody was asked about", () => {
    const card = new ToolCallCard("count_users", {});
    expect(card.element.querySelector<HTMLElement>(".tool-call-decision")?.hidden).toBe(true);
    expect(card.element.hasAttribute("data-decision")).toBe(false);
  });

  it("shows the x-summary label instead of the tool name when given", () => {
    const card = new ToolCallCard("query_model", { model: "Order" }, "Query orders");
    expect(card.element.querySelector(".tool-call-name")?.textContent).toBe("Query orders");
    // The raw name is still on the data attribute for selectors.
    expect(card.element.getAttribute("data-tool-name")).toBe("query_model");
  });
});
