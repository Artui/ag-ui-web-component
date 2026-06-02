import { describe, expect, it } from "vitest";
import { parseSkills } from "../src/skills/parse_skills.js";

describe("parseSkills", () => {
  it("keeps valid skill objects", () => {
    const skills = parseSkills([
      { name: "a", title: "A", prompt: "do a" },
      { name: "b", title: "B", prompt: "do b", chip: true },
    ]);
    expect(skills).toHaveLength(2);
    expect(skills[0]?.name).toBe("a");
  });

  it("drops entries missing required string fields", () => {
    const skills = parseSkills([
      { name: "ok", title: "OK", prompt: "p" },
      { name: "no-title", prompt: "p" },
      { title: "no-name", prompt: "p" },
      { name: "x", title: "x" }, // no prompt
      "not-an-object",
      null,
      42,
    ]);
    expect(skills.map((s) => s.name)).toEqual(["ok"]);
  });

  it("returns an empty list for a non-array", () => {
    expect(parseSkills({ name: "x" })).toEqual([]);
    expect(parseSkills(null)).toEqual([]);
  });
});
