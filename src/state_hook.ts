import type { ClientTool } from "./client_tool_registry.js";
import { X_DESTRUCTIVE_KEY } from "./constants.js";

/**
 * A binding from a named piece of host application state to agent tools.
 *
 * Ergonomic sugar over `registerTool` for SPA state (Redux/Zustand/signals):
 * generates a read tool and, when `write` is given, a destructive set tool.
 */
export interface StateHook {
  /** Base name; tools become `read_<name>` and `set_<name>`. */
  readonly name: string;
  /** Returns the current state value. */
  readonly read: () => unknown;
  /** Mutates the state from the agent-supplied args. Omit for read-only. */
  readonly write?: (args: Record<string, unknown>) => unknown;
  /** JSON-Schema for the set tool's args. Defaults to an open object. */
  readonly schema?: Record<string, unknown>;
}

/**
 * Build the tools for a {@link StateHook}: always a `read_<name>` (read-only)
 * tool, plus a `set_<name>` (`x-destructive`) tool when `write` is supplied.
 */
export function createStateHookTools(hook: StateHook): ClientTool[] {
  const tools: ClientTool[] = [
    {
      name: `read_${hook.name}`,
      description: `Read the "${hook.name}" state.`,
      parameters: { type: "object", properties: {}, required: [] },
      handler: () => hook.read(),
    },
  ];
  const write = hook.write;
  if (write !== undefined) {
    tools.push({
      name: `set_${hook.name}`,
      description: `Update the "${hook.name}" state.`,
      parameters: { ...(hook.schema ?? { type: "object" }), [X_DESTRUCTIVE_KEY]: true },
      handler: (args) => write(args),
    });
  }
  return tools;
}
