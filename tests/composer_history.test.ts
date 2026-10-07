import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import type { RunRow } from "../src/core/run_index.js";
import { makeFakeAgent } from "./helpers/fake_agent.js";

/**
 * Walking back through what you have already sent, on the arrow keys.
 *
 * The shape every shell and every coding agent uses, and the reason it is safe
 * is entirely in when it declines: arrows inside text are how you move the
 * caret, so taking them unconditionally would break editing to add a shortcut.
 */

/** Mount, with whatever `configure` sets before the element connects. */
function mount(configure: (el: AgUiChat) => void = () => {}): AgUiChat {
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  configure(el);
  // Every test here sends, so every test runs the agent. Without a fake the
  // element builds a real HttpAgent, which under happy-dom posts to a localhost
  // port nobody listens on: each run fails behind the test's back, and happy-dom
  // prints the refused connection -- unattributed, dozens of times -- into
  // every run of the suite. Recall does not depend on how a run ends, so a run
  // that simply finishes is the honest stand-in.
  const handle = makeFakeAgent();
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return el;
}

/**
 * Mount with runs that wait to be let through, so a test can type while one is
 * in flight. Each reports its start -- which is what makes Enter queue rather
 * than send -- and then waits at a gate of its own.
 */
function mountHeld(): { el: AgUiChat; release: () => Promise<void> } {
  const gates: (() => void)[] = [];
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.agentFactory = () =>
    makeFakeAgent({
      script: async (emit) => {
        emit.runStart();
        await new Promise<void>((resolve) => gates.push(resolve));
      },
    }).agent;
  document.body.appendChild(el);
  return {
    el,
    // The oldest run still waiting finishes, and the turn that releases from
    // the queue is given the time to start a run of its own.
    release: async () => {
      gates.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    },
  };
}

/** Mount with a runs index that lists one run to continue. */
function mountWithRuns(): AgUiChat {
  const run: RunRow = {
    run_id: "r1",
    thread_id: "t1",
    parent_run_id: null,
    started_at: "2026-07-27T12:00:00+00:00",
    continuable: true,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ runs: [run] }) })),
  );
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  el.setAttribute("data-runs-url", "/agent/runs/");
  // One agent per client, because a continuation builds its own beside the
  // conversation's.
  el.agentFactory = () => makeFakeAgent().agent;
  document.body.appendChild(el);
  return el;
}

/**
 * Open the checkpoints and continue the listed run with what the composer
 * holds: `text` when given, and otherwise the composer as it stands, which is
 * how a test continues with a turn it walked back to.
 */
async function continueWith(el: AgUiChat, verb: "resume" | "fork", text?: string): Promise<void> {
  const root = el.shadowRoot as ShadowRoot;
  (root.querySelector(".header-btn--checkpoints") as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (text !== undefined) {
    composer(el).value = text;
  }
  (root.querySelector(`.checkpoint-${verb}`) as HTMLButtonElement).click();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function bubbles(el: AgUiChat): string[] {
  const root = el.shadowRoot as ShadowRoot;
  return [...root.querySelectorAll(".message--user")].map((n) => n.textContent ?? "");
}

/** The queued turns, as the chips above the composer. */
function chips(el: AgUiChat): HTMLButtonElement[] {
  const root = el.shadowRoot as ShadowRoot;
  return [...root.querySelectorAll<HTMLButtonElement>(".queued-chip")];
}

function composer(el: AgUiChat): HTMLTextAreaElement {
  const found = el.shadowRoot?.querySelector(".input");
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("no composer");
  }
  return found;
}

/**
 * Type and send with Enter, the way the user does, so the draft is recorded on
 * the way -- and wait for the send to finish, as the user waits for an answer.
 *
 * Only the composer route, because it is the one that records drafts. This
 * used to call `sendMessage` ahead of the Enter as well, and returned without
 * waiting for the Enter's own send -- so the next call's `sendMessage` arrived
 * while that send was still out, and the element let it through as a second
 * run on the same client. The recording relied on that. Such a send is refused
 * now, and the Enter after it queues, which is a different path.
 */
async function send(el: AgUiChat, text: string): Promise<void> {
  const input = composer(el);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function arrow(el: AgUiChat, key: "ArrowUp" | "ArrowDown" | "Enter" | "Escape"): void {
  composer(el).dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, composed: true }));
}

/** Walk back from an empty composer, collecting each step until it holds. */
function walkBack(el: AgUiChat, steps: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    arrow(el, "ArrowUp");
    seen.push(composer(el).value);
  }
  return seen;
}

describe("composer history recall", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("walks back through what was sent, newest first", async () => {
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("second");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("first");
  });

  it("stops at the oldest rather than wrapping round", async () => {
    const el = mount();
    await send(el, "only");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("only");
  });

  it("walks forward again, and out to an empty box", async () => {
    // The way out is the key that got you in, rather than sticking on the
    // newest turn with no way back to a blank composer.
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("second");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("");
  });

  it("leaves the caret alone in text the user is writing", async () => {
    // The condition that makes this safe. An arrow in a half-typed message is
    // navigation, and replacing that message would lose it without asking.
    const el = mount();
    await send(el, "sent");
    const input = composer(el);
    input.value = "half typed";
    input.dispatchEvent(new Event("input", { bubbles: true }));

    arrow(el, "ArrowUp");
    expect(input.value).toBe("half typed");
  });

  it("does nothing before anything has been sent", async () => {
    const el = mount();
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });

  it("does not record a repeat of the last turn twice", async () => {
    // Reaching what was said, not how often it was said.
    const el = mount();
    await send(el, "same");
    await send(el, "same");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("same");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("same");
    arrow(el, "ArrowDown");
    expect(composer(el).value).toBe("");
  });

  it("records nothing for an attachment sent without text", async () => {
    // The composer has nothing to hold for it, so an entry would be a step of
    // the walk that empties the box and goes nowhere.
    const el = mount((element) => {
      // Before connect: the tray is wired once, at connect, so an attachments
      // URL set afterwards arrives too late to build one.
      element.setAttribute("data-attachments-url", "/uploads/");
      element.uploadHandler = async (file: File) => ({
        id: file.name,
        name: file.name,
        mime: file.type,
        size: file.size,
      });
    });
    await send(el, "first");
    el.attachFile(new File(["x"], "note.txt", { type: "text/plain" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await send(el, "");
    expect(bubbles(el)).toHaveLength(2);

    expect(walkBack(el, 2)).toEqual(["first", "first"]);
  });

  it("starts the next walk from the newest turn after typing", async () => {
    const el = mount();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("first");

    // Typing hands the composer back to the user...
    const input = composer(el);
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    arrow(el, "ArrowUp");
    expect(input.value).toBe("second");
  });
});

/**
 * A turn can leave the composer without being sent at that moment: Enter while
 * a run is going queues it, and a picked checkpoint sends it somewhere else.
 *
 * Both are recorded as they leave the box, as a turn sent at once is. What the
 * history holds is what the user typed and pressed Enter on, newest first, and
 * that does not depend on when, or whether, it reached the agent.
 */
describe("turns that reach the history another way", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("records a turn typed during a run as soon as it is queued", async () => {
    // It is the newest thing typed, so it is what ArrowUp reaches first -- while
    // it waits, not only once the queue has sent it.
    const { el } = mountHeld();
    await send(el, "first");
    await send(el, "second");

    expect(walkBack(el, 2)).toEqual(["second", "first"]);
  });

  it("holds it once, after the queue has sent it", async () => {
    // The queue sends through the same call a host's own send does, which
    // records nothing. Recording there as well as here would put it in twice.
    const { el, release } = mountHeld();
    await send(el, "first");
    await send(el, "second");
    await release();
    expect(bubbles(el)).toEqual(["first", "second"]);

    expect(walkBack(el, 3)).toEqual(["second", "first", "first"]);
  });

  it("holds each queued turn once when Stop declines to send them", async () => {
    // Stop is where a waiting turn used to enter the history, so that one it
    // declined to send was not left nowhere. Each one is in it already, and
    // moving them in again recorded every one twice.
    const { el } = mountHeld();
    await send(el, "first");
    await send(el, "second");
    await send(el, "third");
    arrow(el, "Escape");
    expect(chips(el)).toHaveLength(0);

    expect(walkBack(el, 4)).toEqual(["third", "second", "first", "first"]);
  });

  it("keeps a turn taken back from the queue", async () => {
    // Taking it back means not sending it, which is not the same as not having
    // typed it -- the reason Stop keeps what it declines to send. A chip removed
    // by mistake is one ArrowUp from being sent after all.
    const { el } = mountHeld();
    await send(el, "first");
    await send(el, "second");
    expect(chips(el).map((chip) => chip.textContent)).toEqual(["second"]);
    chips(el)[0]?.click();
    expect(chips(el)).toHaveLength(0);

    expect(walkBack(el, 2)).toEqual(["second", "first"]);
  });

  it("starts the next walk from the newest after queueing a turn walked back to", async () => {
    // Enter fires no input event, which is what otherwise ends a walk. Left
    // where it was, the next ArrowUp stepped past the turn just queued.
    const { el, release } = mountHeld();
    await send(el, "first");
    await release();
    await send(el, "second");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("second");
    arrow(el, "Enter");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(composer(el).value).toBe("");

    expect(walkBack(el, 1)).toEqual(["second"]);
  });

  it.each(["resume", "fork"] as const)("records a turn sent to %s an earlier run", async (verb) => {
    // Typed in the composer and sent by a press, like any other turn; only
    // where it went differs.
    const el = mountWithRuns();
    await send(el, "first");
    await continueWith(el, verb, "and now sort them");
    expect(bubbles(el)).toEqual(["first", "and now sort them"]);

    expect(walkBack(el, 3)).toEqual(["and now sort them", "first", "first"]);
  });

  it("starts the next walk from the newest after continuing with a turn walked back to", async () => {
    const el = mountWithRuns();
    await send(el, "first");
    await send(el, "second");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("second");
    await continueWith(el, "resume");
    expect(composer(el).value).toBe("");

    expect(walkBack(el, 1)).toEqual(["second"]);
  });
});

/**
 * The history belongs to the conversation it was typed into.
 *
 * The path that makes this more than tidiness is the `user-key` rescope: it
 * purges storage and wipes the transcript precisely so one principal's words
 * are not visible to the next, and every turn they typed would otherwise be a
 * single ArrowUp away in the composer.
 */
describe("what the recall history outlives", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    // Storage is cleared by the shared setup, which is the only place that can
    // do it safely: happy-dom implements no `localStorage` at all -- the object
    // is there and every method on it is undefined -- while CI's Node provides
    // a real one, so a bare `.clear()` here passes there and throws here.
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it("forgets the previous conversation's turns on a new chat", async () => {
    const el = mount();
    await send(el, "something private");

    el.newChat();
    await send(el, "after the reset");

    // Two presses, and the second is the one that matters. One press walks to
    // the newest turn either way; it is the step past it that reaches into the
    // conversation before, or finds nothing there. Sending after the reset is
    // what stops this passing by simple exhaustion -- there is a turn to walk
    // off the end of, so an empty box is a cleared history rather than a
    // history that was never recorded.
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("after the reset");

    // Walking back past the oldest turn holds there rather than emptying, so
    // what this asserts is where "there" is: this conversation's only turn,
    // and not the one typed before the reset.
    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("after the reset");
    expect(composer(el).value).not.toBe("something private");
  });

  it("forgets them when the signed-in principal changes", async () => {
    const el = mount();
    el.setAttribute("user-key", "alice");
    await send(el, "alice's message");

    // The rescope that exists to stop one user seeing another's conversation.
    el.setAttribute("user-key", "bob");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });

  it("forgets a turn still queued when the principal changes", async () => {
    // A queued turn is recorded before it is sent, so it is in the history
    // while the run it waits on is the one the rescope stops.
    const { el } = mountHeld();
    el.setAttribute("user-key", "alice");
    await send(el, "alice's message");
    await send(el, "alice's queued turn");

    el.setAttribute("user-key", "bob");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });

  it("forgets a continued turn when the principal changes", async () => {
    const el = mountWithRuns();
    el.setAttribute("user-key", "alice");
    await continueWith(el, "resume", "alice's resumed turn");

    el.setAttribute("user-key", "bob");

    arrow(el, "ArrowUp");
    expect(composer(el).value).toBe("");
  });
});
