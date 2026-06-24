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

const THREAD_KEY = "ag-ui-chat:thread";
const THREADS_KEY = "ag-ui-chat:threads";
const MESSAGES_PREFIX = "ag-ui-chat:messages:";
const CHECKPOINT_PREFIX = "ag-ui-chat:checkpoint:";

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
 */
export class SessionStorageStore implements ClientConversationStore {
  threadId(): string {
    const existing = sessionStorage.getItem(THREAD_KEY);
    if (existing !== null) {
      return existing;
    }
    const id = randomUUID();
    sessionStorage.setItem(THREAD_KEY, id);
    return id;
  }

  loadMessages(threadId: string): Promise<readonly Message[] | null> {
    return Promise.resolve(this.#readJson<Message[]>(MESSAGES_PREFIX + threadId));
  }

  saveMessages(threadId: string, messages: readonly Message[]): void {
    sessionStorage.setItem(MESSAGES_PREFIX + threadId, JSON.stringify(messages));
    this.#touchThread(threadId, messages);
  }

  loadCheckpoint(threadId: string): NavigationCheckpoint | null {
    return this.#readJson<NavigationCheckpoint>(CHECKPOINT_PREFIX + threadId);
  }

  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void {
    const key = CHECKPOINT_PREFIX + threadId;
    if (checkpoint === null) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(checkpoint));
  }

  clear(threadId: string): void {
    sessionStorage.removeItem(MESSAGES_PREFIX + threadId);
    sessionStorage.removeItem(CHECKPOINT_PREFIX + threadId);
    this.#writeThreads(this.#readThreads().filter((thread) => thread.threadId !== threadId));
    // Only drop the active pointer when the active thread itself is cleared, so
    // the next `threadId()` mints a fresh one. Deleting another thread from the
    // drawer must not disturb the conversation on screen.
    if (sessionStorage.getItem(THREAD_KEY) === threadId) {
      sessionStorage.removeItem(THREAD_KEY);
    }
  }

  listThreads(): Promise<readonly ThreadMeta[]> {
    const metas = this.#readThreads()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map(({ threadId, title, updatedAt, preview }) => ({ threadId, title, updatedAt, preview }));
    return Promise.resolve(metas);
  }

  setActiveThread(threadId: string): void {
    sessionStorage.setItem(THREAD_KEY, threadId);
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
    return this.#readJson<StoredThread[]>(THREADS_KEY) ?? [];
  }

  #writeThreads(threads: readonly StoredThread[]): void {
    if (threads.length === 0) {
      sessionStorage.removeItem(THREADS_KEY);
      return;
    }
    sessionStorage.setItem(THREADS_KEY, JSON.stringify(threads));
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
