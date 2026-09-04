import { page } from "@vitest/browser/context";
import { beforeAll, beforeEach } from "vitest";

/**
 * Reset the state the browser context shares between test files.
 *
 * Both of these are owned by the context rather than by a file, so a file that
 * changes one leaves it changed for whatever runs next -- and the ordering that
 * decides who that is changes with coverage on. Both showed up the same way: a
 * handful of unrelated layout tests failing in one command and passing in
 * another.
 *
 * **The viewport**, because a file that narrows it to exercise the
 * small-viewport layout resizes it under everyone else.
 *
 * **Storage**, because the widget persists its own layout preferences there on
 * purpose. A file that collapses a panel leaves `ag-ui-chat:collapsed` behind,
 * and the next file's very first mount reads it and comes up as a 52px rail --
 * which reads as a placement that ignored the inset it was given, rather than
 * as a widget faithfully restoring somebody else's choice.
 *
 * Stating it here makes the guarantee per file rather than per polite
 * neighbour. A file that wants a different size or a seeded preference still
 * sets one; it just cannot hand it to anyone else.
 */
beforeAll(async () => {
  await page.viewport(1280, 800);
});

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
