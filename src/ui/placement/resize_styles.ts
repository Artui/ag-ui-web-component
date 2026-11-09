// The resize grips on every edge and corner, and which placements keep them.
export const RESIZE_STYLES: string = `
/* Resize grips: every edge and every corner, so the panel can be dragged from
   whichever side the reader is already near. Absent entirely where the
   placement is full-bleed, since there is nothing to drag.

   The whole set is always laid out. Which edges the *layout* pins is not a
   question the stylesheet needs to answer any more -- it decided where the one
   grip went, and there is no longer one grip. The element still measures and
   stamps data-resize-anchor, because it decides what a drag on a pinned edge
   costs in position and which grip carries the tab stop, but no rule here
   reads it. */
.resize-handle {
  position: absolute;
  z-index: 2;
  background: transparent;
  touch-action: none;
}

.resize-handle:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: -2px;
}

/* Corners first in the file and last in the DOM, so they take the pointer
   where they overlap an edge strip. */
.resize-handle--top-left,
.resize-handle--top-right,
.resize-handle--bottom-left,
.resize-handle--bottom-right {
  width: var(--_grip-corner);
  height: var(--_grip-corner);
}

.resize-handle--top-left {
  top: 0;
  left: 0;
  cursor: nwse-resize;
}

.resize-handle--top-right {
  top: 0;
  right: 0;
  cursor: nesw-resize;
}

.resize-handle--bottom-left {
  bottom: 0;
  left: 0;
  cursor: nesw-resize;
}

.resize-handle--bottom-right {
  bottom: 0;
  right: 0;
  cursor: nwse-resize;
}

/* Edge strips, held clear of the corners at both ends so a corner drag is
   never swallowed by the edge next to it. */
.resize-handle--left,
.resize-handle--right {
  top: var(--_grip-corner);
  bottom: var(--_grip-corner);
  width: var(--_grip-edge);
  cursor: ew-resize;
}

.resize-handle--left {
  left: 0;
}

.resize-handle--right {
  right: 0;
}

.resize-handle--top,
.resize-handle--bottom {
  left: var(--_grip-corner);
  right: var(--_grip-corner);
  height: var(--_grip-edge);
  cursor: ns-resize;
}

.resize-handle--top {
  top: 0;
}

.resize-handle--bottom {
  bottom: 0;
}

/* A docked panel a host sized to the whole window has nothing to give a grip: its size
   is the host's, and a place a grip left would outlast that size with the bar back
   under it. They go as they do on a phone. A corner panel keeps them, since it has no
   bar to stand clear of and a grip's place is its own. */
:host([data-collapsed-to="bar"][data-fills-window]) .resize-handle,
:host([data-collapsed-to="none"][data-fills-window]) .resize-handle {
  display: none;
}

/* Docked: the placement owns the height, so the horizontal edges and every
   corner are inert and must not advertise a drag that does nothing. The two
   vertical edges remain, which is the same affordance these placements had
   when there was one grip -- now on both sides, since either may be the inner
   one depending on which side the rail is docked to. */
:host([placement="sidebar"]) .resize-handle--top,
:host([placement="sidebar"]) .resize-handle--bottom,
:host([placement="sidebar"]) .resize-handle--top-left,
:host([placement="sidebar"]) .resize-handle--top-right,
:host([placement="sidebar"]) .resize-handle--bottom-left,
:host([placement="sidebar"]) .resize-handle--bottom-right,
:host([placement="side"]) .resize-handle--top,
:host([placement="side"]) .resize-handle--bottom,
:host([placement="side"]) .resize-handle--top-left,
:host([placement="side"]) .resize-handle--top-right,
:host([placement="side"]) .resize-handle--bottom-left,
:host([placement="side"]) .resize-handle--bottom-right {
  display: none;
}

/* The vertical edges run the full height once no corner shares them. */
:host([placement="sidebar"]) .resize-handle--left,
:host([placement="sidebar"]) .resize-handle--right,
:host([placement="side"]) .resize-handle--left,
:host([placement="side"]) .resize-handle--right {
  top: 0;
  bottom: 0;
  width: var(--_grip-edge-docked);
}

/* Full-bleed: nothing to drag. */
:host([placement="full"]) .resize-handle,
:host([placement="page"]) .resize-handle {
  display: none;
}

/* The visible mark on a grip.

   Filling the whole strip was what the single corner grip did, and at 14px
   square nobody ever saw it. On a strip running the length of an edge the same
   fill reads as a border the panel grew -- square ended, stopping short of the
   corner radius at both ends, and easily mistaken for a rendering fault rather
   than for something to grab.

   So the hit area stays the full strip and the mark is a short pill centred on
   it, which cannot be read as an edge of anything and never meets the radius.

   It shows on hover and focus as well as during the drag. With eight grips, a
   mark that appears only once you are already dragging is a mark that never
   told anyone the grips were there. */
.resize-handle::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  border-radius: 999px;
  background: var(--_accent);
  opacity: 0;
  transition: opacity var(--_motion) var(--_ease);
}

.resize-handle--top::after,
.resize-handle--bottom::after {
  width: var(--_grip-mark-length);
  height: var(--_grip-mark-thickness);
}

.resize-handle--left::after,
.resize-handle--right::after {
  width: var(--_grip-mark-thickness);
  height: var(--_grip-mark-length);
}

/* A corner has no length to run along, so it gets a dot instead of a pill. */
.resize-handle--top-left::after,
.resize-handle--top-right::after,
.resize-handle--bottom-left::after,
.resize-handle--bottom-right::after {
  width: var(--_grip-mark-thickness);
  height: var(--_grip-mark-thickness);
}

.resize-handle:hover::after,
.resize-handle:focus-visible::after {
  opacity: 0.5;
}

/* Equal specificity to the pair above, so source order is what makes the drag
   the stronger of the two states. */
.resize-handle[data-dragging]::after {
  opacity: 0.9;
}
`;
