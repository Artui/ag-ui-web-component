import { afterEach, describe, expect, it, vi } from "vitest";
import {
  focusWithFlash,
  highlightThenClick,
  scrollIntoCenterView,
  typeInto,
} from "../src/animations.js";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

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
