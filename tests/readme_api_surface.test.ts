/**
 * The README's "Public API surface" tables, checked against what the package
 * root actually re-exports.
 *
 * That section opens by claiming to be complete — "Everything below is
 * re-exported from the package root ... the only re-export point" — so a
 * consumer who reads it and finds no `renderChart` concludes the package has no
 * chart seam, rather than that the table is stale. It drifted a third of the way
 * out of date for the same reason the parts list did: nothing read it.
 *
 * Deliberately the same shape as the parts check next door — collect the names
 * from the source, collect the backticked names from the section, subtract.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const INDEX = readFileSync("src/index.ts", "utf8");
const README = readFileSync("README.md", "utf8");

/** Every name `src/index.ts` re-exports, values and types alike. */
function exported(): string[] {
  const names = new Set<string>();
  for (const block of INDEX.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}\s+from/g)) {
    for (const entry of (block[1] ?? "").split(",")) {
      // `type Foo` and `Foo as Bar` both reduce to the name a consumer imports.
      const name =
        entry
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)
          .at(-1) ?? "";
      if (name !== "") {
        names.add(name);
      }
    }
  }
  return [...names];
}

/** The section that claims to enumerate the surface, and nothing else. */
function apiSurfaceSection(): string {
  const start = README.indexOf("\n## Public API surface");
  const end = README.indexOf("\n## ", start + 1);
  if (start < 0 || end < 0) {
    throw new Error("expected a 'Public API surface' section in README.md");
  }
  return README.slice(start, end);
}

/** Every name the section states, one per token (a cell may list several). */
function documented(): Set<string> {
  const found = new Set<string>();
  for (const match of apiSurfaceSection().matchAll(/`([^`]+)`/g)) {
    for (const token of (match[1] ?? "").split("/")) {
      // Rows name functions by their call shape: `mergeUiStrings(overrides)`.
      found.add(
        token
          .trim()
          .replace(/\(.*\)$/, "")
          .trim(),
      );
    }
  }
  return found;
}

describe("the README's public API surface", () => {
  it("names every symbol the package root re-exports", () => {
    const known = documented();
    const missing = exported()
      .filter((name) => !known.has(name))
      .sort();

    expect(missing).toEqual([]);
  });
});
