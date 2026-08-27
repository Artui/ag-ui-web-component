import { X_DESTRUCTIVE_KEY } from "../constants.js";

/**
 * Whether a tool's JSON-Schema `parameters` marks it destructive.
 *
 * Reads the `x-destructive` extension off a schema the **host** declared —
 * a tool passed to `registerTool`, or one of the built-ins. A server-side
 * tool's schema never reaches the browser: tool definitions travel
 * client-to-server on `RunAgentInput.tools`, and the only channel coming the
 * other way is the tool catalog (`data-tools-url`), which carries labels, not
 * schemas. So a server tool marked destructive there is not gated here, and
 * must be gated server-side instead — the confirmation this flag drives is a
 * property of tools the browser itself executes.
 */
export function isDestructive(parameters: Record<string, unknown>): boolean {
  return parameters[X_DESTRUCTIVE_KEY] === true;
}
