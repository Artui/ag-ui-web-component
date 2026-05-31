import { AgUiChat } from "./ag_ui_chat.js";
import { ELEMENT_TAG } from "./constants.js";

/**
 * Register the `<ag-ui-chat>` Custom Element.
 *
 * Idempotent: calling it more than once (or after another module already
 * registered the tag) is a no-op. Registration is an explicit step rather
 * than an import side effect so the package is SSR-safe and tree-shakeable.
 */
export function defineAgUiChat(): void {
  if (customElements.get(ELEMENT_TAG) === undefined) {
    customElements.define(ELEMENT_TAG, AgUiChat);
  }
}
