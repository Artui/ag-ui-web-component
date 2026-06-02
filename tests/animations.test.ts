import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
  it("calls scrollIntoView centered", () => {
    const el = input();
    const spy = vi.spyOn(el, "scrollIntoView");
    scrollIntoCenterView(el);
    expect(spy).toHaveBeenCalledWith({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  });
});

describe("focusWithFlash", () => {
  it("focuses and flashes a ring, then restores", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = focusWithFlash(el, { flashMs: 10 });
    expect(el.style.boxShadow).toContain("rgba");
    await vi.runAllTimersAsync();
    await done;
    expect(el.style.boxShadow).toBe("");
  });

  it("uses the default flash duration when unspecified", async () => {
    vi.useFakeTimers();
    const el = input();
    const done = focusWithFlash(el);
    await vi.runAllTimersAsync();
    await done;
    expect(el.style.boxShadow).toBe("");
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
