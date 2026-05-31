import { type AbstractAgent, HttpAgent } from "@ag-ui/client";

/** Config for {@link createHttpAgent}. */
export interface HttpAgentOptions {
  endpoint: string;
  headers?: Record<string, string>;
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
  });
}

/** Signature of the agent factory the element calls to build its agent. */
export type AgentFactory = (options: HttpAgentOptions) => AbstractAgent;
