/** `detail` shape of the {@link INVALIDATE_EVENT} CustomEvent. */
export interface InvalidateDetail {
  /**
   * The resources that moved, as the server named them.
   *
   * **Opaque strings, and matching is exact.** `orders/42` does not imply
   * `orders` -- a prefix rule would be this component guessing at a scheme it
   * does not own, and `orders/1` would match `orders/11`. A server that wants
   * the collection refreshed names it. Your own matching may be hierarchical,
   * because in your vocabulary the scheme is known.
   */
  readonly keys: readonly string[];
  /** What caused the write -- usually the tool's name. `null` when unstated. */
  readonly reason: string | null;
}
