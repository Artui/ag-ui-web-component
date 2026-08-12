import { X_DESTRUCTIVE_KEY, X_SUMMARY_KEY } from "../constants.js";
import type { ClientTool } from "./client_tool_registry.js";

/**
 * A binding from a named piece of host page state to agent tools.
 *
 * Ergonomic sugar over `registerTool` for SPA state (Redux/Zustand/signals):
 * generates a read tool and, when `write` is given, a destructive set tool.
 *
 * Not AG-UI shared state. `STATE_SNAPSHOT` / `STATE_DELTA` are protocol events
 * carrying state between agent and client; these are ordinary client tools the
 * agent calls like any other.
 */
export interface PageState {
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
 * Build the tools for a {@link PageState}: always a `read_<name>` (read-only)
 * tool, plus a `set_<name>` (`x-destructive`) tool when `write` is supplied.
 */
export function createPageStateTools(binding: PageState): ClientTool[] {
  const tools: ClientTool[] = [
    {
      name: `read_${binding.name}`,
      description: `Read the "${binding.name}" state.`,
      parameters: {
        type: "object",
        properties: {},
        required: [],
        [X_SUMMARY_KEY]: `Read ${binding.name}`,
      },
      handler: () => binding.read(),
    },
  ];
  const write = binding.write;
  if (write !== undefined) {
    tools.push({
      name: `set_${binding.name}`,
      description: `Update the "${binding.name}" state.`,
      parameters: {
        ...(binding.schema ?? { type: "object" }),
        [X_DESTRUCTIVE_KEY]: true,
        [X_SUMMARY_KEY]: `Update ${binding.name}`,
      },
      handler: (args) => write(args),
    });
  }
  return tools;
}

/**
 * @deprecated Renamed to {@link PageState} — the old name read as AG-UI
 * shared-state sync. Will be removed in a future major.
 */
export type StateHook = PageState;

/**
 * @deprecated Renamed to {@link createPageStateTools}. Will be removed in a
 * future major.
 */
export const createStateHookTools = createPageStateTools;
