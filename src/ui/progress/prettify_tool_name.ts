/**
 * Prettify a raw tool name for display: separators become spaces and the
 * first letter is capitalised — `list_projects` → "List projects",
 * `invoices.retrieve` → "Invoices retrieve".
 *
 * Final fallback of the tool-card label chain (`x-summary` →
 * `toolSummaries` → fetched catalog → this). Purely cosmetic: the original
 * name still rides on the card's dataset for debugging.
 */
export function prettifyToolName(name: string): string {
  const spaced = name.replace(/[._-]+/g, " ").trim();
  if (spaced === "") {
    return name;
  }
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
