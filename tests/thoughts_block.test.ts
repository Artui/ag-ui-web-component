import { describe, expect, it } from "vitest";
import { ThoughtsBlock } from "../src/ui/thoughts_block.js";
import { mergeUiStrings } from "../src/ui/ui_strings.js";

describe("ThoughtsBlock", () => {
  it("opens expanded and streaming, with the thinking label", () => {
    const block = new ThoughtsBlock();
    expect(block.element.getAttribute("part")).toBe("thoughts");
    expect(block.element.hasAttribute("data-streaming")).toBe(true);
    const toggle = block.element.querySelector(".thoughts-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(block.element.querySelector(".thoughts-label")?.textContent).toBe(
      "Assistant is thinking…",
    );
    expect(block.element.querySelector<HTMLElement>(".thoughts-body")?.hidden).toBe(false);
  });

  it("streams the running reasoning buffer into the body", () => {
    const block = new ThoughtsBlock();
    block.stream("Let me");
    block.stream("Let me think about this");
    expect(block.element.querySelector(".thoughts-body")?.textContent).toBe(
      "Let me think about this",
    );
  });

  it("collapses to the settled label, stopping the streaming state", () => {
    const block = new ThoughtsBlock();
    block.stream("reasoning…");
    block.collapse();
    expect(block.element.hasAttribute("data-streaming")).toBe(false);
    expect(block.element.querySelector(".thoughts-label")?.textContent).toBe("Thoughts");
    const toggle = block.element.querySelector(".thoughts-toggle");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(block.element.querySelector<HTMLElement>(".thoughts-body")?.hidden).toBe(true);
  });

  it("collapse is idempotent (the per-token text handler calls it repeatedly)", () => {
    const block = new ThoughtsBlock();
    block.collapse();
    block.collapse();
    expect(block.element.querySelector(".thoughts-toggle")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("the header toggle reopens and refolds the body", () => {
    const block = new ThoughtsBlock();
    block.collapse();
    const toggle = block.element.querySelector<HTMLButtonElement>(".thoughts-toggle");
    const body = block.element.querySelector<HTMLElement>(".thoughts-body");

    toggle?.click();
    expect(body?.hidden).toBe(false);
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");

    toggle?.click();
    expect(body?.hidden).toBe(true);
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
  });

  it("draws its labels from the string table", () => {
    const strings = mergeUiStrings({ thinking: "denkt nach…", thoughts: "Gedanken" });
    const block = new ThoughtsBlock(strings);
    expect(block.element.querySelector(".thoughts-label")?.textContent).toBe("denkt nach…");
    block.collapse();
    expect(block.element.querySelector(".thoughts-label")?.textContent).toBe("Gedanken");
  });
});
