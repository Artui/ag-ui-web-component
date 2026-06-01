import type { Context, Tool } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgUiChat, SubmitDetail } from "../src/ag_ui_chat.js";
import { ELEMENT_TAG, MESSAGE_ROLE, SUBMIT_EVENT } from "../src/constants.js";
import { SessionStorageStore } from "../src/conversation_store.js";
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

/** Drain pending microtasks a few times so async submit + fake run settle. */
async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

async function send(el: AgUiChat, text: string): Promise<void> {
  sendNoWait(el, text);
  await flush();
}

/**
 * Click Send without awaiting the run. Used by modal tests that must interact
 * mid-run (the run blocks on the confirmation modal until a button is clicked):
 * call this, ``await flush()`` to reach the modal, click, then ``await flush()``
 * again to let the tool execute and the run settle.
 */
function sendNoWait(el: AgUiChat, text: string): void {
  const input = shadow(el).querySelector<HTMLTextAreaElement>(".input");
  if (input === null) {
    throw new Error("expected an input");
  }
  input.value = text;
  shadow(el).querySelector<HTMLButtonElement>(".send")?.click();
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
    sessionStorage.clear();
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

  it("renders a tool-call card with name, args, and a status", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.toolCall("tc1", "fill_field", { name: "city" });
    });
    await send(el, "fill the city");
    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.getAttribute("data-tool-name")).toBe("fill_field");
    expect(card?.querySelector(".tool-call-name")?.textContent).toBe("🔧 fill_field");
    expect(card?.querySelector(".tool-call-args")?.textContent).toContain('"name": "city"');
    // fill_field isn't registered here, so it's treated as server-executed.
    expect(card?.getAttribute("data-status")).toBe("done");
  });

  it("settles the tool-call card to done with the result body", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "count_users", { active: true });
      }
      round += 1;
    });
    el.registerTool({
      name: "count_users",
      description: "count",
      parameters: { type: "object" },
      handler: () => 42,
    });
    await send(el, "count active users");
    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("done");
    expect(card?.querySelector(".tool-call-result")?.textContent).toBe("42");
  });

  it("settles the tool-call card to error when the handler throws", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "boom", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "boom",
      description: "explodes",
      parameters: { type: "object" },
      handler: () => {
        throw new Error("kaboom");
      },
    });
    await send(el, "trigger boom");
    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("error");
    expect(card?.querySelector(".tool-call-result")?.textContent).toBe("kaboom");
  });

  it("settles the tool-call card to declined on cancel", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    el.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => "deleted",
    });

    sendNoWait(el, "delete user 7");
    await flush();
    shadow(el).querySelector<HTMLButtonElement>(".modal-btn--cancel")?.click();
    await flush();

    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("declined");
    expect(card?.querySelector(".tool-call-result")?.textContent).toBe("User declined the action.");
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

  it("exposes registered tools to the run via getTools", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.text("listing");
        emit.textEnd("listing");
      }
      round += 1;
    });
    el.registerTool({
      name: "count_users",
      description: "count users",
      parameters: { type: "object" },
      handler: () => 42,
    });
    await send(el, "how many?");
    expect(handle.lastRunParams?.tools).toEqual([
      { name: "count_users", description: "count users", parameters: { type: "object" } },
    ]);
  });

  it("executes a non-destructive tool without a modal and posts the result", async () => {
    let round = 0;
    let received: Record<string, unknown> | null = null;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "count_users", { active: true });
      }
      round += 1;
    });
    el.registerTool({
      name: "count_users",
      description: "count",
      parameters: { type: "object" },
      handler: (args) => {
        received = args;
        return 42;
      },
    });
    await send(el, "count active users");

    expect(received).toEqual({ active: true });
    expect(shadow(el).querySelector(".modal-overlay")).toBeNull();
    const toolMsg = handle.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toBe("42");
  });

  it("shows a modal for a destructive tool and runs it on confirm", async () => {
    let round = 0;
    let ran = false;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    el.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => {
        ran = true;
        return "deleted";
      },
    });

    sendNoWait(el, "delete user 7");
    await flush();
    const modal = shadow(el).querySelector<HTMLButtonElement>(".modal-btn--confirm");
    expect(modal).not.toBeNull();
    modal?.click();
    await flush();

    expect(ran).toBe(true);
    expect(handle.messages.find((m) => m.role === "tool")?.content).toBe('"deleted"');
  });

  it("declines a destructive tool on cancel and posts a decline message", async () => {
    let round = 0;
    let ran = false;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    el.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => {
        ran = true;
        return "deleted";
      },
    });

    sendNoWait(el, "delete user 7");
    await flush();
    shadow(el).querySelector<HTMLButtonElement>(".modal-btn--cancel")?.click();
    await flush();

    expect(ran).toBe(false);
    expect(handle.messages.find((m) => m.role === "tool")?.content).toBe(
      "User declined the action.",
    );
  });

  it("skips the modal for a destructive tool when autoConfirm is set", async () => {
    let round = 0;
    let ran = false;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "delete_user", { id: 7 });
      }
      round += 1;
    });
    el.autoConfirm = true;
    el.registerTool({
      name: "delete_user",
      description: "delete",
      parameters: { type: "object", "x-destructive": true },
      handler: () => {
        ran = true;
        return "deleted";
      },
    });
    await send(el, "delete user 7");
    expect(ran).toBe(true);
    expect(shadow(el).querySelector(".modal-overlay")).toBeNull();
  });

  it("captures a tool handler error into the result message", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "boom", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "boom",
      description: "explodes",
      parameters: { type: "object" },
      handler: () => {
        throw new Error("kaboom");
      },
    });
    await send(el, "trigger boom");
    expect(handle.messages.find((m) => m.role === "tool")?.content).toContain("kaboom");
  });

  it("stringifies a non-Error throw from a tool handler", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "boom", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "boom",
      description: "explodes",
      parameters: { type: "object" },
      handler: () => {
        throw "string failure";
      },
    });
    await send(el, "trigger boom");
    expect(handle.messages.find((m) => m.role === "tool")?.content).toContain("string failure");
  });

  it("serialises a nullish tool result as null", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "noop", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "noop",
      description: "returns nothing",
      parameters: { type: "object" },
      handler: () => undefined,
    });
    await send(el, "do nothing");
    expect(handle.messages.find((m) => m.role === "tool")?.content).toBe("null");
  });

  it("rehydrates persisted text messages into bubbles on mount", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
      { id: "3", role: "assistant", content: "" }, // empty → skipped
      { id: "4", role: "tool", content: "tool out", toolCallId: "x" }, // non-text role → skipped
      { id: "5", role: "assistant" }, // no content → skipped
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    const bubbles = shadow(el).querySelectorAll(".message");
    expect([...bubbles].map((b) => b.textContent)).toEqual(["hi", "hello"]);
  });

  it("resumes a checkpointed navigating tool call on mount", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [{ id: "1", role: "user", content: "go to books" }] as never);
    store.saveCheckpoint(tid, { toolCallId: "nav-1" });

    const handle = makeFakeAgent({
      script: (emit) => {
        emit.text("here are the books");
        emit.textEnd("here are the books");
      },
    });
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.conversationStore = store;
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await flush();

    expect(store.loadCheckpoint(tid)).toBeNull();
    const toolMsg = handle.messages.find((m) => m.role === "tool");
    expect(toolMsg?.toolCallId).toBe("nav-1");
    expect(JSON.parse(toolMsg?.content ?? "{}").navigated).toBe(true);
    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("here are the books");
  });

  it("checkpoints and halts on a navigating tool, then marks the card", async () => {
    let round = 0;
    let ran = false;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("nav-1", "open_changelist", { model: "Book" });
      }
      round += 1;
    });
    el.registerTool({
      name: "open_changelist",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => {
        ran = true;
        return { ok: true };
      },
    });

    await send(el, "open the books");

    expect(ran).toBe(true);
    const tid = el.conversationStore.threadId();
    expect(el.conversationStore.loadCheckpoint(tid)).toEqual({ toolCallId: "nav-1" });
    expect(handle.messages.find((m) => m.role === "tool")).toBeUndefined();
    expect(shadow(el).querySelector<HTMLElement>(".tool-call")?.getAttribute("data-status")).toBe(
      "done",
    );
  });

  it("clears the checkpoint when a navigating tool handler throws", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("nav-1", "open_changelist", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "open_changelist",
      description: "navigate",
      parameters: { type: "object", "x-navigates": true },
      handler: () => {
        throw new Error("nav failed");
      },
    });

    await send(el, "open");

    const tid = el.conversationStore.threadId();
    expect(el.conversationStore.loadCheckpoint(tid)).toBeNull();
    expect(shadow(el).querySelector<HTMLElement>(".tool-call")?.getAttribute("data-status")).toBe(
      "error",
    );
  });

  it("exposes route.* tools in the catalog when a routeMap is set", () => {
    const el = mount({ endpoint: "/agent/" });
    expect(el.getTools().map((t) => t.name)).not.toContain("navigate_to_route");
    el.routeMap = [{ id: "users", path: "/admin/auth/user/" }];
    const names = el.getTools().map((t) => t.name);
    expect(names).toContain("list_routes");
    expect(names).toContain("navigate_to_route");
  });

  it("navigate_to_route routes in-page (SPA) without checkpointing", async () => {
    let round = 0;
    const navPaths: string[] = [];
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("r1", "navigate_to_route", { route_id: "users" });
      }
      round += 1;
    });
    el.routeMap = [{ id: "users", path: "/admin/auth/user/" }];
    el.navigate = (p) => navPaths.push(p);

    await send(el, "go to users");

    expect(navPaths).toEqual(["/admin/auth/user/"]);
    const tid = el.conversationStore.threadId();
    expect(el.conversationStore.loadCheckpoint(tid)).toBeNull();
    // In-page: the loop continued and posted the tool result.
    expect(handle.messages.find((m) => m.role === "tool")?.content).toContain("/admin/auth/user/");
  });

  it("navigate_to_route checkpoints + halts without a navigate callback (MPA)", async () => {
    const spy = vi.spyOn(window.location, "assign").mockImplementation(() => {});
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("r1", "navigate_to_route", { route_id: "users" });
      }
      round += 1;
    });
    el.routeMap = [{ id: "users", path: "/admin/auth/user/" }];

    await send(el, "go");

    const tid = el.conversationStore.threadId();
    expect(el.conversationStore.loadCheckpoint(tid)).toEqual({ toolCallId: "r1" });
    expect(spy).toHaveBeenCalledWith("/admin/auth/user/");
    spy.mockRestore();
  });

  it("registerStateHook exposes read/write tools the agent can call", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("s1", "read_cart", {});
      }
      round += 1;
    });
    el.registerStateHook({ name: "cart", read: () => ({ items: 3 }) });
    expect(el.getTools().map((t) => t.name)).toContain("read_cart");

    await send(el, "read the cart");

    expect(handle.messages.find((m) => m.role === "tool")?.content).toBe(
      JSON.stringify({ items: 3 }),
    );
  });

  it("injects the compact page map into the run context", async () => {
    const { el, handle } = mountWithAgent(() => {});
    el.getPageMap = () => ({ fields: ["title"] });

    await send(el, "x");

    expect(handle.lastRunParams?.context).toEqual([
      { description: "page_map", value: JSON.stringify({ fields: ["title"] }) },
    ]);
  });
});
