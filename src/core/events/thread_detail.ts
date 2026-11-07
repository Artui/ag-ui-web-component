/** `detail` shape of the {@link THREAD_EVENT} CustomEvent. */
export interface ThreadDetail {
  /** The thread now on screen. */
  readonly threadId: string;
  /**
   * The thread on screen before the change: the one the previous event
   * reported, and `null` before the first, as at the restore when the element
   * first connects. Equal to `threadId` when the same thread was restored
   * again (`reload()`, the element connecting again).
   */
  readonly previousThreadId: string | null;
  /**
   * What changed it:
   *
   * - `new`: `newChat()` or the built-in New chat button.
   * - `switch`: `switchThread()` or a row picked in the conversation list.
   * - `delete`: the active thread was deleted, and a fresh one took its place.
   * - `restore`: the stored thread was replayed, on connect or by `reload()`.
   * - `rescope`: a `user-key` change handed the element to another principal,
   *   live or while it was out of the document.
   *
   * A closed set today; a host should ignore a reason it does not know, so a
   * later one can be added without breaking it.
   */
  readonly reason: "new" | "switch" | "delete" | "restore" | "rescope";
}
