// The panel itself and its header: title, icon holder and header controls.
export const FRAME_STYLES: string = `
.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--_bg);
  border: 1px solid var(--_border);
  border-radius: var(--_panel-radius);
  box-shadow: var(--_shadow);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--_border);
  background: var(--_header-bg);
  color: var(--_header-fg);
}

/* The header is the panel's title bar: on the placements that let the widget
   be moved it drags the whole thing, matching the launcher's own drag. The
   selector lists those placements rather than asking JS to stamp an attribute,
   because a cursor that appears one frame late reads as a control that only
   sometimes exists. touch-action keeps a finger drag here moving the panel
   instead of scrolling the page behind it. */
:host(:not([placement])) .header,
:host([placement=""]) .header,
:host([placement="floating"]) .header,
:host([placement="bottom-left"]) .header {
  cursor: move;
  touch-action: none;
}

/* A host that turned the drag off keeps a header that says so. */
:host([data-launcher-drag="false"]) .header {
  cursor: auto;
  touch-action: auto;
}

/* A panel that is the screen has nowhere to go, so its header refuses the drag
   and must not offer it. No selector can see that a host has sized the panel to
   the window, so the placement stamps this from the measurement that refuses the
   drag. :host is carried for the specificity, not the scope, as below. Before the
   dragging rule, so a drag the header did take keeps its grabbing cursor. */
:host .header[data-fills-screen] {
  cursor: auto;
}

/* :host is carried for the specificity, not the scope: the placement rules
   above are a host selector plus a class plus an attribute, and a bare
   .header[data-dragging] loses to them -- silently, because the drag still
   works and only the cursor is wrong. */
:host .header[data-dragging] {
  cursor: grabbing;
}

/* The cursor inherits, so a control a host slots into the header would show
   the drag cursor over something the drag deliberately ignores. Named to
   match the controls panel_drag steps aside for. */
.header ::slotted(:is(button, a, input, select, textarea)) {
  cursor: pointer;
}

.header-title {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Header / launcher icon holder: a slot, with a data-icon-url <img>
   fallback, sized via --ag-ui-icon-size. */
.icon-holder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--_icon-size);
  height: var(--_icon-size);
  line-height: 1;
}

.icon-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--_icon-radius);
}

.header-controls {
  display: flex;
  gap: var(--_header-gap);
  flex: none;
}

/* Under every theme: once the host sets the header text, the header behind the
   buttons is the host's colour, so their rest opacity goes. The frame's 0.85
   lets the header through the glyph, which took white on a mid-blue header from
   5.1:1 to 4.2:1. With the header text set, the opacity below reads a colour,
   which no opacity can be, so it is invalid at computed-value time and falls to
   the initial 1; unset, it reads the fallback. The glyph is each theme's own
   business: this inherits the header text, and a theme that draws the buttons
   in another ink reads the same switch to yield. */
.header-btn {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: var(--_header-btn-size);
  height: var(--_header-btn-size);
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  padding: 0;
  border-radius: 6px;
  cursor: pointer;
  opacity: var(--_header-fg-set, 0.85);
}

/* The square is the host's own when it set one; otherwise it is mixed from the
   header text when the host set that, so it reads on any header the host
   painted; otherwise it is the theme's own. See the alias in the token defaults. */
.header-btn:hover {
  opacity: 1;
  background: var(--_header-btn-hover);
}

/* Every built-in header mark is a drawn glyph at the composer's size; the theme
   toggle's holder takes that size too, so its moon matches its neighbours. */
.header-btn .glyph,
.header-btn .icon-holder {
  width: var(--_glyph-size);
  height: var(--_glyph-size);
}
`;
