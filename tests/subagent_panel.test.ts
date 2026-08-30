/**
 * The delegation panel on its own, away from the element that mounts it.
 *
 * Everything the panel is asked to do is a consequence of one decision: the wire
 * keys progress on the *parent's* tool-call id, so this is a surface hung off a
 * card that already exists rather than a floating element with the same identity.
 * What follows from that is a row that must stay readable whatever an
 * announcement omits, and steps that must update in place rather than stack.
 *
 * Payloads come from the producer's fixture, narrowed the way the element
 * narrows them — see `tests/helpers/subagent_fixture.ts` for the provenance.
 */

import { describe, expect, it } from "vitest";

import { SubAgentPanel, type SubAgentUpdate } from "../src/ui/subagent_panel.js";
import { subAgentUpdate } from "../src/ui/subagent_update.js";
import { DEFAULT_UI_STRINGS, mergeUiStrings } from "../src/ui/ui_strings.js";
import { subAgentValue } from "./helpers/subagent_fixture.js";

/** A recorded payload, narrowed. Throws rather than returning a partial shape. */
function update(predicate: Parameters<typeof subAgentValue>[0]): SubAgentUpdate {
  const narrowed = subAgentUpdate(subAgentValue(predicate));
  if (narrowed === null) {
    throw new Error("the fixture's own payload did not narrow, which is a contract finding");
  }
  return narrowed;
}

const OPENING = update((v) => v.agent === "researcher" && v.phase === "started");
const CALLING = update((v) => v.phase === "tool_call" && v.tool?.toolCallId === "sub-1");
const RETURNED = update((v) => v.phase === "tool_result" && v.tool?.ok === true);
const RETRIED = update((v) => v.phase === "tool_result" && v.tool?.ok === false);
const FINISHED = update((v) => v.agent === "researcher" && v.phase === "finished");

function row(panel: SubAgentPanel): HTMLButtonElement {
  const found = panel.element.querySelector<HTMLButtonElement>(".subagent-row");
  if (found === null) {
    throw new Error("expected a collapsed row");
  }
  return found;
}

function steps(panel: SubAgentPanel): HTMLElement {
  const found = panel.element.querySelector<HTMLElement>(".subagent-steps");
  if (found === null) {
    throw new Error("expected a steps region");
  }
  return found;
}

describe("a delegation panel", () => {
  it("opens collapsed, on the server's own line", () => {
    const panel = new SubAgentPanel();

    panel.report(OPENING);

    expect(row(panel).textContent).toBe(OPENING.status);
    expect(row(panel).getAttribute("aria-expanded")).toBe("false");
    expect(steps(panel).hidden).toBe(true);
  });

  it("stamps the phase and the agent for a host to select on", () => {
    const panel = new SubAgentPanel();

    panel.report(OPENING);

    expect(panel.element.getAttribute("data-phase")).toBe(OPENING.phase);
    expect(panel.element.getAttribute("data-agent")).toBe(OPENING.agent);
  });

  it("leaves a readable row when an announcement carries no status", () => {
    // A fallback, not a state. The row is the expander, so it must never be
    // blank -- and the seeded text is what a host localizes.
    const panel = new SubAgentPanel();

    panel.report({ ...OPENING, status: null });

    expect(row(panel).textContent).toBe(DEFAULT_UI_STRINGS.subAgentWorking);
  });

  it("keeps what it already shows when a later phase says nothing new", () => {
    // `finished` is two keys wide on the wire. A panel that applied every field
    // unconditionally would blank the agent it just closed.
    const panel = new SubAgentPanel();
    panel.report(OPENING);

    panel.report({ ...FINISHED, agent: null, status: null });

    expect(panel.element.getAttribute("data-agent")).toBe(OPENING.agent);
    expect(row(panel).textContent).toBe(OPENING.status);
    expect(panel.element.getAttribute("data-phase")).toBe(FINISHED.phase);
  });

  it("takes its chrome text from the strings table", () => {
    const strings = mergeUiStrings({ subAgentSteps: "Étapes du sous-agent" });
    const panel = new SubAgentPanel(strings);

    expect(steps(panel).getAttribute("aria-label")).toBe("Étapes du sous-agent");
  });

  it("opens one step per child call and settles it in place", () => {
    const panel = new SubAgentPanel();

    panel.report(CALLING);
    panel.report(RETURNED);

    const rows = [...steps(panel).querySelectorAll(".subagent-step")];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-tool-call-id")).toBe(CALLING.tool?.toolCallId);
    expect(rows[0]?.getAttribute("data-ok")).toBe("true");
  });

  it("shows a call in flight as an absent outcome, not a failed one", () => {
    // The wire's `null` and the attribute's absence are the same fact. Writing
    // "false" here would draw every running call as one that came back.
    const panel = new SubAgentPanel();

    panel.report(CALLING);

    expect(steps(panel).querySelector(".subagent-step")?.hasAttribute("data-ok")).toBe(false);
  });

  it("re-opens a step that goes back in flight", () => {
    // Not in the recorded run, but reachable: a server that re-announces a call
    // it has already settled must not leave the settled mark on a live row.
    const panel = new SubAgentPanel();
    panel.report(CALLING);
    panel.report(RETURNED);

    panel.report(CALLING);

    expect(steps(panel).querySelector(".subagent-step")?.hasAttribute("data-ok")).toBe(false);
  });

  it("names the child's raw tool, not a relabelled one", () => {
    // A sub-agent's tools never reached the browser's schema, and the status
    // line above quotes the same raw name.
    const panel = new SubAgentPanel();

    panel.report(RETRIED);

    expect(steps(panel).querySelector(".subagent-step-name")?.textContent).toBe(RETRIED.tool?.name);
  });

  it("expands and collapses on the row it already draws", () => {
    const panel = new SubAgentPanel();
    panel.report(CALLING);

    row(panel).click();
    expect(steps(panel).hidden).toBe(false);
    expect(row(panel).getAttribute("aria-expanded")).toBe("true");

    row(panel).click();
    expect(steps(panel).hidden).toBe(true);
    expect(row(panel).getAttribute("aria-expanded")).toBe("false");
  });

  it("offers no control until there is something behind it", () => {
    const panel = new SubAgentPanel();

    panel.report(OPENING);
    expect(row(panel).disabled).toBe(true);

    panel.report(CALLING);
    expect(row(panel).disabled).toBe(false);
  });
});
