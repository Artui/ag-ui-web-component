/** A transcript that follows new content, unless the reader has other ideas. */
export interface StickToBottom {
  /**
   * New content arrived. Scrolls to the bottom only while following, so
   * reading older messages during a run is no longer undone on the next token.
   */
  readonly follow: () => void;
  /** Go to the bottom and resume following, whatever the reader was doing. */
  readonly jump: () => void;
  /** Whether the transcript is currently following new content. */
  readonly following: () => boolean;
  readonly dispose: () => void;
}

export interface StickToBottomOptions {
  /** The scrolling element -- the message list. */
  readonly viewport: HTMLElement;
  /**
   * Called whenever the answer to "should a jump-to-latest affordance show?"
   * changes. True means the reader has scrolled away *and* has since missed
   * something; scrolling up through a settled transcript is not a reason to
   * nag.
   */
  readonly onMissedContent: (missed: boolean) => void;
}

/**
 * How close to the bottom still counts as the bottom, in CSS pixels.
 *
 * Not zero: `scrollHeight - scrollTop - clientHeight` lands on fractional
 * values under a zoom level or a fractional device pixel ratio, so an exact
 * comparison reports "scrolled away" for a transcript that is visibly pinned.
 */
const BOTTOM_SLACK_PX = 4;

/**
 * Follow the foot of a scrolling transcript, and stop when the reader scrolls
 * away.
 *
 * Before this, eleven separate sites assigned `scrollTop = scrollHeight`
 * unconditionally and nothing anywhere listened for a `scroll` event -- so
 * nothing knew the reader had scrolled up, and scrolling back through a run was
 * undone by the next token. Stick-to-bottom with a jump-to-latest affordance is
 * a named primitive elsewhere for exactly this reason: shadcn ships it as
 * `MessageScroller`, AI Elements as `ConversationScrollButton`.
 *
 * **Telling a reader's scroll from our own is the whole problem**, and the
 * answer here is that it does not have to be told. A programmatic scroll only
 * ever happens while already following, and it lands at the bottom, so the
 * `scroll` event it provokes recomputes "at the bottom" as true and changes
 * nothing. A reader's scroll is the only kind that can move the answer.
 *
 * A `ResizeObserver` covers the case scroll events cannot see: the *viewport*
 * changing size. Resizing the panel, or the keyboard opening on a phone, moves
 * the foot without anything scrolling and without any content arriving, so a
 * pinned transcript would silently come unpinned.
 *
 * ⚠ It does **not** cover content that grows after insertion -- an image
 * decoding, a chart laying out. A `ResizeObserver` on a scroll container does
 * not fire when its `scrollHeight` changes, so catching that means observing
 * every child, and the payoff is one late nudge in a case the reader can fix by
 * scrolling. Insertion itself is covered: every site that adds to the
 * transcript calls {@link StickToBottom.follow}.
 */
export function createStickToBottom({
  viewport,
  onMissedContent,
}: StickToBottomOptions): StickToBottom {
  let isFollowing = true;
  let missed = false;

  const atBottom = (): boolean =>
    viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_SLACK_PX;

  const setMissed = (next: boolean): void => {
    if (next === missed) {
      return;
    }
    missed = next;
    onMissedContent(missed);
  };

  const toBottom = (): void => {
    viewport.scrollTop = viewport.scrollHeight;
  };

  const onScroll = (): void => {
    isFollowing = atBottom();
    if (isFollowing) {
      setMissed(false);
    }
  };

  const follow = (): void => {
    if (isFollowing) {
      toBottom();
      return;
    }
    setMissed(true);
  };

  // Passive: this listener never calls preventDefault, and saying so keeps it
  // off the critical path of a scroll it has no intention of blocking.
  viewport.addEventListener("scroll", onScroll, { passive: true });

  const observer = new ResizeObserver(() => {
    if (isFollowing) {
      toBottom();
    }
  });
  observer.observe(viewport);

  return {
    follow,
    jump: (): void => {
      isFollowing = true;
      setMissed(false);
      toBottom();
    },
    following: (): boolean => isFollowing,
    dispose: (): void => {
      viewport.removeEventListener("scroll", onScroll);
      observer.disconnect();
    },
  };
}
