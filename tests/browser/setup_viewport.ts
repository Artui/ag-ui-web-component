import { page } from "@vitest/browser/context";
import { beforeAll } from "vitest";

/**
 * Give every browser test file the same viewport to start from.
 *
 * The viewport belongs to the browser context rather than to a file, so a file
 * that narrows it to exercise the small-viewport layout leaves it narrowed for
 * whatever runs next. Restoring it in that file's own teardown is not enough:
 * the ordering that decides who runs after it changes with coverage on, so the
 * symptom was a handful of unrelated layout tests failing in one command and
 * passing in another, by a couple of hundred pixels.
 *
 * Stating it here instead makes the guarantee per file rather than per polite
 * neighbour. A file that wants a different size still sets one; it just cannot
 * hand that size to anyone else.
 */
beforeAll(async () => {
  await page.viewport(1280, 800);
});
