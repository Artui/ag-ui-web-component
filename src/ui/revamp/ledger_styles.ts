// PROTOTYPE (design revamp, never merged). Direction C, "Ledger": dense and
// editorial. Paper and ink, a serif for what the agent says, a monospace for
// what the machine did, square corners, and rules between turns.
export const LEDGER_STYLES: string = `
/* ── Ledger ──────────────────────────────────────────────────────────────
   A smaller type scale than the other two, because density is the point:
   more of the conversation on screen, read rather than skimmed. */
:host([theme~="proto-ledger"]) {
  --_bg: var(--ag-ui-bg, light-dark(#fbfaf6, #151513));
  --_fg: var(--ag-ui-fg, light-dark(#1d1c19, #e8e6df));
  --_accent: var(--ag-ui-accent, light-dark(#b8410e, #f08a4b));
  --_font: var(--ag-ui-font, Inter, ui-sans-serif, system-ui, sans-serif);
  --_serif: var(--ag-ui-serif, Charter, "Bitstream Charter", "Iowan Old Style", Georgia, serif);
  --_code-font: var(--ag-ui-code-font, "JetBrains Mono", ui-monospace, Menlo, monospace);
  --_text-xs: var(--ag-ui-text-xs, 10.5px);
  --_text-sm: var(--ag-ui-text-sm, 12px);
  --_text-md: var(--ag-ui-text-md, 13px);
  --_text-lg: var(--ag-ui-text-lg, 14.5px);
  --_leading: var(--ag-ui-leading, 1.5);
  --_space: var(--ag-ui-space, 8px);
  --_pad: var(--ag-ui-pad, 14px);
  --_radius: var(--ag-ui-radius, 3px);
  --_panel-radius: var(--ag-ui-panel-radius, 6px);
  --_msg-radius: var(--ag-ui-msg-radius, 0px);
  --_composer-radius: var(--ag-ui-composer-radius, 4px);
  --_user-bg: var(--ag-ui-user-bg, transparent);
  --_shadow: var(--ag-ui-shadow, 0 0 0 1px var(--_line-strong), 0 20px 40px -28px rgb(0 0 0 / 0.45));
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_fg));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_bg));
  --_launcher-radius: var(--ag-ui-launcher-radius, 6px);
  --_launcher-size: var(--ag-ui-launcher-size, 44px);
  --_launcher-icon-size: var(--ag-ui-launcher-icon-size, 20px);
  --_on-accent: var(--ag-ui-on-accent, light-dark(#ffffff, #151513));
}

:host([theme~="proto-ledger"]) .chat {
  line-height: var(--_leading);
  border-color: var(--_line-strong);
}

:host([theme~="proto-ledger"]) .header {
  padding: 8px 10px 8px 14px;
  border-bottom-color: var(--_line-strong);
}

:host([theme~="proto-ledger"]) .header-title {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:host([theme~="proto-ledger"]) .header-title::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  background: var(--_accent);
  vertical-align: 1px;
}

:host([theme~="proto-ledger"]) .header-btn {
  color: var(--_ink-3);
  border-radius: 3px;
  --_header-btn-size: 26px;
}

:host([theme~="proto-ledger"]) .header-btn:hover {
  background: var(--_hover);
  color: var(--_fg);
}

:host([theme~="proto-ledger"]) .message--user {
  align-self: stretch;
  max-width: 100%;
  margin-top: 6px;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--_fg);
  font-weight: 500;
}

:host([theme~="proto-ledger"]) .message--user + .answer,
:host([theme~="proto-ledger"]) .answer + .message--user {
  margin-top: 4px;
}

:host([theme~="proto-ledger"]) .answer + .message--user {
  border-top: 0;
}

:host([theme~="proto-ledger"]) .message--assistant {
  padding: 0;
  max-width: 100%;
  font-family: var(--_serif);
  font-size: var(--_text-lg);
  line-height: 1.5;
}

:host([theme~="proto-ledger"]) .message--assistant a {
  color: var(--_accent-ink);
}

:host([theme~="proto-ledger"]) .thoughts-toggle,
:host([theme~="proto-ledger"]) .tool-group-head,
:host([theme~="proto-ledger"]) .tool-group .tool-call {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  letter-spacing: 0.01em;
}

:host([theme~="proto-ledger"]) .tool-group-head {
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

:host([theme~="proto-ledger"]) .tool-group-list {
  border-left: 1px dashed var(--_line-strong);
}

:host([theme~="proto-ledger"]) .chart-block {
  border-top: 1px solid var(--_line-strong);
  border-bottom: 1px solid var(--_line);
  padding: 8px 0;
}

:host([theme~="proto-ledger"]) .chart-title {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

:host([theme~="proto-ledger"]) .input-row {
  padding: 10px;
  border-top-color: var(--_line-strong);
}

:host([theme~="proto-ledger"]) .composer {
  border-color: var(--_line-strong);
}

:host([theme~="proto-ledger"]) .composer:focus-within {
  border-color: var(--_fg);
}

:host([theme~="proto-ledger"]) .send {
  border-radius: 3px;
}

:host([theme~="proto-ledger"]) :is(.suggestion-chip, .skill-chip) {
  background: transparent;
  border: 1px solid var(--_line-strong);
  color: var(--_ink-2);
  border-radius: 2px;
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  padding: 3px 8px;
}

:host([theme~="proto-ledger"]) :is(.suggestion-chip, .skill-chip):hover {
  border-color: var(--_fg);
  color: var(--_fg);
}

:host([theme~="proto-ledger"]) .confirm {
  border: 1px solid var(--_fg);
  border-left: 3px solid var(--_accent);
  border-radius: 2px;
  padding: 10px 12px;
  gap: 10px;
  background: var(--_bg);
}

:host([theme~="proto-ledger"]) .confirm-btn {
  border-radius: 2px;
  padding: 5px 12px;
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-color: var(--_line-strong);
}

:host([theme~="proto-ledger"]) .confirm-btn--confirm {
  border-color: var(--_accent);
}

:host([theme~="proto-ledger"]) .chart-block {
  --ag-ui-chart-1: var(--_fg);
  --ag-ui-chart-2: var(--_accent);
  --ag-ui-chart-3: color-mix(in oklch, var(--_fg) 40%, var(--_bg));
}
`;
