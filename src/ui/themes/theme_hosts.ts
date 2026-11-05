/**
 * The host selectors theme rules hang off, as one record so every theme
 * module spells them the same way.
 *
 * Classic and code keep today's structure, so the structural rules the newer
 * themes share apply to every element that wears neither. Quiet is the
 * default, so its own structure applies to every element that wears no other
 * built-in theme -- including one whose theme is a word the library does not
 * know, which is how a host's own named theme starts from Quiet.
 */
export const THEME_HOST = {
  modern: ':host(:not([theme~="classic"], [theme~="code"]))',
  quiet: ':host(:not([theme~="classic"], [theme~="code"], [theme~="soft"], [theme~="ledger"]))',
} as const;
