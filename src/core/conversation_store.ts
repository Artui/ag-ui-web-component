import { randomUUID } from "@ag-ui/client";
import type { Message } from "@ag-ui/core";

/**
 * A checkpoint recorded just before a navigating tool reloads the page.
 *
 * The reload destroys the in-memory run loop, so the element persists this
 * marker first; on the next mount it supplies the tool's result and resumes.
 */
export interface NavigationCheckpoint {
  /** The tool-call id whose result must be supplied after the reload. */
  readonly toolCallId: string;
}

/**
 * Lightweight metadata for one conversation — the thread-drawer row shape.
 *
 * Returned by {@link ClientConversationStore.listThreads} so the drawer can
 * render a list without loading message bodies. `title` defaults to a
 * truncation of the first user message (until an explicit rename); `preview`
 * is a one-line excerpt of the latest message; `updatedAt` is epoch ms of the
 * last change, used to order the list.
 */
export interface ThreadMeta {
  readonly threadId: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly preview: string;
}

/**
 * Client-side persistence seam for the conversation and a pending-navigation
 * checkpoint, keyed by `thread_id`.
 *
 * The default {@link SessionStorageStore} keeps everything per-tab in
 * `sessionStorage`, so the chat survives the full page reloads of a
 * multi-page app. A host may inject a server-backed store instead (e.g. one
 * that rehydrates from a history endpoint); `loadMessages` and `listThreads`
 * are therefore async-friendly. The checkpoint methods stay synchronous — the
 * marker is a tiny local hint a server store can derive from history and no-op.
 *
 * Thread enumeration (`listThreads` / `setActiveThread` / `renameThread`) backs
 * the chat-history drawer; "delete a thread" reuses {@link clear} and "new
 * chat" reuses {@link threadId} after clearing the active thread.
 */
export interface ClientConversationStore {
  /** The active conversation id, generated and persisted on first read. */
  threadId(): string;
  /** Load the persisted message history, or `null` when none exists. */
  loadMessages(threadId: string): Promise<readonly Message[] | null>;
  /** Persist the message history (and refresh the thread's drawer metadata). */
  saveMessages(threadId: string, messages: readonly Message[]): void;
  /** Load the pending-navigation checkpoint, or `null` when none is set. */
  loadCheckpoint(threadId: string): NavigationCheckpoint | null;
  /** Set the pending-navigation checkpoint, or clear it when given `null`. */
  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void;
  /** Forget the conversation and checkpoint (a "delete thread" / "new chat"). */
  clear(threadId: string): void;
  /** The user's threads as drawer metadata (no message bodies), newest first. */
  listThreads(): Promise<readonly ThreadMeta[]>;
  /** Make `threadId` the active conversation (the drawer selecting a row). */
  setActiveThread(threadId: string): void;
  /** Set a thread's display title (the drawer renaming a row). */
  renameThread(threadId: string, title: string): void;
}

const KEY_ROOT = "ag-ui-chat";
const THREAD_SUFFIX = "thread";
const THREADS_SUFFIX = "threads";
const MESSAGES_SUFFIX = "messages:";
const CHECKPOINT_SUFFIX = "checkpoint:";

const TITLE_LIMIT = 60;
const PREVIEW_LIMIT = 100;
const DEFAULT_TITLE = "New conversation";

/** The drawer-index entry; `titleCustom` (private) freezes a renamed title. */
interface StoredThread {
  threadId: string;
  title: string;
  titleCustom: boolean;
  preview: string;
  updatedAt: number;
}

/**
 * Default {@link ClientConversationStore}: per-tab `sessionStorage`.
 *
 * Survives full page reloads and same-tab navigation, clears on tab close —
 * the right scope for an embedded agent's conversation in a multi-page app.
 * Tracks multiple threads per tab: the active id lives under one key, the
 * message history / checkpoint are namespaced by id, and a small index feeds
 * the drawer so it works with no server.
 *
 * An optional `namespace` scopes every key to one element (its `id`, else its
 * endpoint), so two `<ag-ui-chat>` instances — or two apps — on the same origin
 * keep separate active-thread pointers and drawer indexes instead of clobbering
 * each other. Constructing with a namespace migrates any pre-namespacing
 * (`ag-ui-chat:*`) keys into it once, so an existing conversation survives the
 * upgrade; the default empty namespace keeps the legacy origin-global keys.
 */
export class SessionStorageStore implements ClientConversationStore {
  readonly #root: string;

  constructor(namespace = "") {
    this.#root = namespace === "" ? KEY_ROOT : `${KEY_ROOT}@${namespace}`;
    if (namespace !== "") {
      this.#migrateLegacyKeys();
    }
  }

  threadId(): string {
    const key = this.#key(THREAD_SUFFIX);
    const existing = sessionStorage.getItem(key);
    if (existing !== null) {
      return existing;
    }
    const id = randomUUID();
    sessionStorage.setItem(key, id);
    return id;
  }

  loadMessages(threadId: string): Promise<readonly Message[] | null> {
    return Promise.resolve(this.#readJson<Message[]>(this.#key(MESSAGES_SUFFIX + threadId)));
  }

  saveMessages(threadId: string, messages: readonly Message[]): void {
    sessionStorage.setItem(this.#key(MESSAGES_SUFFIX + threadId), JSON.stringify(messages));
    this.#touchThread(threadId, messages);
  }

  loadCheckpoint(threadId: string): NavigationCheckpoint | null {
    return this.#readJson<NavigationCheckpoint>(this.#key(CHECKPOINT_SUFFIX + threadId));
  }

  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void {
    const key = this.#key(CHECKPOINT_SUFFIX + threadId);
    if (checkpoint === null) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(checkpoint));
  }

  clear(threadId: string): void {
    sessionStorage.removeItem(this.#key(MESSAGES_SUFFIX + threadId));
    sessionStorage.removeItem(this.#key(CHECKPOINT_SUFFIX + threadId));
    this.#writeThreads(this.#readThreads().filter((thread) => thread.threadId !== threadId));
    // Only drop the active pointer when the active thread itself is cleared, so
    // the next `threadId()` mints a fresh one. Deleting another thread from the
    // drawer must not disturb the conversation on screen.
    if (sessionStorage.getItem(this.#key(THREAD_SUFFIX)) === threadId) {
      sessionStorage.removeItem(this.#key(THREAD_SUFFIX));
    }
  }

  listThreads(): Promise<readonly ThreadMeta[]> {
    const metas = this.#readThreads()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ threadId, title, updatedAt, preview }) => ({ threadId, title, updatedAt, preview }));
    return Promise.resolve(metas);
  }

  setActiveThread(threadId: string): void {
    sessionStorage.setItem(this.#key(THREAD_SUFFIX), threadId);
  }

  renameThread(threadId: string, title: string): void {
    const threads = this.#readThreads();
    const entry = threads.find((thread) => thread.threadId === threadId);
    if (entry === undefined) {
      return;
    }
    entry.title = title;
    entry.titleCustom = true;
    this.#writeThreads(threads);
  }

  /** Add or refresh a thread's drawer metadata from its latest messages. */
  #touchThread(threadId: string, messages: readonly Message[]): void {
    const threads = this.#readThreads();
    const entry = threads.find((thread) => thread.threadId === threadId);
    const preview = derivePreview(messages);
    const updatedAt = Date.now();
    if (entry === undefined) {
      threads.push({
        threadId,
        title: deriveTitle(messages),
        titleCustom: false,
        preview,
        updatedAt,
      });
    } else {
      entry.preview = preview;
      entry.updatedAt = updatedAt;
      if (!entry.titleCustom) {
        entry.title = deriveTitle(messages);
      }
    }
    this.#writeThreads(threads);
  }

  #readThreads(): StoredThread[] {
    return this.#readJson<StoredThread[]>(this.#key(THREADS_SUFFIX)) ?? [];
  }

  #writeThreads(threads: readonly StoredThread[]): void {
    const key = this.#key(THREADS_SUFFIX);
    if (threads.length === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(threads));
  }

  /** This store's fully-qualified key for a suffix (namespaced when set). */
  #key(suffix: string): string {
    return `${this.#root}:${suffix}`;
  }

  /**
   * One-time move of pre-namespacing (`ag-ui-chat:*`) keys into this instance's
   * namespace, so an existing conversation isn't orphaned by the upgrade. Only
   * this store's own keys move (thread pointer, drawer index, per-thread
   * messages/checkpoints) — the element's `collapsed`/`theme` keys are left
   * alone. The first namespaced instance to mount adopts the legacy data; a
   * second namespace finds it gone and starts fresh.
   */
  #migrateLegacyKeys(): void {
    const legacyRoot = `${KEY_ROOT}:`;
    const moves: Array<readonly [string, string]> = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key === null || !key.startsWith(legacyRoot)) {
        continue;
      }
      const suffix = key.slice(legacyRoot.length);
      if (isOwnedSuffix(suffix)) {
        moves.push([key, this.#key(suffix)]);
      }
    }
    // Collected first, mutated second — writing while iterating by index skips
    // entries as the key list shifts.
    for (const [from, to] of moves) {
      const value = sessionStorage.getItem(from);
      if (value !== null && sessionStorage.getItem(to) === null) {
        sessionStorage.setItem(to, value);
      }
      sessionStorage.removeItem(from);
    }
  }

  /** Parse a stored JSON value, returning `null` when absent or corrupt. */
  #readJson<T>(key: string): T | null {
    const raw = sessionStorage.getItem(key);
    if (raw === null) {
      return null;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }
}

/** Whether a legacy key suffix belongs to the store (vs the element's own keys). */
function isOwnedSuffix(suffix: string): boolean {
  return (
    suffix === THREAD_SUFFIX ||
    suffix === THREADS_SUFFIX ||
    suffix.startsWith(MESSAGES_SUFFIX) ||
    suffix.startsWith(CHECKPOINT_SUFFIX)
  );
}

/** The thread title: the first user message, collapsed + truncated. */
function deriveTitle(messages: readonly Message[]): string {
  for (const message of messages) {
    if (message.role === "user") {
      const text = cleanText(message.content);
      if (text !== "") {
        return truncate(text, TITLE_LIMIT);
      }
    }
  }
  return DEFAULT_TITLE;
}

/** A one-line preview: the latest message with text, collapsed + truncated. */
function derivePreview(messages: readonly Message[]): string {
  for (const message of [...messages].reverse()) {
    const text = cleanText(message.content);
    if (text !== "") {
      return truncate(text, PREVIEW_LIMIT);
    }
  }
  return "";
}

/** Whitespace-collapsed message text, or `""` for non-string content. */
function cleanText(content: unknown): string {
  return typeof content === "string" ? content.replace(/\s+/g, " ").trim() : "";
}

function truncate(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}
