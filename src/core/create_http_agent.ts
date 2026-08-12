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
}

/**
 * Build an AG-UI {@link HttpAgent} pointed at `endpoint`.
 *
 * The default agent factory for `<ag-ui-chat>`; tests and advanced hosts
 * override the element's `agentFactory` to inject a different
 * {@link AbstractAgent}.
 */
export function createHttpAgent(options: HttpAgentOptions): AbstractAgent {
  return new HttpAgent({
    url: options.endpoint,
    headers: options.headers ?? {},
    initialState: { ...(options.initialState ?? {}) },
    // HttpAgent invokes its configured fetch as a method (`this.fetch(...)`),
    // rebinding the global `fetch` to the agent instance — "Illegal invocation"
    // in browsers. The wrapper keeps `fetch` a free call, and is also where the
    // per-request `getHeaders()` overlay and the cookie policy go, the agent's
    // own config having no seam for either.
    fetch: (url, init) => {
      const fresh = options.getHeaders?.();
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
