import type { Message } from "@ag-ui/core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { ELEMENT_TAG, THREAD_EVENT } from "../../src/constants.js";
import type { AgUiChat } from "../../src/core/ag_ui_chat.js";
import type { ClientConversationStore, ThreadMeta } from "../../src/core/conversation_store.js";
import { defineAgUiChat } from "../../src/core/define_ag_ui_chat.js";

/**
 * The conversation list from a host's own button under collapse-to="none".
 *
 * Collapsed there, the panel is hidden and the list inside it with it, so the list
 * opens as a popover beside the button instead, with the panel still away.
 * Chromium, because what a host relies on is where the list is and what a press hits.
 */

/** Threads held in memory, so the popover has rows to pick, rename and delete. */
function memoryStore(count: number): ClientConversationStore & { deleted: string[] } {
  const now = Date.now();
  let threads: ThreadMeta[] = Array.from({ length: count }, (_, i) => ({
    threadId: `t${i}`,
    title: `Thread ${i}`,
    preview: `preview ${i}`,
    updatedAt: now - i * 60_000,
  }));
  let active = "t0";
  const deleted: string[] = [];
  return {
    deleted,
    threadId: () => active,
    newThread: () => {
      active = `n${threads.length}`;
      return active;
    },
    loadMessages: (): Promise<readonly Message[] | null> => Promise.resolve(null),
    saveMessages: () => undefined,
    loadCheckpoint: () => null,
    saveCheckpoint: () => undefined,
    clear: (threadId: string) => {
      deleted.push(threadId);
      threads = threads.filter((meta) => meta.threadId !== threadId);
    },
    listThreads: () => Promise.resolve(threads),
    setActiveThread: (threadId: string) => {
      active = threadId;
    },
    renameThread: (threadId: string, title: string) => {
      threads = threads.map((meta) => (meta.threadId === threadId ? { ...meta, title } : meta));
    },
  };
}

/** A host button at a fixed spot: its own header (top) or its own bottom bar. */
function hostButton(where: "top" | "bottom"): HTMLButtonElement {
  const button = document.createElement("button");
  button.textContent = "Chats";
  const edge = where === "top" ? "top: 12px" : "bottom: 6px";
  button.style.cssText = `position: fixed; ${edge}; right: 140px; height: 28px; width: 80px;`;
  document.body.append(button);
  return button;
}

function mount(count = 3, attrs: Record<string, string> = {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("collapse-to", "none");
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  el.style.setProperty("--ag-ui-motion", "0s");
  el.conversationStore = memoryStore(count);
  document.body.appendChild(el);
  return el;
}

function part<T extends HTMLElement = HTMLElement>(el: AgUiChat, selector: string): T {
  const found = el.shadowRoot?.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`no ${selector} in the shadow root`);
  }
  return found as T;
}

function centre(rect: DOMRect): [number, number] {
  return [rect.left + rect.width / 2, rect.top + rect.height / 2];
}

/** What a press at a point lands on, through the shadow root. */
function hit(el: AgUiChat, x: number, y: number): Element | null {
  return el.shadowRoot?.elementFromPoint(x, y) ?? null;
}

const settle = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame += 1) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
};

const screenWidth = (): number => document.documentElement.clientWidth;
const screenHeight = (): number => document.documentElement.clientHeight;

function press(target: EventTarget): void {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
}

function inside(rect: DOMRect): boolean {
  return (
    rect.left >= 0 && rect.top >= 0 && rect.right <= screenWidth() && rect.bottom <= screenHeight()
  );
}

describe("the conversation list from a host's button (real browser)", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
    await page.viewport(1280, 800);
  });

  it.each([
    [1280, 800],
    [390, 844],
  ])("opens below a button in the top half, with the panel still away, at %ipx", async (w, h) => {
    await page.viewport(w, h);
    const button = hostButton("top");
    const el = mount();
    await settle();
    el.openThreads({ anchor: button });
    await settle();
    expect(el.collapsed).toBe(true);
    const anchor = button.getBoundingClientRect();
    const list = part(el, ".drawer-panel").getBoundingClientRect();
    expect(list.top).toBeGreaterThanOrEqual(anchor.bottom);
    expect(list.top - anchor.bottom).toBeLessThanOrEqual(12);
    expect(list.height).toBeGreaterThan(100);
    expect(inside(list)).toBe(true);
    if (w > 600) {
      expect(list.right).toBeCloseTo(anchor.right, 0);
    }
    const fresh = part<HTMLButtonElement>(el, ".drawer-new");
    expect(hit(el, ...centre(fresh.getBoundingClientRect()))).toBe(fresh);
  });

  it.each([
    [1280, 800],
    [390, 844],
  ])(
    "opens above a button in the bottom half, from the anchor attribute, at %ipx",
    async (w, h) => {
      await page.viewport(w, h);
      const button = hostButton("bottom");
      button.id = "host-chats";
      const el = mount(3, { anchor: "#host-chats" });
      await settle();
      el.openThreads();
      await settle();
      expect(el.collapsed).toBe(true);
      const anchor = button.getBoundingClientRect();
      const list = part(el, ".drawer-panel").getBoundingClientRect();
      expect(list.bottom).toBeLessThanOrEqual(anchor.top);
      expect(anchor.top - list.bottom).toBeLessThanOrEqual(12);
      expect(inside(list)).toBe(true);
      const row = part<HTMLButtonElement>(el, ".drawer-row-select");
      expect(hit(el, ...centre(row.getBoundingClientRect()))?.closest(".drawer-row-select")).toBe(
        row,
      );
    },
  );

  it("picks a thread without expanding the panel", async () => {
    const button = hostButton("top");
    const el = mount();
    await settle();
    const seen = vi.fn();
    el.addEventListener(THREAD_EVENT, seen);
    el.openThreads({ anchor: button });
    await settle();
    const rows = el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".drawer-row-select") ?? [];
    rows[1]?.click();
    await settle();
    expect(seen).toHaveBeenCalled();
    expect(el.threadId).toBe("t1");
    expect(el.collapsed).toBe(true);
    expect(part(el, ".drawer").hidden).toBe(true);
  });

  it("deletes with the inline confirm and renames inside the popover", async () => {
    const button = hostButton("top");
    const el = mount();
    const store = el.conversationStore as ReturnType<typeof memoryStore>;
    await settle();
    el.openThreads({ anchor: button });
    await settle();
    const deletes = el.shadowRoot?.querySelectorAll<HTMLButtonElement>(".drawer-row-delete") ?? [];
    deletes[2]?.click();
    const yes = part<HTMLButtonElement>(el, ".drawer-confirm-yes");
    expect(hit(el, ...centre(yes.getBoundingClientRect()))).toBe(yes);
    yes.click();
    await settle();
    expect(store.deleted).toEqual(["t2"]);
    part<HTMLButtonElement>(el, ".drawer-row-rename").click();
    const input = part<HTMLInputElement>(el, ".drawer-rename-input");
    input.value = "Renamed";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await settle();
    expect(part(el, ".drawer-row-title").textContent).toBe("Renamed");
    expect(part(el, ".drawer").hidden).toBe(false);
    expect(el.collapsed).toBe(true);
  });

  it("searches a long list inside the popover", async () => {
    const button = hostButton("top");
    const el = mount(10);
    await settle();
    el.openThreads({ anchor: button });
    await settle();
    const filter = part<HTMLInputElement>(el, ".drawer-filter");
    expect(hit(el, ...centre(filter.getBoundingClientRect()))).toBe(filter);
    filter.value = "Thread 7";
    filter.dispatchEvent(new Event("input"));
    expect(el.shadowRoot?.querySelectorAll(".drawer-row")).toHaveLength(1);
  });

  it("closes on Escape, on a press outside and on closeThreads, but not on a press on the anchor", async () => {
    const button = hostButton("top");
    const el = mount();
    await settle();
    el.openThreads({ anchor: button });
    await settle();
    press(button);
    expect(part(el, ".drawer").hidden).toBe(false);
    press(part(el, ".drawer-panel"));
    expect(part(el, ".drawer").hidden).toBe(false);
    press(document.body);
    expect(part(el, ".drawer").hidden).toBe(true);

    el.openThreads({ anchor: button });
    part(el, ".drawer-new").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(part(el, ".drawer").hidden).toBe(true);

    el.openThreads({ anchor: button });
    el.closeThreads();
    expect(part(el, ".drawer").hidden).toBe(true);
    expect(el.collapsed).toBe(true);
  });

  it("goes back into the panel when the panel opens", async () => {
    const button = hostButton("top");
    const el = mount();
    await settle();
    el.openThreads({ anchor: button });
    await settle();
    el.setCollapsed(false);
    await settle();
    expect(part(el, ".drawer").hidden).toBe(true);
    el.openThreads();
    await settle();
    const list = part(el, ".drawer-panel").getBoundingClientRect();
    const chat = part(el, ".chat").getBoundingClientRect();
    // Inside the panel's border, which is the one pixel between them.
    expect(Math.abs(list.left - chat.left)).toBeLessThanOrEqual(1);
    expect(list.top).toBeGreaterThanOrEqual(chat.top);
  });

  it("with no anchor, says so and draws nothing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const el = mount();
    await settle();
    el.openThreads();
    await settle();
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("openThreads");
    expect(el.collapsed).toBe(true);
    warn.mockRestore();
  });
});
