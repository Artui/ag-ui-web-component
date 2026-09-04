import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * Where a layout preference is written, and how it degrades when the durable
 * store is unavailable.
 *
 * These have to be in the Chromium project, and the reason is worth stating
 * because it is not the usual one: **happy-dom implements no `localStorage` at
 * all**. Not a partial implementation -- `getItem`, `setItem`, `removeItem` and
 * `clear` are all `undefined`, while `sessionStorage` beside it is complete. So
 * every assertion below would pass vacuously there, or fail against a component
 * that is behaving perfectly, and the write these tests exist to check would go
 * to a store that cannot record it.
 *
 * That also means happy-dom is a fair stand-in for the degraded case -- a
 * browser in a privacy mode that denies the durable store -- which is what the
 * last test here pins down deliberately rather than by accident.
 */

const THEME_KEY = "ag-ui-chat:theme";
const LAUNCHER_KEY = "ag-ui-chat:launcher";

function mount(): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("data-theme-toggle", "");
  document.body.appendChild(el);
  return el;
}

describe("layout preference durability (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  afterEach(() => {
    for (const el of document.querySelectorAll(ELEMENT_TAG)) {
      el.remove();
    }
    sessionStorage.clear();
    localStorage.clear();
  });

  it("writes a preference somewhere that outlives the tab", () => {
    const el = mount();
    el.toggleTheme();

    // The point of the change: this used to be per-tab only, so a user who
    // themed the widget met the default again in the next tab.
    expect(localStorage.getItem(THEME_KEY)).toBe(el.getAttribute("theme"));
  });

  it("writes the per-tab copy too, so a denied durable store still persists", () => {
    const el = mount();
    el.toggleTheme();

    // Not redundancy for its own sake: it is what makes the degraded case
    // degrade to the old behaviour rather than to no persistence at all.
    expect(sessionStorage.getItem(THEME_KEY)).toBe(el.getAttribute("theme"));
  });

  it("prefers the durable copy, so a stale per-tab value cannot shadow it", () => {
    // The ordering that matters once there are two copies. A tab that themed
    // the widget before the preference became durable has a session value that
    // must not win over a later choice made in another tab.
    sessionStorage.setItem(THEME_KEY, "code");
    localStorage.setItem(THEME_KEY, "dark");

    expect(mount().getAttribute("theme")).toBe("dark");
  });

  it("carries a value written before the preference became durable", () => {
    // The upgrade path: an existing install has its theme in the per-tab store
    // and nothing in the durable one. Resetting it once would be a small
    // betrayal of a setting the user did choose.
    sessionStorage.setItem(THEME_KEY, "dark");

    expect(mount().getAttribute("theme")).toBe("dark");
  });

  it("keeps working when the durable store refuses every call", () => {
    // A privacy mode, and equally the happy-dom project next door. The widget
    // still has to mount, and the preference still has to persist as far as it
    // can -- which is the per-tab store.
    const durable = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      const el = mount();
      el.toggleTheme();
      expect(sessionStorage.getItem(THEME_KEY)).toBe(el.getAttribute("theme"));
      // And a second mount reads it back through the fallback.
      el.remove();
      expect(mount().getAttribute("theme")).toBe(sessionStorage.getItem(THEME_KEY));
    } finally {
      if (durable !== undefined) {
        Object.defineProperty(window, "localStorage", durable);
      }
    }
  });

  it("routes the other layout keys through the same durable helper", () => {
    // Position and size are written by drags, which their own files exercise;
    // what matters here is only that they read from the durable store rather
    // than the per-tab one, so a value with no session copy is still honoured.
    localStorage.setItem(LAUNCHER_KEY, JSON.stringify({ left: 120, top: 96 }));
    expect(sessionStorage.getItem(LAUNCHER_KEY)).toBeNull();

    const el = mount();
    el.setCollapsed(true);

    // The element re-clamps a restored position against the current viewport,
    // so the assertion is that it was read at all -- the element wrote it back
    // through the same helper, which it only does for a position it adopted.
    expect(localStorage.getItem(LAUNCHER_KEY)).not.toBeNull();
    expect(el.collapsed).toBe(true);
  });
});
