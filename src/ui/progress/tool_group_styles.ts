// The folded tool-step group: one row per run of consecutive tool calls,
// with the per-call cards one click down.
export const TOOL_GROUP_STYLES: string = `
/* ── The folded tool-step group ──────────────────────────────────
   One quiet row per run of consecutive calls, the cards one click down as
   plain lines rather than boxes. Carried on :host so it outranks the
   display-mode rules on a bare card at equal weight. */
:host .tool-group {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

:host .tool-group-head {
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

:host .tool-group-head:hover {
  background: var(--_hover);
  color: var(--_fg);
}

:host .tool-group-head:focus-visible {
  outline: 2px solid var(--_ring, var(--_accent));
  outline-offset: 1px;
}

:host .tool-group-label {
  font-weight: 500;
  color: var(--_ink-2, var(--_fg));
}

:host .tool-group-meta {
  color: var(--_muted);
}

:host .tool-group-meta::before {
  content: "·";
  margin-right: 8px;
  color: var(--_muted);
}

:host .tool-group[data-state="error"] .tool-group-meta {
  color: var(--_danger);
}

:host .tool-group-icon {
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  background: currentColor;
  mask: var(--_ico-check, none) center / contain no-repeat;
  color: var(--_success);
}

:host .tool-group[data-state="error"] .tool-group-icon {
  mask-image: var(--_ico-error, none);
  color: var(--_danger);
}

:host .tool-group[data-state="running"] .tool-group-icon {
  mask: none;
  background: none;
  border: 2px solid var(--_muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ag-ui-tool-spin var(--_tool-spin-duration) linear infinite;
}

:host .tool-group-chevron {
  flex: none;
  width: 12px;
  height: 12px;
  background: currentColor;
  mask: var(--_ico-chevron, none) center / contain no-repeat;
  opacity: 0.7;
  transition: transform var(--_motion) var(--_ease);
}

:host .tool-group[data-open="true"] .tool-group-chevron {
  transform: rotate(90deg);
}

:host .tool-group[data-open="false"] .tool-group-list {
  display: none;
}

:host .tool-group-list {
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
:host .tool-group .tool-call {
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

:host .tool-group .tool-call-head {
  flex: 1 1 auto;
  justify-content: flex-start;
}

:host .tool-group .tool-call-name {
  flex: 0 1 auto;
  font-weight: 450;
}

:host .tool-group .tool-call-toggle {
  font-family: inherit;
  font-size: var(--_text-xs, 11.5px);
  color: var(--_muted);
}

:host .tool-group .tool-call-body,
:host .tool-group .tool-call-approval,
:host .tool-group .tool-call-subagent {
  flex-basis: 100%;
}

/* Waiting on the user: a steady accent dot rather than a spinner, the same
   mark a waiting card uses, and the count in the accent's ink. */
:host .tool-group[data-state="waiting"] .tool-group-icon {
  mask: none;
  border-radius: 50%;
  transform: scale(0.6);
  background: var(--_accent);
}

:host .tool-group[data-state="waiting"] .tool-group-meta {
  color: var(--_accent-ink);
  font-weight: 500;
}
`;
