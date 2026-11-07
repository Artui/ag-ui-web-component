import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The dragged size is the chat's own, and never inherited.
 *
 * The placement code writes --_drag-width and --_drag-height inline on the
 * host after a drag, and the size aliases read them ahead of the host's
 * tokens. Inline on the host they win over any default, but a chat that was
 * never dragged has no value of its own, and a custom property inherits: a
 * second chat inside the first one's light DOM, or any page rule naming the
 * property, sized it. Declaring both initial on :host shields it, as every
 * other alias is shielded.
 */

function mount(parent: HTMLElement = document.body): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("open", "");
  parent.appendChild(el);
  return el;
}

function size(el: AgUiChat): [number, number] {
  return [el.offsetWidth, el.offsetHeight];
}

describe("the dragged size does not inherit (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("ignores a dragged size set on an ancestor", () => {
    const resting = size(mount());
    document.body.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.style.setProperty("--_drag-width", "123px");
    wrapper.style.setProperty("--_drag-height", "234px");
    document.body.appendChild(wrapper);

    expect(size(mount(wrapper))).toEqual(resting);
  });

  it("does not hand a dragged chat's size to a chat in its light DOM", () => {
    const resting = size(mount());
    document.body.innerHTML = "";

    const outer = mount();
    outer.style.setProperty("--_drag-width", "123px");
    outer.style.setProperty("--_drag-height", "234px");
    // Slotted, so it renders inside the outer chat's empty transcript.
    const inner = document.createElement(ELEMENT_TAG) as AgUiChat;
    inner.setAttribute("endpoint", "/agent/");
    inner.setAttribute("open", "");
    inner.slot = "empty";
    outer.appendChild(inner);

    expect(size(outer)).toEqual([123, 234]);
    expect(inner.assignedSlot).not.toBeNull();
    expect(getComputedStyle(inner).getPropertyValue("--_drag-width")).toBe("");
    expect(size(inner)).toEqual(resting);
  });

  it("still takes its own dragged size, written inline", () => {
    const el = mount();
    el.style.setProperty("--_drag-width", "321px");
    el.style.setProperty("--_drag-height", "345px");

    expect(size(el)).toEqual([321, 345]);
  });
});
