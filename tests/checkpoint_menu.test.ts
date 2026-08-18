import { describe, expect, it, vi } from "vitest";
import type { RunRow } from "../src/core/run_index.js";
import { CheckpointMenu } from "../src/ui/checkpoint_menu.js";
import { DEFAULT_UI_STRINGS } from "../src/ui/ui_strings.js";

function row(overrides: Partial<RunRow> = {}): RunRow {
  return {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: new Date().toISOString(),
    continuable: true,
    ...overrides,
  };
}

function rows(menu: CheckpointMenu): HTMLElement[] {
  return [...menu.element.querySelectorAll(".checkpoint-row")] as HTMLElement[];
}

describe("rendering", () => {
  it("starts hidden", () => {
    expect(new CheckpointMenu(() => {}).element.hidden).toBe(true);
  });

  it("renders one row per run", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row(), row({ run_id: "r2" })]);
    expect(rows(menu)).toHaveLength(2);
  });

  it("shows an empty state when there is nothing to continue", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([]);

    expect(menu.element.querySelector(".checkpoints-empty")?.textContent).toBe(
      DEFAULT_UI_STRINGS.noCheckpoints,
    );
  });

  it("labels a row by when it started", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row()]);
    const label = menu.element.querySelector(".checkpoint-label") as HTMLElement;

    expect(label.textContent).toBe(DEFAULT_UI_STRINGS.justNow);
    // Not on the label: a full uuid in a `title` opened a tooltip over the whole
    // row on hover, in a row that is not otherwise interactive.
    expect(label.title).toBe("");
  });

  it("shows enough of the run id to tell two runs of the same minute apart", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([
      row({ run_id: "5087f329-a842-473f-b16b-881f7c91668d" }),
      row({ run_id: "c14b8a02-7d1e-4f77-9a30-2b6e5f0c8d41" }),
    ]);

    const shown = [...menu.element.querySelectorAll(".checkpoint-id")] as HTMLElement[];
    expect(shown.map((el) => el.textContent)).toEqual(["5087f329", "c14b8a02"]);
    expect(shown.map((el) => el.title)).toEqual([
      "5087f329-a842-473f-b16b-881f7c91668d",
      "c14b8a02-7d1e-4f77-9a30-2b6e5f0c8d41",
    ]);
    const labels = [...menu.element.querySelectorAll(".checkpoint-label")];
    expect(new Set(labels.map((el) => el.textContent)).size).toBe(1);
  });

  it("falls back to the run id when the server sent no timestamp", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row({ started_at: null })]);

    expect(menu.element.querySelector(".checkpoint-label")?.textContent).toBe("r1");
    // The label already *is* the id, so a second copy of it would be noise.
    expect(menu.element.querySelector(".checkpoint-id")).toBeNull();
  });

  it("leads with what the run was about when the server sends it", () => {
    // The whole point of the field: two runs a minute apart both read "just now",
    // and a run id is not something a person recognises.
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([
      row({ preview: "What is on the board?" }),
      row({ run_id: "r2", preview: "Import these three events" }),
    ]);

    expect(
      [...menu.element.querySelectorAll(".checkpoint-label")].map((el) => el.textContent),
    ).toEqual(["What is on the board?", "Import these three events"]);
    // The time is still shown, demoted to a chip; the id is no longer needed to
    // tell the rows apart, so it is not competing for the space.
    expect(
      [...menu.element.querySelectorAll(".checkpoint-time")].map((el) => el.textContent),
    ).toEqual([DEFAULT_UI_STRINGS.justNow, DEFAULT_UI_STRINGS.justNow]);
    expect(menu.element.querySelector(".checkpoint-id")).toBeNull();
  });

  it("keeps the id when a preview would be blank", () => {
    // A server older than the field sends nothing; a run seeded from history
    // alone sends null; an empty string is neither an identity nor a label. All
    // three fall back to what every row used to be.
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row(), row({ run_id: "r2", preview: null }), row({ run_id: "r3", preview: "" })]);

    expect([...menu.element.querySelectorAll(".checkpoint-id")]).toHaveLength(3);
    expect(menu.element.querySelector(".checkpoint-time")).toBeNull();
  });

  it("shows a preview even with no timestamp to go beside it", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row({ started_at: null, preview: "Move standup to Friday" })]);

    expect(menu.element.querySelector(".checkpoint-label")?.textContent).toBe(
      "Move standup to Friday",
    );
    expect(menu.element.querySelector(".checkpoint-time")).toBeNull();
    expect(menu.element.querySelector(".checkpoint-id")).toBeNull();
  });

  it("marks a forked run so it doesn't read as a duplicate", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row({ parent_run_id: "parent" })]);
    const branch = menu.element.querySelector(".checkpoint-branch") as HTMLElement;

    expect(branch.textContent).toBe(DEFAULT_UI_STRINGS.forkedRun);
    expect(branch.title).toBe("parent");
  });

  it("has no branch marker on a root run", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row()]);
    expect(menu.element.querySelector(".checkpoint-branch")).toBeNull();
  });

  it("replaces rows rather than appending on re-render", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row(), row({ run_id: "r2" })]);
    menu.setRuns([row({ run_id: "r3" })]);

    expect(rows(menu)).toHaveLength(1);
  });
});

describe("actions", () => {
  it("reports resume with the run id", () => {
    const picked = vi.fn();
    const menu = new CheckpointMenu(picked);
    menu.setRuns([row()]);
    (menu.element.querySelector(".checkpoint-resume") as HTMLButtonElement).click();

    expect(picked).toHaveBeenCalledWith("r1", "resume");
  });

  it("reports fork with the run id", () => {
    const picked = vi.fn();
    const menu = new CheckpointMenu(picked);
    menu.setRuns([row()]);
    (menu.element.querySelector(".checkpoint-fork") as HTMLButtonElement).click();

    expect(picked).toHaveBeenCalledWith("r1", "fork");
  });

  it("closes on pick, so the panel doesn't linger over the reply", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row()]);
    menu.open();
    (menu.element.querySelector(".checkpoint-resume") as HTMLButtonElement).click();

    expect(menu.element.hidden).toBe(true);
  });
});

describe("open state", () => {
  it("opens and closes", () => {
    const menu = new CheckpointMenu(() => {});
    menu.open();
    expect(menu.open_).toBe(true);
    menu.close();
    expect(menu.open_).toBe(false);
  });

  it("closes on Escape", () => {
    const menu = new CheckpointMenu(() => {});
    menu.open();
    menu.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(menu.element.hidden).toBe(true);
  });

  it("ignores other keys", () => {
    const menu = new CheckpointMenu(() => {});
    menu.open();
    menu.element.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(menu.element.hidden).toBe(false);
  });
});

describe("localization", () => {
  it("re-localizes a panel built before strings resolved", () => {
    const menu = new CheckpointMenu(() => {});
    menu.setRuns([row()]);
    menu.setStrings({ ...DEFAULT_UI_STRINGS, checkpoints: "Reprendre", resumeRun: "Reprendre" });

    expect(menu.element.getAttribute("aria-label")).toBe("Reprendre");
    expect(menu.element.querySelector(".checkpoints-title")?.textContent).toBe("Reprendre");
    expect(menu.element.querySelector(".checkpoint-resume")?.textContent).toBe("Reprendre");
  });

  it("accepts strings at construction", () => {
    const menu = new CheckpointMenu(() => {}, { ...DEFAULT_UI_STRINGS, checkpoints: "Weiter" });
    expect(menu.element.getAttribute("aria-label")).toBe("Weiter");
  });
});

describe("opening twice", () => {
  it("keeps the focus it was going to restore", () => {
    // Load-bearing idempotence: a second `open()` while open would record a
    // button *inside* the panel as "what had focus", and closing would then send
    // focus into a hidden dialog. Nothing in the built-in chrome does this any
    // more — the header button toggles — but `openCheckpoints()` is public and a
    // host may call it as often as it likes.
    const outside = document.createElement("button");
    document.body.append(outside);
    const menu = new CheckpointMenu(() => {});
    document.body.append(menu.element);
    menu.setRuns([row()]);
    outside.focus();

    menu.open();
    menu.open();
    menu.close();

    expect(document.activeElement).toBe(outside);
    outside.remove();
    menu.element.remove();
  });
});
