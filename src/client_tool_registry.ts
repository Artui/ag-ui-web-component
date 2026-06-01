import type { Tool } from "@ag-ui/core";

/**
 * A tool the frontend declares and executes itself.
 *
 * `parameters` is a JSON Schema (and may carry the `x-destructive` extension).
 * `handler` receives the parsed arguments and returns a result that is
 * JSON-serialised into the AG-UI tool-result message sent back to the agent.
 */
export interface ClientTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => unknown | Promise<unknown>;
}

/**
 * Holds the frontend tools a host has declared on an `<ag-ui-chat>` element.
 *
 * Produces AG-UI {@link Tool} definitions for `RunAgentInput.tools` and looks
 * up handlers when the agent calls a tool. Pure (no DOM); the element owns one
 * instance.
 */
export class ClientToolRegistry {
  readonly #tools = new Map<string, ClientTool>();

  /** Register a tool. Throws if the name is already taken. */
  register(tool: ClientTool): void {
    if (this.#tools.has(tool.name)) {
      throw new Error(`tool "${tool.name}" already registered`);
    }
    this.#tools.set(tool.name, tool);
  }

  has(name: string): boolean {
    return this.#tools.has(name);
  }

  /** Return a registered tool or throw. */
  get(name: string): ClientTool {
    const tool = this.#tools.get(name);
    if (tool === undefined) {
      throw new Error(`tool "${name}" is not registered`);
    }
    return tool;
  }

  /** AG-UI tool definitions for `RunAgentInput.tools`. */
  tools(): Tool[] {
    return [...this.#tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}
