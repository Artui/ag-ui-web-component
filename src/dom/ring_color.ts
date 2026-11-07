import { ChatRegistration } from "../core/chat_registry.js";

/** The public ring token, read from the target and then from the chat. */
const RING_TOKEN = "--ag-ui-highlight-ring-color";

/** The accent a host themes its page with, read from the target. */
const ACCENT_TOKEN = "--ag-ui-accent";

/**
 * The accent the chat actually resolved, its theme's default included. Read
 * through the private alias because the public token is unset on a page that
 * themed nothing, which is exactly the page this exists for.
 */
const CHAT_ACCENT = "--_accent";

/** The package indigo, for a page with no chat and no theming at all. */
const PACKAGE_ACCENT = "#4f46e5";

/**
 * The colour a highlight ring is drawn in when the caller passed none.
 *
 * In order: `--ag-ui-highlight-ring-color` on the target, the same token on
 * the chat, the target's `--ag-ui-accent`, the chat's resolved accent, the
 * package indigo. The target's accent stays above the chat's own default so a
 * host that themes `--ag-ui-accent` on its page keeps the rings it has; the
 * ring token sits above both so a host can keep the ring apart from the accent.
 *
 * `chat` defaults to the most recently connected `<ag-ui-chat>`, the common
 * page with one widget. A page with two passes the one the ring speaks for.
 */
export function ringColor(target: HTMLElement, chat?: HTMLElement): string {
  const onTarget = readToken(target, RING_TOKEN);
  if (onTarget !== "") {
    return onTarget;
  }
  const owner = chat ?? ChatRegistration.latest();
  const onChat = owner === null ? "" : resolveOn(owner, RING_TOKEN);
  if (onChat !== "") {
    return onChat;
  }
  const accent = readToken(target, ACCENT_TOKEN);
  if (accent !== "") {
    return accent;
  }
  const chatAccent = owner === null ? "" : resolveOn(owner, CHAT_ACCENT);
  return chatAccent === "" ? PACKAGE_ACCENT : chatAccent;
}

function readToken(el: HTMLElement, name: string): string {
  return window.getComputedStyle(el).getPropertyValue(name).trim();
}

/**
 * The custom property `name` on `chat`, as the colour it computes to there, or
 * `""` when it is unset or not a colour.
 *
 * Resolved inside the chat rather than handed to the target, because the
 * chat's colours are `light-dark()` pairs and a custom property keeps them
 * unresolved: written onto an element in the page, the pair would pick its
 * half by the page's colour scheme, so a dark widget on a light page would ring
 * in its light-mode accent. A probe inside the shadow tree inherits the chat's
 * scheme, and its computed `color` is the resolved value.
 *
 * An element with no open shadow root (a host passing something other than a
 * chat) is read as it is, unresolved; that is the best it offers.
 */
function resolveOn(chat: HTMLElement, name: string): string {
  const value = readToken(chat, name);
  const root = chat.shadowRoot;
  if (value === "" || root === null) {
    return value;
  }
  const probe = document.createElement("span");
  probe.hidden = true;
  probe.style.color = value;
  // An unparseable value leaves the declaration empty, and the probe would
  // then report the colour it inherits instead of saying it has none.
  if (probe.style.color === "") {
    return "";
  }
  root.appendChild(probe);
  const resolved = window.getComputedStyle(probe).color;
  probe.remove();
  return resolved;
}
