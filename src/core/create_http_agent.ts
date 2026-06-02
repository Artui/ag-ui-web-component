import { type AbstractAgent, HttpAgent } from "@ag-ui/client";
import type { Message } from "@ag-ui/core";

/** Config for {@link createHttpAgent}. */
export interface HttpAgentOptions {
  endpoint: string;
  headers?: Record<string, string>;
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
    // a free function with the correct receiver.
    fetch: (url, init) => fetch(url, init),
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
