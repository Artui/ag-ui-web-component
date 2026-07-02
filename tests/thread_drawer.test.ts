import { describe, expect, it, vi } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { ThreadDrawer } from "../src/ui/thread_drawer.js";

function make() {
  const callbacks = {
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
  };
  return { drawer: new ThreadDrawer(callbacks), callbacks };
}

const META: ThreadMeta = {
  threadId: "t1",
  title: "Trip planning",
  updatedAt: Date.now(),
  preview: "book a flight",
};

function $(drawer: ThreadDrawer, selector: string): HTMLElement | null {
  return drawer.element.querySelector<HTMLElement>(selector);
}

function press(input: HTMLElement, key: string): void {
  input.dispatchEvent(new KeyboardEvent("keydown", { key }));
}

describe("ThreadDrawer", () => {
  it("starts hidden and toggles open/closed", () => {
    const { drawer } = make();
    expect(drawer.isOpen()).toBe(false);
    drawer.open();
    expect(drawer.isOpen()).toBe(true);
    drawer.close();
    expect(drawer.isOpen()).toBe(false);
    drawer.toggle();
    expect(drawer.isOpen()).toBe(true);
  });

  it("shows an empty state with no threads", () => {
    const { drawer } = make();
    drawer.setThreads([], "");
    expect($(drawer, ".drawer-empty")?.textContent).toBe("No conversations yet.");
  });

  it("renders a row per thread and highlights the active one", () => {
    const { drawer } = make();
    drawer.setThreads([META, { ...META, threadId: "t2", title: "Other" }], "t1");
    const rows = drawer.element.querySelectorAll(".drawer-row");
    expect(rows).toHaveLength(2);
    expect($(drawer, ".drawer-row-title")?.textContent).toBe("Trip planning");
    expect($(drawer, ".drawer-row-preview")?.textContent).toBe("book a flight");
    expect(rows[0]?.classList.contains("drawer-row--active")).toBe(true);
    expect(rows[1]?.classList.contains("drawer-row--active")).toBe(false);
  });

  it("selecting a row closes the drawer and reports the thread", () => {
    const { drawer, callbacks } = make();
    drawer.open();
    drawer.setThreads([META], "other");
    $(drawer, ".drawer-row-select")?.click();
    expect(callbacks.onSelect).toHaveBeenCalledWith("t1");
    expect(drawer.isOpen()).toBe(false);
  });

  it("the New chat button closes the drawer and reports it", () => {
    const { drawer, callbacks } = make();
    drawer.open();
    $(drawer, ".drawer-new")?.click();
    expect(callbacks.onNew).toHaveBeenCalledTimes(1);
    expect(drawer.isOpen()).toBe(false);
  });

  it("clicking the backdrop closes the drawer", () => {
    const { drawer } = make();
    drawer.open();
    $(drawer, ".drawer-backdrop")?.click();
    expect(drawer.isOpen()).toBe(false);
  });

  it("renames a row inline on Enter", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-rename")?.click();
    const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
    expect(input.value).toBe("Trip planning");
    input.value = "  Holiday  ";
    press(input, "Enter");
    expect(callbacks.onRename).toHaveBeenCalledWith("t1", "Holiday");
  });

  it("an empty rename is cancelled, not committed", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-rename")?.click();
    const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
    input.value = "   ";
    press(input, "Enter");
    expect(callbacks.onRename).not.toHaveBeenCalled();
    expect($(drawer, ".drawer-row-select")).not.toBeNull(); // row restored
  });

  it("Escape cancels a rename", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-rename")?.click();
    press($(drawer, ".drawer-rename-input") as HTMLElement, "Escape");
    expect(callbacks.onRename).not.toHaveBeenCalled();
    expect($(drawer, ".drawer-row-select")).not.toBeNull();
  });

  it("an unrelated key during rename does nothing", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-rename")?.click();
    press($(drawer, ".drawer-rename-input") as HTMLElement, "a");
    expect(callbacks.onRename).not.toHaveBeenCalled();
    expect($(drawer, ".drawer-rename-input")).not.toBeNull(); // still editing
  });

  it("deletes a row after the inline confirm", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-delete")?.click();
    expect($(drawer, ".drawer-confirm-label")?.textContent).toBe("Delete?");
    $(drawer, ".drawer-confirm-yes")?.click();
    expect(callbacks.onDelete).toHaveBeenCalledWith("t1");
  });

  it("cancelling the delete confirm restores the row", () => {
    const { drawer, callbacks } = make();
    drawer.setThreads([META], "t1");
    $(drawer, ".drawer-row-delete")?.click();
    $(drawer, ".drawer-confirm-no")?.click();
    expect(callbacks.onDelete).not.toHaveBeenCalled();
    expect($(drawer, ".drawer-row-select")).not.toBeNull();
  });

  it("toggle closes an open drawer; open/close are idempotent", () => {
    const { drawer } = make();
    drawer.open();
    drawer.open(); // no-op while open
    expect(drawer.isOpen()).toBe(true);
    drawer.toggle();
    expect(drawer.isOpen()).toBe(false);
    drawer.close(); // no-op while closed
    expect(drawer.isOpen()).toBe(false);
  });

  it("is a labelled modal dialog", () => {
    const { drawer } = make();
    const panel = $(drawer, ".drawer-panel");
    expect(panel?.getAttribute("role")).toBe("dialog");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
    expect(panel?.getAttribute("aria-label")).toBe("Chat history");
  });

  describe("focus + keyboard", () => {
    function mounted() {
      const m = make();
      document.body.append(m.drawer.element);
      return m;
    }

    it("moves focus into the panel on open and restores it on close", () => {
      const { drawer } = mounted();
      const opener = document.createElement("button");
      document.body.append(opener);
      opener.focus();
      drawer.open();
      expect(document.activeElement).toBe($(drawer, ".drawer-new"));
      drawer.close();
      expect(document.activeElement).toBe(opener);
      drawer.element.remove();
      opener.remove();
    });

    it("Escape closes the drawer", () => {
      const { drawer } = mounted();
      drawer.setThreads([META], "t1");
      drawer.open();
      const panel = $(drawer, ".drawer-panel") as HTMLElement;
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(drawer.isOpen()).toBe(false);
      drawer.element.remove();
    });

    it("traps Tab focus at the panel edges and ignores the middle", () => {
      const { drawer } = mounted();
      drawer.setThreads([META], "t1");
      drawer.open();
      const panel = $(drawer, ".drawer-panel") as HTMLElement;
      const focusables = Array.from(panel.querySelectorAll<HTMLElement>("button, input")).filter(
        (el) => !el.hidden,
      );
      const first = focusables[0] as HTMLElement;
      const last = focusables.at(-1) as HTMLElement;
      expect(first).not.toBe(last);

      // Tab off the last wraps to the first.
      last.focus();
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      expect(document.activeElement).toBe(first);

      // Shift+Tab off the first wraps to the last.
      first.focus();
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
      expect(document.activeElement).toBe(last);

      // Neither edge (Tab on first / Shift+Tab on last): focus is left alone.
      first.focus();
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));
      expect(document.activeElement).toBe(first);
      last.focus();
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
      expect(document.activeElement).toBe(last);

      // A non-Tab, non-Escape key is ignored.
      panel.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(drawer.isOpen()).toBe(true);
      drawer.element.remove();
    });

    it("commits a rename on blur", () => {
      const { drawer, callbacks } = mounted();
      drawer.setThreads([META], "t1");
      $(drawer, ".drawer-row-rename")?.click();
      const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
      input.value = "Blurred";
      input.dispatchEvent(new Event("blur"));
      expect(callbacks.onRename).toHaveBeenCalledWith("t1", "Blurred");
      drawer.element.remove();
    });

    it("an unchanged rename is not committed", () => {
      const { drawer, callbacks } = mounted();
      drawer.setThreads([META], "t1");
      $(drawer, ".drawer-row-rename")?.click();
      const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
      // Value left equal to the title → treated as a no-op cancel.
      press(input, "Enter");
      expect(callbacks.onRename).not.toHaveBeenCalled();
      expect($(drawer, ".drawer-row-select")).not.toBeNull();
      drawer.element.remove();
    });

    it("Enter then blur commits only once", () => {
      const { drawer, callbacks } = mounted();
      drawer.setThreads([META], "t1");
      $(drawer, ".drawer-row-rename")?.click();
      const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
      input.value = "Once";
      press(input, "Enter");
      input.dispatchEvent(new Event("blur"));
      expect(callbacks.onRename).toHaveBeenCalledTimes(1);
      drawer.element.remove();
    });

    it("a second cancel key after the first is a no-op", () => {
      const { drawer, callbacks } = mounted();
      drawer.setThreads([META], "t1");
      $(drawer, ".drawer-row-rename")?.click();
      const input = $(drawer, ".drawer-rename-input") as HTMLInputElement;
      press(input, "Escape"); // cancels the edit (done)
      press(input, "Escape"); // second cancel is guarded out
      expect(callbacks.onRename).not.toHaveBeenCalled();
      drawer.element.remove();
    });
  });
});
