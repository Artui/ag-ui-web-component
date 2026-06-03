/**
 * One entry in the server-tool catalog served by django-ag-ui's `tools/`
 * endpoint and fetched via the `data-tools-url` attribute.
 */
export interface ToolCatalogEntry {
  /** The tool's wire name (matches the name in `TOOL_CALL_START`). */
  readonly name: string;
  /** A friendly card label for the tool. */
  readonly summary: string;
  /** Optional longer blurb (e.g. for a future tooltip). */
  readonly description?: string;
}

/**
 * Parse a fetched tool catalog into a `name → summary` map, skipping any entry
 * that isn't a `{ name: string, summary: string }` object. Tolerant by design:
 * a malformed payload yields an empty map rather than throwing.
 */
export function parseToolCatalog(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
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
    if (typeof name === "string" && typeof summary === "string") {
      out[name] = summary;
    }
  }
  return out;
}
