/**
 * Draw one activity, from its content alone.
 *
 * The contract is {@link ClientTool.render}'s, and for the same reason rather
 * than by analogy. An activity is materialised into a `role: "activity"`
 * message, persisted with the transcript, and re-fired on every restore -- so a
 * renderer that writes to the page instead of returning DOM fires again on
 * every thread load, which is exactly the bug the tool registry's purity rule
 * was written to make unmakeable.
 *
 * - a pure function of `content` -- no host state, no network, no clock;
 * - deterministic, so a reload reproduces what was there before;
 * - free of effects outside the node it returns, which the component places.
 *
 * Return `null` for content that says nothing worth drawing. Anything already
 * drawn under that message id is then removed: live and reload should agree,
 * and the stored content is the version that could not be drawn.
 */
export type ActivityRenderer = (content: unknown) => Node | null;
