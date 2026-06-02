import { X_NAVIGATES_KEY } from "../constants.js";

/**
 * Whether a tool's JSON-Schema `parameters` marks it as navigating.
 *
 * Reads the `x-navigates` extension. A navigating tool's handler reloads the
 * page (MPA navigation), so the element checkpoints the call and resumes the
 * run loop after the next page mounts, rather than awaiting a result inline.
 */
export function isNavigates(parameters: Record<string, unknown>): boolean {
  return parameters[X_NAVIGATES_KEY] === true;
}
