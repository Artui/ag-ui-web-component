/**
 * The `<ag-ui-chat>` elements connected to this document, oldest first.
 *
 * The highlight ring is drawn in the host's page, outside every chat, so a
 * token set on a chat never reaches it through the cascade. A free `flash()`
 * still has to answer "which widget is this ring speaking for", and that is a
 * question about the live elements rather than about any one of them.
 *
 * Module-level on purpose, and the second piece of shared mutable state the
 * repository's `CLAUDE.md` records, beside the claimed storage namespaces. See
 * the conditions it states, and how this one meets them, before adding a
 * third.
 */
const CONNECTED_CHATS = new Set<HTMLElement>();

/**
 * One chat's place in the document's list of connected chats.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, which joins on connect and leaves on
 * disconnect, so the list holds exactly the elements that are in a document
 * now. Typed as `HTMLElement` rather than the element's class, because the DOM
 * driver reads it and must not import the element.
 */
export class ChatRegistration {
  readonly #chat: HTMLElement;

  constructor(chat: HTMLElement) {
    this.#chat = chat;
  }

  /**
   * Join, or move to the end. Deleted first, because a `Set` keeps an existing
   * entry's position: an element moved in the DOM reconnects, and is then the
   * most recently connected chat.
   */
  join(): void {
    CONNECTED_CHATS.delete(this.#chat);
    CONNECTED_CHATS.add(this.#chat);
  }

  /** Leave. The previous chat, if one is still connected, becomes the latest. */
  leave(): void {
    CONNECTED_CHATS.delete(this.#chat);
  }

  /** The most recently connected chat still in the document, or `null`. */
  static latest(): HTMLElement | null {
    let latest: HTMLElement | null = null;
    for (const chat of CONNECTED_CHATS) {
      latest = chat;
    }
    return latest;
  }
}
