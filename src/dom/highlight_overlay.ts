import { HIGHLIGHT_OVERLAY_Z_INDEX } from "../constants.js";

/** The package accent, used when the host has themed nothing. */
const ACCENT = "#4f46e5";

/** How the overlay is drawn around the element being pointed at. */
export interface HighlightOverlayOptions {
  /** Dim everything except the target. Default false. */
  readonly scrim?: boolean;
  /** Draw the ring as a moving gradient rather than a flat colour. Default false. */
  readonly gradient?: boolean;
  /** Ring colour, and the flat fallback for the gradient. */
  readonly color?: string;
  /** Gap between the target's box and the ring. Default 4. */
  readonly padding?: number;
  /** Corner radius of the cut-out and the ring. Default: the target's own. */
  readonly radius?: number;
  /** Ring thickness. Default 3, or `--ag-ui-highlight-ring-width` on the target. */
  readonly ringWidth?: number;
  /** One pass of the gradient. Default 2400, or `--ag-ui-highlight-flow-ms`. */
  readonly flowMs?: number;
}

/**
 * Read a `--ag-ui-*` token from the element being pointed at.
 *
 * From the *target*, not from the overlay. The overlay is appended to the
 * document body so it can escape the clipping this exists to avoid, which also
 * means a `var()` in its own inline style resolves against the body's cascade --
 * so a host that themes the widget the documented way, on `ag-ui-chat` or on a
 * wrapper, would never reach it. The target is on the host's page and inherits
 * the host's cascade, which is the same reason the flat ring reads its accent
 * there.
 */
function tokenOn(target: HTMLElement, name: string, fallback: string): string {
  const value = window.getComputedStyle(target).getPropertyValue(name).trim();
  return value === "" ? fallback : value;
}

/** Default gap between the target's border box and the ring around it. */
const DEFAULT_PADDING_PX = 4;

/**
 * Draw an overlay that points at `target`, and return a function that removes
 * it.
 *
 * **Why an overlay rather than a style on the target.** The flat highlight
 * writes an `outline` onto the element itself, and that is deliberate: a
 * `box-shadow` paints outside the border box, so any `overflow: hidden`
 * ancestor sharing the target's box -- a card, a table cell -- clips the whole
 * ring away while the helper still reports success. But an outline takes a
 * *colour*. There is no `outline-image`, so a gradient ring cannot be one, and
 * every alternative that can be a gradient is a property of the target and
 * lands back inside whatever is clipping it.
 *
 * Dimming everything else wants the same thing from the other direction: a
 * surface larger than the target, which cannot be a property of the target. So
 * the scrim and the gradient are one mechanism rather than two features, and
 * both escape the clipping the outline was chosen to avoid, because nothing
 * here is a descendant of the element being pointed at.
 *
 * **It is inert.** The overlay never takes a pointer event, at the cut-out or
 * anywhere else. A dim that swallows clicks is a modal the user did not open,
 * and the driver's own point-then-click helper has to reach the control it just
 * finished pointing at.
 *
 * **It follows.** The cut-out is recomputed on scroll and resize, because a
 * highlight that stays where the target used to be is worse than none: it
 * points confidently at the wrong thing.
 */
export function showHighlightOverlay(
  target: HTMLElement,
  options: HighlightOverlayOptions = {},
): () => void {
  const root = document.createElement("div");
  root.setAttribute("data-ag-ui-highlight", "");
  // aria-hidden because the ring is decoration: the announcement that this
  // element matters is the agent's message, and a screen reader reaching a
  // second, contentless copy of it learns nothing.
  root.setAttribute("aria-hidden", "true");
  root.style.cssText = [
    "position: fixed",
    "inset: 0",
    "pointer-events: none",
    // Above the widget's own default, because the overlay's whole job is to
    // point at something on the page the widget is sitting over. A host whose
    // chrome stacks higher still can say so.
    `z-index: ${tokenOn(target, "--ag-ui-highlight-z-index", String(HIGHLIGHT_OVERLAY_Z_INDEX))}`,
  ].join(";");

  const scrim = document.createElement("div");
  const ring = document.createElement("div");
  // Named, because this overlay lives in the host's document rather than in
  // the shadow tree: `::part` cannot reach it, so a class is the only handle a
  // host has on the two boxes beyond the tokens they read.
  root.className = "ag-ui-highlight";
  scrim.className = "ag-ui-highlight-scrim";
  ring.className = "ag-ui-highlight-ring";
  if (options.scrim === true) {
    root.append(scrim);
  }
  root.append(ring);

  const ringWidth =
    options.ringWidth ?? Number.parseFloat(tokenOn(target, "--ag-ui-highlight-ring-width", "3"));
  const flowMs =
    options.flowMs ?? Number.parseFloat(tokenOn(target, "--ag-ui-highlight-flow-ms", "2400"));

  const paint = (): void => {
    const box = target.getBoundingClientRect();
    const pad = options.padding ?? DEFAULT_PADDING_PX;
    // No fallback for an unparseable radius: getComputedStyle on an element in
    // the document always resolves this, and the overlay is only ever shown for
    // one the driver has already found. A guard here would be a branch no test
    // can reach honestly.
    const radius = options.radius ?? Number.parseFloat(getComputedStyle(target).borderRadius);
    const left = box.left - pad;
    const top = box.top - pad;
    const width = box.width + pad * 2;
    const height = box.height + pad * 2;

    if (options.scrim === true) {
      // A hole rather than four rectangles: one element, and it stays a hole
      // through a radius. The outer ring runs clockwise and the inner one
      // anticlockwise, which is what makes evenodd treat the inside as outside.
      scrim.style.cssText = [
        "position: absolute",
        "inset: 0",
        `background: ${tokenOn(target, "--ag-ui-highlight-scrim", "rgba(15, 15, 25, 0.45)")}`,
        `clip-path: path(evenodd, '${holePath(left, top, width, height, radius + pad)}')`,
      ].join(";");
    }

    ring.style.cssText = [
      "position: absolute",
      `left: ${left}px`,
      `top: ${top}px`,
      `width: ${width}px`,
      `height: ${height}px`,
      `border-radius: ${radius + pad}px`,
      `border: ${ringWidth}px solid transparent`,
      "box-sizing: border-box",
      ringPaint(target, options),
    ].join(";");
  };

  paint();
  // Animated from script rather than a CSS keyframe, because the overlay lives
  // in the host's document and not in the shadow tree: a keyframe would mean
  // injecting a rule into someone else's stylesheet and remembering whether it
  // had already been injected, which is module-level state this package does
  // not keep.
  //
  // Reduced motion asks for no animation, not for no feedback -- the gradient
  // is still drawn, it simply stops travelling.
  let flow: Animation | null = null;
  if (options.gradient === true && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    flow = ring.animate([{ backgroundPosition: "100% 0" }, { backgroundPosition: "-100% 0" }], {
      duration: flowMs,
      iterations: Number.POSITIVE_INFINITY,
      easing: "linear",
    });
  }
  // Capture, so a scroll inside any container reaches this and not just one on
  // the document. Passive: this only reads geometry and paints.
  const listen = { capture: true, passive: true } as const;
  window.addEventListener("scroll", paint, listen);
  window.addEventListener("resize", paint, listen);
  document.body.appendChild(root);

  return () => {
    window.removeEventListener("scroll", paint, listen);
    window.removeEventListener("resize", paint, listen);
    // Cancelled as well as detached. An infinite animation never finishes, so
    // it is never auto-removed the way a finite one is; removing the node
    // ought to make it irrelevant and collectable, but that is a claim about
    // when an engine drops a non-relevant animation rather than something this
    // function controls. Cancelling makes the teardown total and costs a call.
    flow?.cancel();
    root.remove();
  };
}

/**
 * A caller's colour, or `null` if it is not one.
 *
 * The value is joined into a `;`-separated `cssText` run, so a string carrying
 * its own semicolon would write further declarations onto a `position: fixed;
 * inset: 0` element in the host's page. This function is newly public and
 * "point at this element in colour X" is the obvious wiring for it, with X
 * coming from wherever the host got it -- which can be the agent.
 */
function safeColor(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  return CSS.supports("color", value) ? value : null;
}

/**
 * The ring's paint: a flat border, or a gradient masked to the border box.
 *
 * A gradient border needs the mask because a background paints inside the
 * border, not on it -- the two-layer mask keeps the border box and subtracts
 * the padding box, leaving the frame.
 */
function ringPaint(target: HTMLElement, options: HighlightOverlayOptions): string {
  const color = safeColor(options.color) ?? tokenOn(target, "--ag-ui-accent", ACCENT);
  if (options.gradient !== true) {
    return `border-color: ${color}`;
  }
  const image = tokenOn(
    target,
    "--ag-ui-highlight-gradient",
    `linear-gradient(115deg, transparent 20%, ${color} 50%, transparent 80%)`,
  );
  const mask = "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)";
  return [
    `background-image: ${image}`,
    "background-origin: border-box",
    "background-size: 300% 100%",
    `-webkit-mask: ${mask}`,
    `mask: ${mask}`,
    "-webkit-mask-composite: xor",
    "mask-composite: exclude",
    "background-position: 50% 0",
  ].join(";");
}

/**
 * A viewport-sized rectangle with a rounded rectangle cut out of it, as an SVG
 * path for `clip-path: path(evenodd, ...)`.
 *
 * Written in absolute commands and closed explicitly, because a `clip-path`
 * that fails to parse is not an error anywhere -- the declaration is dropped
 * and the scrim silently covers the target it was meant to reveal.
 */
function holePath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  const right = x + width;
  const bottom = y + height;
  const outer = `M 0 0 H ${window.innerWidth} V ${window.innerHeight} H 0 Z`;
  const hole = [
    `M ${x + r} ${y}`,
    `H ${right - r}`,
    `A ${r} ${r} 0 0 1 ${right} ${y + r}`,
    `V ${bottom - r}`,
    `A ${r} ${r} 0 0 1 ${right - r} ${bottom}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${bottom - r}`,
    `V ${y + r}`,
    `A ${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");
  return `${outer} ${hole}`;
}
