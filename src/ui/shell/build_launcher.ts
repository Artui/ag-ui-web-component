import { ICON_LAUNCHER } from "../../constants.js";
import type { UiStrings } from "../ui_strings.js";
import { iconElement } from "./icon_element.js";

/** The launcher's parts, owned by the element, and what fills them. */
export interface LauncherOptions {
  readonly launcher: HTMLButtonElement;
  readonly badge: HTMLElement;
  readonly railLabel: HTMLElement;
  readonly titleText: string;
  readonly iconUrl: string | null;
  readonly strings: UiStrings;
  readonly signal: AbortSignal;
  readonly onOpen: () => void;
}

/**
 * Build what a collapsed widget shrinks to: a round floating button, or the
 * slim edge rail under `placement="sidebar"` -- one element, shaped by the
 * stylesheet. The element mounts it as a sibling of the panel, so it survives
 * the panel being hidden.
 */
export function buildLauncher(options: LauncherOptions): void {
  const { launcher, badge, railLabel } = options;
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
}
