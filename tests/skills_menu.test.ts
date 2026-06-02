import { afterEach, describe, expect, it } from "vitest";
import type { Skill } from "../src/skills/skill.js";
import { SkillsMenu } from "../src/ui/skills_menu.js";

afterEach(() => {
  document.body.innerHTML = "";
});

const SKILLS: Skill[] = [
  {
    name: "summarize",
    title: "Summarize",
    description: "sum it up",
    prompt: "Summarize.",
    chip: true,
  },
  { name: "draft", title: "Draft description", prompt: "Draft a description." },
  { name: "find", title: "Find records", description: "search", prompt: "Find {q}.", chip: true },
];

function menu(): { menu: SkillsMenu; picks: Skill[] } {
  const picks: Skill[] = [];
  const m = new SkillsMenu((s) => picks.push(s));
  m.setSkills(SKILLS);
  document.body.append(m.chips, m.palette);
  return { menu: m, picks };
}

function key(name: string): KeyboardEvent {
  return new KeyboardEvent("keydown", { key: name });
}

describe("SkillsMenu chips", () => {
  it("renders only chip:true skills when enabled", () => {
    const { menu: m } = menu();
    m.enableChips(true);
    const chips = m.chips.querySelectorAll(".skill-chip");
    expect(chips).toHaveLength(2);
    expect([...chips].map((c) => c.textContent)).toEqual(["Summarize", "Find records"]);
    expect(m.chips.hidden).toBe(false);
  });

  it("stays hidden when chips are disabled", () => {
    const { menu: m } = menu();
    m.enableChips(false);
    expect(m.chips.hidden).toBe(true);
    expect(m.chips.querySelectorAll(".skill-chip")).toHaveLength(0);
  });

  it("hides when enabled but no skill is a chip", () => {
    const picks: Skill[] = [];
    const m = new SkillsMenu((s) => picks.push(s));
    m.setSkills([{ name: "x", title: "X", prompt: "x" }]);
    m.enableChips(true);
    expect(m.chips.hidden).toBe(true);
  });

  it("picks a skill when its chip is clicked", () => {
    const { menu: m, picks } = menu();
    m.enableChips(true);
    m.chips.querySelector<HTMLButtonElement>(".skill-chip")?.click();
    expect(picks).toEqual([SKILLS[0]]);
  });
});

describe("SkillsMenu palette", () => {
  it("does not open when slash mode is disabled", () => {
    const { menu: m } = menu();
    m.onInput("/sum");
    expect(m.isOpen()).toBe(false);
  });

  it("opens and filters on a slash query, closes on non-slash input", () => {
    const { menu: m } = menu();
    m.enableSlash(true);
    m.onInput("/dr");
    expect(m.isOpen()).toBe(true);
    const items = m.palette.querySelectorAll(".skill-item");
    expect(items).toHaveLength(1);
    expect(items[0]?.querySelector(".skill-item-title")?.textContent).toBe("Draft description");
    // No description on the draft skill → no desc node.
    expect(items[0]?.querySelector(".skill-item-desc")).toBeNull();

    m.onInput("hello");
    expect(m.isOpen()).toBe(false);
  });

  it("closes when the query matches nothing", () => {
    const { menu: m } = menu();
    m.enableSlash(true);
    m.onInput("/zzz");
    expect(m.isOpen()).toBe(false);
  });

  it("shows the description line when present", () => {
    const { menu: m } = menu();
    m.enableSlash(true);
    m.onInput("/summarize");
    expect(m.palette.querySelector(".skill-item-desc")?.textContent).toBe("sum it up");
  });

  it("navigates with arrows (wrapping) and picks on Enter", () => {
    const { menu: m, picks } = menu();
    m.enableSlash(true);
    m.onInput("/"); // all three
    const selected = () =>
      [...m.palette.querySelectorAll(".skill-item")].findIndex(
        (el) => el.getAttribute("aria-selected") === "true",
      );
    expect(selected()).toBe(0);

    expect(m.onKeydown(key("ArrowDown"))).toBe(true);
    expect(selected()).toBe(1);
    expect(m.onKeydown(key("ArrowUp"))).toBe(true);
    expect(selected()).toBe(0);
    expect(m.onKeydown(key("ArrowUp"))).toBe(true); // wrap to last
    expect(selected()).toBe(2);

    expect(m.onKeydown(key("Enter"))).toBe(true);
    expect(picks).toEqual([SKILLS[2]]);
    expect(m.isOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    const { menu: m } = menu();
    m.enableSlash(true);
    m.onInput("/");
    expect(m.onKeydown(key("Escape"))).toBe(true);
    expect(m.isOpen()).toBe(false);
  });

  it("picks on item click", () => {
    const { menu: m, picks } = menu();
    m.enableSlash(true);
    m.onInput("/find");
    m.palette.querySelector<HTMLButtonElement>(".skill-item")?.click();
    expect(picks).toEqual([SKILLS[2]]);
  });

  it("ignores keydowns when closed and unrecognized keys when open", () => {
    const { menu: m } = menu();
    m.enableSlash(true);
    expect(m.onKeydown(key("Enter"))).toBe(false); // closed
    m.onInput("/");
    expect(m.onKeydown(key("a"))).toBe(false); // open, unrecognized
    expect(m.isOpen()).toBe(true);
  });
});
