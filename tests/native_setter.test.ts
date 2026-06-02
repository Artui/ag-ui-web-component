import { afterEach, describe, expect, it } from "vitest";
import { setNativeChecked, setNativeValue } from "../src/dom/native_setter.js";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("setNativeValue", () => {
  it("sets value on input, textarea, and select", () => {
    const input = document.createElement("input");
    setNativeValue(input, "a");
    expect(input.value).toBe("a");

    const textarea = document.createElement("textarea");
    setNativeValue(textarea, "b");
    expect(textarea.value).toBe("b");

    const select = document.createElement("select");
    select.innerHTML = '<option value="x"></option><option value="y"></option>';
    setNativeValue(select, "y");
    expect(select.value).toBe("y");
  });

  it("bypasses an instance-level (framework) value setter", () => {
    // Simulate React patching the element's own `value` setter to track changes
    // while dropping the written value — the bug native-setter writes around.
    const el = document.createElement("input");
    const protoGet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.get;
    let intercepted = false;
    Object.defineProperty(el, "value", {
      configurable: true,
      get() {
        return protoGet?.call(this);
      },
      set() {
        intercepted = true; // a tracker that loses the value
      },
    });

    setNativeValue(el, "real");

    expect(intercepted).toBe(false); // our write skipped the instance override
    expect(el.value).toBe("real"); // and landed on the element via the prototype
  });
});

describe("setNativeChecked", () => {
  it("sets the checked state", () => {
    const el = document.createElement("input");
    el.type = "checkbox";
    setNativeChecked(el, true);
    expect(el.checked).toBe(true);
    setNativeChecked(el, false);
    expect(el.checked).toBe(false);
  });
});
