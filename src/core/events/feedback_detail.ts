/** {@link FEEDBACK_EVENT} detail: what was rated, and how. */
export interface FeedbackDetail {
  /** The rated message's text, as rendered. */
  readonly content: string;
  readonly rating: "up" | "down";
}
