import type { UiStrings } from "./ui_strings.js";

/**
 * Most prompts one push may draw.
 *
 * **Keep in step with `MAX_SUGGESTIONS` in django-ag-ui's
 * `agent/suggestions_activity.py`**, which raises past it. Mirroring is the
 * whole point: this side silently draws no more than its limit and has no
 * channel to report the difference, so a producer that does not know the same
 * number ships suggestions that never appear. That is the hole the chart bounds
 * exist to close, and it was found there by shipping it.
 */
export const MAX_SUGGESTIONS = 4;

/** Longest one prompt may be. Mirrored for the same reason as the count. */
export const MAX_SUGGESTION_CHARS = 120;

/** The `prompts` a `suggestions` activity carries, or `null` when it carries none. */
export function suggestionPrompts(content: unknown): string[] | null {
  if (typeof content !== "object" || content === null) {
    return null;
  }
  const raw = (content as { prompts?: unknown }).prompts;
  if (!Array.isArray(raw)) {
    return null;
  }
  const prompts = raw
    .filter((prompt): prompt is string => typeof prompt === "string")
    .map((prompt) => prompt.trim())
    .filter((prompt) => prompt !== "" && prompt.length <= MAX_SUGGESTION_CHARS)
    .slice(0, MAX_SUGGESTIONS);
  return prompts.length === 0 ? null : prompts;
}

/**
 * Draw follow-up prompts as chips that send themselves when clicked.
 *
 * Returns `null` when nothing survives, which is the registry's signal to draw
 * nothing rather than an empty row -- the same contract the chart renderer uses
 * for a spec it cannot draw.
 *
 * Buttons rather than links or list items: each one performs an action in the
 * page, and the thing it sends is the label, so the accessible name is the
 * prompt itself and needs no `aria-label` restating it.
 */
export function renderSuggestionChips(
  content: unknown,
  strings: UiStrings,
  onPick: (prompt: string) => void,
): HTMLElement | null {
  const prompts = suggestionPrompts(content);
  if (prompts === null) {
    return null;
  }
  const row = document.createElement("div");
  row.className = "suggestions";
  row.setAttribute("part", "suggestions");
  // A group, labelled: without it a screen reader meets a row of unrelated
  // buttons with no hint that they are the assistant's offer rather than the
  // page's own controls.
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", strings.suggestions);
  for (const prompt of prompts) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "suggestion-chip";
    chip.setAttribute("part", "suggestion-chip");
    chip.textContent = prompt;
    chip.addEventListener("click", () => onPick(prompt));
    row.appendChild(chip);
  }
  return row;
}
