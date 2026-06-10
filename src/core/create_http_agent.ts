import { type AbstractAgent, HttpAgent } from "@ag-ui/client";
import type { Message } from "@ag-ui/core";

/** Config for {@link createHttpAgent}. */
export interface HttpAgentOptions {
  endpoint: string;
  headers?: Record<string, string>;
  /**
   * Live header source, re-read on **every** request. `HttpAgent` bakes the
   * static `headers` into its constructor and the element caches the agent
   * for the whole conversation — so a rotated token (CSRF, short-lived JWT)
   * would otherwise never reach the agent endpoint and a long session 401s
   * mid-conversation. When set, the fetch wrapper overlays these values on
   * each call; `headers` still seeds the initial/static configuration.
   */
  getHeaders?: () => Record<string, string>;
  /** Stable conversation id, so the agent's runs share a thread. */
  threadId?: string;
  /** Rehydrated history to seed the agent with (durable conversation). */
  initialMessages?: readonly Message[];
}

/**
 * Build an AG-UI {@link HttpAgent} pointed at ``endpoint``.
 *
 * This is the default agent factory used by ``<ag-ui-chat>``. Tests and
 * advanced hosts override the element's ``agentFactory`` to inject a
 * different {@link AbstractAgent} (e.g. a fake, or a middleware-wrapped one).
 */
export function createHttpAgent(options: HttpAgentOptions): AbstractAgent {
  return new HttpAgent({
    url: options.endpoint,
    headers: options.headers ?? {},
    // HttpAgent invokes its configured fetch as a method (`this.fetch(...)`),
    // which would rebind the global `fetch` to the agent instance and trigger
    // "Illegal invocation" in browsers. Wrap it so `fetch` is always called as
    // a free function with the correct receiver. The wrapper also overlays
    // `getHeaders()` per request, so header rotation (CSRF, short-lived JWT)
    // reaches the stream even though the agent instance is cached.
    fetch: (url, init) => {
      const fresh = options.getHeaders?.();
      if (fresh === undefined) {
        return fetch(url, init);
      }
      const headers = new Headers(init?.headers);
      for (const [name, value] of Object.entries(fresh)) {
        headers.set(name, value);
      }
      return fetch(url, { ...init, headers });
    },
    // Spread conditionally: under `exactOptionalPropertyTypes` an explicit
    // `undefined` is not assignable to these optional config fields.
    ...(options.threadId !== undefined ? { threadId: options.threadId } : {}),
    ...(options.initialMessages !== undefined
      ? { initialMessages: [...options.initialMessages] }
      : {}),
  });
}

/** Signature of the agent factory the element calls to build its agent. */
export type AgentFactory = (options: HttpAgentOptions) => AbstractAgent;
