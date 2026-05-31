import type { Context, Tool } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiChat, SubmitDetail } from "../src/ag_ui_chat.js";
import { ELEMENT_TAG, MESSAGE_ROLE, SUBMIT_EVENT } from "../src/constants.js";
import { defineAgUiChat } from "../src/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

/** Mount the element with a fake agent factory and an optional run script. */
function mountWithAgent(
  script: (emit: Emit) => void | Promise<void>,
  extra: { tools?: Tool[]; context?: Context[] } = {},
): { el: AgUiChat; handle: ReturnType<typeof makeFakeAgent> } {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  const handle = makeFakeAgent({ script });
  el.agentFactory = () => handle.agent;
  if (extra.tools !== undefined) {
    el.getTools = () => extra.tools as Tool[];
  }
  if (extra.context !== undefined) {
    el.getContext = () => extra.context as Context[];
  }
  document.body.appendChild(el);
  return { el, handle };
}

async function send(el: AgUiChat, text: string): Promise<void> {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
  // Let the microtask queue drain the async submit + fake run.
  await Promise.resolve();
  await Promise.resolve();
}

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
    // No endpoint here: this asserts the submit-event + user-bubble seam in
    // isolation, without engaging the AG-UI client / network path.
    const el = mount();
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

  it("submits via Enter and drives the client (covers keydown path)", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.text("hi");
      emit.textEnd("hi");
    });
    const input = inputOf(el);
    input.value = "hello";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: false, cancelable: true }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("hi");
  });

  it("streams assistant text into a single growing bubble", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.text("Pa");
      emit.text("Paris");
      emit.textEnd("Paris");
      emit.runEnd();
    });
    await send(el, "capital of France?");

    const assistantBubbles = shadow(el).querySelectorAll(".message--assistant");
    expect(assistantBubbles).toHaveLength(1);
    expect(assistantBubbles[0]?.textContent).toBe("Paris");
  });

  it("toggles the send button disabled state across a run", async () => {
    let sawDisabled = false;
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      sawDisabled = shadow(el).querySelector<HTMLButtonElement>(".send")?.disabled === true;
      emit.runEnd();
    });
    await send(el, "go");
    expect(sawDisabled).toBe(true);
    expect(shadow(el).querySelector<HTMLButtonElement>(".send")?.disabled).toBe(false);
  });

  it("renders a tool-call card", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.toolCall("tc1", "fill_field", { name: "city" });
    });
    await send(el, "fill the city");
    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.textContent).toBe("🔧 fill_field");
    expect(card?.dataset["toolName"]).toBe("fill_field");
  });

  it("renders an error bubble and re-enables send", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.error("model exploded");
    });
    await send(el, "boom");
    const bubble = shadow(el).querySelector(".message--assistant");
    expect(bubble?.textContent).toContain("model exploded");
    expect(shadow(el).querySelector<HTMLButtonElement>(".send")?.disabled).toBe(false);
  });

  it("forwards the current tools and context to the run", async () => {
    const tools: Tool[] = [
      { name: "fill_field", description: "d", parameters: { type: "object" } },
    ];
    const context: Context[] = [{ description: "route", value: "changeform" }];
    const { el, handle } = mountWithAgent(() => {}, { tools, context });
    await send(el, "x");
    expect(handle.lastRunParams).toEqual({ tools, context });
  });

  it("does not build a client when no endpoint is set", async () => {
    const el = mount(); // no endpoint attribute
    let factoryCalled = false;
    el.agentFactory = () => {
      factoryCalled = true;
      return makeFakeAgent().agent;
    };
    inputOf(el).value = "hello";
    shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
    await Promise.resolve();
    expect(factoryCalled).toBe(false);
    // The user bubble still renders; only the network path is skipped.
    expect(shadow(el).querySelectorAll(".message--user")).toHaveLength(1);
  });

  it("reuses a single client across multiple sends", async () => {
    let factoryCalls = 0;
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.text("ok");
        emit.textEnd("ok");
      },
    });
    el.agentFactory = () => {
      factoryCalls += 1;
      return handle.agent;
    };
    document.body.appendChild(el);

    await send(el, "first");
    await send(el, "second");

    expect(factoryCalls).toBe(1);
    expect(handle.messages.map((m) => m.content)).toEqual(["first", "second"]);
  });
});
