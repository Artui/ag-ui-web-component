import type { Message } from "@ag-ui/core";

/**
 * What differs between the clients one conversation builds -- its own, and one
 * per checkpoint continuation. Everything else about a client comes from the
 * element's single construction, so an option added for one reaches the other.
 */
export interface ClientSeed {
  /** Where the client's runs are sent. */
  readonly endpoint: string;
  /** The history the agent starts from, and sends with its first run. */
  readonly initialMessages: readonly Message[];
  /**
   * The conversation this client's own history continues, which every save
   * writes ahead of it.
   *
   * Empty for the conversation's own client, whose history is the whole
   * conversation. A continuation's history is only the turn it adds and its
   * answer -- the endpoint supplies the rest from its snapshot -- and a store
   * keeps one list per thread, so a save of that history alone would replace
   * the conversation with its last exchange, and not saving it lost the
   * exchange on the next reload.
   */
  readonly follows: readonly Message[];
  /** Handed the whole conversation each time the client saves it, as written. */
  readonly onSaved?: (conversation: readonly Message[]) => void;
}
