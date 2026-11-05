// PROTOTYPE (design revamp, never merged). What the three prototype
// directions share: the derived palette, the type scale, status as an icon,
// one chip row, and the folded tool-step group. Each direction then sets only
// its three seed colours and its own character on top of this.
export const REVAMP_BASE_STYLES: string = `
/* ── Revamp: derived palette and type scale ──────────────────────────────
   Every prototype theme starts with the word proto- and may carry a second
   word, dark or auto, which sets color-scheme. The seed colours a direction
   declares use light-dark, so one declaration answers both schemes.

   Everything else is mixed from three seeds -- the background, the text and
   the accent -- in oklch, so a host that changes only the accent token gets a
   whole widget rethemed rather than half of one. Each existing token name is
   still read first, so it stays an override point. */
:host([theme^="proto-"]) {
  color-scheme: light;

  --_text-xs: var(--ag-ui-text-xs, 11.5px);
  --_text-sm: var(--ag-ui-text-sm, 12.5px);
  --_text-md: var(--ag-ui-text-md, 14px);
  --_text-lg: var(--ag-ui-text-lg, 16px);
  --_text-xl: var(--ag-ui-text-xl, 22px);
  --_leading: var(--ag-ui-leading, 1.55);

  --_ink-2: color-mix(in oklch, var(--_fg) 78%, var(--_bg));
  --_ink-3: color-mix(in oklch, var(--_fg) 64%, var(--_bg));
  --_line: color-mix(in oklch, var(--_fg) 11%, var(--_bg));
  --_line-strong: color-mix(in oklch, var(--_fg) 20%, var(--_bg));
  --_wash: color-mix(in oklch, var(--_fg) 4.5%, var(--_bg));
  --_accent-wash: color-mix(in oklch, var(--_accent) 10%, var(--_bg));
  --_accent-ink: color-mix(in oklch, var(--_accent) 82%, var(--_fg));
  --_ring: color-mix(in oklch, var(--_accent) 55%, transparent);

  --_hover: var(--ag-ui-hover, color-mix(in oklch, var(--_fg) 6%, var(--_bg)));
  --_border: var(--ag-ui-border, var(--_line));
  --_muted: var(--ag-ui-muted, var(--_ink-3));
  --_header-bg: var(--ag-ui-header-bg, var(--_bg));
  --_header-fg: var(--ag-ui-header-fg, var(--_fg));
  --_assistant-bg: var(--ag-ui-assistant-bg, transparent);
  --_user-bg: var(--ag-ui-user-bg, var(--_wash));
  --_user-fg: var(--ag-ui-user-fg, var(--_fg));
  --_tool-bg: var(--ag-ui-tool-bg, transparent);
  --_tool-fg: var(--ag-ui-tool-fg, var(--_ink-2));
  --_input-bg: var(--ag-ui-input-bg, var(--_bg));
  --_success: var(--ag-ui-success, light-dark(#15803d, #4ade80));
  --_danger: var(--ag-ui-danger, light-dark(#b91c1c, #f87171));
  --_tooltip-bg: var(--ag-ui-tooltip-bg, var(--_fg));
  --_tooltip-fg: var(--ag-ui-tooltip-fg, var(--_bg));
  --_on-accent: var(--ag-ui-on-accent, light-dark(#ffffff, #111111));
  --_font-size: var(--ag-ui-font-size, var(--_text-md));

  --_ico-check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.5l3 3 6-7'/%3E%3C/svg%3E");
  --_ico-error: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='6.2'/%3E%3Cpath d='M8 4.9v3.7M8 11.1v.1'/%3E%3C/svg%3E");
  --_ico-declined: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='6.2'/%3E%3Cpath d='M3.8 12.2l8.4-8.4'/%3E%3C/svg%3E");
  --_ico-chevron: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 3.5l4.5 4.5L6 12.5'/%3E%3C/svg%3E");
}

:host([theme^="proto-"][theme~="dark"]) {
  color-scheme: dark;
}

:host([theme^="proto-"][theme~="auto"]) {
  color-scheme: light dark;
}

/* ── Revamp: status as an icon, never a pill ─────────────────────────────
   The word stays for assistive technology through the card's own label; the
   pill only ever repeated what the icon said. */
:host([theme^="proto-"]) .tool-call-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

:host([theme^="proto-"]) .tool-call:is([data-status="done"], [data-status="error"], [data-status="declined"], [data-status="interrupted"]) .tool-call-icon::before {
  content: "";
  width: 14px;
  height: 14px;
  background: currentColor;
  mask: var(--_ico-check) center / contain no-repeat;
}

:host([theme^="proto-"]) .tool-call[data-status="done"] .tool-call-icon {
  color: var(--_success);
}

:host([theme^="proto-"]) .tool-call[data-status="error"] .tool-call-icon {
  color: var(--_danger);
}

:host([theme^="proto-"]) .tool-call[data-status="error"] .tool-call-icon::before {
  mask-image: var(--_ico-error);
}

:host([theme^="proto-"]) .tool-call:is([data-status="declined"], [data-status="interrupted"]) .tool-call-icon {
  color: var(--_muted);
}

:host([theme^="proto-"]) .tool-call:is([data-status="declined"], [data-status="interrupted"]) .tool-call-icon::before {
  mask-image: var(--_ico-declined);
}

/* The settled icon inherits colour from the icon box, so the box's own glyph
   colour from the base rules must not win. */
:host([theme^="proto-"]) .tool-call .tool-call-icon::before {
  color: inherit;
}

/* ── Revamp: one chip row ────────────────────────────────────────────────
   Follow-up suggestions are the row once a conversation has started; the
   skill chips stay on the empty state only and otherwise live in the slash
   palette, so two rows never compete above the composer. */
:host([theme^="proto-"]:not([data-empty])) .skill-chips {
  display: none;
}

/* ── Revamp: the folded tool-step group ──────────────────────────────────
   Structural, so it also applies to the baseline theme when the prototype
   attribute is set: one quiet row per run of consecutive calls, the cards
   one click down as plain lines rather than boxes. */
:host([data-tool-group]) .tool-group {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:host([data-tool-group]) .tool-group-head {
  appearance: none;
  align-self: flex-start;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 0 -6px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--_muted);
  font: inherit;
  font-size: var(--_text-sm, 12.5px);
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

:host([data-tool-group]) .tool-group-head:hover {
  background: var(--_hover);
  color: var(--_fg);
}

:host([data-tool-group]) .tool-group-head:focus-visible {
  outline: 2px solid var(--_ring, var(--_accent));
  outline-offset: 1px;
}

:host([data-tool-group]) .tool-group-label {
  font-weight: 500;
  color: var(--_ink-2, var(--_fg));
}

:host([data-tool-group]) .tool-group-meta {
  color: var(--_muted);
}

:host([data-tool-group]) .tool-group-meta::before {
  content: "·";
  margin-right: 8px;
  color: var(--_muted);
}

:host([data-tool-group]) .tool-group[data-state="error"] .tool-group-meta {
  color: var(--_danger);
}

:host([data-tool-group]) .tool-group-icon {
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  background: currentColor;
  mask: var(--_ico-check, none) center / contain no-repeat;
  color: var(--_success);
}

:host([data-tool-group]) .tool-group[data-state="error"] .tool-group-icon {
  mask-image: var(--_ico-error, none);
  color: var(--_danger);
}

:host([data-tool-group]) .tool-group[data-state="running"] .tool-group-icon {
  mask: none;
  background: none;
  border: 2px solid var(--_muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ag-ui-tool-spin var(--_tool-spin-duration) linear infinite;
}

:host([data-tool-group]) .tool-group-chevron {
  flex: none;
  width: 12px;
  height: 12px;
  background: currentColor;
  mask: var(--_ico-chevron, none) center / contain no-repeat;
  opacity: 0.7;
  transition: transform var(--_motion) var(--_ease);
}

:host([data-tool-group]) .tool-group[data-open="true"] .tool-group-chevron {
  transform: rotate(90deg);
}

:host([data-tool-group]) .tool-group[data-open="false"] .tool-group-list {
  display: none;
}

:host([data-tool-group]) .tool-group-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 6px;
  padding-left: 13px;
  border-left: 1px solid var(--_border);
}

/* A card inside the group is one line of the list: icon, name, and its
   Details control at the end, with the arguments and result opening under
   the whole row. */
:host([data-tool-group]) .tool-group .tool-call {
  max-width: 100%;
  align-self: stretch;
  flex-flow: row wrap;
  align-items: center;
  gap: 2px 10px;
  padding: 3px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--_ink-2, var(--_fg));
  font-family: inherit;
  font-size: var(--_text-sm, 12.5px);
}

:host([data-tool-group]) .tool-group .tool-call-head {
  flex: 1 1 auto;
  justify-content: flex-start;
}

:host([data-tool-group]) .tool-group .tool-call-name {
  flex: 0 1 auto;
  font-weight: 450;
}

:host([data-tool-group]) .tool-group .tool-call-toggle {
  font-family: inherit;
  font-size: var(--_text-xs, 11.5px);
  color: var(--_muted);
}

:host([data-tool-group]) .tool-group .tool-call-body,
:host([data-tool-group]) .tool-group .tool-call-approval,
:host([data-tool-group]) .tool-group .tool-call-subagent {
  flex-basis: 100%;
}

/* ── Revamp: one action row per answer ───────────────────────────────────
   Copy and retry under every interim sentence of a long turn read as noise;
   only the row after the last bubble of a turn stays. */
:host([theme^="proto-"]) .message-actions:has(~ .message--assistant) {
  display: none;
}

:host([theme^="proto-"]) .chart-block {
  box-sizing: border-box;
}

/* The baseline placeholder is the browser default, which measured under
   4.5:1 on every dark surface. A derived ink clears it in both schemes. */
:host([theme^="proto-"]) .input::placeholder {
  color: var(--_ink-3);
  opacity: 1;
}
`;
