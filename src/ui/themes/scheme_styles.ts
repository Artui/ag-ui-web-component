// The scheme word of the theme attribute: light (the default), dark or auto.
export const SCHEME_STYLES: string = `
/* ── Scheme ───────────────────────────────────────────────────────────────
   Every theme declares its colours with light-dark, so the scheme is one
   property. Matched as a word, so dark works alone (the default theme,
   dark) and beside a theme name (soft dark). auto follows the operating
   system through color-scheme itself, with no media query to keep in step.
   code is a dark-only theme and has no light half. */
:host([theme~="dark"]),
:host([theme~="code"]) {
  color-scheme: dark;
}

:host([theme~="auto"]) {
  color-scheme: light dark;
}
`;
