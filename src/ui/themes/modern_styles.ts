import { THEME_HOST } from "./theme_hosts.js";

// The structure every theme but classic and code shares: status as an icon,
// one chip row, one action row per answer, and a readable placeholder.
export const MODERN_STYLES: string = `
/* ── status as an icon, never a pill ─────────────────────────────
   The word stays for assistive technology through the card's own label; the
   pill only ever repeated what the icon said. */
${THEME_HOST.modern} .tool-call-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

${THEME_HOST.modern} .tool-call:is([data-status="done"], [data-status="error"], [data-status="declined"], [data-status="interrupted"]) .tool-call-icon::before {
  content: "";
  width: 14px;
  height: 14px;
  background: currentColor;
  mask: var(--_ico-check) center / contain no-repeat;
}

${THEME_HOST.modern} .tool-call[data-status="done"] .tool-call-icon {
  color: var(--_success);
}

${THEME_HOST.modern} .tool-call[data-status="error"] .tool-call-icon {
  color: var(--_danger);
}

${THEME_HOST.modern} .tool-call[data-status="error"] .tool-call-icon::before {
  mask-image: var(--_ico-error);
}

${THEME_HOST.modern} .tool-call:is([data-status="declined"], [data-status="interrupted"]) .tool-call-icon {
  color: var(--_muted);
}

${THEME_HOST.modern} .tool-call:is([data-status="declined"], [data-status="interrupted"]) .tool-call-icon::before {
  mask-image: var(--_ico-declined);
}

/* The settled icon inherits colour from the icon box, so the box's own glyph
   colour from the base rules must not win. */
${THEME_HOST.modern} .tool-call .tool-call-icon::before {
  color: inherit;
}

/* ── one chip row ────────────────────────────────────────────────
   Follow-up suggestions are the row once a conversation has started; the
   skill chips stay on the empty state only and otherwise live in the slash
   palette, so two rows never compete above the composer. */
:host(:not([theme~="classic"], [theme~="code"], [data-empty])) .skill-chips {
  display: none;
}

/* ── one action row per answer ───────────────────────────────────
   Copy and retry under every interim sentence of a long turn read as noise;
   only the row after the last bubble of a turn stays. */
${THEME_HOST.modern} .message-actions:has(~ .message--assistant) {
  display: none;
}

${THEME_HOST.modern} .chart-block {
  box-sizing: border-box;
}

/* The baseline placeholder is the browser default, which measured under
   4.5:1 on every dark surface. A derived ink clears it in both schemes. */
${THEME_HOST.modern} .input::placeholder {
  color: var(--_ink-3);
  opacity: 1;
}
`;
