// Non-exported-from-index helpers shared by the core modules.

import { randomUUID } from "@ag-ui/client";
import type { ClientConversationStore } from "./conversation_store.js";

/**
 * Overlay a `credentials` mode onto a fetch `init`, or hand the `init` back
 * untouched when none is configured.
 *
 * Absent and `undefined` differ: `exactOptionalPropertyTypes` rejects an
 * explicit `credentials: undefined`, and writing one anyway would state a mode
 * where the point is to leave the browser's own default in place.
 */
export function withCredentials(
  init: RequestInit | undefined,
  credentials: RequestCredentials | undefined,
): RequestInit | undefined {
  return credentials === undefined ? init : { ...init, credentials };
}

/**
 * Start a new conversation in `store` and return its id.
 *
 * `newThread` is optional on the interface, so a store that predates it is
 * driven the only other way the interface allows: mint an id here and make it
 * active. That path loses the store's own note that the thread is new, so a
 * remote store would go on to ask the server for a conversation that cannot
 * exist yet — which is why every store in this package implements the method.
 *
 * What neither path does is clear the thread being left behind. Starting a
 * conversation is not a reason to destroy the previous one.
 */
export function mintThread(store: ClientConversationStore): string {
  if (store.newThread !== undefined) {
    return store.newThread();
  }
  const id = randomUUID();
  store.setActiveThread(id);
  return id;
}
