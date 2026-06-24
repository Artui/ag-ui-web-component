import { describe, expect, it } from "vitest";
import { relativeTime } from "../src/ui/relative_time.js";

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
});
