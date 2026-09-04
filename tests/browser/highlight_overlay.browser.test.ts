import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { flash } from "../../src/dom/animations.js";
import { showHighlightOverlay } from "../../src/dom/highlight_overlay.js";

/**
 * The overlay that points at a host-page element from outside it.
 *
 * Chromium rather than happy-dom, and not only because the assertions are
 * geometric. The two things this exists for -- a `clip-path` cut-out and a
 * gradient masked to a border box -- are exactly the kind of declaration a
 * browser drops silently when it cannot parse it. Nothing throws, nothing
 * warns, and the scrim simply covers the element it was meant to reveal. Only
 * a real engine resolving a used value can tell a rule that applied from one
 * that was discarded.
 */

/** Where the target sits, well clear of the viewport edges. */
const TARGET = { left: 200, top: 160, width: 240, height: 80 };

function makeTarget(): HTMLElement {
  const el = document.createElement("div");
  el.className = "probe-target";
  el.style.cssText = [
    "position: absolute",
    `left: ${TARGET.left}px`,
    `top: ${TARGET.top}px`,
    `width: ${TARGET.width}px`,
    `height: ${TARGET.height}px`,
    "border-radius: 8px",
    "background: #ccc",
  ].join(";");
  document.body.appendChild(el);
  return el;
}

function overlay(): HTMLElement | null {
  return document.querySelector("[data-ag-ui-highlight]");
}

function ringOf(): HTMLElement {
  const root = overlay();
  if (root === null) {
    throw new Error("no overlay");
  }
  return root.lastElementChild as HTMLElement;
}

const settle = (): Promise<null> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)));

describe("highlight overlay (real browser)", () => {
  const dismissers: Array<() => void> = [];

  beforeAll(() => {
    document.body.style.margin = "0";
  });

  afterEach(() => {
    for (const dismiss of dismissers.splice(0)) {
      dismiss();
    }
    for (const el of document.querySelectorAll(".probe-target")) {
      el.remove();
    }
    window.scrollTo(0, 0);
  });

  function show(target: HTMLElement, options: Parameters<typeof showHighlightOverlay>[1]) {
    const dismiss = showHighlightOverlay(target, options);
    dismissers.push(dismiss);
    return dismiss;
  }

  it("rings the target from outside it, with a gap", async () => {
    const target = makeTarget();
    show(target, {});
    await settle();

    const ring = ringOf().getBoundingClientRect();
    // Four either side: the ring sits outside the target's own box, which is
    // the whole point of not being an outline on it.
    expect(ring.left).toBeCloseTo(TARGET.left - 4, 0);
    expect(ring.width).toBeCloseTo(TARGET.width + 8, 0);
  });

  it("honours a stated gap and radius", async () => {
    const target = makeTarget();
    show(target, { padding: 12, radius: 0 });
    await settle();

    const ring = ringOf();
    expect(ring.getBoundingClientRect().left).toBeCloseTo(TARGET.left - 12, 0);
    // Radius stated as zero plus the gap, rather than the target's own 8.
    expect(getComputedStyle(ring).borderRadius).toBe("12px");
  });

  it("takes the target's own radius when none is stated", async () => {
    const target = makeTarget();
    show(target, {});
    await settle();

    expect(getComputedStyle(ringOf()).borderRadius).toBe("12px");
  });

  it("cuts a hole in the scrim rather than covering the target", async () => {
    const target = makeTarget();
    show(target, { scrim: true });
    await settle();

    const scrim = overlay()?.firstElementChild as HTMLElement;
    const clip = getComputedStyle(scrim).clipPath;
    // A clip-path the browser could not parse is dropped in silence and the
    // scrim covers what it was meant to reveal, so the assertion is that a
    // used value survived -- not that the string was written.
    expect(clip).toContain("path");
    expect(clip).not.toBe("none");
    expect(getComputedStyle(scrim).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
  });

  it("draws no scrim unless one was asked for", async () => {
    const target = makeTarget();
    show(target, {});
    await settle();

    // Only the ring, so the page is not dimmed by a plain highlight.
    expect(overlay()?.children.length).toBe(1);
  });

  it("takes no pointer events, so the page stays usable and clickable", async () => {
    const target = makeTarget();
    let clicked = false;
    target.addEventListener("click", () => {
      clicked = true;
    });
    show(target, { scrim: true });
    await settle();

    // Through the cut-out...
    const hit = document.elementFromPoint(
      TARGET.left + TARGET.width / 2,
      TARGET.top + TARGET.height / 2,
    );
    expect(hit).toBe(target);
    (hit as HTMLElement).click();
    expect(clicked).toBe(true);

    // ...and through the dimmed part, which is the half that makes it inert
    // rather than a modal nobody opened.
    const outside = document.elementFromPoint(TARGET.left + TARGET.width + 120, TARGET.top);
    expect(outside === null || !overlay()?.contains(outside)).toBe(true);
  });

  it("masks the gradient to the ring rather than filling the box", async () => {
    const target = makeTarget();
    show(target, { gradient: true });
    await settle();

    const style = getComputedStyle(ringOf());
    // A mask that failed to parse leaves a filled rectangle sitting over the
    // element it was supposed to frame. The computed value carries one entry
    // per mask layer -- "exclude, exclude" -- so this asks whether the
    // composite survived rather than comparing the whole string.
    expect(style.maskComposite).toContain("exclude");
    expect(style.maskClip).toContain("content-box");
    expect(style.backgroundImage).toContain("gradient");
  });

  it("animates the gradient, and only the gradient", async () => {
    const plain = makeTarget();
    show(plain, {});
    await settle();
    expect(ringOf().getAnimations().length).toBe(0);
    for (const dismiss of dismissers.splice(0)) {
      dismiss();
    }

    const target = makeTarget();
    show(target, { gradient: true });
    await settle();
    expect(ringOf().getAnimations().length).toBe(1);
  });

  it("draws the gradient but stops it travelling under reduced motion", async () => {
    const query = window.matchMedia;
    window.matchMedia = ((q: string) =>
      q.includes("reduce")
        ? ({ matches: true, media: q } as MediaQueryList)
        : query.call(window, q)) as typeof window.matchMedia;
    try {
      const target = makeTarget();
      show(target, { gradient: true });
      await settle();

      // Reduced motion asks for no animation, not for no feedback.
      expect(ringOf().getAnimations().length).toBe(0);
      expect(getComputedStyle(ringOf()).backgroundImage).toContain("gradient");
    } finally {
      window.matchMedia = query;
    }
  });

  it("uses a stated colour over the themed one", async () => {
    const target = makeTarget();
    show(target, { color: "rgb(255, 0, 0)" });
    await settle();

    expect(getComputedStyle(ringOf()).borderTopColor).toBe("rgb(255, 0, 0)");
  });

  it("follows the target when the page scrolls", async () => {
    const filler = document.createElement("div");
    filler.className = "probe-target";
    filler.style.cssText = "height: 3000px";
    document.body.appendChild(filler);
    const target = makeTarget();
    show(target, { scrim: true });
    await settle();
    const before = ringOf().getBoundingClientRect().top;

    window.scrollBy(0, 200);
    await settle();

    // A ring left where the target used to be is worse than none: it points
    // confidently at the wrong thing.
    expect(before - ringOf().getBoundingClientRect().top).toBeCloseTo(200, 0);
  });

  it("clamps the cut-out's radius to the box it is cutting", async () => {
    // A radius larger than half the box would otherwise produce a path the
    // browser drops, taking the whole scrim with it.
    const target = makeTarget();
    target.style.width = "20px";
    target.style.height = "20px";
    show(target, { scrim: true, radius: 400 });
    await settle();

    const scrim = overlay()?.firstElementChild as HTMLElement;
    expect(getComputedStyle(scrim).clipPath).not.toBe("none");
  });

  it("is what flash uses when a scrim or a gradient is asked for", async () => {
    // The wiring, not the drawing. flash writes an outline onto the element by
    // default -- the cheap path, and the one that must not change -- and only
    // takes the overlay when asked for something an outline cannot be.
    const target = makeTarget();

    const plain = flash(target, { flashMs: 60 });
    await settle();
    expect(overlay()).toBeNull();
    expect(target.style.outline).not.toBe("");
    await plain;

    const scrimmed = flash(target, { flashMs: 60, scrim: true });
    await settle();
    expect(overlay()).not.toBeNull();
    // ...and it leaves the element itself alone on that path.
    expect(target.style.outline).toBe("");
    await scrimmed;

    // The overlay goes when the flash ends, rather than outliving it.
    expect(overlay()).toBeNull();
  });

  it("passes flash's colour and gap through to the overlay", async () => {
    const target = makeTarget();
    const running = flash(target, {
      flashMs: 60,
      gradient: true,
      color: "rgb(0, 128, 0)",
      ringPadding: 10,
    });
    await settle();

    expect(ringOf().getBoundingClientRect().left).toBeCloseTo(TARGET.left - 10, 0);
    expect(getComputedStyle(ringOf()).backgroundImage).toContain("rgb(0, 128, 0)");
    await running;
  });

  it("removes itself and stops listening when dismissed", async () => {
    const target = makeTarget();
    const dismiss = show(target, { scrim: true });
    await settle();
    expect(overlay()).not.toBeNull();

    dismiss();
    expect(overlay()).toBeNull();
    // The listeners went with it: a scroll after dismissal must not paint into
    // a detached node.
    window.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("resize"));
    expect(overlay()).toBeNull();
  });
});
