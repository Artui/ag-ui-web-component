import { beforeEach } from "vitest";

/**
 * Clear both stores before every happy-dom test.
 *
 * The widget persists layout preferences to `localStorage` on purpose, so a
 * test that collapses a panel or drags a size leaves it there for the next one.
 * Teardowns here cleared `sessionStorage` alone, which was enough for as long
 * as `localStorage` did not exist.
 *
 * **It exists on CI and not on this machine**, which is why the suite was green
 * locally and red there. happy-dom implements no `localStorage` at all -- every
 * method is `undefined` -- but Node's own web storage is a global on the
 * versions CI runs, so the widget's writes landed somewhere real and outlived
 * the test that made them. A stored size then came back in a test that had
 * seeded a different one, or seeded nothing.
 *
 * Guarded, because the whole API is missing rather than throwing under
 * happy-dom: the object is there and the methods are not, so this has to
 * tolerate the call not existing rather than the store being absent.
 */
beforeEach(() => {
  for (const store of [globalThis.sessionStorage, globalThis.localStorage]) {
    try {
      store?.clear?.();
    } catch {
      // A store that refuses to be cleared is a store nothing was written to.
    }
  }
});
