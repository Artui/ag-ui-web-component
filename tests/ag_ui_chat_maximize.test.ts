import { afterEach, describe, expect, it } from "vitest";
import { ELEMENT_TAG, MAXIMIZE_EVENT } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { MaximizeDetail } from "../src/core/events/maximize_detail.js";

defineAgUiChat();

function create(attrs: Record<string, string> = {}): { el: AgUiChat; seen: boolean[] } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  const seen: boolean[] = [];
  el.addEventListener(MAXIMIZE_EVENT, (event) => {
    seen.push((event as CustomEvent<MaximizeDetail>).detail.maximized);
  });
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value);
  }
  return { el, seen };
}

function control(el: AgUiChat): HTMLButtonElement | null {
  return el.shadowRoot?.querySelector<HTMLButtonElement>(".header-btn--maximize") ?? null;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the maximized state", () => {
  it("toggles from the header control, reflects, renames the control and reports once each way", () => {
    const { el, seen } = create();
    document.body.appendChild(el);
    const button = control(el);
    button?.click();
    expect(el.maximized).toBe(true);
    expect(el.hasAttribute("maximized")).toBe(true);
    expect(button?.getAttribute("aria-label")).toBe("Restore");
    expect(button?.textContent).toBe("❐");
    expect(el.describeSurface().maximized).toBe(true);
    el.maximized = true;
    button?.click();
    expect(el.maximized).toBe(false);
    expect(button?.getAttribute("aria-label")).toBe("Maximize");
    expect(button?.textContent).toBe("□");
    expect(seen).toEqual([true, false]);
  });

  it("is left by a collapse and refused while collapsed", () => {
    const { el, seen } = create();
    document.body.appendChild(el);
    el.setMaximized(true);
    el.setCollapsed(true);
    expect(el.maximized).toBe(false);
    el.toggleMaximized();
    expect(el.maximized).toBe(false);
    expect(el.hasAttribute("maximized")).toBe(false);
    expect(seen).toEqual([true, false]);
  });

  it("is never stored, and an element written maximized before it connects opens so", () => {
    const { el, seen } = create({ maximized: "" });
    expect(el.maximized).toBe(true);
    document.body.appendChild(el);
    expect(control(el)?.getAttribute("aria-label")).toBe("Restore");
    expect(Object.keys(sessionStorage).some((key) => key.includes("maxim"))).toBe(false);
    expect(Object.keys(localStorage).some((key) => key.includes("maxim"))).toBe(false);
    expect(seen).toEqual([true]);
  });

  it("is refused under a placement switched before connect, which has no control", () => {
    const { el, seen } = create({ maximized: "" });
    el.setAttribute("placement", "embedded");
    expect(el.maximized).toBe(false);
    document.body.appendChild(el);
    expect(control(el)).toBeNull();
    expect(seen).toEqual([]);
  });

  it("reports nothing for a markup request on a panel that mounts collapsed", () => {
    const { el, seen } = create({ maximized: "" });
    el.removeAttribute("data-start-open");
    document.body.appendChild(el);
    expect(el.collapsed).toBe(true);
    expect(el.maximized).toBe(false);
    expect(el.hasAttribute("maximized")).toBe(false);
    expect(seen).toEqual([]);
    el.setCollapsed(false);
    el.setMaximized(true);
    expect(seen).toEqual([true]);
  });

  it("reports a request made while detached once, on the reconnect, and only if it changed", () => {
    const { el, seen } = create();
    document.body.appendChild(el);
    el.remove();
    el.setMaximized(true);
    el.setMaximized(false);
    document.body.appendChild(el);
    expect(seen).toEqual([]);
    el.remove();
    el.setMaximized(true);
    document.body.appendChild(el);
    expect(seen).toEqual([true]);
  });

  it("follows the element across a placement switch that keeps the control", () => {
    const { el } = create();
    document.body.appendChild(el);
    el.setMaximized(true);
    el.setAttribute("placement", "sidebar");
    expect(el.maximized).toBe(true);
    expect(control(el)?.isConnected).toBe(true);
  });
});
