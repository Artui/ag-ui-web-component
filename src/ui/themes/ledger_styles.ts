// The ledger theme's structure: rules, square corners, serif and monospace.
export const LEDGER_STYLES: string = `
/* ── Ledger ──────────────────────────────────────────────────────────────
   Structure only; the tokens are in ledger_tokens. Serif for what the
   agent says, monospace for what the machine did. */

:host([theme~="ledger"]) .chat {
  line-height: var(--_leading);
  border-color: var(--_line-strong);
}

:host([theme~="ledger"]) .header {
  padding: 8px 10px 8px 14px;
  border-bottom-color: var(--_line-strong);
}

:host([theme~="ledger"]) .header-title {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

:host([theme~="ledger"]) .header-title::before {
  content: "";
  display: inline-block;
  width: 7px;
  height: 7px;
  margin-right: 8px;
  background: var(--_accent);
  vertical-align: 1px;
}

:host([theme~="ledger"]) .header-btn {
  color: var(--_ink-3);
  border-radius: 3px;
}

:host([theme~="ledger"]) .header-btn:hover {
  background: var(--_hover);
  color: var(--_fg);
}

:host([theme~="ledger"]) .message--user {
  align-self: stretch;
  max-width: 100%;
  margin-top: 6px;
  padding: 2px 0 2px 12px;
  border-left: 2px solid var(--_fg);
  font-weight: 500;
}

:host([theme~="ledger"]) .message--user + .answer,
:host([theme~="ledger"]) .answer + .message--user {
  margin-top: 4px;
}

:host([theme~="ledger"]) .answer + .message--user {
  border-top: 0;
}

:host([theme~="ledger"]) .message--assistant {
  padding: 0;
  max-width: 100%;
  font-family: var(--_serif);
  font-size: var(--_text-lg);
  line-height: 1.5;
}

:host([theme~="ledger"]) .message--assistant a {
  color: var(--_accent-ink);
}

:host([theme~="ledger"]) .thoughts-toggle {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  letter-spacing: 0.01em;
}

/* The step group's row reads as a ledger heading. Unscoped to grouped mode:
   a card mode hides the row and drops the list's box, so neither reaches a
   flattened card. */
:host([theme~="ledger"]) .tool-group-head {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  border-radius: 2px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

:host([theme~="ledger"]) .tool-group-list {
  border-left: 1px dashed var(--_line-strong);
}

:host([theme~="ledger"]) .chart-block {
  border-top: 1px solid var(--_line-strong);
  border-bottom: 1px solid var(--_line);
  padding: 8px 0;
}

:host([theme~="ledger"]) .chart-title {
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

:host([theme~="ledger"]) .input-row {
  padding-block: 10px;
  border-top: 1px solid var(--_line-strong);
}

:host([theme~="ledger"]) .composer {
  border-color: var(--_line-strong);
}

:host([theme~="ledger"]) .composer:focus-within {
  border-color: var(--_fg);
}

:host([theme~="ledger"]) .send {
  border-radius: 3px;
}

:host([theme~="ledger"]) :is(.suggestion-chip, .skill-chip) {
  background: transparent;
  border: 1px solid var(--_line-strong);
  color: var(--_ink-2);
  border-radius: 2px;
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  padding: 3px 8px;
}

:host([theme~="ledger"]) :is(.suggestion-chip, .skill-chip):hover {
  border-color: var(--_fg);
  color: var(--_fg);
}

:host([theme~="ledger"]) .confirm {
  border: 1px solid var(--_fg);
  border-left: 3px solid var(--_accent);
  border-radius: 2px;
  padding: 10px 12px;
  gap: 10px;
  background: var(--_bg);
}

:host([theme~="ledger"]) .confirm-btn {
  border-radius: 2px;
  padding: 5px 12px;
  font-family: var(--_code-font);
  font-size: var(--_text-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-color: var(--_line-strong);
}

:host([theme~="ledger"]) .confirm-btn--confirm {
  border-color: var(--_accent);
}

:host([theme~="ledger"]) .launcher {
  border: 0;
}
`;
