/** {@link FEEDBACK_EVENT} detail: what was rated, and how. */
export interface FeedbackDetail {
  /** The rated message's text, as rendered. */
  readonly content: string;
  readonly rating: "up" | "down";
  /**
   * The AG-UI id of the rated assistant message: the id it streamed under, or
   * the stored message's `id` when it was restored from history.
   *
   * What a host stores a rating against. `content` cannot be: two answers can
   * read the same, and the text says nothing about which stored message it
   * was. A restored message carries whatever id its store returns: the
   * built-in browser store keeps the streamed ids, and a server-backed one
   * keeps them only where the server persists the ids it streamed.
   */
  readonly messageId: string;
  /** The conversation the message belongs to: the element's thread when it was drawn. */
  readonly threadId: string;
  /**
   * The run that streamed the message, as its `RUN_STARTED` named it.
   *
   * Present only on a message that arrived live. A restored one has none to
   * give -- an AG-UI message carries no run id -- so the key is absent there
   * rather than holding a value that only looks like one.
   */
  readonly runId?: string;
}
