// The token values the bottom-left, side and full placements start from;
// the default bottom-right corner is the token defaults themselves.
export const PRESET_STYLES: string = `
/* ── Placement presets ──────────────────────────────────────────────────── */
/* Maximized, from the header control: a corner or docked panel takes the
   maximized size on both axes. Set on the box rather than the size aliases, so
   the size the user dragged is not read and the aliases stay the host's. The
   element refuses the state on page, full, embedded and at 600px or less, so
   no rule here has to. A collapsed attribute written straight on, which the
   element is not told of, still draws the collapsed box. A side column grows
   its width only, below and in the sidebar module. */
:host([maximized]:not([collapsed]):not([placement="side"]):not([placement="sidebar"])) {
  width: var(--_maximized-width);
  height: var(--_maximized-height);
}

:host([placement="bottom-left"]) {
  --_inset: var(
    --ag-ui-inset,
    auto auto calc(var(--_edge-gutter) + var(--_viewport-inset-bottom) + var(--_keyboard-inset))
      calc(var(--_edge-gutter) + var(--_viewport-inset-left))
  );
}

:host([placement="side"]) {
  --_inset: var(--ag-ui-inset, calc(var(--_viewport-inset-top) + var(--_keyboard-inset-top)) var(--_viewport-inset-right) var(--_viewport-inset-bottom) auto);
  --_width: var(--_drag-width, var(--ag-ui-width, 420px));
  --_height: var(--ag-ui-height, var(--_viewport-height));
  --_max-height: var(--ag-ui-max-height, var(--_viewport-height));
  --_panel-radius: var(--ag-ui-panel-radius, 0);
}

:host([placement="side"][maximized]:not([collapsed])) {
  width: var(--_maximized-width);
}

:host([placement="full"]) {
  --_inset: var(
    --ag-ui-inset,
    calc(var(--_viewport-inset-top) + var(--_keyboard-inset-top)) var(--_viewport-inset-right)
      var(--_viewport-inset-bottom) var(--_viewport-inset-left)
  );
  --_width: var(--ag-ui-width, var(--_viewport-width));
  --_height: var(--ag-ui-height, var(--_viewport-height));
  --_max-width: var(--ag-ui-max-width, var(--_viewport-width));
  --_max-height: var(--ag-ui-max-height, var(--_viewport-height));
  --_panel-radius: var(--ag-ui-panel-radius, 0);
}
`;
