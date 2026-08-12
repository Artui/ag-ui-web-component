import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** What the inline question card asks (the `ask_user` frontend tool's args). */
export interface QuestionRequest {
  /** The question shown to the user. */
  question: string;
  /**
   * Preset choices rendered as radios. When empty/omitted the card is a plain
   * free-text prompt.
   */
  options?: readonly string[];
  /**
   * Whether the user may type a custom answer. With `options`, adds an "other"
   * radio revealing a text field; without options the card is free-text anyway.
   */
  allowCustom?: boolean;
}

/** Options for {@link requestQuestion}. */
export interface QuestionOptions {
  /**
   * Aborting this signal resolves the card with an empty answer and disabled
   * fields — how a Stop control dismisses an open question.
   */
  signal?: AbortSignal;
  /** Localized strings; defaults to the English {@link DEFAULT_UI_STRINGS}. */
  strings?: UiStrings;
}

/**
 * A fully custom renderer for the `ask_user` question, set via
 * `AgUiChat.askUserRenderer`. Receives the parsed {@link QuestionRequest} and an
 * `AbortSignal` that fires when the run is stopped, and resolves with the user's
 * answer; an empty string means no answer. Replaces the built-in
 * {@link requestQuestion} card entirely — see {@link ApprovalRenderer} for the
 * same seam on approvals.
 */
export type QuestionRenderer = (
  request: QuestionRequest,
  options: { signal: AbortSignal },
) => Promise<string>;

/** A single custom-answer text field. */
function answerInput(placeholder: string): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "question-input";
  input.setAttribute("part", "question-input");
  input.placeholder = placeholder;
  return input;
}

/**
 * Append an inline question card to `host` and resolve with the user's answer —
 * the browser half of the built-in `ask_user` frontend tool.
 *
 * Collects a typed answer rather than the yes/no the confirmation and approval
 * cards return: a radio pick from `options`, or free text when `allowCustom` is
 * set or no `options` are given. Stays in the transcript as a resolved record,
 * controls disabled and `data-resolved` set; a Stop while it is open resolves
 * it with an empty string.
 */
export function requestQuestion(
  host: Node & ParentNode,
  request: QuestionRequest,
  options: QuestionOptions = {},
): Promise<string> {
  const strings = options.strings ?? DEFAULT_UI_STRINGS;
  const choices = request.options ?? [];
  const hasChoices = choices.length > 0;
  // Free text is offered when there are no preset choices, or when custom
  // answers are explicitly allowed alongside them (via an "other" radio).
  const allowsText = !hasChoices || request.allowCustom === true;

  return new Promise<string>((resolve) => {
    const card = document.createElement("div");
    card.className = "question";
    card.setAttribute("part", "question");
    card.setAttribute("role", "group");
    card.setAttribute("aria-label", strings.askUserAction);

    const body = document.createElement("div");
    body.className = "question-body";
    body.setAttribute("part", "question-body");
    body.textContent = request.question;

    const form = document.createElement("div");
    form.className = "question-options";
    form.setAttribute("part", "question-options");

    // `name` scopes the radio group to this card so multiple open cards don't
    // interfere; a per-card token keeps it unique without module state.
    const group = `q-${choices.length}-${request.question.length}`;
    const radios: HTMLInputElement[] = [];
    for (const choice of choices) {
      const label = document.createElement("label");
      label.className = "question-choice";
      label.setAttribute("part", "question-choice");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = group;
      radio.value = choice;
      radio.setAttribute("part", "question-radio");
      const text = document.createElement("span");
      text.setAttribute("part", "question-choice-text");
      text.textContent = choice;
      label.append(radio, text);
      form.appendChild(label);
      radios.push(radio);
    }

    // The "other" radio (only alongside choices) toggles the free-text field.
    let otherRadio: HTMLInputElement | null = null;
    let input: HTMLInputElement | null = null;
    if (allowsText) {
      input = answerInput(strings.answerPlaceholder);
      if (hasChoices) {
        const label = document.createElement("label");
        label.className = "question-choice";
        label.setAttribute("part", "question-choice");
        otherRadio = document.createElement("input");
        otherRadio.type = "radio";
        otherRadio.name = group;
        otherRadio.value = "";
        otherRadio.setAttribute("part", "question-radio");
        const text = document.createElement("span");
        text.setAttribute("part", "question-choice-text");
        text.textContent = strings.otherOption;
        label.append(otherRadio, text);
        form.appendChild(label);
        input.disabled = true;
      }
      form.appendChild(input);
    }

    const actions = document.createElement("div");
    actions.className = "question-actions";
    actions.setAttribute("part", "question-actions");
    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "question-btn";
    submit.setAttribute("part", "question-button");
    submit.textContent = strings.submit;
    actions.appendChild(submit);

    let settled = false;
    const answerFor = (): string | null => {
      const picked = radios.find((r) => r.checked);
      if (picked !== undefined) {
        return picked.value;
      }
      if (input !== null && (otherRadio === null || otherRadio.checked)) {
        const typed = input.value.trim();
        return typed === "" ? null : typed;
      }
      return null;
    };
    const refresh = (): void => {
      if (input !== null && otherRadio !== null) {
        input.disabled = !otherRadio.checked;
      }
      submit.disabled = answerFor() === null;
    };
    const close = (answer: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      submit.disabled = true;
      for (const radio of radios) {
        radio.disabled = true;
      }
      if (otherRadio !== null) {
        otherRadio.disabled = true;
      }
      if (input !== null) {
        input.disabled = true;
      }
      card.setAttribute("data-resolved", answer === "" ? "cancelled" : "answered");
      resolve(answer);
    };

    for (const radio of [...radios, ...(otherRadio !== null ? [otherRadio] : [])]) {
      radio.addEventListener("change", refresh);
    }
    input?.addEventListener("input", refresh);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const answer = answerFor();
        if (answer !== null) {
          close(answer);
        }
      }
    });
    submit.addEventListener("click", () => {
      const answer = answerFor();
      if (answer !== null) {
        close(answer);
      }
    });
    options.signal?.addEventListener("abort", () => close(""), { once: true });

    card.append(body, form, actions);
    host.appendChild(card);
    if (options.signal?.aborted === true) {
      close("");
      return;
    }
    refresh();
    (hasChoices ? radios[0] : input)?.focus();
  });
}
