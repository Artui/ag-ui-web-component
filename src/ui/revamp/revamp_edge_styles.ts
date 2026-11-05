// PROTOTYPE (design revamp, never merged). The directions set a rounder panel
// than the baseline, and they come after the placement modules, so their
// radius would win over the square corner a docked placement asks for. This
// restates the square corner, and drops the shadow, after them.
export const REVAMP_EDGE_STYLES: string = `
/* ── Revamp: square where the panel meets the viewport edge ────────────── */
:host([theme^="proto-"][placement="sidebar"]),
:host([theme^="proto-"][placement="page"]),
:host([theme^="proto-"][placement="side"]),
:host([theme^="proto-"][placement="full"]) {
  --_panel-radius: var(--ag-ui-panel-radius, 0);
}

@media (max-width: 600px) {
  :host([theme^="proto-"][placement="floating"]:not([data-small-viewport="off"])),
  :host([theme^="proto-"][placement="bottom-left"]:not([data-small-viewport="off"])),
  :host([theme^="proto-"]:not([placement]):not([data-small-viewport="off"])) {
    --_panel-radius: var(--ag-ui-panel-radius, 0);
    --_shadow: var(--ag-ui-shadow, none);
  }
}
`;
