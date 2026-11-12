import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import type { ThreadMeta } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { ThreadDrawer } from "../src/ui/history/thread_drawer.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

/**
 * The conversation list grouped by age, and the host's say over when its search shows.
 *
 * Ages are counted from local midnight, so "today" is the calendar day the user
 * is in rather than the last twenty-four hours.
 */

defineAgUiChat();

const DAY = 24 * 60 * 60 * 1000;

function midnight(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function thread(id: string, updatedAt: number): ThreadMeta {
  return { threadId: id, title: id, preview: `preview ${id}`, updatedAt };
}

function build(): ThreadDrawer {
  const drawer = new ThreadDrawer({
    onSelect: () => undefined,
    onNew: () => undefined,
    onRename: () => undefined,
    onDelete: () => undefined,
  });
  document.body.appendChild(drawer.element);
  return drawer;
}

/** The list as read top to bottom: a heading as "# label", a row as its title. */
function outline(drawer: ThreadDrawer): string[] {
  const nodes = drawer.element.querySelectorAll(".drawer-group-label, .drawer-row-title");
  return [...nodes].map((node) =>
    node.classList.contains("drawer-group-label")
      ? `# ${node.textContent ?? ""}`
      : (node.textContent ?? ""),
  );
}

function filterShown(root: ParentNode): boolean {
  const filter = root.querySelector(".drawer-filter");
  if (!(filter instanceof HTMLInputElement)) {
    throw new Error("no filter");
  }
  return !filter.hidden;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("age groups", () => {
  const strings = DEFAULT_UI_STRINGS;

  it("draws Today, Previous 7 days and Older in that order, each over its own rows", () => {
    const drawer = build();
    const today = midnight() + 1000;
    drawer.setThreads(
      [thread("old", today - 30 * DAY), thread("now", today), thread("week", today - 3 * DAY)],
      "",
    );
    expect(outline(drawer)).toEqual([
      `# ${strings.threadsToday}`,
      "now",
      `# ${strings.threadsPreviousWeek}`,
      "week",
      `# ${strings.threadsOlder}`,
      "old",
    ]);
  });

  it("skips a group with no rows", () => {
    const drawer = build();
    drawer.setThreads([thread("now", Date.now()), thread("old", midnight() - 40 * DAY)], "");
    expect(outline(drawer)).toEqual([
      `# ${strings.threadsToday}`,
      "now",
      `# ${strings.threadsOlder}`,
      "old",
    ]);
  });

  it("draws no heading when every row falls in one group", () => {
    const drawer = build();
    drawer.setThreads([thread("a", Date.now()), thread("b", Date.now() - 1000)], "");
    expect(outline(drawer)).toEqual(["a", "b"]);
  });

  it("files a thread with no readable date under Older", () => {
    const drawer = build();
    drawer.setThreads([thread("now", Date.now()), thread("lost", Number.NaN)], "");
    expect(outline(drawer)).toEqual([
      `# ${strings.threadsToday}`,
      "now",
      `# ${strings.threadsOlder}`,
      "lost",
    ]);
  });

  it("puts the start of the seventh day back in Previous 7 days and the day before in Older", () => {
    const drawer = build();
    const start = midnight();
    drawer.setThreads(
      [thread("now", start), thread("edge", start - 7 * DAY), thread("past", start - 7 * DAY - 1)],
      "",
    );
    expect(outline(drawer)).toEqual([
      `# ${strings.threadsToday}`,
      "now",
      `# ${strings.threadsPreviousWeek}`,
      "edge",
      `# ${strings.threadsOlder}`,
      "past",
    ]);
  });

  it("keeps the groups of what a filter leaves", () => {
    const drawer = build();
    const now = Date.now();
    const threads = [
      ...Array.from({ length: 6 }, (_, i) => thread(`pad${i}`, now)),
      thread("match new", now),
      thread("match old", midnight() - 30 * DAY),
    ];
    drawer.setThreads(threads, "");
    const filter = drawer.element.querySelector(".drawer-filter") as HTMLInputElement;
    filter.value = "match";
    filter.dispatchEvent(new Event("input"));
    expect(outline(drawer)).toEqual([
      `# ${strings.threadsToday}`,
      "match new",
      `# ${strings.threadsOlder}`,
      "match old",
    ]);
  });

  it("gives the heading a part and no place in the tab order", () => {
    const drawer = build();
    drawer.setThreads([thread("now", Date.now()), thread("old", midnight() - 30 * DAY)], "");
    const labels = [...drawer.element.querySelectorAll(".drawer-group-label")];
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.getAttribute("part")).toBe("drawer-group-label");
      expect(label.matches("button, input, [tabindex]")).toBe(false);
    }
  });

  it("re-labels the headings with new strings", () => {
    const drawer = build();
    drawer.setThreads([thread("now", Date.now()), thread("old", midnight() - 30 * DAY)], "");
    drawer.setStrings({ ...strings, threadsToday: "Heute", threadsOlder: "Earlier" });
    expect(outline(drawer)).toEqual(["# Heute", "now", "# Earlier", "old"]);
  });
});

describe("search mode", () => {
  const few = [thread("a", Date.now()), thread("b", Date.now())];
  const lots = Array.from({ length: 12 }, (_, i) => thread(`t${i}`, Date.now()));

  it("always shows the search over a short list", () => {
    const drawer = build();
    drawer.setSearchMode("always");
    drawer.setThreads(few, "");
    expect(filterShown(drawer.element)).toBe(true);
  });

  it("never shows it over a long one", () => {
    const drawer = build();
    drawer.setSearchMode("never");
    drawer.setThreads(lots, "");
    expect(filterShown(drawer.element)).toBe(false);
  });

  it("keeps the threshold by default", () => {
    const drawer = build();
    drawer.setThreads(few, "");
    expect(filterShown(drawer.element)).toBe(false);
    drawer.setThreads(lots, "");
    expect(filterShown(drawer.element)).toBe(true);
  });

  it("clears a query when the search is turned off under it", () => {
    const drawer = build();
    drawer.setThreads(lots, "");
    const filter = drawer.element.querySelector(".drawer-filter") as HTMLInputElement;
    filter.value = "nothing matches";
    filter.dispatchEvent(new Event("input"));
    drawer.setSearchMode("never");
    expect(filter.value).toBe("");
    expect(drawer.element.querySelectorAll(".drawer-row")).toHaveLength(12);
  });
});

describe("data-threads-search", () => {
  function mount(value: string | null): AgUiChat {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    if (value !== null) {
      el.setAttribute("data-threads-search", value);
    }
    document.body.appendChild(el);
    return el;
  }

  it("hides the search under never however many threads there are", async () => {
    const el = mount(null);
    for (let i = 0; i < 9; i += 1) {
      el.conversationStore.saveMessages(`t${i}`, [
        { id: `u${i}`, role: "user", content: `thread ${i}` },
      ] as never);
    }
    const root = el.shadowRoot as ShadowRoot;
    root.querySelector<HTMLButtonElement>(".header-btn--history")?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(root.querySelectorAll(".drawer-row").length).toBeGreaterThanOrEqual(9);
    expect(filterShown(root)).toBe(true);
    el.setAttribute("data-threads-search", "never");
    expect(filterShown(root)).toBe(false);
  });

  it("shows the search over an empty list under always", () => {
    const el = mount("always");
    expect(filterShown(el.shadowRoot as ShadowRoot)).toBe(true);
  });

  it("is live, and an unknown value is the default", () => {
    const el = mount(null);
    const root = el.shadowRoot as ShadowRoot;
    expect(filterShown(root)).toBe(false);
    el.setAttribute("data-threads-search", "always");
    expect(filterShown(root)).toBe(true);
    el.setAttribute("data-threads-search", "sometimes");
    expect(filterShown(root)).toBe(false);
    el.setAttribute("data-threads-search", "always");
    el.removeAttribute("data-threads-search");
    expect(filterShown(root)).toBe(false);
  });
});
