import { THEME_HOST } from "./theme_hosts.js";

// The default theme's structure. Applies to every element wearing no other
// built-in theme, so a host's own named theme starts from it.
export const QUIET_STYLES: string = `
/* ── Quiet ───────────────────────────────────────────────────────────────
   The default. Its tokens are the token defaults; this is the little
   structure it adds on top: no bubble for the agent, hairlines, and a
   composer that sits on the panel rather than in a band. */

${THEME_HOST.quiet} .chat {
  font-feature-settings: "cv11", "ss01";
  letter-spacing: -0.003em;
  line-height: var(--_leading);
}

${THEME_HOST.quiet} .header {
  padding: 12px 14px 12px 18px;
}

${THEME_HOST.quiet} .header-title {
  font-size: var(--_text-md);
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* The buttons sit back in the third ink on the panel. Once the host sets the
   header text they draw in it instead, since the header behind them is then
   the host's colour (see the switches in the token defaults). So does their
   rest opacity: the frame's 0.85 lets the header through the glyph, which
   took white on a mid-blue header from 5.1:1 to 4.2:1. With the header text
   set, the opacity below reads a colour, which no opacity can be, so it is
   invalid at computed-value time and falls to the initial 1; unset, it reads
   the fallback, the frame's own 0.85. */
${THEME_HOST.quiet} .header-btn {
  color: var(--_header-fg-set, var(--_ink-3));
  opacity: var(--_header-fg-set, 0.85);
  border-radius: 8px;
}

/* The hover square is the host's own when it set one; otherwise it is mixed
   from the header text when the host set that, so it reads on any header the
   host painted; otherwise it is the panel shade.
   The glyph takes the header text, which is the full ink when that is unset.
   The opacity restates the frame's hover value, which the rest rule above
   outweighs. */
${THEME_HOST.quiet} .header-btn:hover {
  color: var(--_header-fg);
  opacity: 1;
  background: var(--_header-btn-hover);
}

${THEME_HOST.quiet} .message--user {
  border-radius: var(--_msg-radius);
  padding: 8px 12px;
}

${THEME_HOST.quiet} .message--assistant {
  padding: 0;
  max-width: 100%;
}

${THEME_HOST.quiet} .message--assistant a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--_line-strong);
  text-underline-offset: 3px;
}

${THEME_HOST.quiet} .thoughts-toggle {
  color: var(--_muted);
  font-size: var(--_text-sm);
}

${THEME_HOST.quiet} .input-row {
  border-top: 0;
  padding-top: 4px;
}

${THEME_HOST.quiet} .composer {
  border-color: var(--_line-strong);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}

${THEME_HOST.quiet} .composer:focus-within {
  border-color: var(--_ink-3);
  box-shadow: 0 0 0 3px var(--_wash);
}

${THEME_HOST.quiet} .send {
  border-radius: 9px;
}

${THEME_HOST.quiet} :is(.suggestion-chip, .skill-chip) {
  background: transparent;
  border: 1px solid var(--_line);
  color: var(--_ink-2);
  border-radius: 999px;
}

${THEME_HOST.quiet} :is(.suggestion-chip, .skill-chip):hover {
  background: var(--_hover);
  color: var(--_fg);
}

${THEME_HOST.quiet} .confirm {
  border: 1px solid var(--_line-strong);
  border-radius: var(--_radius);
  padding: 14px;
  gap: 12px;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.04);
}

${THEME_HOST.quiet} .confirm-btn {
  border-radius: 8px;
  padding: 7px 14px;
  font-weight: 500;
  font-size: var(--_text-sm);
  border-color: var(--_line-strong);
}

${THEME_HOST.quiet} .confirm-btn--confirm {
  border-color: var(--_accent);
  font-weight: 600;
}

${THEME_HOST.quiet} .launcher {
  border: 1px solid var(--_line-strong);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.06), 0 8px 24px -10px rgb(0 0 0 / 0.25);
}
`;
