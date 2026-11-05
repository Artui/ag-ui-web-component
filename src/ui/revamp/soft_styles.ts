// PROTOTYPE (design revamp, never merged). Direction B, "Soft": rounded,
// with surfaces tinted from the accent so the whole panel carries the brand
// faintly, and the accent itself still kept for what you press.
export const SOFT_STYLES: string = `
/* ── Soft ────────────────────────────────────────────────────────────────
   Seeds, plus two surfaces mixed from the accent: a faint wash for the panel
   chrome and a raised tint for the user's turns. */
:host([theme~="proto-soft"]) {
  --_bg: var(--ag-ui-bg, light-dark(#fdfcff, #17161d));
  --_fg: var(--ag-ui-fg, light-dark(#1f1d2b, #ebe9f5));
  --_accent: var(--ag-ui-accent, light-dark(#6a4fd8, #a593ff));
  --_font: var(--ag-ui-font, Inter, ui-sans-serif, system-ui, sans-serif);
  --_tint: color-mix(in oklch, var(--_accent) 5%, var(--_bg));
  --_tint-2: color-mix(in oklch, var(--_accent) 13%, var(--_bg));
  --_header-bg: var(--ag-ui-header-bg, var(--_tint));
  --_user-bg: var(--ag-ui-user-bg, var(--_tint-2));
  --_user-fg: var(--ag-ui-user-fg, var(--_fg));
  --_input-bg: var(--ag-ui-input-bg, var(--_bg));
  --_border: var(--ag-ui-border, color-mix(in oklch, var(--_accent) 14%, var(--_bg)));
  --_radius: var(--ag-ui-radius, 16px);
  --_panel-radius: var(--ag-ui-panel-radius, 24px);
  --_msg-radius: var(--ag-ui-msg-radius, 18px);
  --_composer-radius: var(--ag-ui-composer-radius, 22px);
  --_shadow: var(--ag-ui-shadow, 0 2px 6px rgb(30 20 60 / 0.05), 0 30px 60px -28px color-mix(in oklch, var(--_accent) 45%, transparent));
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_accent));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_on-accent));
  --_launcher-radius: var(--ag-ui-launcher-radius, 20px);
  --_launcher-size: var(--ag-ui-launcher-size, 56px);
}

:host([theme~="proto-soft"][theme~="dark"]) {
  --_shadow: var(--ag-ui-shadow, 0 2px 6px rgb(0 0 0 / 0.3), 0 30px 60px -24px rgb(0 0 0 / 0.75));
}

:host([theme~="proto-soft"]) .chat {
  line-height: var(--_leading);
  background: var(--_bg);
}

:host([theme~="proto-soft"]) .header {
  border-bottom-color: transparent;
  padding: 14px 16px 12px 20px;
}

:host([theme~="proto-soft"]) .header-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: var(--_text-lg);
  font-weight: 600;
  letter-spacing: -0.015em;
}

:host([theme~="proto-soft"]) .header-title::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 8px;
  background: linear-gradient(140deg, color-mix(in oklch, var(--_accent) 55%, var(--_bg)), var(--_accent));
}

:host([theme~="proto-soft"]) .header-btn {
  color: var(--_ink-3);
  border-radius: 10px;
}

:host([theme~="proto-soft"]) .header-btn:hover {
  background: var(--_tint-2);
  color: var(--_accent-ink);
}

:host([theme~="proto-soft"]) .messages {
  background: linear-gradient(var(--_tint), var(--_bg) 120px);
}

:host([theme~="proto-soft"]) .message--user {
  border-radius: var(--_msg-radius) var(--_msg-radius) 6px var(--_msg-radius);
  padding: 9px 14px;
}

:host([theme~="proto-soft"]) .message--assistant {
  padding: 0 2px;
  max-width: 100%;
}

:host([theme~="proto-soft"]) .message--assistant a {
  color: var(--_accent-ink);
}

:host([theme~="proto-soft"]) .tool-group-head {
  background: var(--_tint);
  border: 1px solid var(--_border);
  border-radius: 999px;
  padding: 5px 12px 5px 9px;
  margin-left: 0;
}

:host([theme~="proto-soft"]) .tool-group-head:hover {
  background: var(--_tint-2);
}

:host([theme~="proto-soft"]) .tool-group-list {
  border-left-color: var(--_tint-2);
  margin-left: 14px;
}

:host([theme~="proto-soft"]) .chart-block {
  background: var(--_bg);
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  padding: 12px 14px;
}

:host([theme~="proto-soft"]) .input-row {
  border-top: 0;
  padding: 6px 14px 16px;
}

:host([theme~="proto-soft"]) .composer {
  padding: 8px 8px 8px 14px;
  border-color: var(--_border);
  box-shadow: 0 6px 20px -10px color-mix(in oklch, var(--_accent) 35%, transparent);
}

:host([theme~="proto-soft"]) .composer:focus-within {
  border-color: color-mix(in oklch, var(--_accent) 50%, var(--_bg));
  box-shadow: 0 0 0 4px var(--_tint-2);
}

:host([theme~="proto-soft"]) .send {
  border-radius: 999px;
}

:host([theme~="proto-soft"]) :is(.suggestion-chip, .skill-chip) {
  background: var(--_tint-2);
  border: 1px solid transparent;
  color: var(--_accent-ink);
  border-radius: 999px;
  font-weight: 500;
}

:host([theme~="proto-soft"]) :is(.suggestion-chip, .skill-chip):hover {
  border-color: color-mix(in oklch, var(--_accent) 35%, var(--_bg));
}

:host([theme~="proto-soft"]) .confirm {
  background: var(--_tint);
  border: 1px solid var(--_border);
  border-radius: 18px;
  padding: 16px;
  gap: 14px;
}

:host([theme~="proto-soft"]) .confirm-btn {
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 500;
  background: var(--_bg);
  border-color: var(--_border);
}

:host([theme~="proto-soft"]) .confirm-btn--confirm {
  background: var(--_accent);
  border-color: var(--_accent);
  color: var(--_on-accent);
  font-weight: 600;
}

:host([theme~="proto-soft"][collapsed]) .launcher {
  box-shadow: 0 14px 30px -12px color-mix(in oklch, var(--_accent) 70%, transparent);
}

:host([theme~="proto-soft"]) .chart-block {
  --ag-ui-chart-1: var(--_accent);
  --ag-ui-chart-2: color-mix(in oklch, var(--_accent) 38%, var(--_bg));
  --ag-ui-chart-3: color-mix(in oklch, var(--_accent) 60%, #e0607e);
}
`;
