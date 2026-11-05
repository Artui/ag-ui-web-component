// The classic theme's contrast fixes. Classic's structure is the base
// stylesheet, so this holds only what it took to bring the old look to AA.
export const CLASSIC_STYLES: string = `
/* ── Classic ──────────────────────────────────────────────────────────────
   The status pill draws its state's colour on a grey wash, which measured
   3.75:1 for done in the light scheme and under 2.5:1 in the dark one. Each
   state's ink is pulled halfway to the text colour: darker on the light
   panel, lighter on the dark one, still recognisably its state. Scoped to
   classic, so code keeps the pill it always had. */
:host([theme~="classic"]) .tool-call-status {
  color: color-mix(in oklch, var(--_muted) 50%, var(--_fg));
}

:host([theme~="classic"]) .tool-call[data-status="deferred"] .tool-call-status {
  color: color-mix(in oklch, var(--_accent) 50%, var(--_fg));
}

:host([theme~="classic"]) .tool-call[data-status="done"] .tool-call-status {
  color: color-mix(in oklch, var(--_success) 50%, var(--_fg));
}

:host([theme~="classic"]) .tool-call[data-status="error"] .tool-call-status {
  color: color-mix(in oklch, var(--_danger) 50%, var(--_fg));
}

/* The browser's default placeholder measured 3.93:1 on the dark composer.
   The muted ink clears 4.5:1 in both schemes. */
:host([theme~="classic"]) .input::placeholder {
  color: var(--_muted);
  opacity: 1;
}
`;
