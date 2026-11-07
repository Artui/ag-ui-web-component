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
 * Only the chat's own accent is adjusted, because it follows the widget's
 * scheme rather than the page's: a dark widget's near-white accent on a light
 * page all but disappears. It is held to 3:1 against the surface behind the
 * target (see {@link surfaceBehind}): the accent as resolved if it holds, else
 * the other half of the chat's light-dark pair, else the accent stepped toward
 * black or white. Every value above it is a choice someone made, and is drawn
 * as given.
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
  if (owner === null) {
    return PACKAGE_ACCENT;
  }
  const chatAccent = resolveOn(owner, CHAT_ACCENT);
  return chatAccent === "" ? PACKAGE_ACCENT : legible(owner, chatAccent, target);
}

/** The contrast a ring needs against what it is drawn on (WCAG 2.4.13). */
const RING_CONTRAST = 3;

/** How far each step moves a failing accent toward black or white. */
const STEP = 0.1;

type Rgba = readonly [number, number, number, number];

/**
 * `accent`, or the nearest variant of it that holds {@link RING_CONTRAST}
 * against the surface behind `target`.
 *
 * Colours are compared as sRGB bytes painted onto a one-pixel canvas, the one
 * reading that turns a resolved color-mix() or oklch() into numbers. Where
 * there is no 2d context to paint on, nothing can be measured, and the accent
 * is drawn as it was.
 */
function legible(chat: HTMLElement, accent: string, target: HTMLElement): string {
  const paint = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (paint === null) {
    return accent;
  }
  const bytes = (color: string): Rgba => {
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = "rgb(0 0 0 / 0)";
    paint.fillStyle = color;
    paint.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const surface = surfaceBehind(target, bytes);
  const holds = (color: Rgba): boolean => contrast(over(color, surface), surface) >= RING_CONTRAST;
  const own = [accent, resolveOn(chat, CHAT_ACCENT, "light"), resolveOn(chat, CHAT_ACCENT, "dark")];
  const fit = own.find((candidate) => holds(bytes(candidate)));
  if (fit !== undefined) {
    return fit;
  }
  // Black or white, whichever the surface sets off better, holds at least
  // 4.5:1 against any surface, so the walk always ends by the last step.
  const from = over(bytes(accent), surface);
  const black: Rgba = [0, 0, 0, 1];
  const white: Rgba = [255, 255, 255, 1];
  const toward = contrast(black, surface) > contrast(white, surface) ? black : white;
  let step = 1;
  while (!holds(mix(from, toward, step * STEP))) {
    step += 1;
  }
  const [r, g, b] = mix(from, toward, step * STEP);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The colour of the surface a ring around `target` is drawn on, as opaque
 * sRGB bytes.
 *
 * The ring sits outside the target's border box (the flash outline is offset
 * from it, the overlay leaves a gap), so the target's own fill is not under
 * it: a white field on a dark page is ringed on the dark page. The surface is
 * every background from the target's parent up, composited until one is
 * opaque, over the page canvas, which follows the root's colour scheme. A
 * background image is not read; its colour beneath is.
 */
function surfaceBehind(target: HTMLElement, bytes: (color: string) => Rgba): Rgba {
  const layers: Rgba[] = [];
  for (let el = parentOf(target); el !== null; el = parentOf(el)) {
    const layer = bytes(window.getComputedStyle(el).backgroundColor);
    layers.push(layer);
    if (layer[3] === 1) {
      break;
    }
  }
  const probe = document.createElement("span");
  probe.hidden = true;
  probe.style.color = "Canvas";
  document.documentElement.appendChild(probe);
  let surface = bytes(window.getComputedStyle(probe).color);
  probe.remove();
  for (const layer of layers.reverse()) {
    surface = over(layer, surface);
  }
  return surface;
}

/** The element above `el`, crossing out of a shadow root to its host. */
function parentOf(el: Element): Element | null {
  if (el.parentElement !== null) {
    return el.parentElement;
  }
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/** `top` painted over the opaque `under`. */
function over(top: Rgba, under: Rgba): Rgba {
  return mix(under, top, top[3]);
}

/** `from` moved `share` of the way to `to`, as opaque bytes. */
function mix(from: Rgba, to: Rgba, share: number): Rgba {
  const channel = (index: 0 | 1 | 2): number =>
    Math.round(from[index] + (to[index] - from[index]) * share);
  return [channel(0), channel(1), channel(2), 1];
}

/** WCAG relative luminance of opaque sRGB bytes. */
function luminance([r, g, b]: Rgba): number {
  const linear = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG contrast ratio between two opaque colours. */
function contrast(a: Rgba, b: Rgba): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
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
 * chat) is read as it is, unresolved; that is the best it offers. `scheme`
 * forces one half of the pair, which is how a ring finds the chat's other
 * accent when its own scheme's is too faint against the page.
 */
function resolveOn(chat: HTMLElement, name: string, scheme?: "light" | "dark"): string {
  const value = readToken(chat, name);
  const root = chat.shadowRoot;
  if (value === "" || root === null) {
    return value;
  }
  const probe = document.createElement("span");
  probe.hidden = true;
  // A scheme named here picks that half of a light-dark() pair instead of
  // the one the chat's own scheme picks.
  if (scheme !== undefined) {
    probe.style.colorScheme = scheme;
  }
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
