// The soft theme's tokens: rounded, with surfaces tinted from the accent.
export const SOFT_TOKENS: string = `
/* ── Soft ─────────────────────────────────────────────────────────────────
   Seeds, plus two surfaces mixed from the accent: a faint wash for the panel
   chrome and a stronger tint for the user's turns. */
:host([theme~="soft"]) {
  --_bg: var(--ag-ui-bg, light-dark(#fdfcff, #17161d));
  --_fg: var(--ag-ui-fg, light-dark(#1f1d2b, #ebe9f5));
  --_accent: var(--ag-ui-accent, light-dark(#6a4fd8, #a593ff));
  --_tint: var(--ag-ui-tint, color-mix(in oklch, var(--_accent) 5%, var(--_bg)));
  --_tint-2: var(--ag-ui-tint-2, color-mix(in oklch, var(--_accent) 13%, var(--_bg)));
  --_header-bg: var(--ag-ui-header-bg, var(--_tint));
  --_user-bg: var(--ag-ui-user-bg, var(--_tint-2));
  --_border: var(--ag-ui-border, color-mix(in oklch, var(--_accent) 14%, var(--_bg)));
  --_radius: var(--ag-ui-radius, 16px);
  --_frame-radius: var(--ag-ui-frame-radius, 24px);
  --_msg-radius: var(--ag-ui-msg-radius, 18px);
  --_composer-radius: var(--ag-ui-composer-radius, 22px);
  --_frame-shadow: var(--ag-ui-frame-shadow, 0 2px 6px light-dark(rgb(30 20 60 / 0.05), rgb(0 0 0 / 0.3)), 0 30px 60px -28px light-dark(color-mix(in oklch, var(--_accent) 45%, transparent), rgb(0 0 0 / 0.75)));
  --_launcher-size: var(--ag-ui-launcher-size, 56px);
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_accent));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_on-accent));
  --_launcher-radius: var(--ag-ui-launcher-radius, 20px);
  --_launcher-icon-size: var(--ag-ui-launcher-icon-size, 24px);
  --_chart-1: var(--ag-ui-chart-1, var(--_accent));
  --_chart-2: var(--ag-ui-chart-2, color-mix(in oklch, var(--_accent) 38%, var(--_bg)));
}
`;
