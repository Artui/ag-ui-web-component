import type { ThreadMeta } from "../core/conversation_store.js";
import { relativeTime } from "./relative_time.js";

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
 */
export class ThreadDrawer {
  /** The drawer root (backdrop + panel). Append to the chat shell; hidden until opened. */
  readonly element: HTMLDivElement;

  readonly #callbacks: ThreadDrawerCallbacks;
  readonly #list: HTMLDivElement;
  #threads: readonly ThreadMeta[] = [];
  #activeId = "";

  constructor(callbacks: ThreadDrawerCallbacks) {
    this.#callbacks = callbacks;

    this.element = document.createElement("div");
    this.element.className = "drawer";
    this.element.hidden = true;

    const backdrop = document.createElement("div");
    backdrop.className = "drawer-backdrop";
    backdrop.addEventListener("click", () => this.close());

    const panel = document.createElement("div");
    panel.className = "drawer-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat history");

    const header = document.createElement("div");
    header.className = "drawer-header";
    const heading = document.createElement("span");
    heading.className = "drawer-title";
    heading.textContent = "Chats";
    const newButton = document.createElement("button");
    newButton.type = "button";
    newButton.className = "drawer-new";
    newButton.textContent = "New chat";
    newButton.addEventListener("click", () => {
      this.close();
      this.#callbacks.onNew();
    });
    header.append(heading, newButton);

    this.#list = document.createElement("div");
    this.#list.className = "drawer-list";

    panel.append(header, this.#list);
    this.element.append(backdrop, panel);
  }

  isOpen(): boolean {
    return !this.element.hidden;
  }

  open(): void {
    this.element.hidden = false;
  }

  close(): void {
    this.element.hidden = true;
  }

  toggle(): void {
    this.element.hidden = !this.element.hidden;
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
      empty.textContent = "No conversations yet.";
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
    if (meta.threadId === this.#activeId) {
      row.classList.add("drawer-row--active");
    }

    const select = document.createElement("button");
    select.type = "button";
    select.className = "drawer-row-select";
    const title = document.createElement("span");
    title.className = "drawer-row-title";
    title.textContent = meta.title;
    const time = document.createElement("span");
    time.className = "drawer-row-time";
    time.textContent = relativeTime(meta.updatedAt);
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
    rename.title = "Rename";
    rename.setAttribute("aria-label", "Rename conversation");
    rename.textContent = "✎";
    rename.addEventListener("click", () => this.#startRename(row, meta));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "drawer-row-delete";
    remove.title = "Delete";
    remove.setAttribute("aria-label", "Delete conversation");
    remove.textContent = "🗑";
    remove.addEventListener("click", () => this.#confirmDelete(row, meta));

    const actions = document.createElement("div");
    actions.className = "drawer-row-actions";
    actions.append(rename, remove);

    row.append(select, actions);
    return row;
  }

  /** Swap a row for an inline rename input; Enter commits, Escape cancels. */
  #startRename(row: HTMLDivElement, meta: ThreadMeta): void {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "drawer-rename-input";
    input.value = meta.title;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const value = input.value.trim();
        if (value === "") {
          this.#renderList();
        } else {
          this.#callbacks.onRename(meta.threadId, value);
        }
      } else if (event.key === "Escape") {
        this.#renderList();
      }
    });
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
    label.textContent = "Delete?";
    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "drawer-confirm-yes";
    yes.textContent = "Delete";
    yes.addEventListener("click", () => this.#callbacks.onDelete(meta.threadId));
    const no = document.createElement("button");
    no.type = "button";
    no.className = "drawer-confirm-no";
    no.textContent = "Cancel";
    no.addEventListener("click", () => this.#renderList());
    confirm.append(label, yes, no);
    row.replaceChildren(confirm);
  }
}
