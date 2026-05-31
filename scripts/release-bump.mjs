#!/usr/bin/env node
// release-bump.mjs — bump version across src/version.ts + package.json + CHANGELOG.md.
//
// Usage:
//   node scripts/release-bump.mjs 0.2.0
//
// Driven by `make release-bump VERSION=X.Y.Z`. The mirror of bump-my-version's
// behaviour on the Python side: refuses to run on a dirty tree, rewrites
// version sources in lockstep, and promotes the [Unreleased] CHANGELOG section
// under a new dated heading.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function die(msg) {
  process.stderr.write(`release-bump: ${msg}\n`);
  process.exit(1);
}

function assertCleanTree() {
  const status = execSync("git status --porcelain", { cwd: ROOT, encoding: "utf8" }).trim();
  if (status) {
    die(`working tree is dirty; commit or stash first:\n${status}`);
  }
}

function extractCurrentVersion() {
  const versionFile = readFileSync(join(ROOT, "src/version.ts"), "utf8");
  const match = versionFile.match(/^export const VERSION[^=]*=\s*"([^"]+)"/m);
  if (!match) die("could not parse VERSION from src/version.ts");
  return match[1];
}

function rewriteVersionTs(next) {
  const path = join(ROOT, "src/version.ts");
  const before = readFileSync(path, "utf8");
  const after = before.replace(
    /^(export const VERSION[^=]*=\s*)"[^"]+"/m,
    `$1"${next}"`,
  );
  if (before === after) die("failed to rewrite src/version.ts");
  writeFileSync(path, after);
}

function rewritePackageJson(next) {
  const path = join(ROOT, "package.json");
  const pkg = JSON.parse(readFileSync(path, "utf8"));
  pkg.version = next;
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
}

function rewriteChangelog(current, next) {
  const path = join(ROOT, "CHANGELOG.md");
  const before = readFileSync(path, "utf8");
  const today = new Date().toISOString().slice(0, 10);

  let after = before.replace(
    /^## \[Unreleased\]$/m,
    `## [Unreleased]\n\n## [${next}] — ${today}`,
  );

  const compareLineRe = new RegExp(
    `^\\[Unreleased\\]: (https://[^/]+/[^/]+/[^/]+)/compare/v${current
      .replace(/\./g, "\\.")}\\.\\.\\.HEAD$`,
    "m",
  );
  const compareMatch = before.match(compareLineRe);
  if (!compareMatch) die(`CHANGELOG.md compare link for v${current} not found`);
  const repoUrl = compareMatch[1];
  after = after.replace(
    compareLineRe,
    `[Unreleased]: ${repoUrl}/compare/v${next}...HEAD\n[${next}]: ${repoUrl}/compare/v${current}...v${next}`,
  );

  if (before === after) die("failed to rewrite CHANGELOG.md");
  writeFileSync(path, after);
}

function main() {
  const next = process.argv[2];
  if (!next || !/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(next)) {
    die(`usage: node scripts/release-bump.mjs <X.Y.Z> (got: ${next ?? "<empty>"})`);
  }

  assertCleanTree();
  const current = extractCurrentVersion();
  if (current === next) die(`version is already ${current}`);

  rewriteVersionTs(next);
  rewritePackageJson(next);
  rewriteChangelog(current, next);

  process.stdout.write(`Bumped ${current} → ${next} in src/version.ts, package.json, CHANGELOG.md\n`);
}

main();
