/**
 * The wire-outcome to card-status mapping.
 *
 * Small enough to read in one breath, and the one place four repos agree on
 * what a word means — so the cases worth pinning are the ones nobody writes a
 * branch for: the absent field every existing server sends, and the value from
 * a protocol version this release has not seen.
 */

import { describe, expect, it } from "vitest";
import { TOOL_CALL_STATUS, TOOL_OUTCOME } from "../src/constants.js";
import { toolStatusFromOutcome } from "../src/core/tool_outcome.js";

describe("toolStatusFromOutcome", () => {
  it("reads an absent outcome as a success", () => {
    // The backwards-compatibility case, and the only one that is load-bearing
    // for servers that exist today: every one of them omits the field.
    expect(toolStatusFromOutcome(undefined)).toBe(TOOL_CALL_STATUS.DONE);
  });

  it("reads a stated success as a success", () => {
    expect(toolStatusFromOutcome(TOOL_OUTCOME.SUCCESS)).toBe(TOOL_CALL_STATUS.DONE);
  });

  it("reads a failure as an error", () => {
    expect(toolStatusFromOutcome(TOOL_OUTCOME.FAILED)).toBe(TOOL_CALL_STATUS.ERROR);
  });

  it("reads a refusal as declined", () => {
    expect(toolStatusFromOutcome(TOOL_OUTCOME.DENIED)).toBe(TOOL_CALL_STATUS.DECLINED);
  });

  it("reads interrupted as a call that did not finish, neither success nor failure", () => {
    // pydantic-ai's word for a call its history repair answered, and the one the
    // element writes for a call its own run left open.
    expect(toolStatusFromOutcome(TOOL_OUTCOME.INTERRUPTED)).toBe(TOOL_CALL_STATUS.INTERRUPTED);
  });

  it("reads anything unrecognised as a success", () => {
    // Every shape an undeclared field or a JSON blob out of a store can
    // actually hand over. None of them is grounds for claiming a failure.
    for (const value of [null, "", "FAILED", 1, true, {}, ["failed"]]) {
      expect(toolStatusFromOutcome(value)).toBe(TOOL_CALL_STATUS.DONE);
    }
  });
});
