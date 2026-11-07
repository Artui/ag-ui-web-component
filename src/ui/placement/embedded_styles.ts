// The embedded placement: no floating chrome, laid out by the host.
export const EMBEDDED_STYLES: string = `
/* Embedded: drop the floating chrome and the high z-index stacking context so
   the widget lives in the host's own layout (fixes overlay/z-index clashes). */
:host([placement="embedded"]) {
  --_position: var(--ag-ui-position, static);
  --_width: var(--_drag-width, var(--ag-ui-width, 100%));
  --_height: var(--_drag-height, var(--ag-ui-height, 100%));
  --_max-width: var(--ag-ui-max-width, 100%);
  --_max-height: var(--ag-ui-max-height, 100%);
  --_shadow: var(--ag-ui-shadow, none);
  --_z-index: var(--ag-ui-z-index, auto);
}
`;
