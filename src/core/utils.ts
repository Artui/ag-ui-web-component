// Non-exported-from-index helpers shared by the core modules.

import { randomUUID } from "@ag-ui/client";
import type { Message } from "@ag-ui/core";
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

/**
 * The tokens of a comma-separated attribute value, trimmed, with empty ones
 * dropped -- so `"scroll, drag,"` is `["scroll", "drag"]`.
 *
 * Shared by every attribute that names a set of opt-ins, so each one reads a
 * stray space or a trailing comma the same way.
 */
export function commaTokens(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
}

/**
 * `messages` with a result for every tool call that has none, each placed at the
 * end of the round that made the call.
 *
 * **Why every call.** Several model providers reject a request carrying a tool
 * call with no result, and a conversation that sends one cannot continue. A run
 * leaves calls unanswered in more ways than any one path can list: Stop while
 * the stream is still arriving, a round ending on `RUN_ERROR`, a name no tool
 * here owns, a server that never streamed a result, a page reloaded mid-run.
 * Answering whatever is unanswered, rather than each of those where it happens,
 * is what keeps a path nobody listed from sending one.
 *
 * **Where each result goes.** At the end of its round: the assistant turns
 * carrying calls, then the results that follow them. That is the shape the run
 * loop writes for a round it executed, and a provider reads a result only in the
 * turn straight after the calls; appended at the end of history, it would sit
 * behind a user turn or a reply the conversation has moved on to. A call with a
 * result after a *later* turn is left alone, since it is answered.
 *
 * `answer` builds the one message for a call id, so the caller decides what is
 * true to say and where the label for a reload goes. Calls in `except` are about
 * to be answered by something else -- a resumed approval, or a navigation
 * result -- and must not be answered twice.
 *
 * Returns `messages` itself when nothing is owed.
 *
 * Every condition deciding a round's end is one branch arc, which a coverage
 * gate reports as covered with any part of it deleted. Each is held by a test in
 * `ag_ui_chat_unanswered_tool_calls.test.ts`: a result continuing the round by
 * "answers it after the round's own results"; a turn without calls closing it by
 * "sends a not-finished result for a call that arrived before it"; a turn with
 * calls after a result closing it by "answers each round's open call before the
 * next round starts"; the answered check by "sends the decline Stop gave the
 * open approval"; and the exclusion by "leaves the call it resumes for the
 * server to answer".
 */
export function answerUnansweredCalls(
  messages: readonly Message[],
  answer: (toolCallId: string) => Message,
  except: ReadonlySet<string> = new Set(),
): readonly Message[] {
  const answered = new Set<string>(except);
  for (const message of messages) {
    if (message.role === "tool") {
      answered.add(message.toolCallId);
    }
  }
  const result: Message[] = [];
  let owed: string[] = [];
  let afterResult = false;
  for (const message of messages) {
    const calls = message.role === "assistant" ? toolCallIds(message.toolCalls) : [];
    const continuesRound = message.role === "tool" || (calls.length > 0 && !afterResult);
    if (!continuesRound) {
      result.push(...owed.map(answer));
      owed = [];
    }
    result.push(message);
    afterResult = message.role === "tool";
    for (const id of calls) {
      if (!answered.has(id)) {
        // Marked as it is owed, so a store holding the same id twice gets one
        // answer rather than two, which a provider rejects just the same.
        answered.add(id);
        owed.push(id);
      }
    }
  }
  if (result.length + owed.length === messages.length) {
    return messages;
  }
  result.push(...owed.map(answer));
  return result;
}

/**
 * The ids of the tool calls an assistant turn carries, skipping anything without
 * one.
 *
 * The field is read off the wire or out of a store, and neither is held to its
 * declared type: a server dumping Python models sends `null` for no calls, and a
 * stored conversation may be hand-edited or written by an older version. A throw
 * here would cost the whole request, so a shapeless entry is passed over.
 */
function toolCallIds(value: unknown): string[] {
  // `Object()` boxes a `null` or a primitive entry into something with no `id`,
  // so one read covers every shape without a branch per shape.
  return Array.isArray(value)
    ? value
        .map((call: unknown) => (Object(call) as { id?: unknown }).id)
        .filter((id): id is string => typeof id === "string")
    : [];
}
