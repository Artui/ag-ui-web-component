import type { UiStrings } from "../ui_strings.js";
import { renderSuggestionChips } from "./suggestion_chips.js";

/**
 * The prompts offered on an empty transcript, from `element`'s `data-starters`.
 *
 * Different from the suggestion chips a run pushes, which are follow-ups to
 * something already said. These answer the blank-page question instead, and
 * they are the host's rather than the model's -- only the host knows what its
 * page is for. Shares the renderer, the count and the length limit, because
 * two rows of prompt chips that behaved differently would be the harder
 * thing to explain.
 *
 * Read once at connect: it is content for a state the widget is in before
 * anything happens, and a host that wants it to change has `slot="empty"`.
 *
 * Parses the attribute itself rather than through the element's JSON attribute
 * reader, because the warning is its own: it says no starters are shown and
 * gives an example of the shape, where the shared one says a built-in default
 * is in use, which for this attribute there is not.
 */
export function renderStarterChips(
  element: Element,
  strings: UiStrings,
  onPick: (prompt: string) => void,
): HTMLElement | null {
  const raw = element.getAttribute("data-starters");
  if (raw === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(
      "<ag-ui-chat>: data-starters is not valid JSON, so no starters are shown. " +
        "It takes an array of strings, e.g. data-starters='[\"Summarise this page\"]'.",
    );
    return null;
  }
  return renderSuggestionChips({ prompts: parsed }, strings, onPick);
}
