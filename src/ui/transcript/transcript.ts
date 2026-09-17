import { MESSAGE_ROLE, X_SUMMARY_KEY } from "../../constants.js";
import type { AgUiToolCall } from "../../core/agui_client.js";
import type { MessageRole } from "../../core/message_role.js";
import { skillNameFrom } from "../../skills/skill_name_from.js";
import type { ChartRenderer, ClientTool } from "../../tools/client_tool_registry.js";
import { attachCopyButtons } from "../excerpts/attach_copy_buttons.js";
import { fillUiString } from "../fill_ui_string.js";
import { prettifyToolName } from "../progress/prettify_tool_name.js";
import { renderRunNotice } from "../progress/run_notice.js";
import { ThoughtsBlock } from "../progress/thoughts_block.js";
import { ToolCallCard, type ToolPayload } from "../progress/tool_call_card.js";
import type { UiStrings } from "../ui_strings.js";
import { renderMarkdown } from "./render_markdown.js";
import { renderOrWarn } from "./render_or_warn.js";
import { wrapWords } from "./reveal_words.js";
import { createStickToBottom, type StickToBottom } from "./stick_to_bottom.js";

/** What the transcript needs from the element that owns it. */
export interface TranscriptHost {
  /** The custom element: its text-animation attribute, and the `data-empty` stamp. */
  readonly element: HTMLElement;
  /** The scrolling message list. */
  readonly messages: HTMLDivElement;
  /** The empty-state region at the top of the list. */
  readonly emptyWrap: HTMLDivElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** The element's `allowImages`, read per render. */
  readonly allowImages: () => boolean;
  /** Resolve a frontend tool by name, for its `x-summary`. */
  readonly resolveTool: (name: string) => ClientTool | null;
  /** The element's `toolSummaries`, read per card. */
  readonly toolSummaries: () => Record<string, string>;
  /** The server catalog's label for a tool, if it sent one. */
  readonly serverSummary: (name: string) => string | undefined;
  /** The element's `formatToolPayload`, asked per region of a card. */
  readonly formatToolPayload: (payload: ToolPayload) => Node | string | null;
}

/**
 * The transcript: the bubbles, the open answer group, the pending dots, the
 * reasoning region, the tool cards by call id, and the scroller that follows
 * the foot.
 *
 * The hub most other parts of the element draw into, so it holds only the
 * transcript's own state and asks the element for nothing but configuration.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class Transcript {
  readonly #host: TranscriptHost;
  /** Tool-call cards awaiting execution, keyed by call id. */
  readonly #toolCards = new Map<string, ToolCallCard>();
  /** Card elements by call id, so a rendering handler can find its own card. */
  readonly #cardElements = new Map<string, HTMLElement>();
  /**
   * Call ids whose card was already settled from a streamed server-side result
   * (`TOOL_CALL_RESULT`), so the post-run executeTool sweep doesn't overwrite
   * the real output with the generic "executed on the server" fallback.
   */
  readonly #serverSettled = new Set<string>();
  /** Follows the foot of the transcript, and stops when the reader scrolls away. */
  #scroller!: StickToBottom;
  #pending: HTMLDivElement | null = null;
  // The current assistant turn's grouping container. One `.answer`
  // wraps everything a single answer produces — streamed text, tool cards, the
  // pending indicator — so it can be boxed as one "well" by CSS. Opened on the
  // turn's first run start, closed at settle, so it spans the whole multi-round
  // frontend-tool loop (which is several AG-UI runs), not one run. `null`
  // between turns; user bubbles never enter it.
  #currentGroup: HTMLDivElement | null = null;
  // The current turn's streamed-reasoning region, shown at the top of
  // the answer group while a reasoning model thinks and collapsed once the
  // answer's first text token arrives. `null` outside a reasoning turn.
  #thoughts: ThoughtsBlock | null = null;

  constructor(host: TranscriptHost) {
    this.#host = host;
  }

  /**
   * Start following the foot of the list, and wire the jump button to it.
   * Called while rendering rather than at construction: the viewport has to
   * exist and the observer has to have something to observe.
   */
  mountScroller(jumpButton: HTMLButtonElement): void {
    jumpButton.addEventListener("click", () => {
      this.jump();
    });
    this.#scroller = createStickToBottom({
      viewport: this.#host.messages,
      onMissedContent: (missed) => {
        jumpButton.dataset["missed"] = String(missed);
      },
    });
  }

  /** Stop following, when the element leaves the document. */
  disposeScroller(): void {
    this.#scroller.dispose();
  }

  /** Keep the list at its foot, if the reader is there. */
  follow(): void {
    this.#scroller.follow();
  }

  /** Go to the foot, whether or not the reader had scrolled away. */
  jump(): void {
    this.#scroller.jump();
  }

  /** Whether the empty-state region is showing, which is when nothing else is. */
  isEmpty(): boolean {
    return !this.#host.emptyWrap.hidden;
  }

  /** The card drawn for a call id, while it is still awaiting execution. */
  card(callId: string): ToolCallCard | undefined {
    return this.#toolCards.get(callId);
  }

  /** Every card still awaiting execution. */
  cards(): IterableIterator<ToolCallCard> {
    return this.#toolCards.values();
  }

  /** Stop tracking a call's card as awaiting execution. */
  forgetCard(callId: string): void {
    this.#toolCards.delete(callId);
  }

  /** Remember the element a call's card is, for a renderer to place itself against. */
  setCardElement(callId: string, element: HTMLElement): void {
    this.#cardElements.set(callId, element);
  }

  /** Record that a call's card was settled from a streamed server-side result. */
  markServerSettled(callId: string): void {
    this.#serverSettled.add(callId);
  }

  /** Whether a call's card was settled from a streamed server-side result. */
  isServerSettled(callId: string): boolean {
    return this.#serverSettled.has(callId);
  }

  /** Fold the reasoning region away, once the answer has begun. */
  collapseThoughts(): void {
    this.#thoughts?.collapse();
  }

  /**
   * Close the turn's answer group. Drop it if the turn rendered nothing
   * (e.g. a server-only round that streamed no text/card) so an opted-in
   * well leaves no empty box behind.
   */
  closeGroup(): void {
    if (this.#currentGroup !== null && this.#currentGroup.childElementCount === 0) {
      this.#currentGroup.remove();
      this.updateEmptyState();
    }
    this.#currentGroup = null;
    this.#thoughts = null;
  }

  /**
   * Let go of the open turn: its group, its reasoning region, its pending dots
   * and the cards awaiting execution. The first half of wiping the transcript.
   */
  releaseTurn(): void {
    this.#currentGroup = null;
    this.#thoughts = null;
    this.hidePending();
    this.#toolCards.clear();
  }

  /** Forget which cards settled from the server and where each card is. */
  forgetCards(): void {
    this.#serverSettled.clear();
    this.#cardElements.clear();
  }

  /** Empty the list back to its empty-state region. The last half of wiping it. */
  empty(): void {
    this.#host.messages.replaceChildren(this.#host.emptyWrap);
    this.updateEmptyState();
  }

  /** The bubble behind `AgUiChat.appendMessage`, whose doc is the contract. */
  append(role: MessageRole, content: string): HTMLDivElement {
    const bubble = document.createElement("div");
    bubble.className = `message message--${role}`;
    bubble.setAttribute("part", `message message-${role}`);
    if (role === MESSAGE_ROLE.ASSISTANT) {
      bubble.innerHTML = renderMarkdown(content, { allowImages: this.#host.allowImages() });
      // A finished bubble: rehydrated history, or a whole message appended at
      // once. The streaming bubble gets its buttons in onTextEnd instead.
      attachCopyButtons(bubble, this.#host.strings());
      this.ensureGroup().appendChild(bubble);
    } else {
      this.#currentGroup = null;
      bubble.textContent = content;
      this.#host.messages.appendChild(bubble);
    }
    this.updateEmptyState();
    // A user bubble means someone just pressed Send, which is as deliberate as
    // pressing the jump button -- so it goes to the bottom even if they had
    // scrolled away to re-read something before typing.
    if (role === MESSAGE_ROLE.USER) {
      this.jump();
    } else {
      this.follow();
    }
    return bubble;
  }

  /**
   * The open answer group, creating and appending it on first use. Everything a
   * single assistant turn renders (text, tool cards, the pending indicator)
   * goes inside it, so the opt-in `data-answer-well` styling can box the whole
   * turn. Idempotent across the turn's runs — it persists until the run's
   * settle closes it, see {@link closeGroup}.
   */
  ensureGroup(): HTMLDivElement {
    if (this.#currentGroup === null) {
      const group = document.createElement("div");
      group.className = "answer";
      group.setAttribute("part", "answer");
      this.#currentGroup = group;
      this.#host.messages.appendChild(group);
      this.updateEmptyState();
    }
    return this.#currentGroup;
  }

  /**
   * Word-by-word reveal for the `word` text-animation mode, applied to a
   * completed assistant bubble. `fade` is pure CSS (no JS); `none` is a no-op.
   */
  revealWords(bubble: HTMLDivElement): void {
    if (this.#host.element.getAttribute("data-text-animation") === "word") {
      wrapWords(bubble);
    }
  }

  /**
   * Hide the empty-state region once the message list holds anything else, and
   * say so on the host as `data-empty`.
   *
   * Stamped on the host because the layout has to answer it: where the
   * composer sits is decided outside the list this region lives in, and no
   * selector reaches from inside the list back up to the list's siblings. It is
   * also a documented styling hook for a host's own chrome around a full-page
   * chat.
   */
  updateEmptyState(): void {
    this.#host.emptyWrap.hidden = this.#host.messages.childElementCount > 1;
    this.#host.element.toggleAttribute("data-empty", !this.#host.emptyWrap.hidden);
  }

  /** A muted "⏹ Stopped" line in the transcript (distinct from the ⚠️ error bubble). */
  appendStoppedNote(): void {
    const note = document.createElement("div");
    note.className = "stopped-note";
    note.setAttribute("part", "stopped");
    note.setAttribute("role", "status");
    note.textContent = this.#host.strings().stopped;
    this.ensureGroup().appendChild(note);
    this.updateEmptyState();
    this.follow();
  }

  /**
   * Show a "thinking" indicator while the agent is being awaited — both the
   * silent stretch before the first token and the gap after a tool result
   * while the next round is requested. Idempotent.
   */
  showPending(): void {
    if (this.#pending !== null) {
      return;
    }
    const pending = document.createElement("div");
    pending.className = "pending";
    pending.setAttribute("part", "pending");
    pending.setAttribute("role", "status");
    pending.setAttribute("aria-label", this.#host.strings().thinking);
    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "pending-dot";
      pending.appendChild(dot);
    }
    this.#pending = pending;
    this.ensureGroup().appendChild(pending);
    this.updateEmptyState();
    this.follow();
  }

  /** Remove the pending indicator if shown. */
  hidePending(): void {
    this.#pending?.remove();
    this.#pending = null;
  }

  /**
   * The current turn's thoughts region, creating it (at the top of the answer
   * group, above any streamed text or tool cards) on first sight. Idempotent
   * across a turn's reasoning tokens.
   */
  showThoughts(): ThoughtsBlock {
    if (this.#thoughts === null) {
      this.#thoughts = new ThoughtsBlock(this.#host.strings());
      const group = this.ensureGroup();
      group.insertBefore(this.#thoughts.element, group.firstChild);
      this.updateEmptyState();
      this.follow();
    }
    return this.#thoughts;
  }

  /**
   * Render a skill notice for a `load_capability` call; ``true`` when handled.
   *
   * Shared by the live stream and history replay so the transcript looks the
   * same before and after a reload.
   */
  noticeIfSkillLoad(call: AgUiToolCall): boolean {
    const skill = skillNameFrom(call);
    if (skill === null) {
      return false;
    }
    this.appendNotice(
      "✨",
      fillUiString(this.#host.strings().usingSkill, { name: skill }),
      "skill",
    );
    return true;
  }

  /**
   * An inline notice about something the run did.
   *
   * Goes through {@link ensureGroup} like a tool card so it lands *inside* the
   * assistant turn it annotates rather than floating between turns, and does
   * the same empty-state and scroll bookkeeping afterwards.
   *
   * `undo` is offered only where the agent rearranged the user's own window --
   * see {@link renderRunNotice} for why a notice may carry that one control and
   * nothing else.
   */
  appendNotice(
    icon: string,
    text: string,
    kind: string,
    undo?: { readonly label: string; readonly onActivate: () => void },
  ): void {
    this.ensureGroup().appendChild(renderRunNotice(icon, text, kind, undo));
    this.updateEmptyState();
    this.follow();
  }

  /**
   * Place a tool's rendered node against its own card.
   *
   * Anchored rather than appended because a client tool's handler does not run
   * until the round is over: appending would put the node after everything the
   * model said next, visibly detached from the call that produced it, and in a
   * different order than the same transcript takes on reload. The card was
   * created inline, in the right place, so anchoring makes *when* the handler
   * runs stop mattering.
   */
  renderToolOutput(render: ChartRenderer, call: AgUiToolCall): void {
    const node = renderOrWarn(() => render(call.args), `tool ${call.name}`);
    if (node === null) {
      return;
    }
    // `after` rather than an insert-or-append branch: both callers set the card
    // element immediately before calling, and a parentless anchor makes `after`
    // a no-op, so the alternative would be a branch nothing can reach.
    this.#cardElements.get(call.id)?.after(node);
    this.afterGrew();
  }

  /** Update the empty state and follow the foot, after the transcript grew. */
  afterGrew(): void {
    this.updateEmptyState();
    this.follow();
  }

  /**
   * The card for ``call``, creating and appending it on first sight.
   *
   * The run's tool-call handler creates the card (pending) during the run; the
   * tool's execution later retrieves the same card to settle it.
   */
  cardFor(call: AgUiToolCall): ToolCallCard {
    const existing = this.#toolCards.get(call.id);
    if (existing !== undefined) {
      return existing;
    }
    // Prefer the tool's own `x-summary`; then an explicit `toolSummaries`
    // entry; then the fetched server catalog (`data-tools-url`). All cover
    // server-side tools whose schema never reached the browser.
    const labelled = this.#host.resolveTool(call.name)?.parameters[X_SUMMARY_KEY];
    const summary =
      typeof labelled === "string"
        ? labelled
        : (this.#host.toolSummaries()[call.name] ??
          this.#host.serverSummary(call.name) ??
          prettifyToolName(call.name));
    const card = new ToolCallCard(call.name, call.args, summary, this.#host.strings(), {
      // A thunk over the live property, not the property itself: the card keeps
      // this for the life of the call, and the result region is filled when the
      // tool settles -- which can be long after a host set the hook.
      formatPayload: (payload) => this.#host.formatToolPayload(payload),
    });
    this.#toolCards.set(call.id, card);
    this.ensureGroup().appendChild(card.element);
    this.updateEmptyState();
    this.follow();
    return card;
  }
}
