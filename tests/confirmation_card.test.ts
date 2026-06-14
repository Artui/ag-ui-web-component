import { afterEach, describe, expect, it } from "vitest";
import { requestConfirmation } from "../src/ui/confirmation_card.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function host(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("requestConfirmation (inline card)", () => {
  it("renders the tool name + args and resolves true on confirm", async () => {
    const node = host();
    const decision = requestConfirmation(node, { toolName: "delete_user", args: { id: 7 } });
    const card = node.querySelector(".confirm");
    expect(card?.getAttribute("data-tool-name")).toBe("delete_user");
    expect(card?.querySelector(".confirm-body")?.textContent).toBe("Run “delete_user”?");
    expect(card?.querySelector(".confirm-args")?.textContent).toContain('"id": 7');

    node.querySelector<HTMLButtonElement>(".confirm-btn--confirm")?.click();
    expect(await decision).toBe(true);
    expect(card?.getAttribute("data-resolved")).toBe("confirmed");
    expect(node.querySelector<HTMLButtonElement>(".confirm-btn--confirm")?.disabled).toBe(true);
  });

  it("resolves false on cancel and marks the card declined", async () => {
    const node = host();
    const decision = requestConfirmation(node, { toolName: "x", args: {} });
    node.querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    expect(await decision).toBe(false);
    expect(node.querySelector(".confirm")?.getAttribute("data-resolved")).toBe("declined");
  });

  it("shows a custom x-confirm message when provided", async () => {
    const node = host();
    const decision = requestConfirmation(node, {
      toolName: "set_status",
      args: { active: true },
      message: "Activate this project?",
    });
    expect(node.querySelector(".confirm-body")?.textContent).toBe("Activate this project?");
    node.querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    await decision;
  });

  it("aborting the signal resolves the card as declined", async () => {
    const node = host();
    const controller = new AbortController();
    const decision = requestConfirmation(
      node,
      { toolName: "x", args: {} },
      { signal: controller.signal },
    );
    controller.abort(); // the Stop control dismisses the pending card
    expect(await decision).toBe(false);
    expect(node.querySelector(".confirm")?.getAttribute("data-resolved")).toBe("declined");
    expect(node.querySelector<HTMLButtonElement>(".confirm-btn--confirm")?.disabled).toBe(true);
  });

  it("a user decision before the abort wins; the late abort does not overwrite it", async () => {
    const node = host();
    const controller = new AbortController();
    const decision = requestConfirmation(
      node,
      { toolName: "x", args: {} },
      { signal: controller.signal },
    );
    node.querySelector<HTMLButtonElement>(".confirm-btn--confirm")?.click();
    controller.abort();
    expect(await decision).toBe(true);
    expect(node.querySelector(".confirm")?.getAttribute("data-resolved")).toBe("confirmed");
  });

  it("an already-aborted signal declines immediately", async () => {
    const node = host();
    const controller = new AbortController();
    controller.abort();
    const decision = requestConfirmation(
      node,
      { toolName: "x", args: {} },
      { signal: controller.signal },
    );
    expect(await decision).toBe(false);
    expect(node.querySelector(".confirm")?.getAttribute("data-resolved")).toBe("declined");
  });
});
