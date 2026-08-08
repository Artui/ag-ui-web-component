import { afterEach, describe, expect, it } from "vitest";
import { requestQuestion } from "../src/ui/question_card.js";

afterEach(() => {
  document.body.innerHTML = "";
});

function host(): HTMLDivElement {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
}

function radios(node: ParentNode): HTMLInputElement[] {
  return [...node.querySelectorAll<HTMLInputElement>(".question-choice input")];
}

describe("requestQuestion (inline card)", () => {
  it("renders options as radios and resolves the picked one", async () => {
    const node = host();
    const answer = requestQuestion(node, { question: "Pick one", options: ["a", "b"] });
    expect(node.querySelector(".question-body")?.textContent).toBe("Pick one");
    const opts = radios(node);
    expect(opts.map((r) => r.value)).toEqual(["a", "b"]);
    // No free-text field without allowCustom.
    expect(node.querySelector(".question-input")).toBeNull();

    // Submit is disabled until a choice is made.
    const submit = node.querySelector<HTMLButtonElement>(".question-btn");
    expect(submit?.disabled).toBe(true);
    opts[1]?.click();
    opts[1]?.dispatchEvent(new Event("change"));
    expect(submit?.disabled).toBe(false);
    submit?.click();
    expect(await answer).toBe("b");
    expect(node.querySelector(".question")?.getAttribute("data-resolved")).toBe("answered");
  });

  it("is a free-text prompt when no options are given", async () => {
    const node = host();
    const answer = requestQuestion(node, { question: "Your name?" });
    expect(radios(node)).toHaveLength(0);
    const input = node.querySelector<HTMLInputElement>(".question-input");
    expect(input).not.toBeNull();
    const submit = node.querySelector<HTMLButtonElement>(".question-btn");
    expect(submit?.disabled).toBe(true);
    if (input) {
      input.value = "  Ada  ";
      input.dispatchEvent(new Event("input"));
    }
    expect(submit?.disabled).toBe(false);
    submit?.click();
    expect(await answer).toBe("Ada"); // trimmed
  });

  it("allowCustom adds an 'other' radio that reveals the text field", async () => {
    const node = host();
    const answer = requestQuestion(node, {
      question: "Pick or type",
      options: ["a"],
      allowCustom: true,
    });
    const input = node.querySelector<HTMLInputElement>(".question-input");
    // The text field starts disabled until "other" is chosen.
    expect(input?.disabled).toBe(true);
    const other = radios(node).at(-1);
    other?.click();
    other?.dispatchEvent(new Event("change"));
    expect(input?.disabled).toBe(false);
    if (input) {
      input.value = "custom";
      input.dispatchEvent(new Event("input"));
    }
    node.querySelector<HTMLButtonElement>(".question-btn")?.click();
    expect(await answer).toBe("custom");
  });

  it("Enter in the text field submits", async () => {
    const node = host();
    const answer = requestQuestion(node, { question: "Your name?" });
    const input = node.querySelector<HTMLInputElement>(".question-input");
    if (input) {
      input.value = "Grace";
      input.dispatchEvent(new Event("input"));
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    }
    expect(await answer).toBe("Grace");
  });

  it("Enter with an empty field does nothing", async () => {
    const node = host();
    let resolved = false;
    const answer = requestQuestion(node, { question: "Your name?" }).then((a) => {
      resolved = true;
      return a;
    });
    const input = node.querySelector<HTMLInputElement>(".question-input");
    input?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Finish so the promise settles for the runner.
    if (input) {
      input.value = "x";
      input.dispatchEvent(new Event("input"));
    }
    node.querySelector<HTMLButtonElement>(".question-btn")?.click();
    expect(await answer).toBe("x");
  });

  it("an ordinary keystroke neither submits nor is swallowed", async () => {
    const node = host();
    let resolved = false;
    const answer = requestQuestion(node, { question: "Your name?" }).then((a) => {
      resolved = true;
      return a;
    });
    const input = node.querySelector<HTMLInputElement>(".question-input");
    const keystroke = new KeyboardEvent("keydown", { key: "a", cancelable: true });
    input?.dispatchEvent(keystroke);
    await Promise.resolve();
    expect(resolved).toBe(false);
    // Only Enter is intercepted; anything else must reach the field normally.
    expect(keystroke.defaultPrevented).toBe(false);
    if (input) {
      input.value = "x";
      input.dispatchEvent(new Event("input"));
    }
    node.querySelector<HTMLButtonElement>(".question-btn")?.click();
    expect(await answer).toBe("x");
  });

  it("a click on the submit button with no answer yet does nothing", async () => {
    // The button is disabled until an answer exists, so this can only be
    // reached programmatically — but the guard is what stops a stray dispatch
    // resolving the question with nothing.
    const node = host();
    let resolved = false;
    const answer = requestQuestion(node, { question: "Your name?" }).then((a) => {
      resolved = true;
      return a;
    });
    const submit = node.querySelector<HTMLButtonElement>(".question-btn");
    submit?.dispatchEvent(new Event("click"));
    await Promise.resolve();
    expect(resolved).toBe(false);
    const input = node.querySelector<HTMLInputElement>(".question-input");
    if (input) {
      input.value = "x";
      input.dispatchEvent(new Event("input"));
    }
    submit?.click();
    expect(await answer).toBe("x");
  });

  it("aborting resolves with an empty answer and marks it cancelled", async () => {
    const node = host();
    const controller = new AbortController();
    const answer = requestQuestion(
      node,
      { question: "Pick", options: ["a"] },
      { signal: controller.signal },
    );
    controller.abort();
    expect(await answer).toBe("");
    expect(node.querySelector(".question")?.getAttribute("data-resolved")).toBe("cancelled");
    expect(radios(node)[0]?.disabled).toBe(true);
  });

  it("an answer before the abort wins; the late abort does not overwrite it", async () => {
    const node = host();
    const controller = new AbortController();
    const answer = requestQuestion(
      node,
      { question: "Pick", options: ["a"] },
      { signal: controller.signal },
    );
    const radio = radios(node)[0];
    radio?.click();
    radio?.dispatchEvent(new Event("change"));
    node.querySelector<HTMLButtonElement>(".question-btn")?.click();
    controller.abort(); // the settled guard makes this a no-op
    expect(await answer).toBe("a");
    expect(node.querySelector(".question")?.getAttribute("data-resolved")).toBe("answered");
  });

  it("exposes a styling part on every element for ::part() theming", async () => {
    const node = host();
    const controller = new AbortController();
    const done = requestQuestion(
      node,
      { question: "Q", options: ["a"], allowCustom: true },
      { signal: controller.signal },
    );
    const parts = [...node.querySelectorAll("[part]")].map((n) => n.getAttribute("part"));
    for (const part of [
      "question",
      "question-body",
      "question-options",
      "question-choice",
      "question-radio",
      "question-input",
      "question-actions",
      "question-button",
    ]) {
      expect(parts).toContain(part);
    }
    controller.abort();
    await done;
  });

  it("an already-aborted signal cancels immediately", async () => {
    const node = host();
    const controller = new AbortController();
    controller.abort();
    const answer = requestQuestion(node, { question: "Q" }, { signal: controller.signal });
    expect(await answer).toBe("");
    expect(node.querySelector(".question")?.getAttribute("data-resolved")).toBe("cancelled");
  });
});
