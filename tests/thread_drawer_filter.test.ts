import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { FILTER_FROM, ThreadDrawer } from "../src/ui/thread_drawer.js";

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

/**
 * The named threads, padded out to where the filter is on screen.
 *
 * Every filtering test has to go through a *visible* input: the drawer clears
 * its query when the control goes away, so a short list would be testing a
 * state the UI cannot be in -- typing into a hidden box -- and would keep
 * passing with the whole threshold deleted. The padding is named so it cannot
 * collide with what the queries look for.
 */
function withFilterShown(...named: ThreadMeta[]): ThreadMeta[] {
  const padding = Array.from({ length: FILTER_FROM - named.length }, (_, i) =>
    thread(`pad${i}`, `Padding ${i}`, `padding ${i}`),
  );
  return [...named, ...padding];
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

    // The boundary, not a number either side of it: at FILTER_FROM - 1 it is
    // away and at FILTER_FROM it is there, which is what pins both the
    // constant and the direction of the comparison.
    drawer.setThreads(many(FILTER_FROM - 1), "t0");
    expect(filterOf(root).hidden).toBe(true);

    drawer.setThreads(many(FILTER_FROM), "t0");
    expect(filterOf(root).hidden).toBe(false);
  });

  it("matches the title", () => {
    const { drawer, root } = build();
    drawer.setThreads(
      withFilterShown(thread("a", "Refund policy", "..."), thread("b", "Shipping times", "...")),
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
      withFilterShown(
        thread("a", "Untitled", "the parcel never arrived"),
        thread("b", "Other", "unrelated"),
      ),
      "a",
    );

    type(root, "parcel");

    expect(rows(root)).toEqual(["Untitled"]);
  });

  it("ignores case and surrounding space", () => {
    const { drawer, root } = build();
    drawer.setThreads(withFilterShown(thread("a", "Refund policy", "...")), "a");

    type(root, "  REFUND  ");

    expect(rows(root)).toEqual(["Refund policy"]);
  });

  it("says a filter matched nothing, not that there is nothing", () => {
    // Two different situations wearing one sentence would be a small lie: "no
    // conversations yet" reads as data loss when a filter simply missed.
    const { drawer, root } = build();
    drawer.setThreads(withFilterShown(thread("a", "Refund policy", "...")), "a");

    type(root, "zzz");

    const empty = root.querySelector(".drawer-empty");
    expect(empty?.textContent).toBe("No conversations match that.");

    drawer.setThreads([], "");
    expect(root.querySelector(".drawer-empty")?.textContent).toBe("No conversations yet.");
  });

  it("stops filtering when the list shrinks below the box's own threshold", () => {
    // The query has to go with the control that set it. A list that drops
    // under the threshold while a query matches nothing would otherwise show
    // "no conversations match that" over conversations that are right there,
    // with nothing on screen to clear -- and reopening the drawer does not
    // help, because only a new one would.
    const { drawer, root } = build();
    drawer.setThreads(many(FILTER_FROM), "t0");

    type(root, "zzz");
    expect(rows(root)).toEqual([]);

    drawer.setThreads(many(FILTER_FROM - 1), "t0");

    expect(filterOf(root).hidden).toBe(true);
    expect(filterOf(root).value).toBe("");
    expect(rows(root)).toHaveLength(FILTER_FROM - 1);
  });

  it("shows everything again when the box is cleared", () => {
    const { drawer, root } = build();
    const threads = withFilterShown(thread("a", "One", "..."), thread("b", "Two", "..."));
    drawer.setThreads(threads, "a");

    type(root, "one");
    expect(rows(root)).toEqual(["One"]);
    type(root, "");
    expect(rows(root)).toEqual(threads.map((meta) => meta.title));
  });
});
