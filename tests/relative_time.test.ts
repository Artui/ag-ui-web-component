import { describe, expect, it } from "vitest";
import { relativeTime } from "../src/ui/relative_time.js";
import { ThreadDrawer } from "../src/ui/thread_drawer.js";

const NOW = 1_000_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("reads under a minute as 'just now'", () => {
    expect(relativeTime(NOW - 30 * SECOND, NOW)).toBe("just now");
  });

  it("formats minutes, hours, days, and weeks", () => {
    expect(relativeTime(NOW - 5 * MINUTE, NOW)).toBe("5m ago");
    expect(relativeTime(NOW - 3 * HOUR, NOW)).toBe("3h ago");
    expect(relativeTime(NOW - 2 * DAY, NOW)).toBe("2d ago");
    expect(relativeTime(NOW - 21 * DAY, NOW)).toBe("3w ago");
  });

  it("treats a future timestamp (clock skew) as 'just now'", () => {
    expect(relativeTime(NOW + 10 * SECOND, NOW)).toBe("just now");
  });

  it("defaults the reference point to now", () => {
    expect(relativeTime(Date.now())).toBe("just now");
  });

  it("treats a non-finite timestamp (unparseable/missing date) as 'just now'", () => {
    expect(relativeTime(Number.NaN, NOW)).toBe("just now");
    expect(relativeTime(Number.POSITIVE_INFINITY, NOW)).toBe("just now");
  });
});

describe("the formatter seam", () => {
  it("hands the thread drawer's timestamps to the host's own formatter", () => {
    const drawer = new ThreadDrawer({
      onSelect: () => {},
      onNew: () => {},
      onRename: () => {},
      onDelete: () => {},
    });
    document.body.append(drawer.element);
    // What a host actually reaches for, and the reason the built-in is not it:
    // there is no `Intl` anywhere in this component, so it never disagrees with
    // the page it is embedded in by guessing a locale.
    drawer.setRelativeTimeFormatter(() => "vor 5 Minuten");
    drawer.setThreads(
      [{ threadId: "t1", title: "One", updatedAt: Date.now() - 300_000, preview: "" }],
      "t1",
    );

    const shown = [...drawer.element.querySelectorAll(".drawer-row-time")].map(
      (e) => e.textContent,
    );
    expect(shown).toEqual(["vor 5 Minuten"]);
  });

  it("puts the built-in back when the host clears it", () => {
    const drawer = new ThreadDrawer({
      onSelect: () => {},
      onNew: () => {},
      onRename: () => {},
      onDelete: () => {},
    });
    document.body.append(drawer.element);
    drawer.setRelativeTimeFormatter(() => "custom");
    drawer.setRelativeTimeFormatter(null);
    drawer.setThreads(
      [{ threadId: "t1", title: "One", updatedAt: Date.now() - 300_000, preview: "" }],
      "t1",
    );

    expect(drawer.element.querySelector(".drawer-row-time")?.textContent).toBe("5m ago");
  });
});
