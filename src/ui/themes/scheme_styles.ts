// The scheme word of the theme attribute: light (the default), dark or auto.
export const SCHEME_STYLES: string = `
/* ── Scheme ───────────────────────────────────────────────────────────────
   Every theme declares its colours with light-dark, so the scheme is one
   property. Matched as a word, so dark works alone (the default theme,
   dark) and beside a theme name (soft dark). auto follows the operating
   system through color-scheme itself, with no media query to keep in step.
   code is a dark-only theme and has no light half. */
/* Important, so a scheme word holds against a host rule that sets the
   element's color-scheme (a page that follows its own dark mode). A rule
   from outside the shadow tree beats every :host rule at normal weight, and
   the theme toggle writes the word; without this its press changed nothing.
   code stays last, so code light is still dark. */
:host([theme~="light"]) {
  color-scheme: light !important;
}

:host([theme~="dark"]),
:host([theme~="code"]) {
  color-scheme: dark !important;
}

:host([theme~="auto"]) {
  color-scheme: light dark;
}
`;
