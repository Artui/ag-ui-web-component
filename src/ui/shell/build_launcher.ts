import { ICON_LAUNCHER } from "../../constants.js";
import type { UiStrings } from "../ui_strings.js";
import { iconElement } from "./icon_element.js";

/** The launcher's parts, owned by the element, and what fills them. */
export interface LauncherOptions {
  readonly launcher: HTMLButtonElement;
  readonly badge: HTMLElement;
  readonly railLabel: HTMLElement;
  /** The bottom bar's wrapper, which holds the launcher and the history button. */
  readonly bar: HTMLElement;
  /** The bottom bar's history button, a sibling of the launcher in the bar. */
  readonly barHistory: HTMLButtonElement;
  readonly titleText: string;
  readonly iconUrl: string | null;
  readonly strings: UiStrings;
  readonly signal: AbortSignal;
  readonly onOpen: () => void;
  readonly onHistory: () => void;
}

/**
 * Build what a collapsed widget shrinks to: a round floating button, the slim
 * edge rail under `placement="sidebar"`, or the strip along the bottom edge
 * under `collapse-to="bar"` -- one element, shaped by the stylesheet. The
 * element mounts the bar wrapper as a sibling of the panel, so it survives the
 * panel being hidden.
 *
 * The wrapper is there for the bar's history button: a button cannot nest in
 * a button, so the strip is the launcher and the history button side by side.
 * Outside the bar the wrapper draws no box and the history button is not
 * drawn, so the launcher lays out against the host exactly as it did alone.
 */
export function buildLauncher(options: LauncherOptions): void {
  const { launcher, badge, railLabel, bar, barHistory } = options;
  launcher.className = "launcher";
  launcher.type = "button";
  launcher.setAttribute("part", "launcher");
  launcher.setAttribute("aria-label", options.strings.expand);
  badge.className = "launcher-badge";
  badge.setAttribute("part", "launcher-badge");
  // The count is announced through the launcher's own label, so the badge is
  // decoration to a screen reader rather than a second, context-free number.
  badge.setAttribute("aria-hidden", "true");
  badge.hidden = true;
  // Only the edge rail shows this. A full-height column carrying one small
  // icon reads as a coloured stripe rather than a way back into a
  // conversation -- it is the widest collapsed state there is and the one
  // that says least about itself. Written here and hidden in CSS everywhere
  // else, because the launcher is one element shaped by placement.
  railLabel.className = "rail-label";
  railLabel.setAttribute("part", "rail-label");
  railLabel.setAttribute("aria-hidden", "true");
  railLabel.textContent = options.titleText;
  launcher.replaceChildren(
    iconElement("launcher", "launcher-icon", ICON_LAUNCHER, options.iconUrl),
    railLabel,
    badge,
  );
  launcher.addEventListener("click", options.onOpen, { signal: options.signal });
  bar.className = "dock-bar";
  bar.setAttribute("part", "bar");
  barHistory.className = "bar-history";
  barHistory.type = "button";
  barHistory.setAttribute("part", "bar-history");
  barHistory.title = options.strings.chatHistory;
  barHistory.setAttribute("aria-label", options.strings.chatHistory);
  // A glyph rather than the header's icon slot: a slot name may appear once
  // per shadow root, and the header's history button already holds it.
  const glyph = document.createElement("span");
  glyph.className = "bar-history-glyph";
  glyph.setAttribute("aria-hidden", "true");
  glyph.textContent = "\u2630";
  barHistory.replaceChildren(glyph);
  barHistory.addEventListener("click", options.onHistory, { signal: options.signal });
  bar.replaceChildren(launcher, barHistory);
}
