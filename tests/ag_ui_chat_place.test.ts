/**
 * The place chip, end to end through the element: what it draws in the
 * composer's tool row, the one context entry it sends from the same read, the
 * eye toggle that withholds the place (and with it the page), and when the
 * place is read again.
 */

import type { Context, Message } from "@ag-ui/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, type FakeRunParams, makeFakeAgent } from "./helpers/fake_agent.js";

defineAgUiChat();

interface PlaceShape {
  readonly label: string;
  readonly detail?: string;
  readonly icon?: string;
  readonly href?: string;
}

interface Mounted {
  readonly el: AgUiChat;
  readonly rounds: FakeRunParams[];
}

function mount(
  configure: (el: AgUiChat) => void = () => {},
  script: (emit: Emit, params: FakeRunParams) => void = (emit) => {
    emit.textEnd("ok");
    emit.runEnd();
  },
  attributes: Record<string, string> = {},
): Mounted {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  for (const [name, value] of Object.entries(attributes)) {
    el.setAttribute(name, value);
  }
  const rounds: FakeRunParams[] = [];
  el.agentFactory = () =>
    makeFakeAgent({
      script: (emit, params) => {
        rounds.push(params);
        script(emit, params);
      },
    }).agent;
  configure(el);
  document.body.appendChild(el);
  return { el, rounds };
}

function shadow(el: AgUiChat): ShadowRoot {
  return el.shadowRoot as ShadowRoot;
}

function chip(el: AgUiChat): HTMLElement | null {
  return shadow(el).querySelector<HTMLElement>(".place");
}

function toggle(el: AgUiChat): HTMLButtonElement {
  const button = shadow(el).querySelector<HTMLButtonElement>(".place-toggle");
  if (button === null) {
    throw new Error("no place toggle");
  }
  return button;
}

function text(el: AgUiChat, selector: string): string | null {
  return shadow(el).querySelector(selector)?.textContent ?? null;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    await Promise.resolve();
  }
}

async function send(el: AgUiChat, message = "where am I"): Promise<void> {
  await el.sendMessage(message);
  await flush();
}

function contextOf(params: FakeRunParams | undefined): Context[] {
  return (params?.context ?? []) as Context[];
}

function placeEntries(params: FakeRunParams | undefined): unknown[] {
  return contextOf(params)
    .filter((entry) => entry.description === "place")
    .map((entry) => JSON.parse(entry.value) as unknown);
}

function hasPageMap(params: FakeRunParams | undefined): boolean {
  return contextOf(params).some((entry) => entry.description === "page_map");
}

function toolNames(params: FakeRunParams | undefined): string[] {
  return ((params?.tools ?? []) as { name: string }[]).map((tool) => tool.name);
}

const ORDER: PlaceShape = { label: "Order #4821", detail: "Orders", href: "/orders/4821/" };
const BILLING: PlaceShape = { label: "Billing", detail: "Settings", href: "/settings/billing/" };

beforeEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  document.body.replaceChildren();
  sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("the place from getPlace", () => {
  it("is drawn in the composer tool row, between the voice slot and Send", () => {
    const { el } = mount((chat) => {
      chat.getPlace = () => ORDER;
    });

    const place = chip(el);
    expect(place?.hidden).toBe(false);
    expect(place?.getAttribute("part")).toBe("place");
    const row = [...(shadow(el).querySelector(".composer-tools")?.children ?? [])];
    const names = row.map((child) => child.className);
    expect(names.indexOf("place")).toBe(names.indexOf("voice-slot") + 1);
    expect(names.indexOf("send")).toBe(names.indexOf("place") + 1);
    expect(text(el, ".place-label")).toBe("Order #4821");
    expect(text(el, ".place-detail")).toBe("Orders");
  });

  it("is sent as one context entry with the label, detail and href shown", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ({ ...ORDER, icon: "/static/order.svg" });
    });

    await send(el);

    expect(placeEntries(rounds[0])).toEqual([ORDER]);
  });

  it("is still sent when the host replaces getContext", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
      chat.getContext = () => [{ description: "host", value: "theirs" }];
    });

    await send(el);

    expect(contextOf(rounds[0]).map((entry) => entry.description)).toEqual(["host", "place"]);
    expect(placeEntries(rounds[0])).toEqual([ORDER]);
  });
});

describe("the route map standing in", () => {
  const ROUTES = [
    { id: "home", path: "/" },
    { id: "order", path: "/orders/:id/", title: "Order", group: "Sales" },
    { id: "customers", path: "/customers/" },
  ];

  it("names the route matching the path when getPlace is unset", async () => {
    window.history.replaceState({}, "", "/orders/7/");
    const { el, rounds } = mount((chat) => {
      chat.routeMap = ROUTES;
    });

    expect(text(el, ".place-label")).toBe("Order");
    expect(text(el, ".place-detail")).toBe("Sales");
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([
      { label: "Order", detail: "Sales", href: "/orders/7/" },
    ]);
  });

  it("falls back to the route id when the route has no title", async () => {
    window.history.replaceState({}, "", "/customers/");
    const { el, rounds } = mount((chat) => {
      chat.routeMap = ROUTES;
    });

    await send(el);
    expect(placeEntries(rounds[0])).toEqual([{ label: "customers", href: "/customers/" }]);
  });

  it("shows nothing and sends nothing when no route matches", async () => {
    window.history.replaceState({}, "", "/nowhere/");
    const { el, rounds } = mount((chat) => {
      chat.routeMap = ROUTES;
    });

    expect(chip(el)?.hidden).toBe(true);
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([]);
  });

  it("shows nothing and sends nothing with neither a hook nor a route map", async () => {
    const { el, rounds } = mount();

    expect(chip(el)?.hidden).toBe(true);
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([]);
  });

  it("is opted out of with a getPlace that returns null", async () => {
    window.history.replaceState({}, "", "/orders/7/");
    const { el, rounds } = mount((chat) => {
      chat.routeMap = ROUTES;
      chat.getPlace = () => null;
    });

    expect(chip(el)?.hidden).toBe(true);
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([]);
  });
});

describe("the eye toggle", () => {
  it("takes the place out of the next round and marks the chip", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
    });

    toggle(el).click();

    expect(chip(el)?.hasAttribute("data-excluded")).toBe(true);
    expect(chip(el)?.hidden).toBe(false);
    expect(toggle(el).getAttribute("aria-label")).toBe("Share this page again");
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([]);
  });

  it("holds on the same place and lapses when the place changes", async () => {
    let place: PlaceShape = ORDER;
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => place;
    });
    toggle(el).click();

    await send(el, "first");
    el.refreshPlace();
    await send(el, "second");
    expect(chip(el)?.hasAttribute("data-excluded")).toBe(true);
    expect(placeEntries(rounds[1])).toEqual([]);

    place = BILLING;
    el.refreshPlace();
    expect(chip(el)?.hasAttribute("data-excluded")).toBe(false);
    await send(el, "third");
    expect(placeEntries(rounds[2])).toEqual([BILLING]);
  });

  it("keys a place with no href on its label and detail", () => {
    let place: PlaceShape = { label: "Draft", detail: "Editor" };
    const { el } = mount((chat) => {
      chat.getPlace = () => place;
    });
    toggle(el).click();

    place = { label: "Draft", detail: "Editor" };
    el.refreshPlace();
    expect(chip(el)?.hasAttribute("data-excluded")).toBe(true);

    place = { label: "Draft", detail: "Preview" };
    el.refreshPlace();
    expect(chip(el)?.hasAttribute("data-excluded")).toBe(false);
  });

  it("shares the place again on a second press", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
    });
    toggle(el).click();
    toggle(el).click();

    expect(chip(el)?.hasAttribute("data-excluded")).toBe(false);
    expect(toggle(el).getAttribute("aria-label")).toBe("Stop sharing this page");
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([ORDER]);
  });

  it("is obeyed when the host replaces getContext", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
      chat.getContext = () => [{ description: "host", value: "theirs" }];
    });
    toggle(el).click();

    await send(el);
    expect(contextOf(rounds[0]).map((entry) => entry.description)).toEqual(["host"]);
  });
});

describe("withholding the place withholds the page", () => {
  const PAGE = { route: "/orders/4821/", fields: ["status"] };

  it("withholds nothing while no place is read, and again when the place returns", async () => {
    let place: PlaceShape | null = ORDER;
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => place;
      chat.getPageMap = () => PAGE;
    });
    toggle(el).click();

    place = null;
    el.refreshPlace();
    await send(el, "nowhere");
    expect(hasPageMap(rounds[0])).toBe(true);
    expect(toolNames(rounds[0])).toContain("read_page");

    place = ORDER;
    el.refreshPlace();
    expect(chip(el)?.hasAttribute("data-excluded")).toBe(true);
    await send(el, "back");
    expect(hasPageMap(rounds[1])).toBe(false);
    expect(placeEntries(rounds[1])).toEqual([]);
  });

  it("drops the page map and read_page from the next round, and restores both", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
      chat.getPageMap = () => PAGE;
    });

    toggle(el).click();
    await send(el, "withheld");
    expect(hasPageMap(rounds[0])).toBe(false);
    expect(toolNames(rounds[0])).not.toContain("read_page");

    toggle(el).click();
    await send(el, "shared");
    expect(hasPageMap(rounds[1])).toBe(true);
    expect(toolNames(rounds[1])).toContain("read_page");
  });

  it("drops a page map the host's own getContext sends", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
      chat.getPageMap = () => PAGE;
      chat.getContext = () => [
        { description: "page_map", value: JSON.stringify(PAGE) },
        { description: "host", value: "theirs" },
      ];
    });

    toggle(el).click();
    await send(el);
    expect(contextOf(rounds[0]).map((entry) => entry.description)).toEqual(["host"]);
    expect(toolNames(rounds[0])).not.toContain("read_page");
  });

  it("keeps the page while the place is shared", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => ORDER;
      chat.getPageMap = () => PAGE;
    });

    await send(el);
    expect(hasPageMap(rounds[0])).toBe(true);
    expect(toolNames(rounds[0])).toContain("read_page");
  });

  it("keeps the page when there is no place to withhold", async () => {
    const { el, rounds } = mount((chat) => {
      chat.getPageMap = () => PAGE;
    });

    await send(el);
    expect(hasPageMap(rounds[0])).toBe(true);
    expect(toolNames(rounds[0])).toContain("read_page");
  });

  it("never tells the agent to call read_page when the page moved mid-run", async () => {
    let round = 0;
    const handler = vi.fn(() => "filled");
    const { el, rounds } = mount(
      (chat) => {
        chat.getPlace = () => ORDER;
        chat.getPageMap = () => PAGE;
        chat.registerTool({
          name: "fill_field",
          description: "fill",
          parameters: { type: "object" },
          handler,
        });
      },
      (emit) => {
        if (round === 0) {
          window.history.pushState({}, "", "/moved/");
          emit.toolCall("tc1", "fill_field", {});
        } else {
          emit.textEnd("done");
          emit.runEnd();
        }
        round += 1;
      },
    );
    toggle(el).click();

    await send(el, "fill it");

    const card = shadow(el).querySelector(".tool-call");
    expect(card?.textContent ?? "").not.toContain("read_page");
    expect(card?.getAttribute("data-status")).not.toBe("error");
    expect(handler).toHaveBeenCalledOnce();
    expect(rounds).toHaveLength(2);
  });
});

describe("when the place is read", () => {
  function counted(): { readonly el: AgUiChat; readonly reads: () => number } {
    const getPlace = vi.fn(() => ORDER);
    const { el } = mount(
      (chat) => {
        chat.getPlace = getPlace;
      },
      undefined,
      { placement: "floating" },
    );
    return { el, reads: () => getPlace.mock.calls.length };
  }

  it("reads on connect", () => {
    const { reads } = counted();
    expect(reads()).toBeGreaterThan(0);
  });

  it("reads before every tool round", async () => {
    let round = 0;
    let place: PlaceShape = ORDER;
    const { el, rounds } = mount(
      (chat) => {
        chat.getPlace = () => place;
        chat.registerTool({
          name: "go",
          description: "go",
          parameters: { type: "object" },
          handler: () => {
            place = BILLING;
            return "moved";
          },
        });
      },
      (emit) => {
        if (round === 0) {
          emit.toolCall("tc1", "go", {});
        } else {
          emit.textEnd("done");
          emit.runEnd();
        }
        round += 1;
      },
    );

    await send(el);

    expect(placeEntries(rounds[0])).toEqual([ORDER]);
    expect(placeEntries(rounds[1])).toEqual([BILLING]);
    expect(text(el, ".place-label")).toBe("Billing");
  });

  it("reads on expand", () => {
    const { el, reads } = counted();
    el.setCollapsed(true);
    const before = reads();
    el.setCollapsed(false);
    expect(reads()).toBe(before + 1);
  });

  it("reads when the composer gains focus", () => {
    const { el, reads } = counted();
    const before = reads();
    shadow(el).querySelector(".input")?.dispatchEvent(new FocusEvent("focus"));
    expect(reads()).toBe(before + 1);
  });

  it("reads on popstate and hashchange", () => {
    const { reads } = counted();
    const before = reads();
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.dispatchEvent(new HashChangeEvent("hashchange"));
    expect(reads()).toBe(before + 2);
  });

  it("reads on refreshPlace and redraws the chip", () => {
    let place: PlaceShape = ORDER;
    const { el } = mount((chat) => {
      chat.getPlace = () => place;
    });
    place = BILLING;
    el.refreshPlace();
    expect(text(el, ".place-label")).toBe("Billing");
  });

  it("stops listening for navigation once disconnected", () => {
    const { el, reads } = counted();
    el.remove();
    const before = reads();
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(reads()).toBe(before);
  });

  it("reads a getPlace a framework sets just after inserting the element", async () => {
    const { el } = mount();
    el.getPlace = () => ORDER;
    await flush();
    expect(text(el, ".place-label")).toBe("Order #4821");
  });

  it("does nothing on refreshPlace before the element connects", () => {
    const el = document.createElement(ELEMENT_TAG) as AgUiChat;
    const getPlace = vi.fn(() => ORDER);
    el.getPlace = getPlace;
    el.refreshPlace();
    expect(getPlace).not.toHaveBeenCalled();
  });
});

describe("the place across threads", () => {
  function turn(id: string, content: string): Message {
    return { id, role: "user", content } as Message;
  }

  it("is re-read on switchThread, and the next round carries the new read", async () => {
    let place: PlaceShape = ORDER;
    const { el, rounds } = mount((chat) => {
      chat.getPlace = () => place;
    });
    await flush();
    el.conversationStore.saveMessages("t1", [turn("u1", "an older thread")]);

    place = BILLING;
    await el.switchThread("t1");

    expect(text(el, ".place-label")).toBe("Billing");
    await send(el);
    expect(placeEntries(rounds[0])).toEqual([BILLING]);
  });

  it("is re-read when a new chat starts", async () => {
    let place: PlaceShape = ORDER;
    const { el } = mount((chat) => {
      chat.getPlace = () => place;
    });
    await send(el);

    place = BILLING;
    el.newChat();
    await flush();

    expect(text(el, ".place-label")).toBe("Billing");
  });
});
