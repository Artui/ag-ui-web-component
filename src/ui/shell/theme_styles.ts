// The density presets: token overrides only. The themes live in ui/themes.
export const THEME_STYLES: string = `
/* ── Density ────────────────────────────────────────────────────────────── */
:host([density="compact"]) {
  --_font-size: var(--ag-ui-font-size, 13px);
  --_space: var(--ag-ui-space, 6px);
  --_pad: var(--ag-ui-pad, 10px);
  --_msg-pad: var(--ag-ui-msg-pad, 5px 9px);
  --_msg-radius: var(--ag-ui-msg-radius, 10px);
}
`;
