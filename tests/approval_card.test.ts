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

describe("editing the arguments before approving", () => {
  const ARGS = { id: 7, note: "before" };

  function open(onEdit?: (a: Record<string, unknown>) => void): {
    node: HTMLElement;
    decision: Promise<boolean>;
  } {
    const node = host();
    const decision = requestApproval(
      node,
      { toolName: "update_row", args: ARGS },
      onEdit === undefined ? {} : { onEdit },
    );
    return { node, decision };
  }

  function field(node: HTMLElement): HTMLTextAreaElement {
    return node.querySelector(".approval-args") as HTMLTextAreaElement;
  }

  it("offers no editor when nothing can receive the edit", () => {
    // AG-UI gates this on the agent's own `approveWithEdits` capability, and a
    // card that let a user rewrite arguments the server discards is worse than
    // one that never offered.
    const { node } = open();

    expect(node.querySelector(".approval-args")).toBeNull();
  });

  it("shows the call's arguments as editable JSON", () => {
    const { node } = open(() => {});

    expect(JSON.parse(field(node).value)).toEqual(ARGS);
  });

  it("reports what the user wrote, not what was proposed", async () => {
    const seen: Record<string, unknown>[] = [];
    const { node, decision } = open((a) => seen.push(a));

    field(node).value = JSON.stringify({ id: 7, note: "after" });
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();

    expect(await decision).toBe(true);
    expect(seen).toEqual([{ id: 7, note: "after" }]);
  });

  it("reports nothing when the arguments were left alone", async () => {
    // So a server can tell "approved as proposed" from "approved, but like
    // this" -- `editedArgs` rides only when something actually changed.
    const seen: unknown[] = [];
    const { node, decision } = open((a) => seen.push(a));

    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();

    expect(await decision).toBe(true);
    expect(seen).toEqual([]);
  });

  it("refuses to approve unparseable JSON, and says so on the card", () => {
    let resolved = false;
    const { node, decision } = open(() => {});
    void decision.then(() => {
      resolved = true;
    });

    field(node).value = "{ not json";
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();

    // Approving what the user did not write -- the original arguments -- is the
    // one outcome they cannot see coming, so the card stays open instead.
    expect(resolved).toBe(false);
    const error = node.querySelector(".approval-error") as HTMLElement;
    expect(error.hidden).toBe(false);
    expect(error.getAttribute("role")).toBe("alert");
  });

  it("refuses arguments that parse but are not an object", () => {
    let resolved = false;
    const { node, decision } = open(() => {});
    void decision.then(() => {
      resolved = true;
    });

    field(node).value = "[1, 2]";
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();

    expect(resolved).toBe(false);
    expect((node.querySelector(".approval-error") as HTMLElement).hidden).toBe(false);
  });

  it("lets a corrected edit through after a refused one", async () => {
    const seen: Record<string, unknown>[] = [];
    const { node, decision } = open((a) => seen.push(a));

    field(node).value = "{ not json";
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();
    field(node).value = JSON.stringify({ id: 8 });
    node.querySelector<HTMLButtonElement>(".approval-btn--approve")?.click();

    expect(await decision).toBe(true);
    expect(seen).toEqual([{ id: 8 }]);
    expect((node.querySelector(".approval-error") as HTMLElement).hidden).toBe(true);
  });

  it("denies without asking about the edit", async () => {
    const seen: unknown[] = [];
    const { node, decision } = open((a) => seen.push(a));

    field(node).value = JSON.stringify({ id: 9 });
    node.querySelector<HTMLButtonElement>(".approval-btn--deny")?.click();

    expect(await decision).toBe(false);
    expect(seen).toEqual([]);
  });
});
