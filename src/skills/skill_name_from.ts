import { LOAD_CAPABILITY_TOOL } from "../constants.js";
import type { AgUiToolCall } from "../core/agui_client.js";

/**
 * The skill name a `load_capability` call activated, or `null` when the call is
 * something else.
 *
 * Every deferred capability loads through this one tool, so the id is a skill
 * name only when the project wired agent skills; another project's capability
 * id surfaces here too. Acceptable for a muted notice, and better than a
 * parallel signal — the id is exactly what the model selected.
 */
export function skillNameFrom(call: AgUiToolCall): string | null {
  if (call.name !== LOAD_CAPABILITY_TOOL) {
    return null;
  }
  const id = (call.args as { id?: unknown } | null | undefined)?.id;
  return typeof id === "string" && id !== "" ? id : null;
}
