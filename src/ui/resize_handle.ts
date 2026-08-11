/** Which edges the layout holds still while the panel changes size. */
export interface ResizeAnchor {
  /** The horizontal edge that does not move. */
  readonly x: "left" | "right";
  /** The vertical edge that does not move. */
  readonly y: "top" | "bottom";
}

/**
 * What the current placement allows: both axes, width only, or nothing.
 *
 * Which *corner* the grip sits on is not part of this — that follows the host's
 * layout, which the component measures rather than assumes.
 */
export type ResizeAxis = "none" | "width" | "both";

/** Persisted size, in CSS pixels. Either axis may be absent. */
export interface ResizeSize {
  readonly width?: number;
  readonly height?: number;
}

/** The panel's position on screen at the moment a drag starts. */
export interface PanelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** What the handle needs from its host to do its job. */
export interface ResizeOptions {
  /**
   * Which axes the current placement allows, read **per interaction**.
   *
   * A getter rather than a value because `placement` is a live attribute: read
   * once at construction, a handle built while floating kept its axes after the
   * host switched to a docked or full-bleed layout.
   */
  readonly axis: () => ResizeAxis;
  /**
   * Which edges the layout is holding still, measured at the moment of the
   * drag.
   *
   * **Measured, not derived from `placement`.** A floating panel is pinned
   * bottom-right and an embedded one goes wherever the host's own CSS puts it —
   * the demo playground drops it in a right-aligned flex slot, so "embedded"
   * alone says nothing. Guessing produced a panel that shrank when dragged
   * outward and travelled by its opposite corner.
   */
  readonly anchor: () => ResizeAnchor;
  /** The panel's current bounding box. */
  readonly rect: () => PanelRect;
  /** Apply a size (the host writes the custom properties). */
  readonly apply: (size: ResizeSize) => void;
  /** Called once per completed drag, for persistence. */
  readonly commit: (size: ResizeSize) => void;
  /** Accessible label. */
  readonly label: string;
}

/** Smallest usable panel; below this the composer and header collide. */
const MIN_WIDTH = 280;
const MIN_HEIGHT = 240;

/**
 * A drag handle that resizes the chat panel.
 *
 * The size was previously fixed by whatever the host set `--ag-ui-width` /
 * `--ag-ui-height` to: themeable by the page, immovable by the person reading a
 * long answer in a 380px column.
 *
 * **The new size is measured from the edge that is not moving, never from a
 * delta**, and which edge that is is **measured rather than assumed**. A
 * floating panel is pinned bottom-right; an embedded one goes wherever the
 * host's CSS puts it, so `placement` does not answer the question. Getting it
 * wrong is very visible: the panel shrinks when dragged outward and travels by
 * its opposite corner.
 *
 * **It writes the custom properties rather than inline `width` / `height`.**
 * The placement rules set those same properties, so an inline dimension would
 * fight them — a sidebar would keep a dragged width after switching to
 * fullscreen. Writing the property means placement still has the final say.
 *
 * The axes are read per interaction, so switching `placement` at runtime takes
 * effect immediately rather than leaving whichever ones the element happened to
 * mount with.
 */
export function createResizeHandle(options: ResizeOptions): HTMLDivElement {
  const handle = document.createElement("div");
  handle.className = "resize-handle";
  handle.setAttribute("part", "resize-handle");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-label", options.label);
  handle.tabIndex = 0;

  /** The size implied by a pointer at (x, y), given which edges are pinned. */
  const sizeAt = (
    axis: ResizeAxis,
    anchor: ResizeAnchor,
    rect: PanelRect,
    x: number,
    y: number,
  ): ResizeSize => {
    const width = anchor.x === "right" ? rect.right - x : x - rect.left;
    const clamped: ResizeSize = { width: Math.max(MIN_WIDTH, width) };
    if (axis !== "both") {
      return clamped;
    }
    const height = anchor.y === "bottom" ? rect.bottom - y : y - rect.top;
    return { ...clamped, height: Math.max(MIN_HEIGHT, height) };
  };

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    const axis = options.axis();
    if (axis === "none") {
      return;
    }
    // Captured once: the fixed edges cannot move during the drag, and reading
    // them live would chase the panel as it resizes.
    const anchor = options.anchor();
    const rect = options.rect();

    const onMove = (move: PointerEvent): void => {
      options.apply(sizeAt(axis, anchor, rect, move.clientX, move.clientY));
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      handle.removeAttribute("data-dragging");
      options.commit(sizeAt(axis, anchor, rect, up.clientX, up.clientY));
    };

    handle.setAttribute("data-dragging", "true");
    // Listeners on `window`, not the handle: a fast drag outruns the pointer
    // and would otherwise strand the panel mid-resize with no pointerup.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    event.preventDefault();
  });

  // Keyboard parity. A pointer-only resize is unreachable without a mouse, and
  // this control has no equivalent elsewhere in the UI.
  handle.addEventListener("keydown", (event: KeyboardEvent) => {
    const axis = options.axis();
    if (axis === "none") {
      return;
    }
    const anchor = options.anchor();
    const rect = options.rect();
    const step = event.shiftKey ? 64 : 16;
    // An arrow moves the grip, and whether that grows or shrinks depends on
    // which side the grip is on — the same asymmetry the pointer path handles.
    const outward = anchor.x === "right" ? -1 : 1;
    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    let next: ResizeSize | null = null;
    if (event.key === "ArrowLeft") {
      next = { width: Math.max(MIN_WIDTH, width - step * outward) };
    } else if (event.key === "ArrowRight") {
      next = { width: Math.max(MIN_WIDTH, width + step * outward) };
    } else if (axis === "both" && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      const grow = event.key === (anchor.y === "bottom" ? "ArrowUp" : "ArrowDown");
      next = { height: Math.max(MIN_HEIGHT, height + (grow ? step : -step)) };
    }
    if (next === null) {
      return;
    }
    event.preventDefault();
    options.apply(next);
    options.commit(next);
  });

  return handle;
}
