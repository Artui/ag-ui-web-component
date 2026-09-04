import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Two projects, one coverage report.
 *
 * **happy-dom** runs the bulk of the suite: fast, and perfectly adequate for
 * DOM plumbing, events and component lifecycle.
 *
 * **chromium** runs the sanitisation tests, and it is not an optimisation —
 * it is a correctness requirement. DOMPurify 3.4.8+ silently stops sanitising
 * under happy-dom: `<script>` and `<img>` pass straight through, and even
 * ordinary markdown loses its `<p>` wrapper. A green happy-dom run is
 * therefore compatible with the sanitiser doing nothing at all, which is the
 * one failure this component must never ship.
 *
 * Verified 2026-08-07: dompurify 3.4.13 sanitises correctly in Chromium and
 * not at all under happy-dom — so the bug is happy-dom's DOM emulation, not a
 * DOMPurify regression, and consumers were never exposed. That is what let the
 * exact-version pin on `dompurify` lift.
 */
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
    projects: [
      {
        test: {
          name: "happy-dom",
          environment: "happy-dom",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/browser/**"],
        },
      },
      {
        test: {
          name: "chromium",
          include: ["tests/browser/**/*.browser.test.ts"],
          // Every browser file starts from the same viewport. See the file for
          // why a teardown in the one file that changes it is not enough.
          setupFiles: ["tests/browser/setup_viewport.ts"],
          // One file at a time. The viewport belongs to the browser context
          // rather than to a file, so a test that narrows it to exercise the
          // small-viewport layout resizes it under every file running beside
          // it -- which showed up as unrelated layout tests failing in a way
          // that depended on scheduling. Serial is the only way a stated
          // viewport means anything here.
          fileParallelism: false,
          browser: {
            enabled: true,
            // Vitest 4 takes a provider *instance* from its own package rather
            // than the string `"playwright"`. With v8 coverage the string form
            // is a hard error, not a deprecation — so this is the only spelling
            // that keeps one unified coverage report across both projects.
            provider: playwright(),
            headless: true,
            // A stated desktop viewport, not the runner's default. The
            // component now has a small-viewport layout below 600px, and the
            // default headless window is narrower than that -- so every
            // placement test silently measured the mobile shape instead of the
            // one it named. The tests that mean to exercise the breakpoint set
            // their own size.
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
