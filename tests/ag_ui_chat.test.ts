import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiChat, SubmitDetail } from "../src/ag_ui_chat.js";
import { ELEMENT_TAG, MESSAGE_ROLE, SUBMIT_EVENT } from "../src/constants.js";
import { defineAgUiChat } from "../src/define_ag_ui_chat.js";

function mount(attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  document.body.appendChild(el);
  return el;
}

function shadow(el: AgUiChat): ShadowRoot {
  const root = el.shadowRoot;
  if (root === null) {
    throw new Error("expected a shadow root");
  }
  return root;
}

function inputOf(el: AgUiChat): HTMLTextAreaElement {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  return input;
}

describe("AgUiChat", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the shell into an open shadow root", () => {
    const el = mount();
    const root = shadow(el);
    expect(root.querySelector(".chat")).not.toBeNull();
    expect(root.querySelector(".messages")).not.toBeNull();
    expect(root.querySelector(".input")).not.toBeNull();
    expect(root.querySelector(".send")).not.toBeNull();
  });

  it("defaults the header to 'Assistant' and honours title-text", () => {
    expect(shadow(mount()).querySelector(".header")?.textContent).toBe("Assistant");
    expect(
      shadow(mount({ "title-text": "Admin Copilot" })).querySelector(".header")?.textContent,
    ).toBe("Admin Copilot");
  });

  it("exposes the endpoint attribute, defaulting to empty string", () => {
    expect(mount().endpoint).toBe("");
    expect(mount({ endpoint: "/agent/" }).endpoint).toBe("/agent/");
  });

  it("appendMessage renders a role-tagged bubble", () => {
    const el = mount();
    const bubble = el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
    expect(bubble.className).toBe("message message--assistant");
    expect(bubble.textContent).toBe("hello");
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(1);
  });

  it("submits on send-button click: appends a user bubble and emits the event", () => {
    const el = mount({ endpoint: "/agent/" });
    const onSubmit = vi.fn();
    el.addEventListener(SUBMIT_EVENT, (e) => onSubmit((e as CustomEvent<SubmitDetail>).detail));

    const input = inputOf(el);
    input.value = "  count users  ";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();

    expect(onSubmit).toHaveBeenCalledWith({ content: "count users" });
    expect(input.value).toBe("");
    const bubbles = shadow(el).querySelectorAll(".message--user");
    expect(bubbles).toHaveLength(1);
    expect(bubbles[0]?.textContent).toBe("count users");
  });

  it("does not submit when the input is blank", () => {
    const el = mount();
    const onSubmit = vi.fn();
    el.addEventListener(SUBMIT_EVENT, onSubmit);

    inputOf(el).value = "   ";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();

    expect(onSubmit).not.toHaveBeenCalled();
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(0);
  });

  it("submits on Enter without Shift", () => {
    const el = mount();
    const onSubmit = vi.fn();
    el.addEventListener(SUBMIT_EVENT, onSubmit);

    const input = inputOf(el);
    input.value = "go";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, cancelable: true }),
    );

    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("does not submit on Shift+Enter or other keys", () => {
    const el = mount();
    const onSubmit = vi.fn();
    el.addEventListener(SUBMIT_EVENT, onSubmit);

    const input = inputOf(el);
    input.value = "multi\nline";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", shiftKey: false }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
