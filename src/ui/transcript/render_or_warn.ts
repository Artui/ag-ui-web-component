/**
 * Call a consumer's renderer, turning a throw into "nothing drawn".
 *
 * `render` is consumer code -- a host's activity renderer, a tool's `render` --
 * and both call sites run inside the history replay, where a throw abandons the
 * loop and takes every later turn of the transcript with it -- silently, and
 * again on every reload. One thing that fails to draw is worth losing; the rest
 * of the conversation is not. Reported so the failure is findable rather than
 * merely survived.
 *
 * @param render - The consumer's renderer, already bound to its input.
 * @param subject - What was being drawn, for the warning: `tool <name>` or
 *   `activity <type>`.
 */
export function renderOrWarn(render: () => Node | null, subject: string): Node | null {
  try {
    return render();
  } catch (error) {
    console.warn(`ag-ui-chat: render failed for ${subject}`, error);
    return null;
  }
}
