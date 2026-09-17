import { STYLES } from "../styles.js";

/**
 * Attach the stylesheet to `root` without an inline `<style>` element.
 *
 * A host with a strict `style-src` and no `'unsafe-inline'` drops an injected
 * `<style>` silently: the component mounts, functions, and renders completely
 * unstyled, with nothing in the console to point at. `adoptedStyleSheets`
 * carries no inline-style origin, so it is unaffected by that policy.
 *
 * The sheet is constructed **per call**, which is once per mounted element,
 * rather than shared at module scope. A shared sheet would additionally avoid
 * re-parsing the stylesheet once per mounted element, which is what
 * `adoptedStyleSheets` is usually reached for -- but a module-level singleton
 * is exactly what this package forbids, and the CSP defect is fixed either way.
 * Per instance is no worse than the `<style>` element it replaces, which also
 * parsed once per mount.
 *
 * No fallback: constructible `CSSStyleSheet` is Chrome 73, Firefox 101 and
 * Safari 16.4, all below this package's declared Safari 17 runtime target. A
 * guard here would be code no supported browser can reach, and the only way
 * to keep it would be to exempt it from the coverage gate.
 */
export function adoptStyles(root: ShadowRoot): void {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(STYLES);
  root.adoptedStyleSheets = [sheet];
}
