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
  /** Whether the client writes its messages to the conversation store. */
  readonly persist: boolean;
}
