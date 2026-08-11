/** Which dimensions a placement lets the user drag. */
export type ResizeAxis = "both" | "width" | "none";

/** Persisted size, in CSS pixels. Either axis may be absent. */
export interface ResizeSize {
  readonly width?: number;
  readonly height?: number;
}

/** What the handle needs from its host to do its job. */
export interface ResizeOptions {
  /** Which axes this placement allows. `none` means no handle is built. */
  readonly axis: ResizeAxis;
  /** Current size, so a drag starts from what is on screen. */
  readonly measure: () => { width: number; height: number };
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
 * **It writes the custom properties rather than inline `width` / `height`.**
 * The placement rules set those same properties, so an inline dimension would
 * fight them — a sidebar would keep a dragged width after switching to
 * fullscreen. Writing the property means placement still has the final say.
 *
 * Which axes are draggable is the placement's call, not this file's: a
 * full-bleed layout is `100vw`/`100vh` by definition, so a handle there is a
 * control that does nothing.
 */
export function createResizeHandle(options: ResizeOptions): HTMLDivElement | null {
  if (options.axis === "none") {
    return null;
  }
  const handle = document.createElement("div");
  handle.className = `resize-handle resize-handle--${options.axis}`;
  handle.setAttribute("part", "resize-handle");
  handle.setAttribute("role", "separator");
  handle.setAttribute("aria-orientation", options.axis === "width" ? "vertical" : "horizontal");
  handle.setAttribute("aria-label", options.label);
  handle.tabIndex = 0;

  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    const origin = { x: event.clientX, y: event.clientY, ...options.measure() };

    // Built per drag so the start point is captured rather than read back from
    // a nullable field: there is then no "no drag in progress" state for the
    // move handler to defend against.
    const sizeFor = (move: PointerEvent): ResizeSize => {
      // The panel is anchored right/bottom in every resizable placement, so
      // dragging left or up grows it: the delta is subtracted, not added.
      const width = Math.max(MIN_WIDTH, origin.width - (move.clientX - origin.x));
      if (options.axis === "width") {
        return { width };
      }
      return { width, height: Math.max(MIN_HEIGHT, origin.height - (move.clientY - origin.y)) };
    };

    const onMove = (move: PointerEvent): void => {
      options.apply(sizeFor(move));
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      handle.removeAttribute("data-dragging");
      options.commit(sizeFor(up));
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
    const step = event.shiftKey ? 64 : 16;
    const { width, height } = options.measure();
    let next: ResizeSize | null = null;
    if (event.key === "ArrowLeft") {
      next = { width: Math.max(MIN_WIDTH, width + step) };
    } else if (event.key === "ArrowRight") {
      next = { width: Math.max(MIN_WIDTH, width - step) };
    } else if (event.key === "ArrowUp" && options.axis === "both") {
      next = { height: Math.max(MIN_HEIGHT, height + step) };
    } else if (event.key === "ArrowDown" && options.axis === "both") {
      next = { height: Math.max(MIN_HEIGHT, height - step) };
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
