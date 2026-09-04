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
  // The property *read* is inside the try as well as the call. A test that
  // installs a throwing `localStorage` getter -- which is how the durable path
  // is exercised -- throws on the access itself, and a guard sitting outside
  // the try is a guard the one failure it exists for jumps straight over.
  for (const name of ["sessionStorage", "localStorage"] as const) {
    try {
      globalThis[name]?.clear?.();
    } catch {
      // A store that refuses to be read or cleared is one nothing reached.
    }
  }
});
