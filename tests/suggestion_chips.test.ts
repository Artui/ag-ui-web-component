import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_SUGGESTION_CHARS,
  MAX_SUGGESTIONS,
  renderSuggestionChips,
  suggestionPrompts,
} from "../src/ui/suggestion_chips.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function render(content: unknown, onPick: (p: string) => void = () => {}): HTMLElement | null {
  return renderSuggestionChips(content, DEFAULT_UI_STRINGS, onPick);
}

describe("suggestionPrompts", () => {
  it("reads the prompts a well-formed activity carries", () => {
    expect(suggestionPrompts({ prompts: ["Ask again", "  Or this  "] })).toEqual([
      "Ask again",
      "Or this",
    ]);
  });

  it("draws no more than the server is allowed to send", () => {
    // The mirror of the producer's cap. Both sides carry the number because
    // this side drops silently and has no channel to report the difference --
    // the same hole the chart bounds exist to close.
    const many = Array.from({ length: MAX_SUGGESTIONS + 3 }, (_, i) => `p${i}`);

    expect(suggestionPrompts({ prompts: many })).toHaveLength(MAX_SUGGESTIONS);
  });

  it("drops a prompt too long to be a chip", () => {
    const long = "x".repeat(MAX_SUGGESTION_CHARS + 1);

    expect(suggestionPrompts({ prompts: [long, "fine"] })).toEqual(["fine"]);
  });

  it.each([
    ["not an object", "nope"],
    ["null", null],
    ["no prompts key", { other: 1 }],
    ["prompts not an array", { prompts: "Ask again" }],
    ["every entry unusable", { prompts: ["", "   ", 7] }],
  ])("reports nothing usable for %s", (_label, content) => {
    expect(suggestionPrompts(content)).toBeNull();
  });
});

describe("renderSuggestionChips", () => {
  it("draws one chip per prompt, labelled by the prompt itself", () => {
    const row = render({ prompts: ["Update the address", "Show the history"] });
    document.body.append(row as HTMLElement);

    const chips = [...document.querySelectorAll<HTMLButtonElement>(".suggestion-chip")];
    expect(chips.map((c) => c.textContent)).toEqual(["Update the address", "Show the history"]);
    // The label is the thing it sends, so an aria-label would only restate it.
    expect(chips[0]?.getAttribute("aria-label")).toBeNull();
    expect(row?.getAttribute("role")).toBe("group");
    expect(row?.getAttribute("aria-label")).toBe(DEFAULT_UI_STRINGS.suggestions);
  });

  it("sends the prompt when a chip is clicked", () => {
    const sent: string[] = [];
    const row = render({ prompts: ["Update the address"] }, (p) => sent.push(p));
    document.body.append(row as HTMLElement);

    document.querySelector<HTMLButtonElement>(".suggestion-chip")?.click();

    expect(sent).toEqual(["Update the address"]);
  });

  it("draws nothing rather than an empty row", () => {
    // `null` is the registry's signal to draw nothing -- the same contract the
    // chart renderer uses for a spec it cannot draw.
    expect(render({ prompts: [] })).toBeNull();
  });
});
