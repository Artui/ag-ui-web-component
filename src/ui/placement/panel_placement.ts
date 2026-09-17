import { EDGE_MARGIN, SCREEN_EDGE_MARGIN } from "../../constants.js";
import type { ChatCorner, ChatSurfaceReport } from "../../tools/chat_surface_tools.js";
import type { UiStrings } from "../ui_strings.js";
import { clampLauncher } from "./clamp_launcher.js";
import { clampPanel } from "./clamp_panel.js";
import { isDraggablePlacement } from "./is_draggable_placement.js";
import { enableLauncherDrag } from "./launcher_drag.js";
import {
  type ExpandCorner,
  type Extent,
  type LauncherBox,
  launcherPlacement,
  type ViewportBox,
} from "./launcher_placement.js";
import { enablePanelDrag } from "./panel_drag.js";
import { placeWidget } from "./place_widget.js";
import {
  createResizeHandle,
  gripName,
  type PanelRect,
  type ResizeAnchor,
  type ResizeAxis,
  type ResizeGrip,
  type ResizeSize,
} from "./resize_handle.js";

/** Per-tab persistence key for a dragged panel size. */
const SIZE_KEY = "ag-ui-chat:size";

/** Per-tab persistence key for a dragged launcher position. */
const LAUNCHER_KEY = "ag-ui-chat:launcher";

/** A stored `{ left, top }` pair, or null for anything that is not one. */
function asPoint(value: unknown): { readonly left: number; readonly top: number } | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const { left, top } = value as { left?: unknown; top?: unknown };
  return typeof left === "number" && typeof top === "number" ? { left, top } : null;
}

/**
 * Whether a box covers the usable viewport, which is what full-bleed means.
 *
 * A pixel of slack on each axis, because a box sized from `100vw` and one sized
 * from the visual viewport disagree by sub-pixel rounding, and a panel that
 * fills the screen must not read as one that could still be moved within it.
 */
function coversViewport(box: Extent, viewport: Extent): boolean {
  return box.width >= viewport.width - 1 && box.height >= viewport.height - 1;
}

/**
 * The `--ag-ui-inset` value that pins `box` by `corner`.
 *
 * Only the two sides the corner names get a length; the other two are `auto`,
 * so the box keeps its size and grows away from that corner. Right and bottom
 * are measured from `screen`, the layout viewport, because that is what the
 * browser measures a fixed element's inset from.
 */
function insetFrom(corner: ResizeAnchor, box: PanelRect, screen: Extent): string {
  const side = (value: number): string => `${Math.round(value)}px`;
  return [
    corner.y === "top" ? side(box.top) : "auto",
    corner.x === "right" ? side(screen.width - box.right) : "auto",
    corner.y === "bottom" ? side(screen.height - box.bottom) : "auto",
    corner.x === "left" ? side(box.left) : "auto",
  ].join(" ");
}

/**
 * Every edge and corner the panel can be dragged by. Corners last, so they sit
 * above the edge strips they overlap and win the pointer at the corners.
 */
const RESIZE_GRIPS: readonly ResizeGrip[] = [
  { y: "top" },
  { y: "bottom" },
  { x: "left" },
  { x: "right" },
  { x: "left", y: "top" },
  { x: "right", y: "top" },
  { x: "left", y: "bottom" },
  { x: "right", y: "bottom" },
];

/**
 * What the placement needs from the element that owns it.
 *
 * Everything the element keeps private is reached through a thunk here, the
 * same shape `PanelDragOptions` and `ResizeOptions` already give their hosts:
 * read per call, so a value the element replaces later (the resolved string
 * table, the connected flag) is never captured stale.
 */
export interface PlacementHost {
  /** The custom element itself: its inline style, attributes and box. */
  readonly element: HTMLElement;
  /** The collapsed widget's button, which a drag moves and a resize carries. */
  readonly launcher: HTMLButtonElement;
  /** The shadow root, searched for a header mid-drag. */
  readonly root: ShadowRoot;
  /** Whether the element is in the document. */
  readonly connected: () => boolean;
  /** Whether the widget is collapsed. */
  readonly collapsed: () => boolean;
  /** Whether the current placement has a collapsed state at all. */
  readonly collapsible: () => boolean;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** Read a layout preference, durable store first. */
  readonly readPreference: (base: string) => string | null;
  /** Persist a layout preference to both stores. */
  readonly writePreference: (base: string, value: string) => void;
  /** Drop a layout preference from both stores. */
  readonly clearPreference: (base: string) => void;
  /** Tell the reader the agent moved their window, with the way back. */
  readonly announceSurfaceChange: (text: string, undo: () => void) => void;
}

/**
 * Where the panel and its launcher sit, and how big the panel is: the dragged
 * launcher, the dragged header, the eight resize grips, the corner the panel
 * opens from, and the persisted record of all of it.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance, so two elements on a page place themselves independently.
 */
export class PanelPlacement {
  readonly #host: PlacementHost;

  constructor(host: PlacementHost) {
    this.#host = host;
  }

  /**
   * Make the header a title bar. Only while open: a collapsed widget has no
   * header on screen, and the launcher is the handle then.
   */
  enablePanelDrag(header: HTMLElement): void {
    enablePanelDrag(header, {
      enabled: () => !this.#host.collapsed() && this.#launcherDraggable(),
      rect: () => this.#host.element.getBoundingClientRect(),
      apply: (box, from) => this.#movePanel(box, from),
      commit: (box, from) => this.#commitPanel(box, from),
    });
  }

  /**
   * Let the launcher be dragged. Only while collapsed: the launcher is scaled
   * away and unclickable behind the open panel, so a drag there would move
   * something nobody can see.
   */
  enableLauncherDrag(): void {
    enableLauncherDrag(this.#host.launcher, {
      enabled: () => this.#host.collapsed() && this.#launcherDraggable(),
      rect: () => this.#launcherBox(),
      viewport: () => this.#viewport(),
      apply: (left, top) => this.#moveLauncher(left, top),
      commit: (left, top) => this.#commitLauncher(left, top),
    });
  }

  /** Build the eight resize grips into `chat`, with one of them in the tab order. */
  mountResizeGrips(chat: HTMLElement): void {
    for (const grip of RESIZE_GRIPS) {
      const handle = createResizeHandle(grip, {
        axis: () => this.#resizeAxis(),
        rect: () => this.#host.element.getBoundingClientRect(),
        apply: (box) => this.#applyResize(grip, box),
        commit: (box) => this.#commitResize(grip, box),
        label: this.#host.strings().resizePanel,
      });
      // Only one of the eight is in the tab order. Eight separators between the
      // transcript and the composer is not keyboard parity, it is a keyboard
      // obstacle -- and one grip already reaches both axes, which is exactly
      // what the single grip this replaced offered. syncResizeAnchor decides
      // which one, and it is the free corner, so an arrow key grows the panel
      // rather than moving it.
      handle.tabIndex = -1;
      handle.setAttribute("aria-hidden", "true");
      this.#resizeHandles.set(gripName(grip), handle);
      chat.appendChild(handle);
    }
    this.#focusableGrip();
  }

  /** Restore a dragged size before the panel paints. */
  restoreSize(): void {
    this.#applySize(this.#readSize());
  }

  /**
   * A zero-sized box carrying the host's viewport insets as padding, so they
   * can be read back as used pixel lengths. See the `.viewport-probe` rule for
   * why a custom property cannot be read directly.
   */
  readonly probe = document.createElement("div");

  /**
   * Where the user dragged the launcher, in viewport coordinates, or null
   * while the host's own CSS still places it. Set means this element owns its
   * position -- see #applyLauncherPlacement for what that costs the host.
   */
  #launcherPos: { readonly left: number; readonly top: number } | null = null;

  /**
   * Where the user dragged the *panel*, in viewport coordinates, or null while
   * its position is still derived from the launcher's.
   *
   * The two gestures state different things and are restored differently. A
   * launcher drag says where the bubble goes and leaves the panel to open into
   * whatever space the viewport has, so it is re-derived every time -- which is
   * what lets a widget re-decide its direction when the window changes under
   * it. A header drag states the panel's own position, and re-deriving that
   * from the launcher would move the panel the user just placed.
   */
  #panelPos: { readonly left: number; readonly top: number } | null = null;

  /**
   * The corner the panel opens away from, once this element is placing itself.
   * Null means the host's layout still decides, and the anchor is measured.
   */
  #expandCorner: ExpandCorner | null = null;

  /**
   * The edges the layout is holding still, as last measured. Cached because a
   * resize reads it per pointer move and measuring forces a reflow -- thirty a
   * second while the panel is already being laid out on every one of them.
   */
  #anchor: ResizeAnchor = { x: "right", y: "bottom" };

  /** The eight grips, by name, so the keyboard-reachable one can be moved. */
  readonly #resizeHandles = new Map<string, HTMLDivElement>();

  /**
   * Hold a resized box inside the part of the screen the host left free.
   *
   * Each edge on its own, unlike the drag's clamp: a drag moves a box of fixed
   * size, so pushing it back in is right, while a resize is anchored on the
   * opposite edge and pushing it back would move the edge the user is not
   * touching. Bounding each edge instead leaves the grip stopped at the limit
   * -- the gesture keeps going and the panel simply stops growing, which is
   * what dragging already does.
   *
   * The minimum size is the grip's own concern and is applied before this, so
   * a panel that cannot fit the space is left at its minimum and overflowing
   * rather than collapsed to nothing.
   */
  #withinViewport(box: PanelRect): PanelRect {
    const viewport = this.#viewport();
    // The same bound a drag stops at, so a grip pulled to the edge and a panel
    // dragged to it come to rest on the same line. The inner Math.max/min pair
    // keeps an already-inverted box from turning inside out.
    const left = viewport.left + SCREEN_EDGE_MARGIN;
    const top = viewport.top + SCREEN_EDGE_MARGIN;
    const right = viewport.left + viewport.width - SCREEN_EDGE_MARGIN;
    const bottom = viewport.top + viewport.height - SCREEN_EDGE_MARGIN;
    return {
      left: Math.min(Math.max(box.left, left), box.right),
      top: Math.min(Math.max(box.top, top), box.bottom),
      right: Math.max(Math.min(box.right, right), box.left),
      bottom: Math.max(Math.min(box.bottom, bottom), box.top),
    };
  }

  /**
   * Whether a pointer or key gesture is currently placing the widget.
   *
   * Read from the stamp the drag helpers already set, rather than tracked
   * separately: one source of truth, and it clears on `pointercancel` as well
   * as `pointerup`, which is the end a touch gesture usually gets.
   */
  dragging(): boolean {
    return (
      this.#host.launcher.hasAttribute("data-dragging") ||
      this.#host.root.querySelector(".header[data-dragging]") !== null
    );
  }

  /** The report behind `AgUiChat.describeSurface`, whose doc is the contract. */
  describeSurface(): ChatSurfaceReport {
    const box = this.#host.element.getBoundingClientRect();
    const viewport = this.#viewport();
    const fullBleed = coversViewport(box, viewport);
    return {
      placement: this.#host.element.getAttribute("placement"),
      collapsed: this.#host.collapsed(),
      collapsible: this.#host.collapsible(),
      movable: this.#launcherDraggable() && !fullBleed,
      draggable: this.#launcherDraggable(),
      fullBleed,
      box: {
        left: Math.round(box.left),
        top: Math.round(box.top),
        width: Math.round(box.width),
        height: Math.round(box.height),
      },
      viewport: {
        left: Math.round(viewport.left),
        top: Math.round(viewport.top),
        width: Math.round(viewport.width),
        height: Math.round(viewport.height),
      },
    };
  }

  /** The move behind `AgUiChat.moveTo`, whose doc is the contract. */
  moveTo(corner: ChatCorner, options: { readonly announce?: boolean } = {}): boolean {
    if (!this.#launcherDraggable()) {
      return false;
    }
    const restore = options.announce === true ? this.#captureGeometry() : null;
    const viewport = this.#viewport();
    const box = this.#host.element.getBoundingClientRect();
    if (coversViewport(box, viewport)) {
      return false;
    }
    const [edgeY, edgeX] = corner.split("-");
    // Every term is an absolute screen coordinate, because that is what the
    // clamps and the insets both speak. The usable box carries an origin, so
    // its near edge is `viewport.left`, not zero, and its far edge is
    // `viewport.left + viewport.width` -- a margin applied to the extents
    // alone would send the agent's own move under the chrome the host
    // reserved, which is the failure the usable box exists to prevent.
    const nearX = viewport.left + EDGE_MARGIN;
    const nearY = viewport.top + EDGE_MARGIN;
    const left =
      edgeX === "left"
        ? nearX
        : Math.max(nearX, viewport.left + viewport.width - EDGE_MARGIN - box.width);
    const top =
      edgeY === "top"
        ? nearY
        : Math.max(nearY, viewport.top + viewport.height - EDGE_MARGIN - box.height);
    const host = { left, top, right: left + box.width, bottom: top + box.height };
    // Both axes measured, rather than one read twice: a host can restyle the
    // launcher as a pill, and squaring it here would put it off the corner.
    const launcherWidth = this.#host.launcher.offsetWidth;
    const launcherHeight = this.#host.launcher.offsetHeight;
    this.#placePanelAndLauncher(host, {
      left: edgeX === "left" ? host.left : host.right - launcherWidth,
      top: edgeY === "top" ? host.top : host.bottom - launcherHeight,
      width: launcherWidth,
      height: launcherHeight,
    });
    this.#storeLauncherPosition();
    if (restore !== null) {
      this.#host.announceSurfaceChange(this.#host.strings().chatMoved, restore);
    }
    return true;
  }

  /**
   * Snapshot the panel's stated position, and return a function that puts it
   * back.
   *
   * Both insets and the expand corner, because they are one decision: the
   * corner is what the panel grows from, so restoring a position without it
   * puts the box back and animates it out of the wrong side. Absent values are
   * captured as absent and removed on the way back, rather than written as
   * empty strings that would outrank the placement.
   */
  #captureGeometry(): () => void {
    const inset = this.#host.element.style.getPropertyValue("--ag-ui-inset");
    const launcherInset = this.#host.element.style.getPropertyValue("--ag-ui-launcher-inset");
    const corner = this.#host.element.getAttribute("data-expand-corner");
    const launcherPos = this.#launcherPos;
    const panelPos = this.#panelPos;
    const expandCorner = this.#expandCorner;
    return () => {
      this.#restoreProperty("--ag-ui-inset", inset);
      this.#restoreProperty("--ag-ui-launcher-inset", launcherInset);
      if (corner === null) {
        this.#host.element.removeAttribute("data-expand-corner");
      } else {
        this.#host.element.setAttribute("data-expand-corner", corner);
      }
      this.#launcherPos = launcherPos;
      this.#panelPos = panelPos;
      this.#expandCorner = expandCorner;
      // Erased rather than rewritten when there was nothing to go back to.
      // #storeLauncherPosition returns early for a null position, which would
      // leave the move this is undoing sitting in storage -- and since that
      // store outlives the tab, the next resize or reload would quietly put
      // the panel back in the corner the user had just rejected.
      if (launcherPos === null) {
        this.#host.clearPreference(LAUNCHER_KEY);
      } else {
        this.#storeLauncherPosition();
      }
      this.syncResizeAnchor();
    };
  }

  /**
   * Which axes the current placement allows.
   *
   * A full-bleed layout is `100vw`/`100vh` by definition and cannot be resized
   * at all; a docked panel owns its height, leaving only its inner edge. Read
   * per interaction, because `placement` is a live attribute.
   */
  #resizeAxis(): ResizeAxis {
    switch (this.#host.element.getAttribute("placement")) {
      case "full":
      case "page":
        return "none";
      case "sidebar":
      case "side":
        return "width";
      default:
        return "both";
    }
  }

  /**
   * Which edges the layout is holding still, by measuring rather than guessing:
   * nudge the size by a pixel, see which edges stayed put, and undo. One forced
   * reflow per drag.
   *
   * `placement` cannot answer this — an embedded panel goes wherever the page's
   * CSS puts it — and see {@link createResizeHandle} for why guessing produces
   * a visibly broken control.
   */
  #measureAnchor(): ResizeAnchor {
    const before = this.#host.element.getBoundingClientRect();
    const width = this.#host.element.style.getPropertyValue("--ag-ui-width");
    const height = this.#host.element.style.getPropertyValue("--ag-ui-height");
    // Shrink first. Growing is the obvious probe and cannot answer the question
    // at a size already resting against max-width or max-height: the box does
    // not change, no edge moves, and every clamped axis then reads as pinned on
    // the side that did not move -- which is the side that is free. That is not
    // an edge case. The default panel is 380px wide against a max-width of
    // 100vw minus 48, so any viewport under 428px is born clamped, and the grip
    // rendered on the wrong corner with the drag inverted before anyone touched
    // it. Shrinking always moves an edge, because the shrink is measured from
    // the box's *used* width rather than from whatever was asked for.
    const shrunk = this.#probeAnchor(before, -1);
    // Unless a host rule sets a minimum, in which case that axis is asked the
    // opposite question rather than left to a guess.
    const grown = shrunk.x === null || shrunk.y === null ? this.#probeAnchor(before, 1) : shrunk;
    // Restore exactly what was there, including "nothing" — leaving a probe
    // value behind would pin a panel that had been sizing itself.
    this.#restoreProperty("--ag-ui-width", width);
    this.#restoreProperty("--ag-ui-height", height);
    return {
      // Neither direction moved it: the axis cannot be resized at all, so the
      // floating default is the best answer available and is the one the
      // stylesheet would have used with no measurement at all.
      x: shrunk.x ?? grown.x ?? "right",
      y: shrunk.y ?? grown.y ?? "bottom",
    };
  }

  /**
   * Which edge each axis holds still when the panel changes size by `delta`.
   *
   * Null for an axis whose size did not change: nothing moved, so nothing was
   * learned, and reporting the unmoved edge as the pinned one would be exactly
   * backwards.
   */
  #probeAnchor(
    before: DOMRect,
    delta: number,
  ): { x: "left" | "right" | null; y: "top" | "bottom" | null } {
    this.#applySize({ width: before.width + delta, height: before.height + delta });
    const after = this.#host.element.getBoundingClientRect();
    const moved = (a: number, b: number): boolean => Math.abs(a - b) >= 0.5;
    return {
      x: moved(after.width, before.width)
        ? moved(after.left, before.left)
          ? "right"
          : "left"
        : null,
      y: moved(after.height, before.height)
        ? moved(after.top, before.top)
          ? "bottom"
          : "top"
        : null,
    };
  }

  /** Stamp the measured anchor so the shadow CSS can place the grip. */
  syncResizeAnchor(): void {
    if (!this.#host.connected()) {
      return;
    }
    // When this element owns its position it knows which edges are pinned --
    // it just wrote them -- so there is nothing to probe. The probe is also
    // unreliable at a size resting against max-width or max-height, where a
    // nudge moves no edge and every axis reads as pinned on the wrong side.
    const anchor = this.#expandCorner ?? this.#measureAnchor();
    this.#anchor = anchor;
    this.#host.element.setAttribute("data-resize-anchor", `${anchor.y}-${anchor.x}`);
    this.#focusableGrip();
  }

  /** Put a custom property back to a previous value, or remove it if there was none. */
  #restoreProperty(name: string, value: string): void {
    if (value === "") {
      this.#host.element.style.removeProperty(name);
      return;
    }
    this.#host.element.style.setProperty(name, value);
  }

  /**
   * Write a dragged size onto the host, on the axes this placement leaves free.
   *
   * Writing the custom property rather than inline `width` / `height` does not
   * by itself leave placement in charge: an inline custom property still
   * outranks a `:host([placement=…])` rule setting the same property, so a
   * height dragged while floating would cap a docked sidebar asking for
   * `100vh`. The cascade cannot arbitrate this, so the axis check must — a
   * placement owns the axes it fixes, and a persisted size is applied only to
   * the ones it leaves free.
   */
  #applySize(size: ResizeSize): void {
    const axis = this.#resizeAxis();
    if (axis === "none") {
      return;
    }
    // The placement's max-width and max-height are left alone, which means a
    // grip pushed against the edge the placement is *not* anchored to stops one
    // gutter short of the screen. Moving the cap with the size fixes that and
    // shifts several resting sizes by a pixel or two, because the cap and the
    // size are not measured from the same box -- not worth the churn for a
    // symmetry nobody has asked for. The limit that matters, staying inside
    // what the host left free, is enforced above.
    if (size.width !== undefined) {
      this.#host.element.style.setProperty("--ag-ui-width", `${size.width}px`);
    }
    if (size.height !== undefined && axis === "both") {
      this.#host.element.style.setProperty("--ag-ui-height", `${size.height}px`);
    }
  }

  /**
   * Drop any dragged size the new placement has taken ownership of.
   *
   * Without this a size survives the switch as an inline property and silently
   * overrides the placement it moved to — the panel keeps a floating height
   * while docked, and reads as a component that cannot do full height.
   */
  releaseOwnedAxes(): void {
    const axis = this.#resizeAxis();
    if (axis !== "both") {
      this.#host.element.style.removeProperty("--ag-ui-height");
    }
    if (axis === "none") {
      this.#host.element.style.removeProperty("--ag-ui-width");
    }
  }

  /**
   * Whether this placement lets the launcher be dragged, read per interaction
   * because `placement` is a live attribute. `data-launcher-drag="false"` opts
   * a host out without giving up the launcher itself.
   */
  #launcherDraggable(): boolean {
    return (
      this.#host.element.getAttribute("data-launcher-drag") !== "false" &&
      isDraggablePlacement(this.#host.element.getAttribute("placement"))
    );
  }

  /**
   * The viewport the launcher and the panel both have to fit inside.
   *
   * The *visual* viewport, not the layout one, because they come apart exactly
   * when this matters. An on-screen keyboard shrinks the visual viewport and
   * leaves the layout viewport alone, so clamping against `innerHeight` parks
   * the launcher behind the keyboard and decides which corner to open into
   * using space that is not on the screen. Pinch-zoom does the same on both
   * axes.
   *
   * Falls back where the API is absent, which keeps this working in the
   * happy-dom project as well as in an old browser.
   */
  #viewport(): ViewportBox {
    const visual = window.visualViewport;
    const width = visual?.width ?? window.innerWidth;
    const height = visual?.height ?? window.innerHeight;
    // And minus whatever the host reserved for its own chrome. Without this a
    // panel is clamped against the whole screen and settles happily underneath
    // a sticky header, where it cannot be reached -- and where collapsing it,
    // the one thing a user tries, hides it completely rather than rescuing it.
    // Read as padding off the probe, not as custom properties off this
    // element. `getPropertyValue` on an unregistered custom property returns
    // the token stream rather than a length, so a host stating `4rem` reserves
    // four pixels here and sixty-four in the stylesheet, and one stating
    // `calc(56px + env(safe-area-inset-top))` -- which is the natural spelling
    // of what the token's own documentation recommends -- parses as NaN and
    // takes the panel's whole inset down with it.
    const style = getComputedStyle(this.probe);
    const edge = (name: string): number => {
      const value = Number.parseFloat(style.getPropertyValue(name));
      // A detached or not-yet-rendered probe resolves to nothing at all, and
      // reserving NaN is worse than reserving zero in every case.
      return Number.isFinite(value) ? value : 0;
    };
    const left = edge("padding-left");
    const top = edge("padding-top");
    return {
      left,
      top,
      width: Math.max(0, width - left - edge("padding-right")),
      height: Math.max(0, height - top - edge("padding-bottom")),
    };
  }

  /**
   * The whole viewport, before anything the host reserved is taken out of it.
   *
   * Distinct from {@link #viewport} on purpose, and the two must not be
   * swapped. The usable box decides where the widget may rest; this is what a
   * CSS `inset` on a fixed element is measured from, because that is what the
   * browser measures it from.
   */
  #screen(): Extent {
    // The *layout* viewport, and `clientWidth`/`clientHeight` rather than
    // `innerWidth`/`innerHeight`, because those two disagree by the width of a
    // classic scrollbar and it is the smaller one a fixed element is laid out
    // against. Reading the visual viewport here would be the same mistake one
    // level up as clamping against the whole screen was one level down: a
    // keyboard shrinks the visual viewport without moving the box CSS measures
    // an inset from, so a panel the clamp had just held inside the visible
    // band would be written back out behind the keyboard.
    //
    // The zero checks are for a detached or not-yet-laid-out document, where
    // `clientWidth` is 0 and no viewport ever is.
    const root = document.documentElement;
    return {
      width: root.clientWidth || window.innerWidth,
      height: root.clientHeight || window.innerHeight,
    };
  }

  /**
   * Publish the measured viewport height so the stylesheet can size a
   * full-bleed panel to what the user can see.
   *
   * No CSS length carries this. An on-screen keyboard has no effect on any
   * viewport-percentage unit, so a panel sized from `100dvh` puts its composer
   * behind the keyboard being typed into. Written inline, and read through a
   * token the host's own `--ag-ui-viewport-height` still outranks.
   *
   * Removed rather than frozen when the two viewports agree, so a desktop that
   * never diverges carries no inline override at all and the declared fallback
   * stays in charge.
   */
  publishVisualViewport(): void {
    const visual = window.visualViewport;
    if (visual === null || visual === undefined) {
      return;
    }
    if (Math.abs(visual.height - window.innerHeight) < 1) {
      this.#host.element.style.removeProperty("--ag-ui-visual-viewport-height");
      this.#host.element.style.removeProperty("--ag-ui-visual-viewport-inset-bottom");
      return;
    }
    this.#host.element.style.setProperty(
      "--ag-ui-visual-viewport-height",
      `${Math.round(visual.height)}px`,
    );
    // What is hidden below the visible area, which is where a keyboard is. A
    // shorter panel does not help anything anchored to the bottom: a floating
    // widget is positioned against the layout viewport, so its bottom edge and
    // the launcher at that corner stay behind the keyboard until this lifts
    // them. Never negative -- a visual viewport panned up past the layout one
    // would otherwise pull the panel down off the screen.
    const hidden = window.innerHeight - visual.height - visual.offsetTop;
    this.#host.element.style.setProperty(
      "--ag-ui-visual-viewport-inset-bottom",
      `${Math.max(0, Math.round(hidden))}px`,
    );
  }

  /**
   * The launcher's box in viewport coordinates, with its transform divided out.
   *
   * The launcher is scaled in four states -- the collapse animation, hover,
   * press, and the resting scale(0.4) it sits at while the panel is open -- and
   * `getBoundingClientRect` reports every one of them. A drag that started from
   * that rect would begin a couple of pixels off, because a press is one of
   * those states.
   *
   * So the size comes from `offsetWidth`/`offsetHeight`, which are layout
   * metrics no transform reaches, and the position from the rect's *centre*,
   * which a centred scale is the one point that cannot move.
   */
  #launcherBox(): LauncherBox {
    const width = this.#host.launcher.offsetWidth;
    const height = this.#host.launcher.offsetHeight;
    const dragged = this.#launcherPos;
    if (dragged !== null) {
      return { left: dragged.left, top: dragged.top, width, height };
    }
    const rect = this.#host.launcher.getBoundingClientRect();
    return {
      left: rect.left + rect.width / 2 - width / 2,
      top: rect.top + rect.height / 2 - height / 2,
      width,
      height,
    };
  }

  /**
   * Place the host box and the launcher for the position the user dragged to.
   *
   * This writes `--ag-ui-inset`, which is a host-facing property: an inline
   * value outranks the page's own rule for it, exactly as a dragged width
   * outranks a placement's. That is the intent -- the user moved it -- and it
   * is why switching to a placement that owns its position hands the property
   * back rather than leaving a stale inline one behind.
   */
  #applyLauncherPlacement(at: { readonly left: number; readonly top: number }): void {
    // The single gate: callers hand over a position and this decides whether
    // it is this element's to honour. Checking in both places instead would
    // leave one of the two checks permanently unreachable.
    if (!this.#launcherDraggable()) {
      return;
    }
    this.#launcherPos = at;
    // Dropping the bubble hands the panel's position back to the placement.
    // Keeping a stated one would pin the panel where it was dragged and leave
    // the launcher deriving nothing, which is the gesture doing half its job.
    this.#panelPos = null;
    // The host box keeps its expanded size while collapsed, so its own rect is
    // the panel's size in either state and needs no separate bookkeeping.
    const panel = this.#host.element.getBoundingClientRect();
    const placement = launcherPlacement(
      this.#launcherBox(),
      { width: panel.width, height: panel.height },
      this.#viewport(),
      this.#screen(),
    );
    this.#host.element.style.setProperty("--ag-ui-inset", placement.hostInset);
    this.#host.element.style.setProperty("--ag-ui-launcher-inset", placement.launcherInset);
    this.#expandCorner = placement.corner;
    // The corner the panel grows from, for the open/close animation's origin.
    this.#host.element.setAttribute(
      "data-expand-corner",
      `${placement.corner.y}-${placement.corner.x}`,
    );
    this.syncResizeAnchor();
  }

  /** Move the launcher live during a drag, without persisting. */
  #moveLauncher(left: number, top: number): void {
    this.#applyLauncherPlacement({ left, top });
  }

  /** Move the launcher and remember where, per tab, like the dragged size. */
  #commitLauncher(left: number, top: number): void {
    this.#moveLauncher(left, top);
    this.#storeLauncherPosition();
  }

  /**
   * Move the panel live during a header drag, without persisting.
   *
   * Only the host box is written, and that is the whole trick: the launcher is
   * positioned *inside* that box, so leaving its own inset alone carries it
   * along by exactly the distance the panel travelled -- which is what a person
   * dragging a window expects of the thing it collapses into. Placing it on the
   * panel's pinned corner instead, as an earlier version did, sent it leaping
   * across the panel the moment the drag re-picked that corner.
   *
   * The corner is therefore held for the length of the gesture. Both insets are
   * measured from it, and rewriting one of them from a new corner while the
   * other still names the old one would move the launcher for no reason.
   */
  #movePanel(box: PanelRect, from: PanelRect): { held: PanelRect; launcher: LauncherBox | null } {
    if (!this.#launcherDraggable()) {
      return { held: box, launcher: null };
    }
    // Where the launcher rests, recorded before the first move writes anything.
    // From here on the DOM shows it mid-gesture, so this is the last moment it
    // can be read rather than derived.
    if (this.#launcherPos === null) {
      const resting = this.#launcherBox();
      this.#launcherPos = { left: resting.left, top: resting.top };
    }
    // The launcher as it was when the gesture began. Held for the whole drag:
    // every move measures from here, so the two halves cannot drift apart.
    const start = this.#launcherPos;
    // The screen-edge bound, not the resting gutter. The 24px margin is where
    // a placement rests one, not a rule about where a person may put it, and
    // enforcing it against a drag is what made the panel feel stuck short of
    // every edge on all four sides at once. Zero was the correction and it
    // went too far the other way: it welded the panel to the boundary while
    // the launcher -- same shadow, same rounded edge -- was held 8px off it,
    // and it disagreed with the restore below, so a panel dragged flush leapt
    // inward the next time the viewport changed.
    const held = clampPanel(box, this.#viewport(), SCREEN_EDGE_MARGIN);
    const corner = this.#expandCorner ?? this.#anchor;
    // The usable box decides where the panel may rest, above; the screen is
    // what these insets are measured from, because that is what the browser
    // measures a fixed element's inset from. Using the usable box here made a
    // right or bottom short by whatever the host had reserved, and the panel
    // jumped by that much the first time a gesture wrote one.
    this.#host.element.style.setProperty("--ag-ui-inset", insetFrom(corner, held, this.#screen()));
    this.#panelPos = { left: held.left, top: held.top };

    // Where the launcher has ended up, derived rather than read. During a
    // header drag it rides inside the host box with its own inset untouched,
    // so the DOM shows it moving while `#launcherPos` still holds where it
    // started -- reading it back mid-gesture returns the stale value, and
    // adding the panel's travel to that a second time on release is a jump.
    // Measured from the box the press started on, so a long drag cannot
    // accumulate the rounding each move writes.
    const carried = {
      ...this.#launcherBox(),
      left: start.left + (held.left - from.left),
      top: start.top + (held.top - from.top),
    };
    // A bubble carried into an edge the host reserved is one nobody can press.
    // Clamping it live rather than at the end is what makes releasing the drag
    // change nothing: leaving it until then parked it under a nav bar for the
    // whole gesture and hopped it out on pointerup.
    const launcher = { ...carried, ...clampLauncher(carried, this.#viewport()) };
    this.#host.element.style.setProperty(
      "--ag-ui-launcher-inset",
      placeWidget(held, launcher, corner, this.#screen()).launcherInset,
    );
    return { held, launcher };
  }

  /**
   * Finish a header drag: settle where both halves ended up, and remember it.
   *
   * The launcher travels the distance the panel actually travelled, which is
   * the clamped distance rather than the pointer's -- a panel held against the
   * viewport margin stops, and so does the bubble attached to it. Measured from
   * the box the press started on, so a long drag cannot accumulate the rounding
   * each move writes into the inset.
   *
   * Only now is the corner re-picked, from where the launcher has ended up, so
   * the panel opens into clear space next time. Re-picking it moves nothing:
   * both insets are rewritten from positions that are already decided.
   */
  #commitPanel(box: PanelRect, from: PanelRect): void {
    // Exactly what the last move applied, rather than the same sum computed
    // again. Recomputing it is how the two came apart: releasing the drag
    // moved the bubble by the panel's whole travel a second time.
    const { held, launcher } = this.#movePanel(box, from);
    if (launcher === null) {
      return;
    }
    this.#placePanelAndLauncher(held, launcher);
    this.#storeLauncherPosition();
  }

  /**
   * Write both insets for a panel and launcher that are already positioned,
   * re-picking the corner they are measured from.
   */
  #placePanelAndLauncher(host: PanelRect, launcher: LauncherBox): void {
    const viewport = this.#viewport();
    const screen = this.#screen();
    const size = { width: host.right - host.left, height: host.bottom - host.top };
    const { corner } = launcherPlacement(launcher, size, viewport, screen);
    // The screen again, not the usable box: these are CSS insets on a fixed
    // element and the browser measures them from the real edges.
    const insets = placeWidget(host, launcher, corner, screen);
    this.#host.element.style.setProperty("--ag-ui-inset", insets.hostInset);
    this.#host.element.style.setProperty("--ag-ui-launcher-inset", insets.launcherInset);
    this.#launcherPos = { left: launcher.left, top: launcher.top };
    this.#panelPos = { left: host.left, top: host.top };
    this.#expandCorner = corner;
    this.#host.element.setAttribute("data-expand-corner", `${corner.y}-${corner.x}`);
    this.syncResizeAnchor();
  }

  /**
   * Re-apply a panel position the user stated, against the current viewport.
   *
   * The launcher keeps its offset from the panel through the clamp -- it was
   * put where it is relative to the panel, and a viewport that has since shrunk
   * is no reason to move one without the other -- and is then held on screen in
   * its own right.
   */
  #restorePanelPosition(at: { readonly left: number; readonly top: number }): void {
    if (!this.#launcherDraggable()) {
      return;
    }
    const rect = this.#host.element.getBoundingClientRect();
    // The same bound the drag itself used. Taking the default here instead is
    // what made a panel dragged to an edge jump a whole resting gutter inward
    // on the next resize, reload or expand -- re-placing a position the user
    // had stated, against a limit they had never been shown.
    const held = clampPanel(
      { left: at.left, top: at.top, right: at.left + rect.width, bottom: at.top + rect.height },
      this.#viewport(),
      SCREEN_EDGE_MARGIN,
    );
    const launcher = this.#launcherBox();
    const carried = {
      ...launcher,
      left: launcher.left + (held.left - at.left),
      top: launcher.top + (held.top - at.top),
    };
    this.#placePanelAndLauncher(held, {
      ...carried,
      ...clampLauncher(carried, this.#viewport()),
    });
  }

  /**
   * Write the current position, if this element owns one.
   *
   * The panel's own position rides along only when the user stated it, because
   * its presence is what tells a restore which of the two gestures to honour:
   * with it, the panel goes back where it was put; without it, the panel is
   * re-derived from the launcher and opens into whatever room the viewport has
   * now.
   */
  #storeLauncherPosition(): void {
    const position = this.#launcherPos;
    if (position === null) {
      return;
    }
    const panel = this.#panelPos;
    this.#host.writePreference(
      LAUNCHER_KEY,
      JSON.stringify(panel === null ? position : { ...position, panel }),
    );
  }

  /**
   * Re-apply the dragged position against the current viewport: on connect,
   * whenever the window resizes, and before an expand. The viewport that
   * stored a position may since have shrunk, and a launcher past the edge is
   * unreachable -- it is the only way back to a collapsed conversation.
   */
  restoreLauncherPosition(): void {
    const stored = this.#readLauncherPosition();
    const launcher = this.#launcherPos ?? stored;
    if (launcher === null) {
      return;
    }
    const panel = this.#panelPos ?? stored?.panel ?? null;
    if (panel !== null) {
      // Stated rather than derived: the launcher is only read here to keep the
      // offset the two were left with, so it has to be seeded before the panel
      // is placed around it.
      this.#launcherPos = { left: launcher.left, top: launcher.top };
      this.#restorePanelPosition(panel);
      return;
    }
    const box = this.#launcherBox();
    this.#applyLauncherPlacement(
      clampLauncher({ ...box, left: launcher.left, top: launcher.top }, this.#viewport()),
    );
  }

  /** The persisted position for this instance, or null. */
  #readLauncherPosition(): {
    readonly left: number;
    readonly top: number;
    readonly panel?: { readonly left: number; readonly top: number };
  } | null {
    const raw = this.#host.readPreference(LAUNCHER_KEY);
    if (raw === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) {
        return null;
      }
      const { left, top, panel } = parsed as { left?: unknown; top?: unknown; panel?: unknown };
      if (typeof left !== "number" || typeof top !== "number") {
        return null;
      }
      // A record written before the panel could be dragged has no panel half,
      // and one written by a launcher drag never will -- both restore by
      // deriving the panel, which is what they meant.
      const at = asPoint(panel);
      return at === null ? { left, top } : { left, top, panel: at };
    } catch {
      // A corrupt entry is not worth failing a mount over; fall back to the
      // placement's own corner.
      return null;
    }
  }

  /**
   * Give the position back to the host when the new placement owns it, the way
   * releaseOwnedAxes gives back a size. Without this a dragged inset survives
   * the switch inline and pins a sidebar to wherever the floating launcher was.
   */
  releaseLauncherPosition(): void {
    if (this.#launcherDraggable()) {
      return;
    }
    this.#launcherPos = null;
    this.#panelPos = null;
    this.#expandCorner = null;
    this.#host.element.style.removeProperty("--ag-ui-inset");
    this.#host.element.style.removeProperty("--ag-ui-launcher-inset");
    this.#host.element.removeAttribute("data-expand-corner");
  }

  /**
   * Apply the box a grip is asking for.
   *
   * The size is the easy half. The other half is that **dragging the edge the
   * layout is holding still moves the panel as well as resizing it**, and the
   * layout cannot express that on its own: a floating panel pinned bottom-right
   * cannot grow rightward, because its right edge is what the placement fixed.
   * So a grip on a pinned edge takes the position over -- which is the same
   * ownership the launcher drag takes, written the same way.
   *
   * A grip on a free edge writes nothing but the size, exactly as before, so a
   * host positioning the panel with its own rule keeps that rule until someone
   * drags the edge it was holding.
   */
  #applyResize(grip: ResizeGrip, box: PanelRect): PanelRect {
    box = this.#withinViewport(box);
    this.#applySize({ width: box.right - box.left, height: box.bottom - box.top });
    if (grip.x !== this.#anchor.x && grip.y !== this.#anchor.y) {
      return box;
    }
    // The whole screen, not the usable box: a CSS inset on a fixed element is
    // measured from the real edges, so expressing a right or bottom against a
    // box the host has inset comes out short by exactly that inset.
    const anchor = this.#anchor;
    this.#host.element.style.setProperty("--ag-ui-inset", insetFrom(anchor, box, this.#screen()));
    // The launcher lives at this corner of the panel, so a corner that moved
    // takes it along. Without this the next expand would re-derive the panel's
    // position from a launcher still standing where the panel used to be, and
    // undo the move.
    if (this.#launcherPos !== null) {
      const size = this.#host.launcher.offsetWidth;
      this.#launcherPos = {
        left: anchor.x === "left" ? box.left : box.right - size,
        top: anchor.y === "top" ? box.top : box.bottom - size,
      };
    }
    // A stated panel position is a claim about this box, so it moves with it.
    if (this.#panelPos !== null) {
      this.#panelPos = { left: box.left, top: box.top };
    }
    return box;
  }

  /** Finish a resize: keep the box, remember it, and re-read the pinned edges. */
  #commitResize(grip: ResizeGrip, box: PanelRect): void {
    // The bounded box, not the one the pointer asked for. Persisting the raw
    // one would store a size the panel never had and restore it on the next
    // mount, which is the same disagreement between apply and commit that made
    // the header drag jump on release.
    const held = this.#applyResize(grip, box);
    this.#persistSize({ width: held.right - held.left, height: held.bottom - held.top });
    this.#storeLauncherPosition();
    // Re-stamp after the drag: a host whose layout changed underneath us would
    // otherwise keep the tab-reachable grip in the old corner, which reads as
    // the control being in the wrong place even though the drag was right.
    this.syncResizeAnchor();
  }

  /**
   * Put the tab stop on the grip diagonally opposite the pinned corner.
   *
   * That is the corner a resize grows the panel from, so an arrow key there
   * changes the size and never the position -- the behaviour the single grip
   * this replaced had, kept for the one path that cannot simply grab a
   * different edge.
   */
  #focusableGrip(): void {
    const free = `${this.#anchor.y === "top" ? "bottom" : "top"}-${
      this.#anchor.x === "left" ? "right" : "left"
    }`;
    for (const [name, handle] of this.#resizeHandles) {
      const reachable = name === free;
      handle.tabIndex = reachable ? 0 : -1;
      if (reachable) {
        handle.removeAttribute("aria-hidden");
      } else {
        handle.setAttribute("aria-hidden", "true");
      }
    }
  }

  /** Persist a dragged size per tab, alongside the collapsed/theme preferences. */
  #persistSize(size: ResizeSize): void {
    const stored = { ...this.#readSize(), ...size };
    this.#host.writePreference(SIZE_KEY, JSON.stringify(stored));
  }

  /** The persisted size for this instance, or an empty record. */
  #readSize(): ResizeSize {
    const raw = this.#host.readPreference(SIZE_KEY);
    if (raw === null) {
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      return typeof parsed === "object" && parsed !== null ? (parsed as ResizeSize) : {};
    } catch {
      // A corrupt entry is not worth failing a mount over; fall back to the
      // placement's own size.
      return {};
    }
  }
}
