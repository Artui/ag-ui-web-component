// PROTOTYPE (design revamp, never merged). Direction A, "Quiet": flat and
// near-monochrome. Ink on paper, hairlines instead of boxes, and the accent is
// graphite until a host gives it a brand colour.
export const QUIET_STYLES: string = `
/* ── Quiet ───────────────────────────────────────────────────────────────
   Seeds only; every other shade is mixed in the revamp base. */
:host([theme~="proto-quiet"]) {
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #161618));
  --_fg: var(--ag-ui-fg, light-dark(#1b1b1d, #ececee));
  --_accent: var(--ag-ui-accent, light-dark(#232326, #f0f0f2));
  --_font: var(--ag-ui-font, Inter, ui-sans-serif, system-ui, sans-serif);
  --_radius: var(--ag-ui-radius, 10px);
  --_panel-radius: var(--ag-ui-panel-radius, 14px);
  --_msg-radius: var(--ag-ui-msg-radius, 12px);
  --_composer-radius: var(--ag-ui-composer-radius, 12px);
  --_shadow: var(--ag-ui-shadow, 0 1px 2px rgb(0 0 0 / 0.05), 0 12px 32px -16px rgb(0 0 0 / 0.22));
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_bg));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_fg));
  --_launcher-radius: var(--ag-ui-launcher-radius, 14px);
  --_launcher-size: var(--ag-ui-launcher-size, 48px);
  --_launcher-icon-size: var(--ag-ui-launcher-icon-size, 22px);
  --_success: var(--ag-ui-success, var(--_ink-3));
}

:host([theme~="proto-quiet"][theme~="dark"]) {
  --_shadow: var(--ag-ui-shadow, 0 0 0 1px rgb(255 255 255 / 0.04), 0 16px 40px -16px rgb(0 0 0 / 0.7));
}

:host([theme~="proto-quiet"]) .chat {
  font-feature-settings: "cv11", "ss01";
  letter-spacing: -0.003em;
  line-height: var(--_leading);
}

:host([theme~="proto-quiet"]) .header {
  padding: 12px 14px 12px 18px;
}

:host([theme~="proto-quiet"]) .header-title {
  font-size: var(--_text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

:host([theme~="proto-quiet"]) .header-btn {
  color: var(--_ink-3);
  border-radius: 8px;
}

:host([theme~="proto-quiet"]) .header-btn:hover {
  color: var(--_fg);
  background: var(--_hover);
}

:host([theme~="proto-quiet"]) .message--user {
  border-radius: var(--_msg-radius);
  padding: 8px 12px;
}

:host([theme~="proto-quiet"]) .message--assistant {
  padding: 0;
  max-width: 100%;
}

:host([theme~="proto-quiet"]) .message--assistant a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--_line-strong);
  text-underline-offset: 3px;
}

:host([theme~="proto-quiet"]) .thoughts-toggle {
  color: var(--_muted);
  font-size: var(--_text-sm);
}

:host([theme~="proto-quiet"]) .input-row {
  border-top: 0;
  padding: 4px 14px 14px;
}

:host([theme~="proto-quiet"]) .composer {
  border-color: var(--_line-strong);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}

:host([theme~="proto-quiet"]) .composer:focus-within {
  border-color: var(--_ink-3);
  box-shadow: 0 0 0 3px var(--_wash);
}

:host([theme~="proto-quiet"]) .send {
  border-radius: 9px;
}

:host([theme~="proto-quiet"]) :is(.suggestion-chip, .skill-chip) {
  background: transparent;
  border: 1px solid var(--_line);
  color: var(--_ink-2);
  border-radius: 999px;
}

:host([theme~="proto-quiet"]) :is(.suggestion-chip, .skill-chip):hover {
  background: var(--_hover);
  color: var(--_fg);
}

:host([theme~="proto-quiet"]) .confirm {
  border: 1px solid var(--_line-strong);
  border-radius: var(--_radius);
  padding: 14px;
  gap: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}

:host([theme~="proto-quiet"]) .confirm-btn {
  border-radius: 8px;
  padding: 7px 14px;
  font-weight: 500;
  font-size: var(--_text-sm);
  border-color: var(--_line-strong);
}

:host([theme~="proto-quiet"]) .confirm-btn--confirm {
  border-color: var(--_accent);
  font-weight: 600;
}

:host([theme~="proto-quiet"][collapsed]) .launcher {
  border: 1px solid var(--_line-strong);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -10px rgb(0 0 0 / 0.25);
}

/* Series in ink, so a chart reads as part of the page rather than a sticker.
   The chart renderer reads the public names, so they are set here directly. */
:host([theme~="proto-quiet"]) .chart-block {
  --ag-ui-chart-1: var(--_fg);
  --ag-ui-chart-2: color-mix(in oklch, var(--_fg) 30%, var(--_bg));
  --ag-ui-chart-3: color-mix(in oklch, var(--_fg) 55%, var(--_bg));
}
`;
