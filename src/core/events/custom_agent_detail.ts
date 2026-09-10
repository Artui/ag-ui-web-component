/** `detail` shape of the {@link CUSTOM_AGENT_EVENT} CustomEvent. */
export interface CustomAgentDetail {
  /** The `CUSTOM` event's `name`, verbatim. An open string; never interpreted here. */
  readonly name: string;
  /** Its `value`, verbatim and unparsed. `unknown` because the protocol says nothing about it. */
  readonly value: unknown;
}
