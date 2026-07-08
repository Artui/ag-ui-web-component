import type { ThreadMeta } from "../core/conversation_store.js";
import { relativeTime } from "./relative_time.js";
import { DEFAULT_UI_STRINGS, type UiStrings } from "./ui_strings.js";

/** Actions the host ({@link AgUiChat}) wires to the drawer's rows. */
export interface ThreadDrawerCallbacks {
  /** A row was picked — load that thread and make it active. */
  readonly onSelect: (threadId: string) => void;
  /** The "New chat" action — start a fresh thread. */
  readonly onNew: () => void;
  /** A row was renamed to `title`. */
  readonly onRename: (threadId: string, title: string) => void;
  /** A row was deleted (after the inline confirm). */
  readonly onDelete: (threadId: string) => void;
}

/**
 * The chat-history drawer: a slide-over listing the user's threads (title,
 * relative time, preview), with select / new / rename / delete actions and an
 * empty state. Pure DOM in the spirit of {@link SkillsMenu} — the host appends
 * {@link element}, toggles it, feeds rows via {@link setThreads}, and acts on
 * the callbacks. The drawer is a *view*: it does not mutate the store; after a
 * callback the host updates the store and calls {@link setThreads} to refresh.
 *
 * All visible text comes from {@link UiStrings}; {@link setStrings} re-localizes
 * a drawer the host built before its strings resolved.
 */
export class ThreadDrawer {
  /** The drawer root (backdrop + panel). Append to the chat shell; hidden until opened. */
  readonly element: HTMLDivElement;

  readonly #callbacks: ThreadDrawerCallbacks;
  readonly #panel: HTMLDivElement;
  readonly #heading: HTMLSpanElement;
  readonly #newButton: HTMLButtonElement;
  readonly #list: HTMLDivElement;
  #strings: UiStrings;
  #threads: readonly ThreadMeta[] = [];
  #activeId = "";
  /** The element focused before the drawer opened, restored on close. */
  #lastFocused: HTMLElement | null = null;

  constructor(callbacks: ThreadDrawerCallbacks, strings: UiStrings = DEFAULT_UI_STRINGS) {
    this.#callbacks = callbacks;
    this.#strings = strings;

    this.element = document.createElement("div");
    this.element.className = "drawer";
    this.element.setAttribute("part", "drawer");
    this.element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    backdrop.setAttribute("part", "drawer-backdrop");
    backdrop.addEventListener("click", () => this.close());

    this.#panel = document.createElement("div");
    this.#panel.className = "drawer-panel";
    this.#panel.setAttribute("part", "drawer-panel");
    this.#panel.setAttribute("role", "dialog");
    this.#panel.setAttribute("aria-modal", "true");
    this.#panel.setAttribute("aria-label", strings.chatHistory);
    // Escape closes the drawer; Tab is trapped within the panel while it's open.
    this.#panel.addEventListener("keydown", (event) => this.#onPanelKeydown(event));

    const header = document.createElement("div");
    header.className = "drawer-header";
    header.setAttribute("part", "drawer-header");
    this.#heading = document.createElement("span");
    this.#heading.className = "drawer-title";
    this.#heading.setAttribute("part", "drawer-title");
    this.#heading.textContent = strings.chats;
    this.#newButton = document.createElement("button");
    this.#newButton.type = "button";
    this.#newButton.className = "drawer-new";
    this.#newButton.setAttribute("part", "drawer-new");
    this.#newButton.textContent = strings.newChat;
    this.#newButton.addEventListener("click", () => {
      this.close();
      this.#callbacks.onNew();
    });
    header.append(this.#heading, this.#newButton);

    this.#list = document.createElement("div");
    this.#list.className = "drawer-list";
    this.#list.setAttribute("part", "drawer-list");

    this.#panel.append(header, this.#list);
    this.element.append(backdrop, this.#panel);
  }

  /** Re-localize the drawer's chrome and rows (the host calls this on connect). */
  setStrings(strings: UiStrings): void {
    this.#strings = strings;
    this.#panel.setAttribute("aria-label", strings.chatHistory);
    this.#heading.textContent = strings.chats;
    this.#newButton.textContent = strings.newChat;
    this.#renderList();
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    if (this.isOpen()) {
      return;
    }
    // Remember what had focus so it's restored on close, then move focus into
    // the panel (its first control) so keyboard users land inside the dialog.
    this.#lastFocused = this.#activeElement() as HTMLElement | null;
    this.element.hidden = false;
    this.#newButton.focus();
  }

  close(): void {
    if (!this.isOpen()) {
      return;
    }
    this.element.hidden = true;
    this.#lastFocused?.focus();
    this.#lastFocused = null;
  }

  toggle(): void {
    if (this.isOpen()) {
      this.close();
    } else {
      this.open();
    }
  }

  /** The currently-focused element within the drawer's root (shadow-aware). */
  #activeElement(): Element | null {
    return (this.element.getRootNode() as Document | ShadowRoot).activeElement;
  }

  /** Escape-to-close and a Tab focus trap while the dialog is open. */
  #onPanelKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const focusables = Array.from(
      this.#panel.querySelectorAll<HTMLElement>("button, input, [tabindex]"),
    ).filter((el) => !el.hidden);
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = this.#activeElement();
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  /** Render the rows (or the empty state), highlighting the active thread. */
  setThreads(threads: readonly ThreadMeta[], activeId: string): void {
    this.#threads = threads;
    this.#activeId = activeId;
    this.#renderList();
  }

  #renderList(): void {
    this.#list.replaceChildren();
    if (this.#threads.length === 0) {
      const empty = document.createElement("div");
      empty.className = "drawer-empty";
      empty.setAttribute("part", "drawer-empty");
      empty.textContent = this.#strings.noConversations;
      this.#list.appendChild(empty);
      return;
    }
    for (const meta of this.#threads) {
      this.#list.appendChild(this.#renderRow(meta));
    }
  }

  #renderRow(meta: ThreadMeta): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "drawer-row";
    row.setAttribute("part", "drawer-row");
    if (meta.threadId === this.#activeId) {
      row.classList.add("drawer-row--active");
    }

    const select = document.createElement("button");
    select.type = "button";
    select.className = "drawer-row-select";
    select.setAttribute("part", "drawer-row-select");
    const title = document.createElement("span");
    title.className = "drawer-row-title";
    title.textContent = meta.title;
    const time = document.createElement("span");
    time.className = "drawer-row-time";
    time.textContent = relativeTime(meta.updatedAt, undefined, this.#strings);
    const preview = document.createElement("span");
    preview.className = "drawer-row-preview";
    preview.textContent = meta.preview;
    select.append(title, time, preview);
    select.addEventListener("click", () => {
      this.close();
      this.#callbacks.onSelect(meta.threadId);
    });

    const rename = document.createElement("button");
    rename.type = "button";
    rename.className = "drawer-row-rename";
    rename.title = this.#strings.rename;
    rename.setAttribute("aria-label", this.#strings.renameConversation);
    rename.textContent = "✎";
    rename.addEventListener("click", () => this.#startRename(row, meta));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "drawer-row-delete";
    remove.title = this.#strings.delete;
    remove.setAttribute("aria-label", this.#strings.deleteConversation);
    remove.textContent = "🗑";
    remove.addEventListener("click", () => this.#confirmDelete(row, meta));

    const actions = document.createElement("div");
    actions.className = "drawer-row-actions";
    actions.append(rename, remove);

    row.append(select, actions);
    return row;
  }

  /** Swap a row for an inline rename input; Enter/blur commits, Escape cancels. */
  #startRename(row: HTMLDivElement, meta: ThreadMeta): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "drawer-rename-input";
    input.value = meta.title;
    // One-shot: Enter, Escape, and blur can all fire for a single edit (Enter
    // commits and re-renders, which blurs the detached input); the flag makes
    // the later events no-ops so a rename isn't submitted twice.
    let done = false;
    const commit = (): void => {
      if (done) {
        return;
      }
      done = true;
      const value = input.value.trim();
      if (value === "" || value === meta.title) {
        this.#renderList();
      } else {
        this.#callbacks.onRename(meta.threadId, value);
      }
    };
    const cancel = (): void => {
      if (done) {
        return;
      }
      done = true;
      this.#renderList();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      } else if (event.key === "Escape") {
        // Stop the panel's Escape handler from also closing the drawer.
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    });
    input.addEventListener("blur", () => commit());
    row.replaceChildren(input);
    input.focus();
    input.select();
  }

  /** Swap a row for an inline "Delete? [Delete] [Cancel]" confirm. */
  #confirmDelete(row: HTMLDivElement, meta: ThreadMeta): void {
    const confirm = document.createElement("div");
    confirm.className = "drawer-confirm";
    const label = document.createElement("span");
    label.className = "drawer-confirm-label";
    label.textContent = this.#strings.deletePrompt;
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "drawer-confirm-yes";
    yes.textContent = this.#strings.delete;
    yes.addEventListener("click", () => this.#callbacks.onDelete(meta.threadId));
    const no = document.createElement("button");
    no.type = "button";
    no.className = "drawer-confirm-no";
    no.textContent = this.#strings.cancel;
    no.addEventListener("click", () => this.#renderList());
    confirm.append(label, yes, no);
    row.replaceChildren(confirm);
  }
}
