import type { UiStrings } from "../ui_strings.js";
import { headerButton } from "./header_button.js";
import { iconElement } from "./icon_element.js";

/** What {@link buildHeader} needs from the element that owns the header. */
export interface HeaderOptions {
  /** The element itself, asked whether a host slotted an icon. */
  readonly host: HTMLElement;
  /** The title node, kept by the element so a later `title-text` can update it. */
  readonly title: HTMLElement;
  readonly titleText: string;
  readonly iconUrl: string | null;
  readonly strings: UiStrings;
  /** Whether the server indexes runs, so there is anything to continue. */
  readonly withCheckpoints: boolean;
  /** The opt-in theme toggle, or `null` when the host did not ask for one. */
  readonly themeToggle: HTMLButtonElement | null;
  readonly signal: AbortSignal;
  readonly onHistory: () => void;
  readonly onCheckpoints: () => void;
  readonly onNewChat: () => void;
  readonly onCollapse: () => void;
  readonly onToggleTheme: () => void;
}

/** The header, and the one control the element still needs a handle on. */
export interface BuiltHeader {
  readonly header: HTMLElement;
  /**
   * The checkpoints button, built whether or not it is shown: the click-away
   * handler for the checkpoints popover has to exclude it either way.
   */
  readonly checkpoints: HTMLButtonElement;
}

/**
 * Build the panel's title bar: the optional icon, the title, the host's
 * header-actions slot, and the controls.
 *
 * Every control calls back into the element's public methods, so a host
 * chrome driving them imperatively takes exactly the path the built-in button
 * takes.
 */
export function buildHeader(options: HeaderOptions): BuiltHeader {
  const { strings } = options;
  const header = document.createElement("div");
  header.className = "header";
  header.setAttribute("part", "header");

  const title = options.title;
  title.className = "header-title";
  title.setAttribute("part", "title");
  title.textContent = options.titleText;

  // Optional header icon: a slot (any markup) with a `data-icon-url` <img>
  // fallback. Rendered only when one of the two is provided, so the header has
  // no phantom gap otherwise.
  if (options.host.querySelector('[slot="icon"]') !== null || options.iconUrl !== null) {
    header.append(iconElement("icon", "icon", null, options.iconUrl));
  }

  // A coarse slot for host-provided header actions, between title and controls.
  const headerActions = document.createElement("slot");
  headerActions.name = "header-actions";

  const controls = document.createElement("div");
  controls.className = "header-controls";
  controls.setAttribute("part", "header-controls");

  const history = headerButton("history", strings.chatHistory, "☰");
  history.addEventListener("click", options.onHistory);

  // ↺ rather than ⭯: the same idea in a glyph that has a font behind it in
  // every browser. The obscure one rendered as an unreadable mark at 14px, and a
  // header control nobody can name is one nobody presses.
  const checkpoints = headerButton("checkpoints", strings.checkpoints, "↺");
  checkpoints.addEventListener("click", options.onCheckpoints);

  const newChat = headerButton("new", strings.newChat, "✚");
  newChat.addEventListener("click", options.onNewChat);

  const collapse = headerButton("collapse", strings.collapse, "—");
  collapse.addEventListener("click", options.onCollapse);

  // Only offered when the server actually indexes runs — without
  // `data-runs-url` there is nothing to continue and the button would open
  // a permanently empty panel.
  if (options.withCheckpoints) {
    controls.append(history, checkpoints, newChat);
  } else {
    controls.append(history, newChat);
  }
  // Optional built-in theme toggle: off unless the host opts in, so
  // it never competes with a host-supplied switch in `slot="header-actions"`.
  const toggle = options.themeToggle;
  if (toggle !== null) {
    toggle.type = "button";
    toggle.className = "header-btn header-btn--theme";
    toggle.setAttribute("part", "header-button theme-toggle");
    toggle.title = strings.toggleTheme;
    toggle.setAttribute("aria-label", strings.toggleTheme);
    toggle.addEventListener("click", options.onToggleTheme, { signal: options.signal });
    controls.append(toggle);
  }
  controls.append(collapse);
  header.append(title, headerActions, controls);
  return { header, checkpoints };
}
