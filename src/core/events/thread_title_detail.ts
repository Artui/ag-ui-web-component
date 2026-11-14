/** `detail` shape of the {@link THREAD_TITLE_EVENT} CustomEvent. */
export interface ThreadTitleDetail {
  /** The thread on screen. */
  readonly threadId: string;
  /** Its title, as `threadTitle` reads it now; `""` for a thread with nothing sent. */
  readonly title: string;
}
