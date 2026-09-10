/**
 * Which edges a grip drags. An axis left out is an axis the grip does not
 * move: the left-edge grip is `{ x: "left" }`, the top-right corner is
 * `{ x: "right", y: "top" }`.
 */
export interface ResizeGrip {
  readonly x?: "left" | "right";
  readonly y?: "top" | "bottom";
}

/** Which edges the layout holds still while the panel changes size. */
export interface ResizeAnchor {
  /** The horizontal edge that does not move. */
  readonly x: "left" | "right";
  /** The vertical edge that does not move. */
  readonly y: "top" | "bottom";
}

/**
 * What the current placement allows: both axes, width only, or nothing. Which
 * edges a given grip drags is separate, and fixed when the grip is built.
 */
export type ResizeAxis = "none" | "width" | "both";

/** Persisted size, in CSS pixels. Either axis may be absent. */
export interface ResizeSize {
  readonly width?: number;
  readonly height?: number;
}

/** The panel's position on screen, in viewport coordinates. */
export interface PanelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** What the handle needs from its host to do its job. */
export interface ResizeOptions {
  /**
   * Which axes the current placement allows, read per interaction. A getter
   * because `placement` is a live attribute, and a value read at construction
   * would survive the host switching to a docked or full-bleed layout.
   */
  readonly axis: () => ResizeAxis;
  /** The panel's current bounding box. */
  readonly rect: () => PanelRect;
  /** Apply a box (the host decides what that costs in properties). */
  readonly apply: (box: PanelRect) => void;
  /**
   * Called once per completed resize, for persistence: on `pointerup` for a
   * drag, and when the key comes up (or focus leaves the handle) for a key
   * press. Never per pointer move, and never per key repeat.
   */
  readonly commit: (box: PanelRect) => void;
  /** Accessible label. */
  readonly label: string;
}

/** Smallest usable panel; below this the composer and header collide. */
const MIN_WIDTH = 280;
const MIN_HEIGHT = 240;

/** Keyboard step, and the larger one Shift asks for. */
const STEP = 16;
const COARSE_STEP = 64;

/**
 * A drag handle that resizes the chat panel from one edge or corner.
 *
 * The rule that keeps it correct is that **the edge a grip does not drag is the
 * one that stays put**. That is the whole model, and it is what lets the same
 * code serve all eight grips: the left-edge grip moves the left edge and holds
 * the right, the right-edge grip does the reverse, a corner does both axes.
 *
 * Which edge the *layout* pins is a different question and is deliberately not
 * asked here. It matters only to the host, which has to rewrite its own
 * position when a grip drags the very edge the layout was holding still --
 * dragging the pinned edge of a panel is a move as much as a resize. The
 * handle reports the box it wants; what that costs in CSS properties is the
 * host's problem.
 *
 * An earlier version took the anchor and derived the direction from it, which
 * is where the asymmetries lived: whether an arrow key grew or shrank the
 * panel depended on which corner the single grip had been placed on. With the
 * grip stated outright, an arrow simply moves the edge it names.
 */
export function createResizeHandle(grip: ResizeGrip, options: ResizeOptions): HTMLDivElement {
  const handle = document.createElement("div");
  handle.className = `resize-handle resize-handle--${gripName(grip)}`;
  handle.setAttribute("part", `resize-handle resize-handle-${gripName(grip)}`);
  // A separator with an orientation: an edge grip splits along one axis, and a
  // corner has no single one to report.
  handle.setAttribute("role", "separator");
  if (grip.x === undefined) {
    handle.setAttribute("aria-orientation", "horizontal");
  } else if (grip.y === undefined) {
    handle.setAttribute("aria-orientation", "vertical");
  }
  handle.setAttribute("aria-label", options.label);
  handle.tabIndex = 0;

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    const axis = options.axis();
    if (axis === "none" || !movable(grip, axis)) {
      return;
    }
    // Captured once: the edges this grip is not dragging cannot move during
    // the drag, and reading them live would chase the panel as it resizes.
    const rect = options.rect();

    const onMove = (move: PointerEvent): void => {
      options.apply(boxAt(grip, axis, rect, move.clientX, move.clientY));
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      handle.removeAttribute("data-dragging");
      options.commit(boxAt(grip, axis, rect, up.clientX, up.clientY));
    };

    handle.setAttribute("data-dragging", "true");
    // Listeners on `window`, not the handle: a fast drag outruns the pointer
    // and would otherwise strand the panel mid-resize with no pointerup.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    event.preventDefault();
  });

  // The box the current key gesture has applied but not yet persisted. The
  // pointer path can commit inline because a drag has one unambiguous end;
  // a key press does not, so the gesture's result is held here until it does.
  let pending: PanelRect | null = null;

  /** End a key gesture: persist what it applied, once. */
  const settle = (): void => {
    if (pending === null) {
      return;
    }
    const box = pending;
    pending = null;
    options.commit(box);
  };

  // Keyboard parity: a pointer-only resize is unreachable without a mouse, and
  // this control has no equivalent elsewhere in the UI. An arrow moves the edge
  // this grip names, in the direction it names -- so the same key grows one
  // side's grip and shrinks the opposite one, which is what a pointer does too.
  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    const axis = options.axis();
    if (axis === "none" || !movable(grip, axis)) {
      return;
    }
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const rect = options.rect();
    const delta = ARROWS[event.key];
    if (delta === undefined) {
      return;
    }
    // An arrow across this grip's fixed axis has no edge to move.
    if ((delta.x !== 0 && grip.x === undefined) || (delta.y !== 0 && grip.y === undefined)) {
      return;
    }
    event.preventDefault();
    const x = (grip.x === "left" ? rect.left : rect.right) + delta.x * step;
    const y = (grip.y === "top" ? rect.top : rect.bottom) + delta.y * step;
    const next = boxAt(grip, axis, rect, x, y);
    // Live feedback per key event, persistence only when the gesture ends:
    // `commit` promises one call per completed resize, and a held arrow key
    // repeats at the OS rate (20-30 events a second), so committing here would
    // put that many storage writes or PATCHes behind a single press — landing
    // hardest on the keyboard users this path exists for.
    options.apply(next);
    pending = next;
  });

  // The key coming up ends the gesture, mirroring `pointerup`. `blur` closes one
  // whose keyup never arrives here — focus moved on mid-press — because a size
  // that was applied but never committed is a resize the host silently forgets.
  handle.addEventListener("keyup", settle);
  handle.addEventListener("blur", settle);

  return handle;
}

/** Which way each arrow key pushes the edge under it. */
const ARROWS: Record<string, { x: number; y: number } | undefined> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** The hyphenated name of a grip, for its class and part. */
export function gripName(grip: ResizeGrip): string {
  return [grip.y, grip.x].filter((side) => side !== undefined).join("-");
}

/** Whether the current placement leaves this grip anything to move. */
function movable(grip: ResizeGrip, axis: ResizeAxis): boolean {
  // A docked panel owns its height, so a grip that only moves a horizontal
  // edge has nothing to do and must not pretend otherwise.
  return axis === "both" || grip.x !== undefined;
}

/**
 * The box a pointer at (x, y) implies for this grip.
 *
 * Each axis is clamped by pushing the *dragged* edge back to the minimum,
 * never by moving the edge that is supposed to be standing still: clamping the
 * wrong one is how a panel dragged past its minimum starts travelling.
 */
function boxAt(
  grip: ResizeGrip,
  axis: ResizeAxis,
  rect: PanelRect,
  x: number,
  y: number,
): PanelRect {
  const left = grip.x === "left" ? Math.min(x, rect.right - MIN_WIDTH) : rect.left;
  const right = grip.x === "right" ? Math.max(x, rect.left + MIN_WIDTH) : rect.right;
  // A placement that owns its height leaves the vertical edges where they are.
  const vertical = axis === "both";
  const top = vertical && grip.y === "top" ? Math.min(y, rect.bottom - MIN_HEIGHT) : rect.top;
  const bottom = vertical && grip.y === "bottom" ? Math.max(y, rect.top + MIN_HEIGHT) : rect.bottom;
  return { left, top, right, bottom };
}
