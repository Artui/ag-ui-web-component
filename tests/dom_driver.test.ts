import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fillField,
  pressButton,
  selectControl,
  setControlValue,
  toggleCheckbox,
} from "../src/dom/dom_driver.js";

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("fillField", () => {
  it("scrolls, focuses, and types the value", async () => {
    vi.useFakeTimers();
    const el = document.createElement("input");
    document.body.appendChild(el);
    const scroll = vi.spyOn(el, "scrollIntoView");

    const done = fillField(el, "Paris", { charDelayMs: 5, flashMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    expect(scroll).toHaveBeenCalledOnce();
    expect(el.value).toBe("Paris");
  });

  it("defaults the focus flash to zero", async () => {
    const el = document.createElement("textarea");
    document.body.appendChild(el);
    await fillField(el, "hi", { charDelayMs: 0 });
    expect(el.value).toBe("hi");
  });
});

describe("clickElement", () => {
  it("scrolls then highlight-clicks", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    document.body.appendChild(button);
    const scroll = vi.spyOn(button, "scrollIntoView");
    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });

    const done = clickElement(button, { highlightMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    expect(scroll).toHaveBeenCalledOnce();
    expect(clicked).toBe(true);
  });
});

describe("setControlValue", () => {
  it("sets a select value and dispatches input + change", () => {
    const select = document.createElement("select");
    for (const v of ["a", "b"]) {
      const opt = document.createElement("option");
      opt.value = v;
      select.appendChild(opt);
    }
    document.body.appendChild(select);
    let changes = 0;
    select.addEventListener("change", () => {
      changes += 1;
    });

    setControlValue(select, "b");
    expect(select.value).toBe("b");
    expect(changes).toBe(1);
  });

  it("toggles a checkbox", () => {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);

    setControlValue(checkbox, true);
    expect(checkbox.checked).toBe(true);
    setControlValue(checkbox, false);
    expect(checkbox.checked).toBe(false);
  });
});

describe("pressButton", () => {
  it("scrolls then press-clicks", async () => {
    vi.useFakeTimers();
    const button = document.createElement("button");
    document.body.appendChild(button);
    const scroll = vi.spyOn(button, "scrollIntoView");
    let clicked = false;
    button.addEventListener("click", () => {
      clicked = true;
    });

    const done = pressButton(button, { pressMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    expect(scroll).toHaveBeenCalledOnce();
    expect(clicked).toBe(true);
  });
});

describe("selectControl", () => {
  it("scrolls then animates the select", async () => {
    vi.useFakeTimers();
    const select = document.createElement("select");
    select.innerHTML = '<option value="a"></option><option value="b"></option>';
    document.body.appendChild(select);
    const scroll = vi.spyOn(select, "scrollIntoView");

    const done = selectControl(select, "b", { highlightMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    expect(scroll).toHaveBeenCalledOnce();
    expect(select.value).toBe("b");
  });
});

describe("toggleCheckbox", () => {
  it("scrolls then animates the toggle", async () => {
    vi.useFakeTimers();
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    document.body.appendChild(checkbox);
    const scroll = vi.spyOn(checkbox, "scrollIntoView");

    const done = toggleCheckbox(checkbox, true, { flashMs: 5 });
    await vi.runAllTimersAsync();
    await done;

    expect(scroll).toHaveBeenCalledOnce();
    expect(checkbox.checked).toBe(true);
  });
});
