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
 * Client-side persistence seam for the conversation and a pending-navigation
 * checkpoint, keyed by `thread_id`.
 *
 * The default {@link SessionStorageStore} keeps everything per-tab in
 * `sessionStorage`, so the chat survives the full page reloads of a
 * multi-page app. A host may inject a server-backed store instead (e.g. one
 * that rehydrates from a history endpoint); `loadMessages` is therefore
 * async-friendly. The checkpoint methods stay synchronous — the marker is a
 * tiny local hint a server store can derive from history and no-op.
 */
export interface ClientConversationStore {
  /** A stable conversation id, generated and persisted on first read. */
  threadId(): string;
  /** Load the persisted message history, or `null` when none exists. */
  loadMessages(threadId: string): Promise<readonly Message[] | null>;
  /** Persist the message history. */
  saveMessages(threadId: string, messages: readonly Message[]): void;
  /** Load the pending-navigation checkpoint, or `null` when none is set. */
  loadCheckpoint(threadId: string): NavigationCheckpoint | null;
  /** Set the pending-navigation checkpoint, or clear it when given `null`. */
  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void;
  /** Forget the conversation and checkpoint (e.g. a "new chat" action). */
  clear(threadId: string): void;
}

const THREAD_KEY = "ag-ui-chat:thread";
const MESSAGES_PREFIX = "ag-ui-chat:messages:";
const CHECKPOINT_PREFIX = "ag-ui-chat:checkpoint:";

/**
 * Default {@link ClientConversationStore}: per-tab `sessionStorage`.
 *
 * Survives full page reloads and same-tab navigation, clears on tab close —
 * the right scope for an embedded agent's conversation in a multi-page app.
 * One thread id per tab; the message history and checkpoint are namespaced by
 * it so two tabs hold independent conversations.
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
    sessionStorage.removeItem(THREAD_KEY);
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
