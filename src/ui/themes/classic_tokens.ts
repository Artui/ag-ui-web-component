// The classic theme: the look before the revamp, kept so a host can pin it.
// Tokens only; classic's structure is the base stylesheet itself.
export const CLASSIC_TOKENS: string = `
/* ── Classic ──────────────────────────────────────────────────────────────
   Today's indigo header, accent user bubble, round launcher and heavy
   shadow, in both schemes. The code theme starts from these as well, since
   it was always this structure in a terminal palette. */
:host([theme~="classic"]),
:host([theme~="code"]) {
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #15151f));
  --_fg: var(--ag-ui-fg, light-dark(#1a1a2e, #e8e8f2));
  --_accent: var(--ag-ui-accent, #4f46e5);
  --_user-bg: var(--ag-ui-user-bg, #4f46e5);
  --_user-fg: var(--ag-ui-user-fg, #ffffff);
  --_assistant-bg: var(--ag-ui-assistant-bg, light-dark(#f1f1f6, #25253a));
  --_hover: var(--ag-ui-hover, light-dark(#e7e7ee, #303049));
  --_tool-bg: var(--ag-ui-tool-bg, var(--_assistant-bg));
  --_tool-fg: var(--ag-ui-tool-fg, var(--_accent));
  --_header-bg: var(--ag-ui-header-bg, light-dark(var(--_accent), #1f1f30));
  --_header-fg: var(--ag-ui-header-fg, light-dark(#ffffff, #e8e8f2));
  --_header-btn-hover: var(--ag-ui-header-btn-hover, var(--_header-btn-hover-auto, rgba(255, 255, 255, 0.18)));
  --_border: var(--ag-ui-border, light-dark(#e2e2ec, #33334a));
  --_muted: var(--ag-ui-muted, light-dark(#6b7280, #9aa0b4));
  --_success: var(--ag-ui-success, #15803d);
  --_danger: var(--ag-ui-danger, #b91c1c);
  --_tooltip-bg: var(--ag-ui-tooltip-bg, #1f2430);
  --_tooltip-fg: var(--ag-ui-tooltip-fg, #f5f6fa);
  --_font: var(--ag-ui-font, inherit);
  --_frame-radius: var(--ag-ui-frame-radius, var(--_radius));
  --_frame-shadow: var(--ag-ui-frame-shadow, 0 12px 32px light-dark(rgba(20, 20, 50, 0.18), rgba(0, 0, 0, 0.5)));
  --_composer-radius: var(--ag-ui-composer-radius, 14px);
  --_msg-radius: var(--ag-ui-msg-radius, 14px);
  --_launcher-size: var(--ag-ui-launcher-size, 56px);
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_header-bg));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_header-fg));
  --_launcher-radius: var(--ag-ui-launcher-radius, 50%);
  --_launcher-icon-size: var(--ag-ui-launcher-icon-size, 26px);
  --_chart-1: var(--ag-ui-chart-1, #4f7cff);
  --_chart-2: var(--ag-ui-chart-2, #21b573);
}

/* Classic's contrast fixes, which code does not share. The indigo accent
   measured 2.38:1 as tool-name text on the dark card, and the old success
   green 2.38:1 as the done mark there; in the dark scheme the tool name
   takes the accent mixed halfway to the text colour, and success the
   lighter green the other themes use. The light half is unchanged. */
:host([theme~="classic"]) {
  --_tool-fg: var(--ag-ui-tool-fg, light-dark(var(--_accent), color-mix(in oklch, var(--_accent) 50%, var(--_fg))));
  --_success: var(--ag-ui-success, light-dark(#15803d, #4ade80));
}
`;
