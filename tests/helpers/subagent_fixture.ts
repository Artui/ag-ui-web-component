/**
 * The sub-agent progress wire, as the server that serves it wrote it.
 *
 * ## Provenance — regenerate, never edit
 *
 * `tests/fixtures/subagent_progress_stream.json` is a **byte-for-byte copy** of
 * the file of the same name in the **django-ag-ui** repository, where
 * `scripts/generate_subagent_fixture.py` produces it by driving a real
 * `DjangoAGUIView` run through the real `SubAgents` capability and decoding the
 * Server-Sent Events its own encoder wrote. That repository's
 * `tests/agent/test_subagent_fixture.py` regenerates it on every run and fails
 * on any difference, so the file cannot drift from the server without someone
 * noticing.
 *
 * **Editing this fixture to make a test pass is always wrong.** If an assertion
 * cannot be satisfied by what is in here, the finding is about the contract, not
 * about the test — take it to the server side and regenerate. A hand-typed
 * double describing a wire no server writes makes every test that uses it agree
 * with the bug, which has happened in this family more than once.
 *
 * Two fields are canonicalized by the generator and only two: `timestamp` (the
 * wall clock) and `messageId` / `parentMessageId` (fresh UUIDs). Every
 * `toolCallId` is what the server wrote, which matters here because the progress
 * events key on them.
 */

import fixture from "../fixtures/subagent_progress_stream.json";

/** The `tool` record the two tool phases carry, always with all three keys. */
export interface FixtureSubAgentTool {
  readonly toolCallId: string;
  readonly name: string;
  readonly ok: boolean | null;
}

/** The `value` of one `ag_ui.subagent` CUSTOM event. */
export interface FixtureSubAgentValue {
  readonly delegationId: string;
  readonly agent: string;
  readonly phase: string;
  readonly status: string;
  readonly tool?: FixtureSubAgentTool;
}

/** One decoded AG-UI event, read only through the fields a caller names. */
export type FixtureEvent = Readonly<Record<string, unknown>>;

/** Every event of the recorded run, in the order the encoder wrote them. */
export const FIXTURE_EVENTS: readonly FixtureEvent[] = fixture.events as readonly FixtureEvent[];

/** The scenario line the generator stamps, quoted in failures for context. */
export const FIXTURE_SCENARIO: string = fixture.scenario;

/** The `CUSTOM` event `name` the sub-agent progress channel uses on the wire. */
export const FIXTURE_CUSTOM_NAME = "ag_ui.subagent";

/** Every sub-agent progress payload the run carried, in order. */
export function subAgentValues(): readonly FixtureSubAgentValue[] {
  return FIXTURE_EVENTS.filter(
    (event) => event["type"] === "CUSTOM" && event["name"] === FIXTURE_CUSTOM_NAME,
  ).map((event) => event["value"] as FixtureSubAgentValue);
}

/**
 * The one progress payload matching `predicate`.
 *
 * Selecting by shape rather than by index, so a regenerated fixture that gains
 * an event fails on the assertion it invalidates rather than on an off-by-one
 * somewhere else.
 */
export function subAgentValue(
  predicate: (value: FixtureSubAgentValue) => boolean,
): FixtureSubAgentValue {
  const found = subAgentValues().filter(predicate);
  if (found.length !== 1) {
    throw new Error(
      `expected exactly one matching sub-agent payload in the fixture, found ${found.length}. ` +
        `Scenario: ${FIXTURE_SCENARIO}`,
    );
  }
  return found[0] as FixtureSubAgentValue;
}
