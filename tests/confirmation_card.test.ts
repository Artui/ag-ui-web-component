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
    // Answering removes the prompt. The record of what was decided belongs to
    // the tool card it gates, which stays in the transcript in order; a spent
    // form left in place read as an outstanding question.
    expect(node.querySelector(".confirm")).toBeNull();
  });

  it("resolves false on cancel and marks the card declined", async () => {
    const node = host();
    const decision = requestConfirmation(node, { toolName: "x", args: {} });
    node.querySelector<HTMLButtonElement>(".confirm-btn--cancel")?.click();
    expect(await decision).toBe(false);
    expect(node.querySelector(".confirm")).toBeNull();
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
    expect(node.querySelector(".confirm")).toBeNull();
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
    expect(node.querySelector(".confirm")).toBeNull();
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
    expect(node.querySelector(".confirm")).toBeNull();
  });

  it("omits the argument block for a call that takes none", () => {
    const node = host();
    void requestConfirmation(node, { toolName: "refresh", args: {} });
    expect(node.querySelector<HTMLElement>(".confirm-args")?.hidden).toBe(true);
  });
});

describe("the session waiver", () => {
  it("offers no third button when nothing can honour one", () => {
    const node = host();
    void requestConfirmation(node, { toolName: "x", args: {} });
    // Presence of the handler is what enables the button, so the affordance
    // can never be rendered with nothing listening.
    expect(node.querySelector(".confirm-btn--always")).toBeNull();
  });

  it("reports the waiver and still approves this call", async () => {
    const node = host();
    let waived = 0;
    const decision = requestConfirmation(
      node,
      { toolName: "publish", args: {} },
      { onAlwaysAllow: () => (waived += 1) },
    );

    node.querySelector<HTMLButtonElement>(".confirm-btn--always")?.click();

    // The extra decision is *in addition to* approving this call, not instead
    // of it: the tool the user was asked about still runs.
    expect(await decision).toBe(true);
    expect(waived).toBe(1);
    expect(node.querySelector(".confirm")).toBeNull();
  });

  it("puts confirm last so the wider decision is not where the eye lands", () => {
    const node = host();
    void requestConfirmation(node, { toolName: "x", args: {} }, { onAlwaysAllow: () => {} });

    const labels = [...node.querySelectorAll(".confirm-actions button")].map(
      (b) => b.className.split("--")[1],
    );
    expect(labels).toEqual(["cancel", "always", "confirm"]);
  });

  it("does not report a waiver when the card is answered any other way", async () => {
    const node = host();
    let waived = 0;
    const decision = requestConfirmation(
      node,
      { toolName: "x", args: {} },
      { onAlwaysAllow: () => (waived += 1) },
    );

    node.querySelector<HTMLButtonElement>(".confirm-btn--confirm")?.click();

    expect(await decision).toBe(true);
    expect(waived).toBe(0);
  });
});
