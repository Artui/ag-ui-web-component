import { randomUUID } from "@ag-ui/client";
import { contentToText, type Message } from "@ag-ui/core";
import { MESSAGE_ROLE, TOOL_CALL_STATUS, TOOL_OUTCOME } from "../../constants.js";
import type { ActivityRegistry } from "../../core/activity_registry.js";
import type { AgUiClient } from "../../core/agui_client.js";
import { messageAttachments } from "../../core/attachment.js";
import type { ClientSeed } from "../../core/client_seed.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
} from "../../core/conversation_store.js";
import type { MessageRole } from "../../core/message_role.js";
import { RunIndex } from "../../core/run_index.js";
import { toolStatusFromOutcome } from "../../core/tool_outcome.js";
import { answerUnansweredCalls, metadataOrTopLevel, mintThread } from "../../core/utils.js";
import type { ToolCatalog } from "../../tools/tool_catalog.js";
import type { AnswerActions } from "../transcript/answer_actions.js";
import { renderAttachmentChips } from "../transcript/attachment_chips.js";
import type { Transcript } from "../transcript/transcript.js";
import type { UiStrings } from "../ui_strings.js";
import type { CheckpointMenu, CheckpointVerb } from "./checkpoint_menu.js";
import type { RelativeTimeFormatter } from "./relative_time.js";
import type { ThreadDrawer } from "./thread_drawer.js";

/** What conversation history needs from the element that owns it. */
export interface ConversationHistoryHost {
  /**
   * The custom element: the attributes history reads and stamps, and the
   * `this` a host's `agentFactory` and `navigationResult` are called with.
   */
  readonly element: HTMLElement;
  /** The conversation list, which the element builds and renders. */
  readonly drawer: ThreadDrawer;
  /** The checkpoint panel, which the element builds and renders. */
  readonly checkpoints: CheckpointMenu;
  /** The transcript a restored conversation is replayed into. */
  readonly transcript: Transcript;
  /** The action row under each finished answer. */
  readonly actions: AnswerActions;
  /** The activity renderers, which redraw a restored activity. */
  readonly activities: ActivityRegistry;
  /** The frontend tools, whose renderers a restored call is redrawn with. */
  readonly tools: ToolCatalog;
  /** The composer, whose text a continuation sends. */
  readonly input: HTMLTextAreaElement;
  /** The one-line hint above the composer. */
  readonly hint: HTMLDivElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** The element's `conversationStore`, read per use. */
  readonly conversationStore: () => ClientConversationStore;
  /** The element's `formatRelativeTime`. */
  readonly formatRelativeTime: () => RelativeTimeFormatter | null;
  /** The element's `navigationResult`. */
  readonly navigationResult: () => (checkpoint: NavigationCheckpoint) => unknown;
  /** The request headers, having first reported the destination if it is foreign. */
  readonly headersFor: (url: string) => Record<string, string>;
  /** The configured cookie policy as `fetch` spells it. */
  readonly requestCredentials: () => RequestCredentials | undefined;
  /** The element's `appendMessage`, which a restored bubble opens through. */
  readonly appendMessage: (role: MessageRole, content: string) => HTMLDivElement;
  /** Resize the composer to its content. */
  readonly autoGrow: () => void;
  /**
   * A continuation has ended, whether or not it ever ran.
   *
   * The composer parks a turn typed while one is in flight, and learns a run
   * has settled from its own events -- which never arrive for a continuation
   * that failed before starting one. Without this, such a turn stayed parked
   * with nothing left to release it.
   */
  readonly continuationEnded: () => void;
  /** The conversation's own client, or `null` until one is built. */
  readonly client: () => AgUiClient | null;
  /** The conversation's own client, built on first use. */
  readonly ensureClient: () => AgUiClient;
  /**
   * A client from the same construction as the conversation's own, differing
   * only in what `seed` says. A continuation's comes from here so that nothing
   * added to one can be missing from the other.
   */
  readonly buildClient: (seed: ClientSeed) => AgUiClient;
  /**
   * Forget the conversation's own client, so the next one is built from
   * {@link ConversationHistory.restored}. Nothing is cancelled: this is for a
   * client that is not running.
   */
  readonly releaseClient: () => void;
  /** Whether an interaction is in flight, which the composer owns. */
  readonly running: () => boolean;
  /** Stop the in-flight run. */
  readonly cancelRun: () => void;
  /** Drop the in-memory run and transcript, leaving the thread untouched. */
  readonly resetState: () => void;
  /** Swap the composer between Send and Stop, which the composer owns. */
  readonly setRunning: (running: boolean) => void;
}

/**
 * Which conversation is on screen, and how one gets there: restoring it from
 * the store, switching to another from the conversation list, and continuing
 * a run from the checkpoint panel.
 *
 * The one writer of the active thread's id and of the messages a restore
 * seeded the next client with. The element reads both when it builds its
 * client, and asks for a transition -- adopt the store's thread, mint a new
 * one -- rather than writing either. Clearing the run, the transcript and the
 * composer around a transition stays the element's, because it spans every
 * part of it; history calls back for that.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ConversationHistory {
  readonly #host: ConversationHistoryHost;
  /** The active thread's id. Empty until the element connects. */
  #threadId = "";
  /**
   * The conversation as last written for the next client the element builds to
   * start from: what the last restore replayed, or what a checkpoint
   * continuation last saved after it. Emptied with the rest of the in-memory run.
   */
  #restored: readonly Message[] = [];
  /**
   * Counts the conversations cleared away, so a continuation can tell whether
   * the one it continued is still on screen when it saves.
   */
  #cleared = 0;
  // Bumped on every rehydrate; a replay whose generation is stale (a newer
  // thread switch started while it awaited a slow store) drops its result.
  #generation = 0;
  /** Built lazily from `data-runs-url`; `null` when the host didn't opt in. */
  #runIndex: RunIndex | null = null;
  /**
   * The checkpoint continuation in flight, so stopping the conversation's run
   * reaches it. `null` when none is running.
   */
  #continuation: AgUiClient | null = null;

  constructor(host: ConversationHistoryHost) {
    this.#host = host;
  }

  /** The active thread's id. */
  get threadId(): string {
    return this.#threadId;
  }

  /** The conversation as last written, for seeding the next client. */
  get restored(): readonly Message[] {
    return this.#restored;
  }

  /** The checkpoint continuation in flight, or `null` when none is running. */
  get continuation(): AgUiClient | null {
    return this.#continuation;
  }

  /** Point at the thread the store says is active. */
  adoptActiveThread(): void {
    this.#threadId = this.#host.conversationStore().threadId();
  }

  /** Make a freshly minted thread the active one. */
  startThread(): void {
    this.#threadId = mintThread(this.#host.conversationStore());
  }

  /**
   * Stop the checkpoint continuation in flight, if there is one.
   *
   * A continuation runs on a client of its own, which the element never held,
   * so Stop cancelled the conversation's client and left this one streaming:
   * the button read Stop and did nothing, and New chat, a thread switch or
   * removing the element carried on drawing the resumed answer into whatever
   * came next. The element calls this wherever it stops its own run.
   */
  stopContinuation(): void {
    this.#continuation?.cancel();
    this.#continuation = null;
  }

  /** Forget the messages the last restore seeded, with the rest of the run. */
  forgetRestored(): void {
    this.#restored = [];
    // The element clears the conversation through here, so a continuation
    // still saving afterwards learns the conversation is no longer this one.
    this.#cleared += 1;
  }

  /** Delete the active thread if nothing was ever sent in it. */
  reapUnsent(): void {
    // A thread nothing was ever sent in has nothing to come back to, and the
    // drawer never listed it — so reap it here rather than strand one record
    // per press of a button whose whole use is being pressed again.
    if (this.#host.conversationStore().isUnsent?.(this.#threadId) === true) {
      this.#host.conversationStore().clear(this.#threadId);
    }
  }

  /** The run index, built once from `data-runs-url`; `null` when unset. */
  runs(): RunIndex | null {
    const url = this.#host.element.getAttribute("data-runs-url");
    if (url === null || url === "") {
      return null;
    }
    if (this.#runIndex === null) {
      this.#runIndex = new RunIndex(
        url,
        () => this.#host.headersFor(url),
        () => this.#host.requestCredentials(),
      );
    }
    return this.#runIndex;
  }

  /** Open the conversation list, dismissing the checkpoint panel. */
  openThreads(): void {
    // Two overlapping surfaces, so opening one dismisses the other. Clicking away
    // already covers the built-in buttons, but a host driving its own chrome
    // through these methods raises no pointer event — and the drawer would then
    // open *underneath* a popover still floating over it.
    this.#host.checkpoints.close();
    void this.refreshDrawer();
    this.#host.drawer.open();
  }

  /** Open the checkpoint panel, dismissing the conversation list. */
  openCheckpoints(): void {
    // The other half of the pair — see `openThreads`.
    this.#host.drawer.close();
    void this.#refreshCheckpoints();
    this.#host.checkpoints.open();
  }

  /** Switch the active conversation to an existing thread and replay it. */
  async switchThread(threadId: string): Promise<void> {
    if (threadId === this.#threadId) {
      return;
    }
    this.#host.cancelRun();
    this.#host.resetState();
    this.#host.conversationStore().setActiveThread(threadId);
    this.#threadId = threadId;
    this.#host.setRunning(false);
    await this.rehydrate();
  }

  /** Rename a thread, then reload the list that shows its title. */
  renameThread(threadId: string, title: string): void {
    this.#host.conversationStore().renameThread(threadId, title);
    void this.refreshDrawer();
  }

  /** Delete a thread; if it was the active one, fall back to a fresh chat. */
  deleteThread(threadId: string): void {
    const wasActive = threadId === this.#threadId;
    if (wasActive) {
      this.#host.cancelRun();
    }
    this.#host.conversationStore().clear(threadId);
    if (wasActive) {
      this.#host.resetState();
      this.adoptActiveThread();
      this.#host.setRunning(false);
    }
    void this.refreshDrawer();
  }

  /** Reload the drawer's thread list, marking the active thread. */
  async refreshDrawer(): Promise<void> {
    this.#host.drawer.setRelativeTimeFormatter(this.#host.formatRelativeTime());
    this.#host.drawer.setThreads(
      await this.#host.conversationStore().listThreads(),
      this.#threadId,
    );
  }

  /** Load the checkpoint panel with the runs that can actually be continued. */
  async #refreshCheckpoints(): Promise<void> {
    const index = this.runs();
    // Pushed at render rather than at connect: `formatRelativeTime` is a
    // property, so a host may set it long after the element mounted.
    this.#host.checkpoints.setRelativeTimeFormatter(this.#host.formatRelativeTime());
    this.#host.checkpoints.setRuns(index === null ? [] : await index.continuable());
  }

  /**
   * Continue `runId` as a **new** run, seeded server-side from its snapshot.
   *
   * Uses a short-lived agent pointed at the resume / fork endpoint and seeded
   * with no history, because those endpoints supply the prior turns from the
   * snapshot and re-sending them would duplicate. A separate agent makes that
   * structural and mints the fresh `run_id` the endpoints also require.
   *
   * Built by the same construction as the conversation's own client, so the
   * continuation streams into the same transcript the user is looking at and
   * runs under the same state, tools and bounds. It is the run in flight while
   * it lasts: {@link stopContinuation} is how the element's Stop reaches it.
   *
   * What it adds joins the conversation. Its saves write the conversation on
   * screen ahead of its exchange, and each one hands that whole list to the
   * next client the element builds, so the next ordinary message is sent with
   * the exchange it follows. The conversation's own client never held it, and
   * was sending without it.
   */
  async continueRun(runId: string, verb: CheckpointVerb): Promise<void> {
    const index = this.runs();
    if (index === null) {
      // Unreachable from the built-in control: the header button is only
      // rendered when `runs()` is configured, so a row to pick cannot exist
      // without one. A host calling `openCheckpoints()` regardless gets the
      // documented empty panel, which has no rows either. Typed, not silent.
      return;
    }
    if (this.#host.running() || this.#continuation !== null) {
      // Refused rather than started beside it. The panel opens and its rows
      // take a pick while a run streams, and a second run would draw its answer
      // into the turn still arriving; a second continuation would also replace
      // the one Stop reaches, leaving the first streaming where nothing could
      // end it. Nor is the earlier run cancelled for it: a pick in a panel is not
      // a Stop, and what is streaming may be the answer the user is waiting on.
      //
      // Both checks, because they see different moments. `running` is the
      // composer's own state and spans every round of an interaction, but it
      // is set when the run's first event arrives; a continuation is recorded
      // here the moment it starts.
      //
      // Said at the composer, as an empty composer is below, because the row
      // closed the panel before this ran. The typed turn stays where it is --
      // it is what the user wants sent once the run is done -- and the caret
      // goes back to it, where Escape stops the run.
      this.#refuse(this.#host.strings().continueWhileRunning);
      return;
    }
    const content = this.#host.input.value.trim();
    if (content === "") {
      // A continuation sends *only* the next turn -- the snapshot supplies
      // everything before it -- so with an empty composer there is nothing to
      // send. Returning here was the same failure the endpoint guard above had:
      // the row's button closes the panel before this runs, so the widget
      // visibly reacted and then did nothing, which reads as a resume that was
      // attempted and lost rather than one that never started.
      //
      // Said at the composer rather than in the transcript, because that is
      // where the fix goes and because the hint clears itself on the first
      // keystroke -- a transcript notice for a recoverable slip would outlive
      // the slip. Focus follows for the same reason applying a skill moves it when
      // a template is short of a field.
      this.#refuse(this.#host.strings().continueNeedsTurn);
      return;
    }
    this.#host.input.value = "";
    this.#host.autoGrow();
    const cleared = this.#cleared;
    const client = this.#host.buildClient({
      endpoint: verb === "resume" ? index.resumeUrl(runId) : index.forkUrl(runId),
      // The seed the endpoints assume: nothing. The snapshot is the history.
      initialMessages: [],
      // What its saves write ahead of the exchange: the conversation on screen,
      // in the form the store holds it. From the conversation's own client when
      // there is one, because that client keeps how each call ended beside its
      // messages rather than on them; otherwise what the last restore or
      // continuation wrote, which is already in that form.
      //
      // All of it, even where this forks an earlier run and the server's
      // snapshot stops there: what is saved is what the screen shows.
      follows: this.#host.client()?.messages ?? this.#restored,
      onSaved: (conversation) => {
        // A continuation stopped by New chat or a thread switch saves once its
        // request closes, into its own thread; the conversation now on screen
        // is not the one it continued.
        if (cleared !== this.#cleared) {
          return;
        }
        // The conversation's own client holds the conversation without this
        // exchange, and would send it that way. Released rather than patched:
        // the next client is built from this list exactly as a reload builds
        // one from the store, outcomes included.
        //
        // Nothing can run on the released client in between, because the
        // composer refuses to start one while a continuation is in flight --
        // it parks the turn instead. It said here that only a script in the
        // same task could, which was wrong by a whole request: `running` does
        // not turn on until the continuation's first event, and a person who
        // typed in that window got a second run against the snapshot
        // `follows` had already frozen, so whichever saved last dropped the
        // other's turn.
        this.#restored = conversation;
        this.#host.releaseClient();
      },
    });
    this.#continuation = client;
    try {
      await client.send(content);
    } finally {
      // Only if it is still the one in flight: stopping forgets it at once, and
      // a continuation started after that one is not this one to forget.
      //
      // In a finally because the send can fail before its run ever starts. The
      // first save goes through the host's `conversationStore` synchronously
      // inside it, and a store is the host's to replace: the built-in one
      // swallows a write the browser refused, a server-backed one need not. A
      // throw there left this pointing at a client that would never run, so
      // every later pick was refused with no Stop to clear it -- the composer's
      // button is Send until a run reports a start -- and `#liveClient` went on
      // handing that dead client the shared state a host wrote.
      if (this.#continuation === client) {
        this.#continuation = null;
        this.#host.continuationEnded();
      }
    }
  }

  /**
   * Say at the composer why a picked run did not continue, and put the caret
   * there. The hint clears itself on the next keystroke.
   */
  #refuse(reason: string): void {
    this.#host.hint.textContent = reason;
    this.#host.hint.hidden = false;
    this.#host.input.focus();
  }

  /**
   * Restore the conversation from the store on mount, then — if a navigating
   * tool reloaded the page mid-run — resume the loop by supplying that tool's
   * result from the page we landed on.
   *
   * Any other call the stored run left unanswered is answered on the way in, as
   * not finished, because no run is left to answer it.
   *
   * **What the store holds after a reload mid-run.** The run loop persists a
   * round when its stream ends, which is *before* it asks about a gated call,
   * runs a frontend tool, or collects a server-side approval. A reload in that
   * window leaves the round's calls stored with no result, and the request that
   * would have produced one died with the page.
   *
   * **Why not finished, and not declined.** Stop declines an open card because
   * pressing it is a person answering the question. A reload answers nothing, and
   * the stored shape is the same whether the round waited on a person or on a
   * handler the reload killed, so declined would be unproven for the first and
   * false for the second. A marker saved while a card is open could tell them
   * apart, but every host store would have to round-trip it, and a store that
   * dropped it would fall back to this wording anyway -- which is true of both.
   *
   * The answers come from the same helper the client runs before each request,
   * so a restored card and the result the next request carries cannot disagree.
   * Giving them to the replay, rather than leaving the client to add them, is
   * what settles each card from its result. The checkpointed call is excluded,
   * because the resume path answers it from the page the reload landed on; that
   * exclusion is held by "resumes with the landed page's result, and its card says
   * so" in `ag_ui_chat_reload_mid_run.test.ts`.
   */
  async rehydrate(): Promise<void> {
    // Guard against a thread-switch race: with a slow remote store, picking
    // thread B then C would interleave both replays into one transcript. Each
    // rehydrate claims a generation before awaiting and bails if a newer one
    // started meanwhile (its reset already cleared the transcript).
    this.#generation += 1;
    const generation = this.#generation;
    // Held while the store answers. A remote store answers after first paint,
    // and a conversation it is still fetching is more likely to have messages
    // than not, so without this the page would paint the greeting and a centred
    // composer and then drop the composer the moment they land. The built-in
    // store answers in a microtask, before paint, so for it this never reaches
    // the screen. Released in `finally` so a store that rejects cannot leave the
    // layout held for good, and only by the restore that is still current.
    this.#host.element.setAttribute("data-restoring", "");
    let messages: readonly Message[] | null;
    try {
      messages = await this.#host.conversationStore().loadMessages(this.#threadId);
    } finally {
      if (generation === this.#generation) {
        this.#host.element.removeAttribute("data-restoring");
      }
    }
    if (generation !== this.#generation) {
      return;
    }
    // Read before the replay rather than after it: the checkpointed call is the
    // one unanswered call a reload was *expected* by, and the replay has to know
    // which it is so as not to settle it as abandoned.
    const checkpoint = this.#host.conversationStore().loadCheckpoint(this.#threadId);
    if (messages !== null) {
      const unfinished = this.#host.strings().callNotFinished;
      const restored = answerUnansweredCalls(
        messages,
        // The shape the store holds for a call the client answered the same way:
        // its tool message, with the outcome in its metadata.
        (toolCallId) => ({
          id: randomUUID(),
          role: "tool",
          content: unfinished,
          toolCallId,
          metadata: { outcome: TOOL_OUTCOME.INTERRUPTED },
        }),
        new Set(checkpoint === null ? [] : [checkpoint.toolCallId]),
      );
      this.#restored = restored;
      for (const message of restored) {
        this.replay(message);
      }
    }
    if (checkpoint !== null) {
      await this.#resumeFrom(checkpoint);
      return;
    }
    this.#noticeIfRunUnfinished(messages);
  }

  /**
   * Notice a previous run that never produced a response.
   *
   * {@link AgUiClient.send} persists the user's message before starting the
   * run, so a transcript ending on that user message means nothing came back.
   * The transcript's shape alone detects it, needing no store method and no
   * `pagehide` listener — neither of which fires on a crash or force-quit.
   *
   * An agent-initiated reload is not this case: a navigating tool leaves a
   * checkpoint and resumes, so the caller returns early on one.
   *
   * Deliberately a notice, never a resume. AG-UI has no resume-an-aborted-run
   * primitive, and re-sending the accumulated messages is semantically a new
   * run, so any server-side tool already executed would run a second time.
   */
  #noticeIfRunUnfinished(messages: readonly Message[] | null): void {
    const last = messages?.at(-1);
    if (last === undefined || last.role !== MESSAGE_ROLE.USER) {
      return;
    }
    this.#host.transcript.appendNotice("⚠", this.#host.strings().runInterrupted, "interrupted");
  }

  /**
   * Replay a restored message: text bubbles *and* tool activity. An assistant
   * turn may carry `toolCalls` (rendered as cards) and/or text; a `tool` turn
   * carries a result that settles the matching card. So a refreshed page shows
   * the full transcript — tool calls and their results — not just the prose.
   */
  replay(message: Message): void {
    const text = typeof message.content === "string" ? message.content : "";
    if (message.role === MESSAGE_ROLE.USER) {
      const attachments = messageAttachments(message);
      if (text !== "" || attachments.length > 0) {
        const bubble = this.#host.appendMessage(MESSAGE_ROLE.USER, text);
        if (attachments.length > 0) {
          bubble.appendChild(renderAttachmentChips(attachments));
        }
      }
      return;
    }
    if (message.role === MESSAGE_ROLE.ASSISTANT) {
      if (text !== "") {
        // Restored history must appear statically — entrance animations
        // (fade / word) are for freshly-arriving messages. On reload the whole
        // transcript mounts at once, so animating every bubble's text in
        // parallel looks wrong. Mark it so the fade CSS skips it, and don't
        // wrap words.
        const restoredBubble = this.#host.appendMessage(MESSAGE_ROLE.ASSISTANT, text);
        restoredBubble.classList.add("message--restored");
        this.#host.actions.attach(restoredBubble);
      }
      // Narrowed rather than trusted, for the same reason `messageAttachments`
      // narrows the neighbouring field: anything that throws in this loop aborts
      // the replay at this message, and every later turn silently disappears from
      // the transcript. See `restoredToolCalls`.
      for (const call of restoredToolCalls(message.toolCalls)) {
        const restored = {
          id: call.id,
          name: call.function.name,
          args: this.#parseArgs(call.function.arguments),
        };
        // Restored history goes through the same interception as the live
        // stream — otherwise a reload resurrects the raw `load_capability`
        // card the live path deliberately replaced.
        if (this.#host.transcript.noticeIfSkillLoad(restored)) {
          continue;
        }
        this.#host.transcript.setCardElement(
          restored.id,
          this.#host.transcript.cardFor(restored).element,
        );
        // Only `render` is replayed, never `handler`. A restored transcript
        // redraws what the call drew; it must not re-run what the call *did*.
        // Only the renderer is handed over, never the tool. The guarantee that
        // a reload cannot re-run a tool's *effect* is worth more than a comment
        // saying so: this signature cannot reach `handler`, so a later
        // maintainer adding a "no render? fall back to the handler" convenience
        // here has to change the type first, which is exactly the moment the
        // question should be asked.
        const render = this.#host.tools.resolve(restored.name)?.render;
        if (render !== undefined) {
          this.#host.transcript.renderToolOutput(render, restored);
        }
      }
      return;
    }
    if (message.role === "activity") {
      // The client materialises a pushed activity as a message of its own, so a
      // chart's data is in the transcript already and survives a reload. Only
      // the drawing had to be put back.
      const activity = message as unknown as { activityType?: unknown; content?: unknown };
      if (typeof activity.activityType === "string") {
        this.#host.activities.draw(message.id, activity.activityType, activity.content);
      }
      return;
    }
    if (message.role === "tool") {
      const card = this.#host.transcript.card(message.toolCallId);
      if (card !== undefined) {
        // The outcome in the message's metadata -- folded there from a server's
        // result by `@ag-ui/client`, or written there by `AgUiClient` for a
        // result it made itself -- read back through the same mapping the live
        // path uses, so a card that said "declined" before the reload still
        // says it after. History stored by an earlier release has it at the
        // top level instead, which is read when the metadata has none. Narrowed
        // off `unknown` rather than trusted, like every other field read out of
        // the store: metadata is open by key, a host store may not round-trip
        // it, and history written before outcomes existed has none. All three
        // land on DONE, which is what this line did unconditionally.
        card.settle(
          toolStatusFromOutcome(metadataOrTopLevel(message, "outcome")),
          // Flattened exactly as the live path flattens it, so a reload shows
          // the card the user watched settle.
          contentToText(message.content),
        );
      }
    }
  }

  /** Parse a tool call's JSON `arguments` from history into an object. */
  #parseArgs(raw: unknown): Record<string, unknown> {
    if (typeof raw !== "string") {
      // A restored call whose `arguments` are missing or not a string still has
      // a name worth showing, so this renders an empty-args card rather than
      // dropping the card.
      return {};
    }
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Malformed history — fall back to empty args rather than failing replay.
    }
    return {};
  }

  /**
   * Complete the checkpointed navigating tool call and continue the run.
   *
   * The call's card is settled here, from the result the continuation carries.
   * The restore left it open on purpose -- it is the one call a reload was
   * expected by -- and nothing after this answers it: the run that follows
   * streams no result for a call the client answered itself. Left open, it
   * spun through the whole continuation, and the sweep that closes a run then
   * found it pending and called it not finished -- on the one call known to
   * have finished, since the page it moved to is the page doing the asking.
   *
   * Settled from the string the stored message holds, and with no outcome,
   * since `addToolResult` writes none, so the card is the one a later reload
   * draws from that message. The card can be missing, when the stored
   * transcript does not hold the call -- a store that kept the checkpoint and
   * lost the turn that made it -- and then there is nothing to settle. That
   * guard is held by "resumes a checkpointed navigating tool call on mount" in
   * `ag_ui_chat.test.ts`, whose transcript never made the call.
   */
  async #resumeFrom(checkpoint: NavigationCheckpoint): Promise<void> {
    this.#host.conversationStore().saveCheckpoint(this.#threadId, null);
    const client = this.#host.ensureClient();
    // Called on the element, as `this.navigationResult(...)` always was.
    const landed = JSON.stringify(
      this.#host.navigationResult().call(this.#host.element, checkpoint),
    );
    client.addToolResult(checkpoint.toolCallId, landed);
    this.#host.transcript.card(checkpoint.toolCallId)?.settle(TOOL_CALL_STATUS.DONE, landed);
    await client.resume();
  }
}

/** One tool call as a restored assistant message carries it. */
interface RestoredToolCall {
  readonly id: string;
  readonly function: { readonly name: string; readonly arguments?: unknown };
}

/**
 * The tool calls a restored assistant turn carries, with anything shapeless dropped.
 *
 * Narrowing here rather than trusting the declared type, for three reasons that
 * point the same way.
 *
 * **`null` is a value this field really takes.** `@ag-ui/core` types `toolCalls`
 * as optional (`z.ZodOptional`), so TypeScript offers only `undefined` — but the
 * protocol's Python models declare `tool_calls: list[ToolCall] | None`, and a
 * server dumping them without `exclude_none` sends `null`. The two SDKs disagree
 * about the wire, and a client cannot afford to take either one's word for it.
 *
 * **A throw here costs the rest of the transcript.** This runs inside the replay
 * of stored history, one message at a time; an exception aborts the whole replay,
 * so a single bad entry silently truncates the conversation from that point on —
 * with no error state and nothing on screen to explain the gap.
 *
 * **Storage is untrusted anyway** — hand-edited, truncated, written by an older
 * version, or supplied by a host's own store. `messageAttachments` already takes
 * exactly this stance for the neighbouring field on the same message.
 */
function restoredToolCalls(value: unknown): readonly RestoredToolCall[] {
  return Array.isArray(value) ? value.filter(isRestoredToolCall) : [];
}

/** Whether an unknown history entry has enough shape to render a tool card. */
function isRestoredToolCall(value: unknown): value is RestoredToolCall {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const call = value as { id?: unknown; function?: { name?: unknown } };
  return typeof call.id === "string" && typeof call.function?.name === "string";
}
