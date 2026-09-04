import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { ThreadDrawer } from "../src/ui/thread_drawer.js";

/**
 * Narrowing a long conversation list.
 *
 * Client-side over what the drawer already holds: the server index is fetched
 * whole, so a query would be a round trip to filter a list that is already in
 * memory.
 */

function thread(id: string, title: string, preview: string): ThreadMeta {
  return { threadId: id, title, preview, updatedAt: Date.now() };
}

function many(count: number): ThreadMeta[] {
  return Array.from({ length: count }, (_, i) => thread(`t${i}`, `Thread ${i}`, `preview ${i}`));
}

function build(): { drawer: ThreadDrawer; root: HTMLDivElement } {
  const drawer = new ThreadDrawer({
    onSelect: () => undefined,
    onNew: () => undefined,
    onRename: () => undefined,
    onDelete: () => undefined,
  });
  document.body.appendChild(drawer.element);
  return { drawer, root: drawer.element };
}

function filterOf(root: HTMLElement): HTMLInputElement {
  const found = root.querySelector(".drawer-filter");
  if (!(found instanceof HTMLInputElement)) {
    throw new Error("no filter");
  }
  return found;
}

const rows = (root: HTMLElement): string[] =>
  [...root.querySelectorAll(".drawer-row-title")].map((n) => n.textContent ?? "");

function type(root: HTMLElement, value: string): void {
  const input = filterOf(root);
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("conversation list filter", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("stays out of the way until there is a list worth narrowing", () => {
    const { drawer, root } = build();

    drawer.setThreads(many(4), "t0");
    expect(filterOf(root).hidden).toBe(true);

    drawer.setThreads(many(9), "t0");
    expect(filterOf(root).hidden).toBe(false);
  });

  it("matches the title", () => {
    const { drawer, root } = build();
    drawer.setThreads(
      [thread("a", "Refund policy", "..."), thread("b", "Shipping times", "...")],
      "a",
    );

    type(root, "refund");

    expect(rows(root)).toEqual(["Refund policy"]);
  });

  it("matches the preview too, because the title is often a summary", () => {
    // The title is frequently the model's one-line summary, so the phrase the
    // user remembers is as likely to be inside the conversation as on it.
    const { drawer, root } = build();
    drawer.setThreads(
      [thread("a", "Untitled", "the parcel never arrived"), thread("b", "Other", "unrelated")],
      "a",
    );

    type(root, "parcel");

    expect(rows(root)).toEqual(["Untitled"]);
  });

  it("ignores case and surrounding space", () => {
    const { drawer, root } = build();
    drawer.setThreads([thread("a", "Refund policy", "...")], "a");

    type(root, "  REFUND  ");

    expect(rows(root)).toEqual(["Refund policy"]);
  });

  it("says a filter matched nothing, not that there is nothing", () => {
    // Two different situations wearing one sentence would be a small lie: "no
    // conversations yet" reads as data loss when a filter simply missed.
    const { drawer, root } = build();
    drawer.setThreads([thread("a", "Refund policy", "...")], "a");

    type(root, "zzz");

    const empty = root.querySelector(".drawer-empty");
    expect(empty?.textContent).toBe("No conversations match that.");

    drawer.setThreads([], "");
    expect(root.querySelector(".drawer-empty")?.textContent).toBe("No conversations yet.");
  });

  it("shows everything again when the box is cleared", () => {
    const { drawer, root } = build();
    drawer.setThreads([thread("a", "One", "..."), thread("b", "Two", "...")], "a");

    type(root, "one");
    expect(rows(root)).toEqual(["One"]);
    type(root, "");
    expect(rows(root)).toEqual(["One", "Two"]);
  });
});
