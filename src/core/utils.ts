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

/**
 * Announce host credentials about to leave the document's origin.
 *
 * `endpoint` and its six sibling URL attributes are plain HTML, and a page that
 * interpolates one from a query parameter or from tenant-authored
 * configuration has handed an attacker the destination. The browser preflights
 * the custom header, any server willing to answer `Access-Control-Allow-Headers`
 * receives it, and the token leaves on the element's very first request —
 * before the user has done anything. Nothing else in this package compares a
 * configured URL against an expected origin, so without this the delivery is
 * silent, which is the only part of that sequence worth changing.
 *
 * A warning rather than a refusal because a cross-origin agent is a documented
 * deployment: refusing would break working installations to defend against a
 * page that is already interpolating untrusted data into its own markup. What
 * it removes is the silence.
 *
 * `warned` is supplied by the caller rather than held here, per this package's
 * rule against shared mutable state: two elements on one page must each get
 * their own notice, and the set lives exactly as long as its owner.
 *
 * Every configured URL goes through this, not the agent endpoint alone. The
 * tool catalog, the skills list, the thread and attachment endpoints and the
 * upload target are all named by the same kind of host attribute and all carry
 * the same headers, so covering one of them and not the rest would report the
 * least interesting of the seven.
 */
export function warnOnCrossOriginCredentials(
  url: string | URL,
  credentialNames: readonly string[],
  trustedOrigins: readonly string[],
  warned: Set<string>,
): void {
  if (credentialNames.length === 0) {
    return;
  }
  // Resolved against the document, so a relative endpoint — the ordinary case —
  // lands on this origin and says nothing.
  const destination = new URL(String(url), location.href).origin;
  if (
    destination === location.origin ||
    trustedOrigins.includes(destination) ||
    warned.has(destination)
  ) {
    return;
  }
  warned.add(destination);
  console.warn(
    `<ag-ui-chat>: sending host credentials (${credentialNames.join(", ")}) to ` +
      `${destination}, which is not this page's origin (${location.origin}). Those headers ` +
      "are the page's own authentication, and whichever server answers the browser's " +
      "preflight receives them — so a URL attribute built from a query parameter or from " +
      "tenant-authored configuration is a channel for the token to leave on. If this " +
      "destination is deliberate, name it in `trustedOrigins` to confirm it and " +
      "silence this notice. Reported once per origin.",
  );
}
