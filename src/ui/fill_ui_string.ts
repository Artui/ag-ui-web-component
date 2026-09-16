/** A `{token}` placeholder, named the way every key in the string table names one. */
const TOKEN_RE = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/**
 * Fill the `{token}` placeholders of a string-table template.
 *
 * Every string-table template goes through here rather than through
 * `template.replace("{token}", value)`, which was wrong in two ways at once:
 *
 * - **A string replacement interprets dollar patterns in the value.** `$&`
 *   inserts the matched token, and `` $` `` and `$'` the text either side of it,
 *   so a queued message reading `costs $& more` was labelled
 *   `Do not send "costs {text} more"`. Several of these values are text a user
 *   or a server wrote -- a queued message, a tool name, a skill title, an
 *   agent name -- so the value has to land verbatim. A replacer function's
 *   return value is never interpreted, which is the whole fix.
 * - **A string pattern replaces only the first occurrence**, so a translation
 *   that uses a token twice was left half filled.
 *
 * One pass over the template, so a value that itself contains a `{token}` is
 * inserted as written rather than filled in turn: a skill titled
 * `Fill {fields}` stays that, where chained replacements filled it twice.
 *
 * A token with no entry in `values` is left as written. Every call site passes
 * the tokens its key documents, so that is a translation carrying a token the
 * call site does not know, and printing it is more honest than dropping it.
 * `skills/fill_template.ts` is the prompt-side counterpart, and its contract is
 * different on purpose: a prompt reports what it could not fill so a send can
 * be refused.
 *
 * @param template - A string-table value, e.g. `strings.removeQueued`.
 * @param values - The value for each token the template's key documents.
 */
export function fillUiString(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(TOKEN_RE, (token, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : token,
  );
}
