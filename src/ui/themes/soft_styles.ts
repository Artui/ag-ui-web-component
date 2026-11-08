// The soft theme's structure: pills, tinted surfaces, rounded cards.
export const SOFT_STYLES: string = `
/* ── Soft ────────────────────────────────────────────────────────────────
   Structure only; the tokens are in soft_tokens, set before the density
   presets. */

:host([theme~="soft"]) .chat {
  line-height: var(--_leading);
  background: var(--_bg);
}

:host([theme~="soft"]) .header {
  border-bottom-color: transparent;
  padding: 14px 16px 12px 20px;
}

:host([theme~="soft"]) .header-title {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: var(--_text-lg);
  font-weight: 600;
  letter-spacing: -0.015em;
}

:host([theme~="soft"]) .header-title::before {
  content: "";
  width: 22px;
  height: 22px;
  border-radius: 8px;
  background: linear-gradient(140deg, color-mix(in oklch, var(--_accent) 55%, var(--_bg)), var(--_accent));
}

/* Both inks yield once the host sets the header text, since the header behind
   them is then the host's colour (see the switches in the token defaults). */
:host([theme~="soft"]) .header-btn {
  color: var(--_header-fg-set, var(--_ink-3));
  border-radius: 10px;
}

:host([theme~="soft"]) .header-btn:hover {
  color: var(--_header-fg-set, var(--_accent-ink));
}

:host([theme~="soft"]) .messages {
  background: linear-gradient(var(--_tint), var(--_bg) 120px);
}

:host([theme~="soft"]) .message--user {
  border-radius: var(--_msg-radius) var(--_msg-radius) 6px var(--_msg-radius);
  padding: 9px 14px;
}

:host([theme~="soft"]) .message--assistant {
  padding: 0 2px;
  max-width: 100%;
}

:host([theme~="soft"]) .message--assistant a {
  color: var(--_accent-ink);
}

/* The step group's row as a tinted pill. Unscoped to grouped mode: a card
   mode hides the row and drops the list's box, so neither reaches a
   flattened card. */
:host([theme~="soft"]) .tool-group-head {
  background: var(--_tint);
  border: 1px solid var(--_border);
  border-radius: 999px;
  padding: 5px 12px 5px 9px;
  margin-left: 0;
}

:host([theme~="soft"]) .tool-group-head:hover {
  background: var(--_tint-2);
}

:host([theme~="soft"]) .tool-group-list {
  border-left-color: var(--_tint-2);
  margin-left: 14px;
}

:host([theme~="soft"]) .chart-block {
  background: var(--_bg);
  border: 1px solid var(--_border);
  border-radius: var(--_radius);
  padding: 12px 14px;
}

:host([theme~="soft"]) .input-row {
  border-top: 0;
  padding-block: 6px 16px;
}

:host([theme~="soft"]) .composer {
  padding: 8px 8px 8px 14px;
  border-color: var(--_border);
  box-shadow: 0 6px 20px -10px color-mix(in oklch, var(--_accent) 35%, transparent);
}

:host([theme~="soft"]) .composer:focus-within {
  border-color: color-mix(in oklch, var(--_accent) 50%, var(--_bg));
  box-shadow: 0 0 0 4px var(--_tint-2);
}

:host([theme~="soft"]) .send {
  border-radius: 999px;
}

:host([theme~="soft"]) :is(.suggestion-chip, .skill-chip) {
  background: var(--_tint-2);
  border: 1px solid transparent;
  color: var(--_accent-ink);
  border-radius: 999px;
  font-weight: 500;
}

:host([theme~="soft"]) :is(.suggestion-chip, .skill-chip):hover {
  border-color: color-mix(in oklch, var(--_accent) 35%, var(--_bg));
}

:host([theme~="soft"]) .confirm {
  background: var(--_tint);
  border: 1px solid var(--_border);
  border-radius: 18px;
  padding: 16px;
  gap: 14px;
}

:host([theme~="soft"]) .confirm-btn {
  border-radius: 999px;
  padding: 8px 16px;
  font-weight: 500;
  background: var(--_bg);
  border-color: var(--_border);
}

:host([theme~="soft"]) .confirm-btn--confirm {
  background: var(--_accent);
  border-color: var(--_accent);
  color: var(--_on-accent);
  font-weight: 600;
}

:host([theme~="soft"]) .launcher {
  border: 0;
  box-shadow: 0 14px 30px -12px color-mix(in oklch, var(--_accent) 70%, transparent);
}
`;
