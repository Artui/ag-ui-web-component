import { afterEach, describe, expect, it, vi } from "vitest";
import {
  flash,
  focusWithFlash,
  highlightThenClick,
  prefersReducedMotion,
  pressThenClick,
  scrollIntoCenterView,
  selectOption,
  toggleControl,
  typeInto,
} from "../src/dom/animations.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** Force `prefers-reduced-motion` to ``reduce`` for the duration of a test. */
function mockReducedMotion(reduce: boolean): void {
  vi.spyOn(window, "matchMedia").mockReturnValue({ matches: reduce } as MediaQueryList);
}

function input(): HTMLInputElement {
  const el = document.createElement("input");
  document.body.appendChild(el);
  return el;
}

describe("typeInto", () => {
  it("clears then types character by character, firing input + change", async () => {
    vi.useFakeTimers();
    const el = input();
    el.value = "stale";
    const inputs: string[] = [];
    let changes = 0;
    el.addEventListener("input", () => inputs.push(el.value));
    el.addEventListener("change", () => {
      changes += 1;
    });

    const done = typeInto(el, "Paris", { charDelayMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    // First input is the clear (""), then one per character.
    expect(inputs).toEqual(["", "P", "Pa", "Par", "Pari", "Paris"]);
    expect(changes).toBe(1);
    expect(el.value).toBe("Paris");
  });

  it("skips the delay when charDelayMs is 0", async () => {
    const el = input();
    await typeInto(el, "ab", { charDelayMs: 0 });
    expect(el.value).toBe("ab");
  });

  it("uses the default delay when unspecified", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = typeInto(el, "x");
    await vi.runAllTimersAsync();
    await done;
    expect(el.value).toBe("x");
  });
});

describe("highlightThenClick", () => {
  it("outlines, waits, restores, and clicks", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    button.style.outline = "1px dashed red";
    document.body.appendChild(button);
    // Capture the browser-normalised form to compare against after restore.
    const originalOutline = button.style.outline;
    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });

    const done = highlightThenClick(button, { highlightMs: 10 });
    // Mid-animation: the accent outline is applied.
    expect(button.style.outline).toContain("#4f46e5");
    await vi.runAllTimersAsync();
    await done;

    expect(clicked).toBe(true);
    // Original outline restored.
    expect(button.style.outline).toBe(originalOutline);
  });

  it("uses the default highlight duration when unspecified", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    document.body.appendChild(button);
    const done = highlightThenClick(button);
    await vi.runAllTimersAsync();
    await done;
    expect(button.style.outline).toBe("");
  });
});

describe("scrollIntoCenterView", () => {
  it("calls scrollIntoView centered and resolves once the scroll ends", async () => {
    const el = input();
    const spy = vi.spyOn(el, "scrollIntoView");

    const settled = scrollIntoCenterView(el);
    expect(spy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
    // scroll/scrollend are dispatched on whatever scrolled; the primitive
    // listens on the document in the capture phase.
    el.dispatchEvent(new Event("scroll"));
    el.dispatchEvent(new Event("scrollend"));
    await expect(settled).resolves.toBeUndefined();
  });

  it("does not hold the caller when the element was already in view", async () => {
    vi.useFakeTimers();
    const el = input();
    let settled = false;
    void scrollIntoCenterView(el).then(() => {
      settled = true;
    });
    // Nothing ever scrolls, so nothing will ever fire scrollend.
    await vi.advanceTimersByTimeAsync(99);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("gives up waiting after the settle timeout when scrollend never arrives", async () => {
    vi.useFakeTimers();
    const el = input();
    let settled = false;
    void scrollIntoCenterView(el, { settleMs: 300 }).then(() => {
      settled = true;
    });
    el.dispatchEvent(new Event("scroll"));

    await vi.advanceTimersByTimeAsync(299);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("falls back to the default settle timeout", async () => {
    vi.useFakeTimers();
    const el = input();
    let settled = false;
    void scrollIntoCenterView(el).then(() => {
      settled = true;
    });
    el.dispatchEvent(new Event("scroll"));

    await vi.advanceTimersByTimeAsync(599);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
  });

  it("jumps instead of gliding under reduced motion, and settles immediately", async () => {
    mockReducedMotion(true);
    const el = input();
    const spy = vi.spyOn(el, "scrollIntoView");
    await scrollIntoCenterView(el);
    expect(spy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "auto",
    });
  });
});

describe("flash", () => {
  it("draws an outline ring rather than a box-shadow, so overflow:hidden cannot clip it", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = flash(el, { flashMs: 30 });

    expect(el.style.outline).toContain("3px");
    expect(el.style.outline).toContain("#4f46e5");
    expect(el.style.outlineOffset).toBe("2px");
    expect(el.style.boxShadow).toBe("");

    await vi.runAllTimersAsync();
    await done;
    expect(el.style.outline).toBe("");
    expect(el.style.outlineOffset).toBe("");
  });

  it("leaves focus where the user put it", async () => {
    vi.useFakeTimers();
    const other = input();
    const el = input();
    other.focus();

    const done = flash(el, { flashMs: 10 });
    expect(document.activeElement).toBe(other);
    await vi.runAllTimersAsync();
    await done;
  });

  it("holds for 1200ms by default, fading out over the last third", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = flash(el);

    await vi.advanceTimersByTimeAsync(799);
    expect(el.style.outline).toContain("#4f46e5");
    expect(el.style.transition).toBe("");

    // The fade starts at 800ms and runs to 1200ms.
    await vi.advanceTimersByTimeAsync(1);
    expect(el.style.transition).toBe("outline-color 400ms ease-out");
    expect(el.style.outlineColor).toBe("transparent");

    await vi.advanceTimersByTimeAsync(399);
    expect(el.style.outline).toContain("transparent");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(el.style.outline).toBe("");
    expect(el.style.transition).toBe("");
  });

  it("takes the ring colour from the target's --ag-ui-accent", async () => {
    vi.useFakeTimers();
    const el = input();
    el.style.setProperty("--ag-ui-accent", "rgb(31, 71, 57)");
    const done = flash(el, { flashMs: 10 });
    expect(el.style.outline).toContain("rgb(31, 71, 57)");
    await vi.runAllTimersAsync();
    await done;
  });

  it("accepts an explicit colour", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = flash(el, { flashMs: 10, color: "hotpink" });
    expect(el.style.outline).toContain("hotpink");
    await vi.runAllTimersAsync();
    await done;
  });

  it("restores a pre-existing outline and transition", async () => {
    vi.useFakeTimers();
    const el = input();
    el.style.outline = "1px dashed red";
    el.style.outlineOffset = "4px";
    el.style.transition = "color 1s linear";
    const originalOutline = el.style.outline;

    const done = flash(el, { flashMs: 10 });
    await vi.runAllTimersAsync();
    await done;

    expect(el.style.outline).toBe(originalOutline);
    expect(el.style.outlineOffset).toBe("4px");
    expect(el.style.transition).toBe("color 1s linear");
  });

  it("holds a static ring under reduced motion instead of fading", async () => {
    mockReducedMotion(true);
    vi.useFakeTimers();
    const el = input();
    const done = flash(el, { flashMs: 60 });

    await vi.advanceTimersByTimeAsync(59);
    // Still fully visible, and never animated.
    expect(el.style.outline).toContain("#4f46e5");
    expect(el.style.transition).toBe("");

    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(el.style.outline).toBe("");
  });

  it("skips the ring entirely at zero duration", async () => {
    const el = input();
    await flash(el, { flashMs: 0 });
    expect(el.style.outline).toBe("");
  });

  it("moves focus when asked", async () => {
    const el = input();
    await flash(el, { flashMs: 0, focus: true });
    expect(document.activeElement).toBe(el);
  });
});

describe("focusWithFlash", () => {
  it("focuses and flashes a ring, then restores", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = focusWithFlash(el, { flashMs: 10 });
    expect(document.activeElement).toBe(el);
    expect(el.style.outline).toContain("3px");
    await vi.runAllTimersAsync();
    await done;
    expect(el.style.outline).toBe("");
  });

  it("focuses without scrolling, so it cannot fight an in-flight smooth scroll", async () => {
    const el = input();
    const spy = vi.spyOn(el, "focus");
    await focusWithFlash(el, { flashMs: 0 });
    expect(spy).toHaveBeenCalledWith({ preventScroll: true });
  });

  it("uses the default flash duration when unspecified", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = focusWithFlash(el);
    await vi.advanceTimersByTimeAsync(1199);
    expect(el.style.outline).not.toBe("");
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(el.style.outline).toBe("");
  });

  it("can be told not to take focus", async () => {
    const other = input();
    const el = input();
    other.focus();
    await focusWithFlash(el, { flashMs: 0, focus: false });
    expect(document.activeElement).toBe(other);
  });
});

describe("prefersReducedMotion", () => {
  it("is false by default", () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it("reflects the media query when reduce is requested", () => {
    mockReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("pressThenClick", () => {
  it("applies a pressed state, waits, restores, and clicks", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    button.style.transform = "none";
    document.body.appendChild(button);
    const original = button.style.transform;
    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });

    const done = pressThenClick(button, { pressMs: 10 });
    expect(button.style.transform).toBe("scale(0.96)");
    expect(button.style.boxShadow).toContain("rgba");
    await vi.runAllTimersAsync();
    await done;

    expect(clicked).toBe(true);
    expect(button.style.transform).toBe(original);
  });

  it("uses the default press duration when unspecified", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    document.body.appendChild(button);
    const done = pressThenClick(button);
    await vi.runAllTimersAsync();
    await done;
    expect(button.style.transform).toBe("");
  });

  it("skips the hold under reduced motion but still clicks", async () => {
    mockReducedMotion(true);
    const button = document.createElement("button");
    document.body.appendChild(button);
    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });
    await pressThenClick(button, { pressMs: 100000 });
    expect(clicked).toBe(true);
    expect(button.style.transform).toBe("");
  });
});

describe("selectOption", () => {
  function select(): HTMLSelectElement {
    const el = document.createElement("select");
    el.innerHTML = '<option value="d">Draft</option><option value="p">Published</option>';
    document.body.appendChild(el);
    return el;
  }

  it("highlights, picks by option value, fires input + change, restores", async () => {
    vi.useFakeTimers();
    const el = select();
    let changes = 0;
    el.addEventListener("change", () => {
      changes += 1;
    });
    const done = selectOption(el, "p", { highlightMs: 10 });
    expect(el.style.outline).toContain("#4f46e5");
    await vi.runAllTimersAsync();
    await done;
    expect(el.value).toBe("p");
    expect(changes).toBe(1);
    expect(el.style.outline).toBe("");
  });

  it("matches by visible option text", async () => {
    const el = select();
    await selectOption(el, "Published", { highlightMs: 0 });
    expect(el.value).toBe("p");
  });

  it("uses the default highlight duration when unspecified", async () => {
    vi.useFakeTimers();
    const el = select();
    const done = selectOption(el, "d");
    await vi.runAllTimersAsync();
    await done;
    expect(el.value).toBe("d");
  });

  it("throws when no option matches", async () => {
    const el = select();
    await expect(selectOption(el, "nope", { highlightMs: 0 })).rejects.toThrow(
      'no <option> matching "nope"',
    );
  });
});

describe("toggleControl", () => {
  it("flashes, sets checked, fires input + change, restores", async () => {
    vi.useFakeTimers();
    const el = document.createElement("input");
    el.type = "checkbox";
    document.body.appendChild(el);
    let changes = 0;
    el.addEventListener("change", () => {
      changes += 1;
    });
    const done = toggleControl(el, true, { flashMs: 10 });
    expect(el.style.boxShadow).toContain("rgba");
    await vi.runAllTimersAsync();
    await done;
    expect(el.checked).toBe(true);
    expect(changes).toBe(1);
    expect(el.style.boxShadow).toBe("");
  });

  it("uses the default flash duration when unspecified", async () => {
    vi.useFakeTimers();
    const el = document.createElement("input");
    el.type = "checkbox";
    el.checked = true;
    document.body.appendChild(el);
    const done = toggleControl(el, false);
    await vi.runAllTimersAsync();
    await done;
    expect(el.checked).toBe(false);
  });
});
