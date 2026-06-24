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
});
