/** Result of {@link fillTemplate}: the filled text plus any unresolved keys. */
export interface TemplateResult {
  /** The prompt with resolved `{placeholder}`s substituted. */
  readonly text: string;
  /** Placeholder names with no value available (deduped, in first-seen order). */
  readonly missing: readonly string[];
}

const PLACEHOLDER_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Substitute `{name}` placeholders in ``template`` from ``values``.
 *
 * A placeholder whose value is missing, ``null``, or an empty string is left
 * verbatim and reported in ``missing`` — the caller blocks send and tells the
 * user what's needed (e.g. "select rows first") rather than sending a
 * half-filled prompt.
 */
export function fillTemplate(template: string, values: Record<string, unknown>): TemplateResult {
  const missing: string[] = [];
  const text = template.replace(PLACEHOLDER_RE, (token, key: string) => {
    const value = values[key];
    if (value === undefined || value === null || value === "") {
      if (!missing.includes(key)) {
        missing.push(key);
      }
      return token;
    }
    return String(value);
  });
  return { text, missing };
}
