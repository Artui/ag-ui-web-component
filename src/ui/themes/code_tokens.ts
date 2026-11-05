// The code theme: classic's structure in a dark terminal palette. Kept for
// hosts that already wear it; Ledger is where a monospace look goes next.
export const CODE_TOKENS: string = `
/* ── Code ─────────────────────────────────────────────────────────────────
   Dark only, monospace, green accent. Restates the colours classic sets,
   after it, so code wins wherever the two would both apply. */
:host([theme~="code"]) {
  --_bg: var(--ag-ui-bg, #0d1117);
  --_fg: var(--ag-ui-fg, #c9d1d9);
  --_accent: var(--ag-ui-accent, #3fb950);
  --_user-bg: var(--ag-ui-user-bg, #238636);
  --_assistant-bg: var(--ag-ui-assistant-bg, #161b22);
  --_hover: var(--ag-ui-hover, #21262d);
  --_header-bg: var(--ag-ui-header-bg, #010409);
  --_header-fg: var(--ag-ui-header-fg, #c9d1d9);
  --_border: var(--ag-ui-border, #30363d);
  --_muted: var(--ag-ui-muted, #8b949e);
  --_font: var(--ag-ui-font, var(--_code-font));
  --_frame-shadow: var(--ag-ui-frame-shadow, 0 12px 32px rgba(0, 0, 0, 0.6));
}
`;
