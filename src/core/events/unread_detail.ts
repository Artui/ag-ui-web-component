/** `detail` shape of the {@link UNREAD_EVENT} CustomEvent. */
export interface UnreadDetail {
  /** Unseen answers across every thread: what the launcher badge shows. */
  readonly unread: number;
  /**
   * The threads whose unseen answers this change marked or cleared; empty when
   * none did (a collapse toggle still reports the total).
   */
  readonly threadIds: readonly string[];
}
