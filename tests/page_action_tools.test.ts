import { describe, expect, it, vi } from "vitest";
import { X_DESTRUCTIVE_KEY } from "../src/constants.js";
import type { ClientTool } from "../src/tools/client_tool_registry.js";
import { createPageActionTools, PAGE_ACTIONS } from "../src/tools/page_action_tools.js";

/** Build the enabled tools as a name→tool map for terse lookups. */
function toolsByName(
  enabled: string[],
  resolve: (target: string) => HTMLElement | null = () => null,
): Record<string, ClientTool> {
  const map: Record<string, ClientTool> = {};
  for (const tool of createPageActionTools(new Set(enabled), resolve)) {
    map[tool.name] = tool;
  }
  return map;
}

describe("page action tools", () => {
  it("registers nothing when no actions are enabled", () => {
    expect(createPageActionTools(new Set(), () => null)).toEqual([]);
  });

  it("registers each tool by its opt-in token", () => {
    expect(Object.keys(toolsByName([PAGE_ACTIONS.SCROLL]))).toEqual(["scroll_to"]);
    expect(Object.keys(toolsByName([PAGE_ACTIONS.DRAG]))).toEqual(["drag_and_drop"]);
    expect(Object.keys(toolsByName([PAGE_ACTIONS.SCROLL, PAGE_ACTIONS.DRAG]))).toEqual([
      "scroll_to",
      "drag_and_drop",
    ]);
  });

  it("leaves page actions un-stamped as destructive (host gates via confirmPredicate)", () => {
    const tools = toolsByName([PAGE_ACTIONS.SCROLL, PAGE_ACTIONS.DRAG]);
    expect(tools["scroll_to"]?.parameters[X_DESTRUCTIVE_KEY]).toBeUndefined();
    expect(tools["drag_and_drop"]?.parameters[X_DESTRUCTIVE_KEY]).toBeUndefined();
  });

  describe("scroll_to", () => {
    it("scrolls to the top of the page", async () => {
      const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      const result = await toolsByName([PAGE_ACTIONS.SCROLL])["scroll_to"]?.handler({
        target: "top",
      });
      expect(spy).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });
      expect(result).toEqual({ scrolled: true, target: "top" });
      spy.mockRestore();
    });

    it("scrolls to the bottom of the page", async () => {
      const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
      const result = await toolsByName([PAGE_ACTIONS.SCROLL])["scroll_to"]?.handler({
        target: "bottom",
      });
      expect(spy).toHaveBeenCalledWith({ top: document.body.scrollHeight, behavior: "smooth" });
      expect(result).toEqual({ scrolled: true, target: "bottom" });
      spy.mockRestore();
    });

    it("scrolls a resolved element into view", async () => {
      const el = document.createElement("div");
      const spy = vi.spyOn(el, "scrollIntoView").mockImplementation(() => {});
      const tools = toolsByName([PAGE_ACTIONS.SCROLL], (target) => (target === "#row" ? el : null));
      const result = await tools["scroll_to"]?.handler({ target: "#row" });
      expect(spy).toHaveBeenCalledWith({ block: "center", inline: "nearest", behavior: "smooth" });
      expect(result).toEqual({ scrolled: true, target: "#row" });
    });

    it("errors cleanly when the target resolves to nothing", () => {
      const tools = toolsByName([PAGE_ACTIONS.SCROLL], () => null);
      expect(() => tools["scroll_to"]?.handler({ target: "#missing" })).toThrow(
        'no element matching "#missing"',
      );
    });

    it("coerces a missing target to the empty string", () => {
      const resolve = vi.fn(() => null);
      const tools = toolsByName([PAGE_ACTIONS.SCROLL], resolve);
      expect(() => tools["scroll_to"]?.handler({})).toThrow('no element matching ""');
      expect(resolve).toHaveBeenCalledWith("");
    });
  });

  describe("drag_and_drop", () => {
    it("fires the HTML5 drag sequence with a shared dataTransfer", async () => {
      const from = document.createElement("li");
      const to = document.createElement("li");
      document.body.append(from, to);
      const events: Array<{ type: string; hasData: boolean }> = [];
      for (const type of ["dragstart", "dragend"]) {
        from.addEventListener(type, (e) => {
          events.push({ type, hasData: (e as { dataTransfer?: unknown }).dataTransfer != null });
        });
      }
      for (const type of ["dragenter", "dragover", "drop"]) {
        to.addEventListener(type, (e) => {
          events.push({ type, hasData: (e as { dataTransfer?: unknown }).dataTransfer != null });
        });
      }
      const tools = toolsByName([PAGE_ACTIONS.DRAG], (target) =>
        target === "#a" ? from : target === "#b" ? to : null,
      );
      const result = await tools["drag_and_drop"]?.handler({ from: "#a", to: "#b" });

      expect(events.map((e) => e.type)).toEqual([
        "dragstart",
        "dragenter",
        "dragover",
        "drop",
        "dragend",
      ]);
      expect(events.every((e) => e.hasData)).toBe(true);
      expect(result).toEqual({ dragged: true, from: "#a", to: "#b" });
      from.remove();
      to.remove();
    });

    it("errors when the source resolves to nothing", () => {
      const tools = toolsByName([PAGE_ACTIONS.DRAG], () => null);
      expect(() => tools["drag_and_drop"]?.handler({ from: "#a", to: "#b" })).toThrow(
        'no element matching "#a"',
      );
    });

    it("errors when only the target resolves to nothing", () => {
      const from = document.createElement("div");
      const tools = toolsByName([PAGE_ACTIONS.DRAG], (target) => (target === "#a" ? from : null));
      expect(() => tools["drag_and_drop"]?.handler({ from: "#a", to: "#b" })).toThrow(
        'no element matching "#b"',
      );
    });

    it("coerces missing from/to to the empty string", () => {
      const from = document.createElement("div");
      const tools = toolsByName([PAGE_ACTIONS.DRAG], (target) => (target === "#a" ? from : null));
      // Missing `from` → resolves "" → null.
      expect(() => tools["drag_and_drop"]?.handler({})).toThrow('no element matching ""');
      // Present `from`, missing `to` → `to` resolves "" → null.
      expect(() => tools["drag_and_drop"]?.handler({ from: "#a" })).toThrow(
        'no element matching ""',
      );
    });
  });
});
