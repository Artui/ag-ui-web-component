import { clampLauncher } from "./clamp_launcher.js";
import type { LauncherBox, ViewportBox } from "./launcher_placement.js";

/** What the drag needs from its host to do its job. */
export interface LauncherDragOptions {
  /**
   * Whether the current placement lets the launcher move, read per interaction
   * because `placement` is a live attribute. A docked rail and a full-bleed
   * layout have nowhere to move it to.
   */
  readonly enabled: () => boolean;
  /** The launcher's current box, in viewport coordinates. */
  readonly rect: () => LauncherBox;
  /** The viewport the launcher has to stay inside. */
  readonly viewport: () => ViewportBox;
  /** Put the launcher's top-left at this point. Called per pointer move. */
  readonly apply: (left: number, top: number) => void;
  /**
   * Called once per completed move, for persistence: on `pointerup` for a
   * drag, and when the key comes up (or focus leaves) for a key press. Never
   * per pointer move, and never per key repeat.
   */
  readonly commit: (left: number, top: number) => void;
}

/**
 * How far the pointer must travel before this counts as a drag rather than a
 * click. The launcher's first job is still to expand the panel, so a press
 * that wanders by a pixel has to remain a press.
 */
const DRAG_THRESHOLD = 4;

/** Keyboard step, and the larger one Shift asks for. */
const STEP = 16;
const COARSE_STEP = 64;

/**
 * Let the user drag the collapsed launcher anywhere on screen.
 *
 * The launcher is a button before it is a handle, and that ordering is the
 * whole difficulty: every drag ends in a `click` the browser synthesises, which
 * would expand the panel the user was only repositioning. So a completed drag
 * arms a one-shot capture listener that eats exactly one click.
 *
 * Two things stop that from eating a click it should not have. A drag ending
 * off the launcher never produces the click it armed, so the arming is cleared
 * on the next `pointerdown` -- a pointer click is always preceded by a press,
 * which puts the clearing ahead of any click it could reach.
 *
 * That leaves the clicks with no press in front of them at all: `Enter` and
 * `Space` on the focused button, assistive technology activating it, and a host
 * calling `click()` itself. None of those is the tail of a drag, and all of them
 * are the only way in for someone not using a pointer, so the suppression is
 * narrowed to clicks carrying a click count -- which is the pointer's own.
 */
export function enableLauncherDrag(launcher: HTMLElement, options: LauncherDragOptions): void {
  let suppressClick = false;

  launcher.addEventListener(
    "click",
    (event: MouseEvent) => {
      // detail is the click count on a pointer click and zero on a keyboard,
      // assistive or programmatic one. Only the first kind can end a drag.
      if (!suppressClick || event.detail === 0) {
        return;
      }
      suppressClick = false;
      // Capture phase, so this runs before the expand handler bound to the
      // same element rather than after it.
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  launcher.addEventListener("pointerdown", (event: PointerEvent) => {
    // Any suppression left armed by a drag that ended elsewhere dies here,
    // before it can reach a click belonging to this new gesture.
    suppressClick = false;
    if (!options.enabled()) {
      return;
    }
    const start = options.rect();
    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;

    const onMove = (move: PointerEvent): void => {
      const dx = move.clientX - originX;
      const dy = move.clientY - originY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) {
        return;
      }
      dragging = true;
      launcher.setAttribute("data-dragging", "true");
      // Measured from the box the press started on, never from the live one:
      // reading it each move would chase the launcher as it moves and the
      // travel would compound.
      const next = clampLauncher(
        { ...start, left: start.left + dx, top: start.top + dy },
        options.viewport(),
      );
      options.apply(next.left, next.top);
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      if (!dragging) {
        return;
      }
      launcher.removeAttribute("data-dragging");
      suppressClick = true;
      const next = clampLauncher(
        {
          ...start,
          left: start.left + (up.clientX - originX),
          top: start.top + (up.clientY - originY),
        },
        options.viewport(),
      );
      options.commit(next.left, next.top);
    };

    // Listeners on `window`, not the launcher: a fast drag outruns the pointer
    // and would otherwise strand it mid-move with no pointerup.
    //
    // pointercancel matters on touch, where it is routine rather than
    // exceptional: the browser takes the pointer back for a scroll or a system
    // gesture and never sends pointerup. Without this the move listeners stay
    // attached and the drag stamp never clears, which leaves the launcher
    // following a finger that has stopped and the element believing a gesture
    // is still in flight.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  });

  // The position this key gesture has applied but not yet persisted. The
  // pointer path can commit inline because a drag has one unambiguous end; a
  // key press does not, so the gesture's result is held here until it does.
  let pending: { left: number; top: number } | null = null;

  /** End a key gesture: persist what it applied, once. */
  const settle = (): void => {
    if (pending === null) {
      return;
    }
    const { left, top } = pending;
    pending = null;
    options.commit(left, top);
  };

  // Keyboard parity: a pointer-only move is unreachable without a mouse, and
  // the launcher has no equivalent control elsewhere. Arrow keys are free on a
  // button, so Enter and Space still expand.
  launcher.addEventListener("keydown", (event: KeyboardEvent) => {
    if (!options.enabled()) {
      return;
    }
    const step = event.shiftKey ? COARSE_STEP : STEP;
    const rect = options.rect();
    let moved: { left: number; top: number } | null = null;
    if (event.key === "ArrowLeft") {
      moved = { left: rect.left - step, top: rect.top };
    } else if (event.key === "ArrowRight") {
      moved = { left: rect.left + step, top: rect.top };
    } else if (event.key === "ArrowUp") {
      moved = { left: rect.left, top: rect.top - step };
    } else if (event.key === "ArrowDown") {
      moved = { left: rect.left, top: rect.top + step };
    }
    if (moved === null) {
      return;
    }
    event.preventDefault();
    const next = clampLauncher({ ...rect, ...moved }, options.viewport());
    // Live feedback per key event, persistence only when the gesture ends: a
    // held arrow repeats at the OS rate, and committing here would put that
    // many storage writes behind a single press.
    options.apply(next.left, next.top);
    pending = next;
  });

  // The key coming up ends the gesture, mirroring `pointerup`. `blur` closes
  // one whose keyup never arrives here -- focus moved on mid-press -- because a
  // position applied but never committed is a move the host silently forgets.
  launcher.addEventListener("keyup", settle);
  launcher.addEventListener("blur", settle);
}
