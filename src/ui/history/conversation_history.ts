import type { Message } from "@ag-ui/core";
import { MESSAGE_ROLE } from "../../constants.js";
import type { ActivityRegistry } from "../../core/activity_registry.js";
import { AgUiClient } from "../../core/agui_client.js";
import { messageAttachments } from "../../core/attachment.js";
import type {
  ClientConversationStore,
  NavigationCheckpoint,
} from "../../core/conversation_store.js";
import type { AgentFactory } from "../../core/create_http_agent.js";
import type { MessageRole } from "../../core/message_role.js";
import type { RunHandlers } from "../../core/run_handlers.js";
import { RunIndex } from "../../core/run_index.js";
import { toolStatusFromOutcome } from "../../core/tool_outcome.js";
import { mintThread } from "../../core/utils.js";
import type { ToolCatalog } from "../../tools/tool_catalog.js";
import type { ToolDispatch } from "../../tools/tool_dispatch.js";
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
  /** Tool execution, which a continuation's client is handed. */
  readonly dispatch: ToolDispatch;
  /** The run's event handlers, which a continuation streams through. */
  readonly runHandlers: RunHandlers;
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
  /** The element's `agentFactory`. */
  readonly agentFactory: () => AgentFactory;
  /** The element's `trustedOrigins`. */
  readonly trustedOrigins: () => readonly string[];
  /** The headers for the request about to go out. */
  readonly requestHeaders: () => Record<string, string>;
  /** The request headers, having first reported the destination if it is foreign. */
  readonly headersFor: (url: string) => Record<string, string>;
  /** The configured cookie policy as `fetch` spells it. */
  readonly requestCredentials: () => RequestCredentials | undefined;
  /** The `credentials` entry for an agent factory call, or nothing at all. */
  readonly credentialsOption: () => { credentials?: RequestCredentials };
  /** The element's `appendMessage`, which a restored bubble opens through. */
  readonly appendMessage: (role: MessageRole, content: string) => HTMLDivElement;
  /** Resize the composer to its content. */
  readonly autoGrow: () => void;
  /** The conversation's own client, built on first use. */
  readonly ensureClient: () => AgUiClient;
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
   * The messages the last restore replayed, which seed the next client the
   * element builds. Emptied with the rest of the in-memory run.
   */
  #restored: readonly Message[] = [];
  // Bumped on every rehydrate; a replay whose generation is stale (a newer
  // thread switch started while it awaited a slow store) drops its result.
  #generation = 0;
  /** Built lazily from `data-runs-url`; `null` when the host didn't opt in. */
  #runIndex: RunIndex | null = null;

  constructor(host: ConversationHistoryHost) {
    this.#host = host;
  }

  /** The active thread's id. */
  get threadId(): string {
    return this.#threadId;
  }

  /** The messages the last restore replayed, for seeding the next client. */
  get restored(): readonly Message[] {
    return this.#restored;
  }

  /** Point at the thread the store says is active. */
  adoptActiveThread(): void {
    this.#threadId = this.#host.conversationStore().threadId();
  }

  /** Make a freshly minted thread the active one. */
  startThread(): void {
    this.#threadId = mintThread(this.#host.conversationStore());
  }

  /** Forget the messages the last restore seeded, with the rest of the run. */
  forgetRestored(): void {
    this.#restored = [];
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
   * structural — the main agent keeps its own history — and mints the fresh
   * `run_id` the endpoints also require.
   *
   * Handlers come from the same run handlers as the conversation's own client,
   * so the continuation streams into the same transcript the user is looking at.
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
      this.#host.hint.textContent = this.#host.strings().continueNeedsTurn;
      this.#host.hint.hidden = false;
      this.#host.input.focus();
      return;
    }
    this.#host.input.value = "";
    this.#host.autoGrow();
    const endpoint = verb === "resume" ? index.resumeUrl(runId) : index.forkUrl(runId);
    // Called on the element, as `this.agentFactory(...)` always was.
    const agent = this.#host.agentFactory().call(this.#host.element, {
      endpoint,
      headers: this.#host.requestHeaders(),
      getHeaders: () => this.#host.requestHeaders(),
      trustedOrigins: this.#host.trustedOrigins(),
      ...this.#host.credentialsOption(),
      threadId: this.#threadId,
      // The seed the endpoints assume: nothing. The snapshot is the history.
      initialMessages: [],
    });
    const client = new AgUiClient({
      agent,
      handlers: this.#host.runHandlers.forClient(),
      getTools: () => this.#host.tools.advertise(),
      getContext: () => this.#host.dispatch.buildContext(),
      executeTool: (call) => this.#host.dispatch.execute(call),
      resolveInterrupts: (interrupts) => this.#host.dispatch.resolveInterrupts(interrupts),
      connectionLostMessage: this.#host.strings().connectionLost,
    });
    await client.send(content);
  }

  /**
   * Restore the conversation from the store on mount, then — if a navigating
   * tool reloaded the page mid-run — resume the loop by supplying that tool's
   * result from the page we landed on.
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
    if (messages !== null) {
      this.#restored = messages;
      for (const message of messages) {
        this.replay(message);
      }
    }
    const checkpoint = this.#host.conversationStore().loadCheckpoint(this.#threadId);
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
        // The outcome `AgUiClient` annotated onto the persisted message, read
        // back through the same mapping the live path uses -- so a card that
        // said "declined" before the reload still says it after. Narrowed off
        // `unknown` rather than trusted, like every other field read out of the
        // store: `Message` does not declare it, a host store may not round-trip
        // it, and history written before this shipped has none. All three land
        // on DONE, which is what this line did unconditionally.
        card.settle(
          toolStatusFromOutcome((message as { outcome?: unknown }).outcome),
          message.content,
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

  /** Complete the checkpointed navigating tool call and continue the run. */
  async #resumeFrom(checkpoint: NavigationCheckpoint): Promise<void> {
    this.#host.conversationStore().saveCheckpoint(this.#threadId, null);
    const client = this.#host.ensureClient();
    client.addToolResult(
      checkpoint.toolCallId,
      // Called on the element, as `this.navigationResult(...)` always was.
      JSON.stringify(this.#host.navigationResult().call(this.#host.element, checkpoint)),
    );
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
