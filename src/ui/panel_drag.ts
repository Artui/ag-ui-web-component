import type { PanelRect } from "./resize_handle.js";

/** What the drag needs from its host to do its job. */
export interface PanelDragOptions {
  /**
   * Whether the panel can be moved right now, read per interaction because
   * both halves of the answer are live: a docked or full-bleed placement has
   * nowhere to move the panel to, and a collapsed one has no panel on screen.
   */
  readonly enabled: () => boolean;
  /** The panel's current box, in viewport coordinates. */
  readonly rect: () => PanelRect;
  /**
   * Put the panel at this box. Called per pointer move, with the box the press
   * started on -- the whole gesture is one translation of that box, and a host
   * with anything else to move alongside the panel needs the same distance
   * rather than a distance measured from wherever the last move left things.
   */
  readonly apply: (box: PanelRect, from: PanelRect) => void;
  /** Called once per completed move, for persistence. Never per pointer move. */
  readonly commit: (box: PanelRect, from: PanelRect) => void;
}

/**
 * How far the pointer must travel before this counts as a drag. The header is
 * also where the title is selected and the controls are pressed, so a press
 * that wanders by a pixel has to remain a press.
 */
const DRAG_THRESHOLD = 4;

/**
 * Elements inside the header that own their own press. A drag started on one
 * of these would move the panel out from under the control the user was
 * aiming at, and every one of them is the only way to reach what it does.
 */
const CONTROLS = "button, a[href], input, select, textarea, [contenteditable]";

/**
 * Let the user move the whole widget by dragging the panel's header.
 *
 * The launcher can already be dragged, and this is the same gesture on the
 * half of the widget that is on screen when it is open -- a chat panel is a
 * window, and a window moves by its title bar. The two stay one position
 * rather than two: the host answers a moved panel by moving the launcher with
 * it, so collapsing after a drag leaves the launcher where the panel was.
 *
 * **No keyboard path here, deliberately.** Every other drag in this component
 * has arrow keys on the handle, because the handle is a control and the
 * capability is reachable nowhere else. A header is not a control: making it
 * focusable would put a tab stop with no role in front of every keyboard user,
 * ahead of the controls they actually came for. The capability is not lost --
 * arrow keys on the collapsed launcher move the widget, and the panel follows
 * it -- so what is missing is a shortcut, not the ability.
 */
export function enablePanelDrag(handle: HTMLElement, options: PanelDragOptions): void {
  handle.addEventListener("pointerdown", (event: PointerEvent) => {
    // Secondary buttons open menus and paste on the platforms that have them;
    // none of that is a drag.
    //
    // Three conditions in one arc, which coverage counts as one branch however
    // many of them are deleted. Each is held by a named test in
    // panel_drag.test.ts -- "ignores a secondary button", "does nothing where
    // the placement has nowhere to move the panel", and "steps aside for a
    // control in the header" -- verified by mutating each one out.
    if (event.button !== 0 || !options.enabled() || onControl(event, handle)) {
      return;
    }
    const start = options.rect();
    const originX = event.clientX;
    const originY = event.clientY;
    let dragging = false;

    const boxAt = (x: number, y: number): PanelRect => {
      // Measured from the box the press started on, never from the live one:
      // reading it each move would chase the panel as it moves and the travel
      // would compound.
      const dx = x - originX;
      const dy = y - originY;
      return {
        left: start.left + dx,
        top: start.top + dy,
        right: start.right + dx,
        bottom: start.bottom + dy,
      };
    };

    const onMove = (move: PointerEvent): void => {
      if (
        !dragging &&
        Math.hypot(move.clientX - originX, move.clientY - originY) < DRAG_THRESHOLD
      ) {
        return;
      }
      dragging = true;
      handle.setAttribute("data-dragging", "true");
      options.apply(boxAt(move.clientX, move.clientY), start);
    };

    const onUp = (up: PointerEvent): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!dragging) {
        return;
      }
      handle.removeAttribute("data-dragging");
      options.commit(boxAt(up.clientX, up.clientY), start);
    };

    // The press is the panel's from here: without this the browser starts
    // selecting the title text and the drag leaves a highlight behind it.
    event.preventDefault();
    // Listeners on `window`, not the header: a fast drag outruns the pointer
    // and would otherwise strand the panel mid-move with no pointerup.
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

/**
 * Whether the press landed on a control inside the header rather than on the
 * header itself.
 *
 * The composed path rather than `target`, because a control a host slots into
 * the header lives in the light DOM: retargeting reports the host element for
 * it, which matches nothing. Everything below the handle is examined and
 * nothing above it, so a control the header happens to sit inside is not one
 * of ours.
 */
function onControl(event: PointerEvent, handle: HTMLElement): boolean {
  const path = event.composedPath();
  return path
    .slice(0, path.indexOf(handle))
    .some((node) => node instanceof Element && node.matches(CONTROLS));
}
