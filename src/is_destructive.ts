import { X_DESTRUCTIVE_KEY } from "./constants.js";

/**
 * Whether a tool's JSON-Schema `parameters` marks it destructive.
 *
 * Reads the `x-destructive` extension stamped by the server (`django-ag-ui`'s
 * `build_input_schema`) or by a host declaring a tool directly.
 */
export function isDestructive(parameters: Record<string, unknown>): boolean {
  return parameters[X_DESTRUCTIVE_KEY] === true;
}
