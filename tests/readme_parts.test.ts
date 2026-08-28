/**
 * The README's parts list, checked against the parts the component sets.
 *
 * Part names are declared public API there ("additions are non-breaking; renames
 * are breaking"), and a host cannot style what it cannot know exists — a name
 * guessed wrong fails silently, so an undocumented part is not a part. The list
 * was thorough and still missed an entire feature: all twelve checkpoint-panel
 * parts, plus five strays from other features. It drifted because nothing read
 * it.
 *
 * Literal part names are collected from the source, so a new one that never
 * reaches the README fails here. The runtime-assembled names cannot be read that
 * way, so they are listed below with the call site that supplies each modifier —
 * and the *number* of such call sites is asserted, so adding one without
 * extending this list fails too.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Parts assembled at runtime, by the call site that builds them. */
const DYNAMIC: Record<string, readonly string[]> = {
  // ag_ui_chat #iconElement(slotName, part, …) — the header mark and the launcher's.
  "#iconElement": ["icon", "launcher-icon"],
  // ag_ui_chat #headerButton(modifier, …) — history / checkpoints / new / collapse.
  "#headerButton": [
    "header-button",
    "history-button",
    "checkpoints-button",
    "new-button",
    "collapse-button",
  ],
  // ag_ui_chat #appendNotice(icon, text, kind).
  run_notice: [
    "run-notice",
    "run-notice-interrupted",
    "run-notice-attachment-pending",
    "run-notice-compaction",
    "run-notice-skill",
    "run-notice-history-replaced",
    "run-notice-chart-undrawable",
  ],
  // ag_ui_chat message bubbles, by role.
  bubble: ["message", "message-user", "message-assistant"],
  approval_card: ["approval-button", "approval-approve", "approval-deny"],
  confirmation_card: ["confirm-button", "confirm-confirm", "confirm-cancel", "confirm-always"],
  // message_actions messageActionButton(modifier, …) — retry / copy / thumbs.
  message_actions: [
    "message-action",
    "message-action-retry",
    "message-action-copy",
    "message-action-up",
    "message-action-down",
  ],
  checkpoint_menu: ["checkpoint-action", "checkpoint-resume", "checkpoint-fork"],
  // tool_call_card #section(kind, …) — the arguments and result regions.
  tool_call_card: [
    "tool-card-args",
    "tool-card-result",
    "tool-card-section",
    "tool-card-args-section",
    "tool-card-result-section",
    "tool-card-section-label",
    "tool-card-args-label",
    "tool-card-result-label",
  ],
};

/**
 * How many `setAttribute("part", …)` calls build their value rather than stating
 * it. Every one is accounted for in {@link DYNAMIC}; a new one moves this number,
 * which is the point.
 */
const RUNTIME_ASSEMBLED = { template: 10, variable: 1 };

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    return entry.name.endsWith(".ts") ? [readFileSync(path, "utf8")] : [];
  });
}

const SOURCE = sources("src").join("\n");
const README = readFileSync("README.md", "utf8");

/** Every part name stated outright, one per token (a value may hold two). */
function literalParts(): string[] {
  const found = new Set<string>();
  for (const match of SOURCE.matchAll(/setAttribute\("part", "([^"]+)"\)/g)) {
    for (const token of (match[1] ?? "").split(" ")) {
      found.add(token);
    }
  }
  return [...found];
}

function count(pattern: RegExp): number {
  return [...SOURCE.matchAll(pattern)].length;
}

describe("the README's parts list", () => {
  it("names every part the component sets", () => {
    const documented = new Set(
      [...README.matchAll(/`([a-z][a-z0-9-]*)`/g)].map((match) => match[1] ?? ""),
    );
    const missing = [...literalParts(), ...Object.values(DYNAMIC).flat()]
      .filter((part) => !documented.has(part))
      .sort();

    expect(missing).toEqual([]);
  });

  it("accounts for every part it cannot read from the source", () => {
    // The literal scan above cannot see a value built from a modifier. These two
    // counts are the tripwire: add a template or variable form and this fails,
    // pointing at the list that has to grow with it.
    expect({
      template: count(/setAttribute\("part", `/g),
      variable: count(/setAttribute\("part", [a-z][A-Za-z]*\)/g),
    }).toEqual(RUNTIME_ASSEMBLED);
  });
});
