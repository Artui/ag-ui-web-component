// Collapsing and expanding: the animation toward the launcher, the in-flow
// and page placements that collapse differently or not at all, and the two
// collapse-to targets: the bottom bar, and the host's own (hidden here).
export const COLLAPSE_STYLES: string = `
/* ── Collapse ───────────────────────────────────────────────────────────────
   Collapsing shrinks the widget to the round floating launcher: the panel
   scales toward the launcher's corner and fades, the launcher pops in from the
   same point. Both halves are transform and opacity only, so the morph runs on
   the compositor and never reflows the host page.

   The host box keeps its expanded size, since animating it would animate
   layout and a dragged --ag-ui-width would fight the launcher's own size.
   Nothing paints there once the panel is gone, so the box only has to stop
   swallowing clicks: pointer events go to none and the launcher takes them.

   Two placements do not use it: "sidebar" slides to its rail (below), and
   "embedded" keeps its header bar, having no corner for a floating circle that
   would escape the host's layout. "page" has no collapsed state at all. */
:host([collapsed]) {
  pointer-events: none;
  /* A collapsed host has to be allowed to shrink, and in the layout hosts
     actually use it is not. Every collapse path here works by letting the host
     size to its content -- the in-flow ones set height: auto, the floating one
     leaves only the launcher -- and a flex or grid parent whose align-items is
     the default stretch value overrides all of it. The panel then hides and the box
     it occupied stays: a header bar over several hundred pixels of nothing.
     Every known consumer hit this, because putting the element in a flex column
     beside the page content is the obvious way to embed it. */
  align-self: start;
}

:host([collapsed]) .chat {
  opacity: 0;
  transform: scale(0.94);
  visibility: hidden;
}

/* visibility keeps the panel out of the tab order and the a11y tree at rest
   without display:none killing the transition. It interpolates so any progress
   below 1 still counts as visible: the panel stays on screen for the whole
   collapse, flips hidden exactly at the end, and on expand is visible from the
   first frame. */
.chat {
  transform-origin: bottom right;
  transition:
    opacity var(--_motion) var(--_ease),
    transform var(--_motion) var(--_ease),
    visibility var(--_motion) var(--_ease);
}

:host([placement="bottom-left"]) .chat {
  transform-origin: bottom left;
}

/* Once the launcher has been dragged the element places itself, and stamps the
   corner it chose to open away from. The morph has to start at that same
   corner: scaling out of the one the placement originally guessed reads as the
   panel leaping across the screen before it opens.

   Equal specificity to the placement rule above, so source order is what lets
   the stamped value win -- the same arrangement the resize grip uses, and the
   same trap. Write these with = on the whole hyphenated token; a ~= would match
   whitespace-separated words and so could never match at all. */
:host([data-expand-corner="top-left"]) .chat {
  transform-origin: top left;
}

:host([data-expand-corner="top-right"]) .chat {
  transform-origin: top right;
}

:host([data-expand-corner="bottom-left"]) .chat {
  transform-origin: bottom left;
}

:host([data-expand-corner="bottom-right"]) .chat {
  transform-origin: bottom right;
}

/* The in-flow placement keeps the original collapse: hide the body, let the
   host shrink to the header bar. */
:host([collapsed][placement="embedded"]) {
  height: auto;
  max-height: none;
  pointer-events: auto;
}

:host([collapsed][placement="embedded"]) .chat {
  opacity: 1;
  transform: none;
  visibility: visible;
}

/* It keeps the header bar, so the launcher must stay out of the way: an
   embedded host is position: static, which would let an absolutely-positioned
   circle escape the layout and land against whatever the page positions. */
:host([collapsed][placement="embedded"]) .launcher {
  visibility: hidden;
  opacity: 0;
}

:host([collapsed][placement="embedded"]) .messages-wrap,
:host([collapsed][placement="embedded"]) .messages,
:host([collapsed][placement="embedded"]) .input-row,
:host([collapsed][placement="embedded"]) slot[name="above-composer"],
:host([collapsed][placement="embedded"]) .skill-chips,
:host([collapsed][placement="embedded"]) .skill-palette,
:host([collapsed][placement="embedded"]) .skill-hint {
  display: none;
}

/* The above-composer slot is in the list above because it is the host's content
   against the composer: a bare slot has no box of its own, so hiding the input
   row alone left the slotted row showing under the header bar. Its sibling slot
   below the composer is a footer and is left to the host. */

/* The page placement has no collapsed state, so it offers no control for one.
   A dedicated route has no "away" to go to: shrinking it left a strip of
   application chrome fixed over a route that no longer had an owner, and this
   is the one placement where the launcher that would bring it back is hidden.

   Hiding the control is only half of it. The state has another way in -- the
   attribute can be written straight onto the element, and a value stored under
   a different placement is restored on connect -- and the JS guards that catch
   those cannot see an attribute set directly. So the placement neutralises the
   state here as well: with the collapse rules above no longer naming "page", an
   unguarded collapsed attribute would otherwise fall through to the generic
   rule that scales the panel away and drops pointer events, leaving nothing on
   screen and no launcher to press. */
:host([placement="page"]) .header-btn--collapse {
  display: none;
}

:host([placement="page"][collapsed]) {
  pointer-events: auto;
  align-self: auto;
}

:host([placement="page"][collapsed]) .chat {
  opacity: 1;
  transform: none;
  visibility: visible;
}

/* ── Bottom bar (collapse-to="bar") ──────────────────────────────────────────
   The round launcher drawn as a strip along the bottom edge: the title, the
   unread badge and a running mark, with a history button beside it. The
   wrapper draws no box anywhere else, so the launcher lays out against the
   host as it always has; under the bar it is fixed to the bottom of the
   viewport, outside the host's box, which sits where the panel opens.

   Here rather than with the launcher because it restyles the launcher's
   collapsed and pressed states, which this module follows in the cascade.
   The strip stays drawn while the panel is open on a wide viewport, as the
   way to minimise it; the phone block hides it then. */
.dock-bar {
  display: contents;
}

.bar-history,
.bar-place {
  display: none;
}

:host([data-collapsed-to="bar"]) .dock-bar {
  position: fixed;
  inset: auto var(--_viewport-inset-right) var(--_viewport-inset-bottom) var(--_viewport-inset-left);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  box-sizing: border-box;
  min-height: 40px;
  padding: 4px 8px;
  border-top: 1px solid var(--_border);
  background: var(--_bg);
  color: var(--_fg);
  pointer-events: auto;
}

/* A left-hand chat keeps its side: its controls and its panel at the left end. */
:host([data-collapsed-to="bar"][placement="bottom-left"]) .dock-bar {
  justify-content: flex-start;
}

/* The launcher as the strip's title button. Its resting state hides it behind
   an open panel; the bar keeps it on screen, so every part of that state is
   restated, and the hover and press scales are cancelled at the weight of the
   rules that set them. The title truncates rather than taking a fixed width,
   leaving room beside it for whatever a later release adds to the row. */
:host([data-collapsed-to="bar"]) .launcher {
  position: static;
  inset: auto;
  flex: 0 1 auto;
  justify-content: flex-start;
  gap: 8px;
  width: auto;
  min-width: 0;
  max-width: 100%;
  height: auto;
  min-height: 32px;
  padding: 4px 10px;
  border-radius: 8px;
  background: transparent;
  color: var(--_fg);
  box-shadow: none;
  touch-action: manipulation;
  opacity: 1;
  transform: none;
  visibility: visible;
}

:host([data-collapsed-to="bar"]) .launcher:hover {
  background: var(--_wash);
}

/* Bare at rest, like the history button beside it. The themes frame the
   round launcher with a border or a shadow at the weight of the rule above
   and later in the cascade, so the child combinator on the bar is there for
   weight, not scope: the launcher is always the bar's direct child. */
:host([data-collapsed-to="bar"]) .dock-bar > .launcher {
  border: 0;
  box-shadow: none;
}

:host([data-collapsed-to="bar"][collapsed]) .launcher:hover,
:host([data-collapsed-to="bar"][collapsed]) .launcher:active {
  transform: none;
}

:host([data-collapsed-to="bar"]) .launcher .icon-holder {
  flex: none;
  width: 18px;
  height: 18px;
}

:host([data-collapsed-to="bar"]) .rail-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  font-size: 0.9em;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* The place beside the title, secondary text that truncates first so the
   history button never leaves the strip. Withheld places keep the chip's
   dashed, struck-through look: the bar must not claim the page is sent. */
:host([data-collapsed-to="bar"]) .bar-place {
  display: inline-flex;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
  padding: 2px 0;
  border-bottom: 1px solid transparent;
  color: var(--_muted);
  font-size: 0.85em;
  line-height: 1.2;
}

:host([data-collapsed-to="bar"]) .bar-place[hidden],
:host([data-collapsed-to="bar"]) .bar-place .place-detail[hidden] {
  display: none;
}

:host([data-collapsed-to="bar"]) .bar-place[data-excluded] {
  border-bottom-style: dashed;
  border-bottom-color: var(--_border);
}

:host([data-collapsed-to="bar"]) .bar-place[data-excluded] .place-label,
:host([data-collapsed-to="bar"]) .bar-place[data-excluded] .place-detail {
  text-decoration: line-through;
}

:host([data-collapsed-to="bar"]) .launcher-badge {
  position: static;
  flex: none;
  box-shadow: none;
}

/* The running mark: the element already reflects a run as data-running, so
   the bar shows one without a state of its own. */
:host([data-collapsed-to="bar"][data-running]) .launcher::after {
  content: "";
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--_accent);
  animation: ag-ui-dock-running 1.2s ease-in-out infinite;
}

@keyframes ag-ui-dock-running {
  50% {
    opacity: 0.35;
  }
}

@media (prefers-reduced-motion: reduce) {
  :host([data-collapsed-to="bar"][data-running]) .launcher::after {
    animation: none;
  }
}

:host([data-collapsed-to="bar"]) .bar-history {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--_muted);
  font: inherit;
  cursor: pointer;
}

:host([data-collapsed-to="bar"]) .bar-history:hover {
  background: var(--_wash);
  color: var(--_fg);
}

/* Both declare a display of their own, so each needs its own hidden rule. */
:host([data-collapsed-to]) .dock-bar[hidden],
:host([data-collapsed-to]) .bar-history[hidden] {
  display: none;
}

/* A panel a host sized to the whole window stands on the strip, whose fixed box would
   draw over the composer's foot. So it goes as it does on a phone, by display, so the
   bar measures 0 and the host's padding goes with it, and the header's minimise
   control is the way back. Collapsed, the strip is the way back, so it stays. */
:host([data-collapsed-to="bar"][data-fills-window]:not([collapsed])) .dock-bar {
  display: none;
}

/* History from the bar: the panel's own drawer, moved beside the bar while
   the panel is away, drawn as a popover standing on the bar's end. There is
   no backdrop; a press outside the bar closes it, as Escape does.

   Its outer edge keeps the panel's gutter, so the popover and the panel line
   up on the side they share. The bar is already inset by the host's reserved
   edges, so the gutter alone is the whole offset from it, and the width cap
   leaves the gutter free on both sides. A phone keeps a narrow margin
   instead, in the block below: the panel there is the whole screen, so there
   is no edge to line up with. */
:host([data-collapsed-to="bar"]) .dock-bar > .drawer {
  inset: auto var(--_edge-gutter) calc(100% + 8px) auto;
  width: min(320px, calc(var(--_viewport-width) - 2 * var(--_edge-gutter)));
  height: min(440px, calc(var(--_viewport-height) - var(--_dock-bottom, 0px) - 16px));
  border-radius: var(--_panel-radius);
  box-shadow: var(--_shadow);
  overflow: hidden;
}

:host([data-collapsed-to="bar"][placement="bottom-left"]) .dock-bar > .drawer {
  inset: auto auto calc(100% + 8px) var(--_edge-gutter);
}

@media (max-width: 600px) {
  :host([data-collapsed-to="bar"]:not([data-small-viewport="off"])) .dock-bar > .drawer {
    inset: auto 8px calc(100% + 8px) auto;
    width: min(320px, calc(100vw - 16px));
  }

  :host([data-collapsed-to="bar"][placement="bottom-left"]:not([data-small-viewport="off"])) .dock-bar > .drawer {
    inset: auto auto calc(100% + 8px) 8px;
  }
}

:host([data-collapsed-to="bar"]) .dock-bar > .drawer .drawer-backdrop {
  display: none;
}

/* The popover closes in one step. The in-panel drawer slides its panel out
   and holds the overlay's visibility until the slide ends; here the overlay
   is the popover's own box, rounded and clipped, so the slide moved the list
   inside a box that stayed put (read as a shrink) and the box went only once
   the slide had finished. This outweighs the drawer's own hidden rule, so the
   box hides at once, and whatever the list inside does is out of sight. The
   way in needs no rule: the drawer is moved into the bar as it opens, and a
   moved element starts no transition. Nothing is left for reduced motion. */
:host([data-collapsed-to="bar"]) .dock-bar > .drawer {
  transition: none;
}

/* Border-box, so the list's own border sits inside the popover's clipped box
   rather than 2px past its bottom edge. */
:host([data-collapsed-to="bar"]) .dock-bar > .drawer .drawer-panel {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid var(--_border);
  border-radius: inherit;
  box-shadow: none;
}

/* ── The host's own bar (collapse-to="none") ─────────────────────────────────
   Collapsed is hidden: no launcher, no rail, no header bar. The host's control
   calls the public API, and the panel rises from its anchor (the dock module)
   or from the placement's corner. Each placement's own collapsed rule is
   overridden at its weight or above, later in the cascade. */
:host([data-collapsed-to="none"][collapsed]) {
  pointer-events: none;
}

:host([data-collapsed-to="none"][collapsed]) .launcher {
  display: none;
}

:host([data-collapsed-to="none"][collapsed][placement="sidebar"]) {
  width: 0;
}

:host([data-collapsed-to="none"][collapsed][placement="embedded"]) {
  display: none;
}
`;
