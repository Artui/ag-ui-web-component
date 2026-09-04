import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { showHighlightOverlay } from "../../src/dom/highlight_overlay.js";

/**
 * Where the overlay reads its theming from.
 *
 * From the element being pointed at, not from itself. The overlay is appended
 * to the document body so it can escape the clipping it exists to avoid, and
 * that means a `var()` in its own inline style resolves against the body's
 * cascade -- so a host theming the widget the documented way, on `ag-ui-chat`
 * or on a wrapper above it, would never reach it. Its inline styles also beat
 * any rule a host could write, and `::part` does not reach the light DOM, so
 * getting this wrong leaves the overlay the one surface with no way in at all.
 */

function makeTarget(styles = ""): HTMLElement {
  const scope = document.createElement("div");
  scope.className = "probe-scope";
  scope.style.cssText = styles;
  const el = document.createElement("div");
  el.style.cssText = "position:absolute;left:200px;top:160px;width:240px;height:80px";
  scope.appendChild(el);
  document.body.appendChild(scope);
  return el;
}

function overlay(): HTMLElement {
  const root = document.querySelector("[data-ag-ui-highlight]");
  if (root === null) {
    throw new Error("no overlay");
  }
  return root as HTMLElement;
}

describe("highlight overlay theming (real browser)", () => {
  const dismissers: Array<() => void> = [];

  beforeAll(() => {
    document.body.style.margin = "0";
  });

  afterEach(() => {
    for (const dismiss of dismissers.splice(0)) {
      dismiss();
    }
    for (const el of document.querySelectorAll(".probe-scope")) {
      el.remove();
    }
  });

  function show(target: HTMLElement, options: Parameters<typeof showHighlightOverlay>[1]) {
    dismissers.push(showHighlightOverlay(target, options));
  }

  it("takes the scrim colour from the target's cascade", () => {
    show(makeTarget("--ag-ui-highlight-scrim: rgb(0, 100, 0)"), { scrim: true });

    const scrim = overlay().firstElementChild as HTMLElement;
    expect(getComputedStyle(scrim).backgroundColor).toBe("rgb(0, 100, 0)");
  });

  it("takes the ring colour from the accent the host already themes", () => {
    // The same token that colours the flat ring, so one declaration themes both.
    show(makeTarget("--ag-ui-accent: rgb(200, 0, 0)"), {});

    const ring = overlay().lastElementChild as HTMLElement;
    expect(getComputedStyle(ring).borderTopColor).toBe("rgb(200, 0, 0)");
  });

  it("takes the ring width from a token, and from an option over that", () => {
    show(makeTarget("--ag-ui-highlight-ring-width: 7"), {});
    expect(getComputedStyle(overlay().lastElementChild as HTMLElement).borderTopWidth).toBe("7px");

    dismissers.splice(0);
    for (const node of document.querySelectorAll("[data-ag-ui-highlight]")) {
      node.remove();
    }

    show(makeTarget("--ag-ui-highlight-ring-width: 7"), { ringWidth: 2 });
    expect(getComputedStyle(overlay().lastElementChild as HTMLElement).borderTopWidth).toBe("2px");
  });

  it("takes the gradient and its speed from tokens", () => {
    show(makeTarget("--ag-ui-highlight-flow-ms: 600"), { gradient: true });

    const ring = overlay().lastElementChild as HTMLElement;
    const [animation] = ring.getAnimations();
    expect((animation?.effect?.getTiming().duration ?? 0) as number).toBe(600);
  });

  it("takes its stacking order from a token, for a host that stacks higher", () => {
    show(makeTarget("--ag-ui-highlight-z-index: 12"), { scrim: true });

    expect(getComputedStyle(overlay()).zIndex).toBe("12");
  });

  it("falls back to the package defaults where the host themed nothing", () => {
    show(makeTarget(), { scrim: true });

    const ring = overlay().lastElementChild as HTMLElement;
    expect(getComputedStyle(ring).borderTopWidth).toBe("3px");
    expect(getComputedStyle(overlay()).zIndex).toBe("2147483001");
  });
});
