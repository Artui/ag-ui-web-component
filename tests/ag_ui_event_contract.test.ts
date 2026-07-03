import { EventType } from "@ag-ui/core";
import { describe, expect, it } from "vitest";

/**
 * Cross-repo AG-UI event-set contract.
 *
 * The JS (`@ag-ui/core`) and Python (`ag-ui-protocol`) event sets are identical
 * today, and the trio relies on it — reasoning rides the `REASONING_*` family on
 * both sides. This pins the canonical set so a dependency bump that
 * adds / removes / renames an event fails here and forces a deliberate review.
 *
 * The **same** list is asserted in django-ag-ui's suite
 * (`tests/test_ag_ui_event_contract.py`) and documented in the ecosystem
 * `architecture.md` ("Events the trio relies on"). Update all three together.
 */
const CANONICAL_AG_UI_EVENTS: ReadonlySet<string> = new Set([
  "ACTIVITY_DELTA",
  "ACTIVITY_SNAPSHOT",
  "CUSTOM",
  "MESSAGES_SNAPSHOT",
  "RAW",
  "REASONING_ENCRYPTED_VALUE",
  "REASONING_END",
  "REASONING_MESSAGE_CHUNK",
  "REASONING_MESSAGE_CONTENT",
  "REASONING_MESSAGE_END",
  "REASONING_MESSAGE_START",
  "REASONING_START",
  "RUN_ERROR",
  "RUN_FINISHED",
  "RUN_STARTED",
  "STATE_DELTA",
  "STATE_SNAPSHOT",
  "STEP_FINISHED",
  "STEP_STARTED",
  "TEXT_MESSAGE_CHUNK",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TEXT_MESSAGE_START",
  "THINKING_END",
  "THINKING_START",
  "THINKING_TEXT_MESSAGE_CONTENT",
  "THINKING_TEXT_MESSAGE_END",
  "THINKING_TEXT_MESSAGE_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_CHUNK",
  "TOOL_CALL_END",
  "TOOL_CALL_RESULT",
  "TOOL_CALL_START",
]);

describe("AG-UI event-set contract", () => {
  it("matches the canonical cross-repo set", () => {
    const actual = new Set(Object.values(EventType).filter((v) => typeof v === "string"));
    expect(actual).toEqual(CANONICAL_AG_UI_EVENTS);
  });

  it("includes the reasoning event family", () => {
    // REASONING_* (7, the modern family) + the legacy THINKING_* (5) this client
    // maps onto it.
    const reasoning = [...CANONICAL_AG_UI_EVENTS].filter(
      (e) => e.startsWith("REASONING") || e.startsWith("THINKING"),
    );
    expect(reasoning).toHaveLength(12);
  });
});
