import { afterEach, describe, expect, it } from "vitest";
import { requestApproval } from "../src/ui/approval_card.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function host(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("requestApproval (inline card)", () => {
  it("shows the interrupt message and resolves true on approve", async () => {
    const node = host();
    const decision = requestApproval(node, {
      message: "Approve delete_thing({…})?",
      toolName: "delete_thing",
    });
    const card = node.querySelector(".approval");
    expect(card?.getAttribute("data-tool-name")).toBe("delete_thing");
    expect(card?.querySelector(".approval-body")?.textContent).toBe("Approve delete_thing({…})?");

    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    expect(await decision).toBe(true);
    expect(card?.getAttribute("data-resolved")).toBe("approved");
    expect(node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.disabled).toBe(true);
    expect(node.querySelector<HTMLButtonElement>(".approval-btn--deny")?.disabled).toBe(true);
  });

  it("resolves false on deny and marks the card denied", async () => {
    const node = host();
    const decision = requestApproval(node, { message: "Approve x?" });
    node.querySelector<HTMLButtonElement>(".approval-btn--deny")?.click();
    expect(await decision).toBe(false);
    expect(node.querySelector(".approval")?.getAttribute("data-resolved")).toBe("denied");
  });

  it("falls back to the generic prompt with no message, and omits data-tool-name", async () => {
    const node = host();
    const decision = requestApproval(node, {});
    const card = node.querySelector(".approval");
    expect(card?.querySelector(".approval-body")?.textContent).toBe("Approve this action?");
    expect(card?.hasAttribute("data-tool-name")).toBe(false);
    node.querySelector<HTMLButtonElement>(".approval-btn--deny")?.click();
    await decision;
  });

  it("aborting the signal resolves the card as denied", async () => {
    const node = host();
    const controller = new AbortController();
    const decision = requestApproval(
      node,
      { message: "Approve x?" },
      { signal: controller.signal },
    );
    controller.abort();
    expect(await decision).toBe(false);
    expect(node.querySelector(".approval")?.getAttribute("data-resolved")).toBe("denied");
  });

  it("a decision before the abort wins; the late abort does not overwrite it", async () => {
    const node = host();
    const controller = new AbortController();
    const decision = requestApproval(
      node,
      { message: "Approve x?" },
      { signal: controller.signal },
    );
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    controller.abort();
    expect(await decision).toBe(true);
    expect(node.querySelector(".approval")?.getAttribute("data-resolved")).toBe("approved");
  });

  it("an already-aborted signal denies immediately", async () => {
    const node = host();
    const controller = new AbortController();
    controller.abort();
    const decision = requestApproval(
      node,
      { message: "Approve x?" },
      { signal: controller.signal },
    );
    expect(await decision).toBe(false);
    expect(node.querySelector(".approval")?.getAttribute("data-resolved")).toBe("denied");
  });
});
