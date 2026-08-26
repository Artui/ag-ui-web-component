/**
 * One entry in the server-tool catalog served by django-ag-ui's `tools/`
 * endpoint and fetched via the `data-tools-url` attribute.
 */
export interface ToolCatalogEntry {
  /** The tool's wire name (matches the name in `TOOL_CALL_START`). */
  readonly name: string;
  /** A friendly card label for the tool. */
  readonly summary: string;
  /** Optional longer blurb (e.g. for a tooltip). */
  readonly description?: string;
}

/**
 * Parse a fetched tool catalog into a `name → entry` map, skipping any entry
 * that isn't a `{ name: string, summary: string }` object. Tolerant by design:
 * a malformed payload yields an empty map rather than throwing, and an
 * optional field of the wrong type costs that field rather than the entry.
 *
 * Whole entries rather than bare summaries, even though the element itself
 * only labels cards with `summary`: the map is what a caller gets, so
 * narrowing it here would put `description` on the wire with nowhere to
 * arrive, and no consumer could recover it without changing this signature
 * first.
 */
export function parseToolCatalog(data: unknown): Record<string, ToolCatalogEntry> {
  const out: Record<string, ToolCatalogEntry> = {};
  if (!Array.isArray(data)) {
    return out;
  }
  for (const entry of data) {
    if (entry === null || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const name = record["name"];
    const summary = record["summary"];
    const description = record["description"];
    if (typeof name === "string" && typeof summary === "string") {
      // Built conditionally rather than with an `undefined` field:
      // `exactOptionalPropertyTypes` makes "absent" and "present as
      // undefined" different types, and only the former is the wire shape.
      out[name] =
        typeof description === "string" ? { name, summary, description } : { name, summary };
    }
  }
  return out;
}
