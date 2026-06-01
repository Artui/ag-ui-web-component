import { beforeEach, describe, expect, it } from "vitest";
import { requestConfirmation } from "../src/confirmation_modal.js";

function host(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

describe("requestConfirmation", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the request and resolves true on confirm", async () => {
    const root = host();
    const promise = requestConfirmation(root, {
      toolName: "fill_field",
      args: { name: "city", value: "Paris" },
    });

    const overlay = root.querySelector(".modal-overlay");
    expect(overlay).not.toBeNull();
    expect(root.querySelector(".modal-body")?.textContent).toContain("fill_field");
    expect(root.querySelector(".modal-args")?.textContent).toContain("Paris");

    root.querySelector<HTMLButtonElement>(".modal-btn--confirm")?.click();
    await expect(promise).resolves.toBe(true);
    expect(root.querySelector(".modal-overlay")).toBeNull();
  });

  it("resolves false on cancel", async () => {
    const root = host();
    const promise = requestConfirmation(root, { toolName: "x", args: {} });
    root.querySelector<HTMLButtonElement>(".modal-btn--cancel")?.click();
    await expect(promise).resolves.toBe(false);
  });

  it("resolves false when the backdrop is clicked", async () => {
    const root = host();
    const promise = requestConfirmation(root, { toolName: "x", args: {} });
    const overlay = root.querySelector<HTMLDivElement>(".modal-overlay");
    overlay?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await expect(promise).resolves.toBe(false);
  });

  it("does not resolve when a click lands inside the dialog", async () => {
    const root = host();
    let settled = false;
    void requestConfirmation(root, { toolName: "x", args: {} }).then(() => {
      settled = true;
    });
    // Click the dialog body (target !== overlay): the modal stays open.
    root
      .querySelector<HTMLDivElement>(".modal")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(root.querySelector(".modal-overlay")).not.toBeNull();
  });
});
