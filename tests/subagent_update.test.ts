/**
 * The narrowing in front of the delegation panel.
 *
 * A `CUSTOM` event's `value` is `unknown` by the protocol, so this is the seam
 * where an announcement stops being whatever a server felt like sending. The
 * happy path is checked against the **real** payloads out of the producer's
 * fixture; every rejection below is one of those payloads, deliberately spoiled
 * one key at a time, so the test states what the contract requires rather than
 * inventing a shape nobody writes.
 *
 * Two rules the cases encode:
 *
 * - **Refuse only what cannot be drawn.** Without a `delegationId` there is no
 *   card to attach to and without a known `phase` there is no state to be in.
 *   Everything else degrades to `null`, which the panel reads as "said nothing
 *   about this" and leaves alone.
 * - **`tool` is all-or-nothing.** The contract states all three keys on both
 *   tool phases, so a partial record is a payload this client does not
 *   understand rather than a step to draw half of.
 */

import { describe, expect, it } from "vitest";

import { SUBAGENT_PHASE } from "../src/constants.js";
import { subAgentUpdate } from "../src/ui/subagent_update.js";
import { subAgentValue, subAgentValues } from "./helpers/subagent_fixture.js";

/** Two real payloads: a call in flight, and a result that landed. */
const A_STEP = subAgentValue((v) => v.phase === "tool_call" && v.tool?.toolCallId === "sub-1");
const WITH_TOOL = subAgentValue((v) => v.phase === "tool_result" && v.tool?.ok === true);

/** The same payload with one key replaced, as an untyped value off the wire. */
function spoiled(base: object, patch: Record<string, unknown>): unknown {
  return { ...base, ...patch };
}

describe("narrowing a sub-agent announcement", () => {
  it("accepts every payload the recorded run actually carried", () => {
    const narrowed = subAgentValues().map((value) => subAgentUpdate(value));

    expect(narrowed.every((update) => update !== null)).toBe(true);
    expect(narrowed.map((update) => update?.phase)).toEqual(
      subAgentValues().map((value) => value.phase),
    );
  });

  it("keeps the tool record whole, with the tri-state the wire sent", () => {
    expect(subAgentUpdate(WITH_TOOL)?.tool).toEqual(WITH_TOOL.tool);
    // A payload carrying no tool still narrows, to "said nothing about this".
    // Every payload a current server writes carries one, so this is the
    // defensive path rather than the ordinary one -- the value is `unknown`.
    expect(subAgentUpdate(spoiled(A_STEP, { tool: undefined }))?.tool).toBeNull();
  });

  it("recognises every phase the contract names, and only those", () => {
    // All five, including the three a current server no longer puts on this
    // carrier: a server one release older still does, and this element ships
    // and is vendored separately from it.
    for (const phase of Object.values(SUBAGENT_PHASE)) {
      expect(subAgentUpdate(spoiled(A_STEP, { phase }))?.phase).toBe(phase);
    }
    expect(subAgentUpdate(spoiled(A_STEP, { phase: "half_done" }))).toBeNull();
    expect(subAgentUpdate(spoiled(A_STEP, { phase: 3 }))).toBeNull();
  });

  it("refuses a value that is not an object at all", () => {
    // An array is `typeof "object"` and carries none of these keys, and a JSON
    // decoder hands one over without a word.
    for (const value of [null, undefined, "started", 7, [A_STEP]]) {
      expect(subAgentUpdate(value)).toBeNull();
    }
  });

  it("refuses an announcement with no delegation to attach to", () => {
    for (const delegationId of [undefined, "", 7, null]) {
      expect(subAgentUpdate(spoiled(A_STEP, { delegationId }))).toBeNull();
    }
  });

  it("degrades an unusable agent or status to nothing said", () => {
    for (const agent of [undefined, "", 7]) {
      expect(subAgentUpdate(spoiled(A_STEP, { agent }))?.agent).toBeNull();
    }
    for (const status of [undefined, "", { text: "hi" }]) {
      expect(subAgentUpdate(spoiled(A_STEP, { status }))?.status).toBeNull();
    }
  });

  it("drops a tool record that is missing any of its three keys", () => {
    const partial = [
      { toolCallId: "sub-1", name: "lookup_docs" },
      { toolCallId: "sub-1", ok: null },
      { name: "lookup_docs", ok: null },
      // An empty id would key two of the child's calls onto one step row.
      { toolCallId: "", name: "lookup_docs", ok: null },
      { toolCallId: "sub-1", name: "", ok: null },
      { toolCallId: "sub-1", name: "lookup_docs", ok: "true" },
      "lookup_docs",
      null,
    ];
    for (const tool of partial) {
      expect(subAgentUpdate(spoiled(WITH_TOOL, { tool }))?.tool).toBeNull();
    }
  });

  it("carries a running call's null through rather than flattening it", () => {
    // `null` is in flight and `false` is a result that came back. Collapsing the
    // first into the second draws every running call as a failed one.
    const running = subAgentUpdate(spoiled(WITH_TOOL, { tool: { ...WITH_TOOL.tool, ok: null } }));

    expect(running?.tool?.ok).toBeNull();
    expect(
      subAgentUpdate(spoiled(WITH_TOOL, { tool: { ...WITH_TOOL.tool, ok: false } }))?.tool?.ok,
    ).toBe(false);
  });
});
