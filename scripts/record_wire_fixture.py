#!/usr/bin/env python
"""Record real AG-UI SSE bodies into ``tests/fixtures/recorded_ag_ui_runs.json``.

Every frame this writes is the verbatim return value of the AG-UI protocol
package's own ``EventEncoder``. Nothing here types a wire payload by hand, and
that is the whole point: a fixture whose JSON was written by a person is a
second copy of the client's assumptions wearing a fixture's clothes, and it
agrees with the client for exactly as long as both are wrong together.

So the field *names* in the output are chosen by the Python event models, the
framing (``data: `` prefix, blank-line terminator, camelCase aliasing, omission
of unset fields) by the encoder, and the chart and compaction payloads by the
server package's own builders. This script only chooses ids and values.

Running it
----------

It needs the Python side of the stack, which lives in the sibling server
repository, so run it with *that* project's interpreter rather than a bare
``python``::

    <django-ag-ui checkout>/.venv/bin/python scripts/record_wire_fixture.py

Any interpreter with ``ag-ui-protocol`` and ``django-ag-ui`` importable will do.
The output is checked in, so this is a regeneration tool rather than a build
step: re-run it after a protocol bump, review the diff, and let the browser
suite say whether the client still reads what the server now writes.

The recorded runs are deliberately not exhaustive. They cover the events
``AgUiClient``'s subscriber reads fields off, which is a much smaller set than
the protocol's thirty-three, and the events nothing reads are left out rather
than padded in for symmetry.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import django
from django.conf import settings

# ``django_ag_ui`` imports Django settings at module scope, so configure a
# minimal in-memory project before touching it. Nothing recorded here runs a
# request or reaches a database; the settings only satisfy the import.
settings.configure(DEBUG=False, INSTALLED_APPS=[], DATABASES={})
django.setup()

from ag_ui.core import (  # noqa: E402
    ActivitySnapshotEvent,
    Interrupt,
    ReasoningEndEvent,
    ReasoningMessageContentEvent,
    ReasoningMessageEndEvent,
    ReasoningMessageStartEvent,
    ReasoningStartEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunFinishedInterruptOutcome,
    RunFinishedSuccessOutcome,
    RunStartedEvent,
    StateSnapshotEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)
from ag_ui.encoder import EventEncoder  # noqa: E402
from django_ag_ui.agent.chart_activity import chart_activity  # noqa: E402
from django_ag_ui.agent.chart_points_delta import chart_points_delta  # noqa: E402
from django_ag_ui.agent.inject_compaction_events import (  # noqa: E402
    COMPACTION_ACTIVITY_TYPE,
)
from django_ag_ui.agent.types.chart_series import ChartSeries  # noqa: E402
from django_ag_ui.agent.types.chart_spec import ChartSpec  # noqa: E402

OUTPUT = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "recorded_ag_ui_runs.json"

THREAD_ID = "thread-recorded"
CHART_ID = "chart-recorded"

# The one field on the wire that no client can be deterministic about. Real runs
# stamp it with the wall clock; a fixture that did would produce a diff on every
# regeneration and teach reviewers to skim them. Frozen to a fixed instant so a
# regeneration diff contains only what actually changed.
TIMESTAMP = 1_700_000_000_000


def _compaction_activity(message_id: str, *, removed: int, before: int, after: int) -> Any:
    """A history-condensed notice, in the shape the server's injector builds.

    The injector itself only runs inside a live agent stream (it drains a
    context-local sink mid-run), so the event is rebuilt here from the same
    class and the same exported activity-type constant. The constant is the
    load-bearing half: it is the string both sides match on, and importing it
    is what makes a rename on the server side show up here.
    """
    return ActivitySnapshotEvent(
        message_id=message_id,
        activity_type=COMPACTION_ACTIVITY_TYPE,
        content={"removed": removed, "before": before, "after": after},
    )


def _ordinary_run() -> list[Any]:
    """A run that condenses history, reasons, calls a server tool, draws, answers.

    Everything the component reads off a *successful* stream, in one body. The
    tool is named for something the browser does not register, so the client
    treats it as server-side and takes its result from ``TOOL_CALL_RESULT``
    rather than executing anything.
    """
    spec = ChartSpec(
        labels=("Mon", "Tue", "Wed"),
        series=(ChartSeries(label="orders", points=(3.0, 5.0, 4.0)),),
        kind="bar",
        title="Orders this week",
    )
    return [
        RunStartedEvent(thread_id=THREAD_ID, run_id="run-ordinary"),
        _compaction_activity("compaction-recorded", removed=8, before=10, after=2),
        ReasoningStartEvent(message_id="reasoning-1"),
        ReasoningMessageStartEvent(message_id="reasoning-1", role="reasoning"),
        # Two deltas, because one would not show how the client accumulates
        # them -- and because the buffer it hands a subscriber is the text so
        # far *excluding* the delta being announced, which a single-delta
        # recording renders as an empty string and hides.
        ReasoningMessageContentEvent(message_id="reasoning-1", delta="Checking the order table"),
        ReasoningMessageContentEvent(message_id="reasoning-1", delta=" for this week"),
        ReasoningMessageEndEvent(message_id="reasoning-1"),
        ReasoningEndEvent(message_id="reasoning-1"),
        ToolCallStartEvent(
            tool_call_id="call-1",
            tool_call_name="query_orders",
            parent_message_id="assistant-1",
        ),
        # Split across two frames on purpose. Arguments arrive as a stream of
        # partial JSON that the client concatenates, so a single whole-object
        # frame would never exercise the join.
        ToolCallArgsEvent(tool_call_id="call-1", delta='{"week"'),
        ToolCallArgsEvent(tool_call_id="call-1", delta=': "current"}'),
        ToolCallEndEvent(tool_call_id="call-1"),
        ToolCallResultEvent(
            message_id="tool-result-1",
            tool_call_id="call-1",
            content="3 orders on Mon, 5 on Tue, 4 on Wed",
        ),
        chart_activity(spec, chart_id=CHART_ID),
        # Chosen so the patch *reorders* the bars: the snapshot's tallest is
        # Tuesday, the delta's is Monday. A delta that never arrived, or arrived
        # and was not applied, therefore fails a height comparison rather than
        # passing on numbers that happen to look alike.
        chart_points_delta(CHART_ID, series=0, points=(9.0, 1.0, 4.0)),
        StateSnapshotEvent(snapshot={"selectedWeek": "current"}),
        TextMessageStartEvent(message_id="assistant-1"),
        # Markdown, so the render assertion crosses the sanitiser rather than
        # stopping at the text.
        TextMessageContentEvent(message_id="assistant-1", delta="Orders are **up** "),
        TextMessageContentEvent(message_id="assistant-1", delta="on Tuesday."),
        TextMessageEndEvent(message_id="assistant-1"),
        RunFinishedEvent(
            thread_id=THREAD_ID,
            run_id="run-ordinary",
            outcome=RunFinishedSuccessOutcome(),
        ),
    ]


def _failed_run() -> list[Any]:
    """A run the server aborts partway, after some text has already landed."""
    return [
        RunStartedEvent(thread_id=THREAD_ID, run_id="run-failed"),
        TextMessageStartEvent(message_id="assistant-2"),
        TextMessageContentEvent(message_id="assistant-2", delta="Looking that up"),
        TextMessageEndEvent(message_id="assistant-2"),
        RunErrorEvent(message="The upstream model timed out", code="upstream_timeout"),
    ]


def _deferred_run() -> list[Any]:
    """A gated server-side tool that defers, so the run finishes on an interrupt.

    The most field-dense terminal event the protocol has, and the one the
    hand-written fakes flatten hardest: on the wire ``outcome`` is an object
    with its own discriminator, and each interrupt carries five fields the
    approval UI reads.
    """
    return [
        RunStartedEvent(thread_id=THREAD_ID, run_id="run-deferred"),
        ToolCallStartEvent(
            tool_call_id="call-2",
            tool_call_name="delete_order",
            parent_message_id="assistant-3",
        ),
        ToolCallArgsEvent(tool_call_id="call-2", delta='{"order_id": 41}'),
        ToolCallEndEvent(tool_call_id="call-2"),
        RunFinishedEvent(
            thread_id=THREAD_ID,
            run_id="run-deferred",
            outcome=RunFinishedInterruptOutcome(
                interrupts=[
                    Interrupt(
                        id="interrupt-1",
                        reason="approval_required",
                        message="Delete order 41?",
                        tool_call_id="call-2",
                    )
                ]
            ),
        ),
    ]


def main() -> None:
    encoder = EventEncoder()
    runs = {
        "ordinary": _ordinary_run(),
        "failed": _failed_run(),
        "deferred": _deferred_run(),
    }
    document = {
        "recordedBy": Path(__file__).name,
        "contentType": encoder.get_content_type(),
        "runs": {
            name: [encoder.encode(_stamp(event)) for event in events]
            for name, events in runs.items()
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(document, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    frames = sum(len(body) for body in document["runs"].values())
    print(f"wrote {frames} frames across {len(runs)} runs to {OUTPUT.name}")


def _stamp(event: Any) -> Any:
    """Give every event the same fixed timestamp (see ``TIMESTAMP``)."""
    return event.model_copy(update={"timestamp": TIMESTAMP})


if __name__ == "__main__":
    main()
