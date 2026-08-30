/**
 * Narrow one `ag_ui.subagent` payload into a {@link SubAgentUpdate}.
 *
 * Kept out of the panel for the reason `chartSpecFrom` is kept out of the
 * renderer: the panel's job is drawing, and a value that reaches it has already
 * been vouched for.
 *
 * Defensive about the payload, not about the name. A `CUSTOM` event's `value` is
 * `unknown` by the protocol, so a server can put anything there, and a malformed
 * announcement must not take a run down with it — the same rule the invalidation
 * channel applies to the same field. What is refused here is only what cannot be
 * rendered at all: without a `delegationId` there is no card to attach to, and
 * without a known `phase` there is no state to be in. Everything else degrades to
 * `null`, which the panel reads as "said nothing about this".
 */

import { SUBAGENT_PHASE } from "../constants.js";
import type { SubAgentPhase, SubAgentTool, SubAgentUpdate } from "./subagent_panel.js";

const PHASES: readonly string[] = Object.values(SUBAGENT_PHASE);

/** A record view of `value`, or `null` for anything that is not an object. */
function asRecord(value: unknown): Record<string, unknown> | null {
  // `typeof null` is "object", and an array is one too — neither carries the
  // keys below, and both arrive from a JSON decoder without any warning.
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** A non-empty string, or `null`. */
function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The `tool` record the two tool phases carry.
 *
 * All-or-nothing: the contract states all three keys on every tool phase, so a
 * partial record is a payload this client does not understand rather than a step
 * to draw half of. A step row keyed by an empty id would also collide with the
 * next one, silently merging two of the child's calls into one row.
 */
function asTool(value: unknown): SubAgentTool | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const toolCallId = asText(record["toolCallId"]);
  const name = asText(record["name"]);
  const ok = record["ok"];
  if (toolCallId === null || name === null) {
    return null;
  }
  if (ok !== null && typeof ok !== "boolean") {
    return null;
  }
  return { toolCallId, name, ok };
}

/** Narrow an `ag_ui.subagent` `CUSTOM` value, or `null` if it cannot be drawn. */
export function subAgentUpdate(value: unknown): SubAgentUpdate | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const delegationId = asText(record["delegationId"]);
  const phase = record["phase"];
  if (delegationId === null || typeof phase !== "string" || !PHASES.includes(phase)) {
    return null;
  }
  return {
    delegationId,
    phase: phase as SubAgentPhase,
    agent: asText(record["agent"]),
    status: asText(record["status"]),
    tool: asTool(record["tool"]),
  };
}
