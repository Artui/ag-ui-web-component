/** `detail` shape of the {@link STATE_EVENT} CustomEvent. */
export interface StateDetail {
  readonly state: Readonly<Record<string, unknown>>;
}
