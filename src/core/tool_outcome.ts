import { TOOL_CALL_STATUS, TOOL_OUTCOME } from "../constants.js";
import type { SettledStatus } from "../ui/tool_call_card.js";

/**
 * How a tool call ended, in the wire's own words. See {@link TOOL_OUTCOME}.
 *
 * Absent is the fourth case and the common one: a server that has never heard
 * of the field says nothing, and nothing means success.
 */
export type ToolOutcome = (typeof TOOL_OUTCOME)[keyof typeof TOOL_OUTCOME];

/**
 * The card status a wire outcome settles into.
 *
 * Takes `unknown` rather than {@link ToolOutcome} on purpose: both callers read
 * this off a boundary the type system does not police -- a `passthrough` field
 * on an AG-UI event, and a JSON blob out of the conversation store -- so the
 * narrowing belongs here, once, instead of at each of them.
 *
 * **Everything unrecognised maps to `DONE`.** Not because unknown values are
 * expected to be successes, but because the alternative is worse in the
 * direction that matters: a card claiming a call failed when it did not is a
 * lie the user acts on, while a card claiming success has at least the result
 * text under it for them to read. `interrupted` is the concrete case today --
 * pydantic-ai emits it, this vocabulary does not carry it, and a future release
 * may add more. Forward compatibility is the point of the open field.
 */
export function toolStatusFromOutcome(outcome: unknown): SettledStatus {
  if (outcome === TOOL_OUTCOME.FAILED) {
    return TOOL_CALL_STATUS.ERROR;
  }
  if (outcome === TOOL_OUTCOME.DENIED) {
    return TOOL_CALL_STATUS.DECLINED;
  }
  return TOOL_CALL_STATUS.DONE;
}
