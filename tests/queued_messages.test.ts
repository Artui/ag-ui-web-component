import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { ELEMENT_TAG } from "../src/constants.js";
import type { AgUiChat } from "../src/core/ag_ui_chat.js";
import { defineAgUiChat } from "../src/core/define_ag_ui_chat.js";
import { type Emit, makeFakeAgent } from "./helpers/fake_agent.js";

/**
 * Typing while the assistant is working.
 *
 * Enter during a run used to do nothing at all, and silently: a second run
 * cannot start while one is in flight, because it would orphan the first --
 * which is unabortable -- and the second's settle sweep would corrupt the
 * first's still-pending tool cards. Queueing keeps that guard and gives the key
 * something to do.
 *
 * Driven through a real run rather than a flag flipped from the outside. The
 * guard and the flush are two halves of one state machine, and a test that sets
 * the state directly proves only that each half works against a state nothing
 * produced.
 */

/** Holds a run open until `release` is called, so "mid-run" is a real state. */
function mountWithHeldRun(
  options: { attributes?: Record<string, string>; uploadHandler?: AgUiChat["uploadHandler"] } = {},
): { el: AgUiChat; release: () => void; sent: string[] } {
  const sent: string[] = [];
  let release: (() => void) | null = null;
  const handle = makeFakeAgent({
    script: async (emit: Emit) => {
      // Counted on the way in, so each run answers under an id of its own. It
      // was read but never written, which made every flushed run re-emit as
      // `m0` -- the first run's id -- and any assertion about which run
      // answered would have been reading an empty list and believing it.
      sent.push(`run${sent.length}`);
      emit.runStart();
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      emit.textEnd("answer", `m${sent.length - 1}`);
    },
  });
  const el = document.createElement(ELEMENT_TAG) as AgUiChat;
  el.setAttribute("endpoint", "/agent/");
  el.setAttribute("data-start-open", "");
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    el.setAttribute(name, value);
  }
  if (options.uploadHandler !== undefined) {
    el.uploadHandler = options.uploadHandler;
  }
  el.agentFactory = () => handle.agent;
  document.body.appendChild(el);
  return {
    el,
    sent,
    release: () => {
      release?.();
      release = null;
    },
  };
}

function composer(el: AgUiChat): HTMLTextAreaElement {
  const found = el.shadowRoot?.querySelector(".input");
  if (!(found instanceof HTMLTextAreaElement)) {
    throw new Error("no composer");
  }
  return found;
}

function enter(el: AgUiChat, text: string): void {
  const input = composer(el);
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
  );
}

const chips = (el: AgUiChat): string[] =>
  [...(el.shadowRoot?.querySelectorAll(".queued-chip") ?? [])].map((n) => n.textContent ?? "");

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) {
    await Promise.resolve();
  }
}

describe("messages typed during a run", () => {
  beforeAll(() => {
    defineAgUiChat();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    sessionStorage.clear();
  });

  it("holds what is typed mid-run, and clears the box", async () => {
    const { el, release } = mountWithHeldRun();
    enter(el, "first");
    await flush();

    enter(el, "while it thinks");
    expect(chips(el)).toEqual(["while it thinks"]);
    expect(composer(el).value).toBe("");

    release();
    await flush();
  });

  it("sends what was waiting once the run settles", async () => {
    const { el, release } = mountWithHeldRun();
    enter(el, "first");
    await flush();
    enter(el, "second");
    expect(chips(el)).toEqual(["second"]);

    release();
    await flush();

    // Off the row and into the conversation.
    expect(chips(el)).toEqual([]);
    const bubbles = [...(el.shadowRoot?.querySelectorAll(".message--user") ?? [])].map(
      (n) => n.textContent ?? "",
    );
    expect(bubbles.some((text) => text.includes("second"))).toBe(true);
  });

  it("lets a waiting message be taken back before it is sent", async () => {
    // A message the user changed their mind about has to be retractable
    // before it is sent on their behalf.
    const { el, release } = mountWithHeldRun();
    enter(el, "first");
    await flush();
    enter(el, "actually no");
    expect(chips(el)).toEqual(["actually no"]);

    const chip = el.shadowRoot?.querySelector(".queued-chip");
    if (!(chip instanceof HTMLButtonElement)) {
      throw new Error("no queued chip to take back");
    }
    chip.click();
    expect(chips(el)).toEqual([]);

    release();
    await flush();
    const bubbles = [...(el.shadowRoot?.querySelectorAll(".message--user") ?? [])].map(
      (n) => n.textContent ?? "",
    );
    expect(bubbles.some((text) => text.includes("actually no"))).toBe(false);
  });

  it("throws the queue away when the run is stopped", async () => {
    // Sending into a conversation the user has just stopped is the opposite of
    // what stopping meant, and it would arrive after they turned away.
    const { el, release } = mountWithHeldRun();
    enter(el, "first");
    await flush();
    enter(el, "queued");
    expect(chips(el)).toEqual(["queued"]);

    composer(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await flush();

    expect(chips(el)).toEqual([]);
    release();
    await flush();
    const bubbles = [...(el.shadowRoot?.querySelectorAll(".message--user") ?? [])].map(
      (n) => n.textContent ?? "",
    );
    expect(bubbles.some((text) => text.includes("queued"))).toBe(false);
  });

  it("keeps a discarded queue reachable on the arrow keys", async () => {
    // Not sending it and destroying it are different things. A queued message
    // has already left the composer, so dropping it on Stop would take a
    // paragraph the user typed and leave it nowhere at all -- not on screen,
    // not in the box, not recallable.
    const { el, release } = mountWithHeldRun();
    enter(el, "first");
    await flush();
    enter(el, "a long thought worth keeping");
    await flush();

    composer(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await flush();
    expect(chips(el)).toEqual([]);

    composer(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }),
    );
    expect(composer(el).value).toBe("a long thought worth keeping");

    release();
    await flush();
  });

  it("does not double up a queued message that repeats the last one sent", async () => {
    // The same guard the send path applies to its own history: pressing the
    // same thing twice should leave one entry to walk back through, not two
    // identical ones that take two presses to get past.
    const { el, release } = mountWithHeldRun();
    enter(el, "same words");
    await flush();
    enter(el, "same words");
    await flush();

    composer(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, composed: true }),
    );
    await flush();

    const up = (): void => {
      composer(el).dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, composed: true }),
      );
    };
    up();
    expect(composer(el).value).toBe("same words");
    // One entry, so a second press walks off the end and holds rather than
    // finding a duplicate behind the first.
    up();
    expect(composer(el).value).toBe("same words");

    release();
    await flush();
  });

  it("queues nothing for an attachment with no words", async () => {
    // An attachment is settled state the tray is holding, and the composer has
    // no second copy of it -- parking one here would mean deciding what happens
    // when the user then removes the chip. It simply stays in the tray, which
    // is where it already was.
    const { el, release } = mountWithHeldRun({
      // Both before connect: the tray is wired once, at connect, so an
      // attachments URL set afterwards arrives too late to build one.
      attributes: { "data-attachments-url": "/uploads/" },
      uploadHandler: async (file: File) => ({
        id: file.name,
        name: file.name,
        mime: file.type,
        size: file.size,
      }),
    });
    enter(el, "first");
    await flush();

    el.attachFile(new File(["x"], "note.txt", { type: "text/plain" }));
    await flush();
    expect(el.shadowRoot?.querySelectorAll(".attachment-chip").length).toBe(1);
    composer(el).dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, composed: true }),
    );

    expect(chips(el)).toEqual([]);
    release();
    await flush();
  });

  it("keeps the row out of the way when nothing is waiting", async () => {
    const { el, release } = mountWithHeldRun();
    const row = el.shadowRoot?.querySelector(".queued") as HTMLElement;
    expect(row.hidden).toBe(true);

    enter(el, "first");
    await flush();
    enter(el, "waiting");
    expect(row.hidden).toBe(false);

    release();
    await flush();
    expect(row.hidden).toBe(true);
  });
});
