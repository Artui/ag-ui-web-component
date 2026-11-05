/**
 * Parse a JSON-valued attribute on `element`, saying so when it will not parse.
 *
 * `null` for an absent attribute, and `null` again for one that is not JSON --
 * but not quietly the second time. Quoting JSON inside an HTML attribute is
 * fiddly, and the result of getting it wrong is indistinguishable from the
 * feature being switched off: no chips appear, or the strings stay English,
 * with nothing anywhere saying why. That is the same failure `data-paste-attach`
 * already reports for a value it cannot read.
 *
 * Console only. A page author's typo is not the reader's business, nothing the
 * reader did was refused, and the degraded widget is still perfectly usable.
 */
export function readJsonAttribute(element: Element, name: string): unknown {
  const raw = element.getAttribute(name);
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    console.warn(
      `<ag-ui-chat>: ${name} is not valid JSON, so it was ignored entirely and ` +
        "the built-in default is being used. Check the quoting -- JSON inside " +
        "an HTML attribute needs single quotes around the attribute value, or " +
        "its own double quotes escaped.",
    );
    return null;
  }
}
