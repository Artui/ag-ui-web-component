import { type AbstractAgent, HttpAgent } from "@ag-ui/client";
import type { Message } from "@ag-ui/core";
import { withCredentials } from "./utils.js";

/** Config for {@link createHttpAgent}. */
export interface HttpAgentOptions {
  endpoint: string;
  headers?: Record<string, string>;
  /**
   * Cookie policy for the run request, as `fetch`'s own `credentials` mode.
   * Unset leaves the browser default (`same-origin`), which sends no cookies
   * to an agent endpoint on a different origin or subdomain. A
   * cookie-authenticated cross-origin deployment needs `"include"` here plus a
   * server answering with `Access-Control-Allow-Credentials: true` and a
   * concrete origin.
   */
  credentials?: RequestCredentials;
  /**
   * Live header source, re-read on every request, overlaid on `headers`.
   * `HttpAgent` bakes static `headers` in at construction and the element
   * caches the agent for the whole conversation, so rotating credentials (CSRF,
   * short-lived JWT) must come through here.
   */
  getHeaders?: () => Record<string, string>;
  /** Stable conversation id, so the agent's runs share a thread. */
  threadId?: string;
  /** Rehydrated history to seed the agent with (durable conversation). */
  initialMessages?: readonly Message[];
  /**
   * AG-UI shared state to seed the agent with. `@ag-ui/client` sends it as
   * `RunAgentInput.state` on every run and replaces it in place when the
   * server streams `STATE_SNAPSHOT` / `STATE_DELTA`.
   */
  initialState?: Readonly<Record<string, unknown>>;
  /**
   * Origins, besides the document's own, this agent may carry the host's
   * credentials to.
   *
   * Running the agent on another subdomain is a normal deployment and stays
   * supported, so a cross-origin endpoint is not refused — it is *announced*,
   * once per origin, on the console. Listing an origin here says the
   * destination was chosen deliberately and silences the notice for it.
   *
   * Entries are compared as serialized origins (`https://agent.example.com`,
   * scheme and port included), which is what `URL.origin` produces.
   */
  trustedOrigins?: readonly string[];
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
 * `warned` is per-agent rather than module-level, per this package's rule
 * against shared mutable state: two elements on one page must each get their
 * own notice, and the set lives exactly as long as the agent it belongs to.
 */
function warnOnCrossOriginCredentials(
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
      "destination is deliberate, name it in the agent's `trustedOrigins` to confirm it and " +
      "silence this notice. Reported once per origin.",
  );
}

/**
 * Build an AG-UI {@link HttpAgent} pointed at `endpoint`.
 *
 * The default agent factory for `<ag-ui-chat>`; tests and advanced hosts
 * override the element's `agentFactory` to inject a different
 * {@link AbstractAgent}.
 */
export function createHttpAgent(options: HttpAgentOptions): AbstractAgent {
  const staticHeaders = options.headers ?? {};
  const warned = new Set<string>();
  return new HttpAgent({
    url: options.endpoint,
    headers: staticHeaders,
    initialState: { ...(options.initialState ?? {}) },
    // HttpAgent invokes its configured fetch as a method (`this.fetch(...)`),
    // rebinding the global `fetch` to the agent instance — "Illegal invocation"
    // in browsers. The wrapper keeps `fetch` a free call, and is also where the
    // per-request `getHeaders()` overlay and the cookie policy go, the agent's
    // own config having no seam for either.
    fetch: (url, init) => {
      const fresh = options.getHeaders?.();
      // Only the names the *host* supplied. `HttpAgent` adds `Content-Type` and
      // `Accept` to every request and neither is a credential, so reporting the
      // outgoing header set wholesale would cry wolf on every plain request.
      const credentialNames = [
        ...new Set([...Object.keys(staticHeaders), ...Object.keys(fresh ?? {})]),
      ].sort();
      warnOnCrossOriginCredentials(url, credentialNames, options.trustedOrigins ?? [], warned);
      if (fresh === undefined) {
        return fetch(url, withCredentials(init, options.credentials));
      }
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(fresh)) {
        headers.set(name, value);
      }
      return fetch(url, withCredentials({ ...init, headers }, options.credentials));
    },
    // Spread conditionally: under `exactOptionalPropertyTypes` an explicit
    // `undefined` is not assignable to an optional field.
    ...(options.threadId !== undefined ? { threadId: options.threadId } : {}),
    ...(options.initialMessages !== undefined
      ? { initialMessages: [...options.initialMessages] }
      : {}),
  });
}

/** Signature of the agent factory the element calls to build its agent. */
export type AgentFactory = (options: HttpAgentOptions) => AbstractAgent;
