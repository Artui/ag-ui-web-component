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
 * Lightweight metadata for one conversation — the thread-drawer row shape, so
 * the drawer renders without loading message bodies. `title` defaults to a
 * truncation of the first user message until an explicit rename, `preview` is a
 * one-line excerpt of the latest message, and `updatedAt` is epoch ms of the
 * last change, which orders the list.
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
 * The default {@link SessionStorageStore} keeps everything per-tab. A host may
 * inject a server-backed store instead, which is why `loadMessages` and
 * `listThreads` are async. The checkpoint methods stay synchronous: the marker
 * is a small local hint a server store can derive from history and no-op.
 *
 * Thread enumeration backs the chat-history drawer; deleting a thread reuses
 * {@link clear}, and "new chat" is {@link newThread} — which leaves the
 * conversation it moves off of intact, for the drawer to offer back.
 */
export interface ClientConversationStore {
  /** The active conversation id, generated and persisted on first read. */
  threadId(): string;
  /**
   * Start a fresh conversation, make it active, and return its id.
   *
   * Existing threads are left where they are: "new chat" adds one, and
   * {@link clear} is the only method that takes one away.
   *
   * Optional, so a store written before this method existed still works. The
   * caller then mints the id itself and hands it to {@link setActiveThread},
   * which loses only the store's own record that the thread is new (see
   * {@link isUnsent}).
   */
  newThread?(): string;
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
  /**
   * Whether `threadId` was minted here and has never been saved — a thread in
   * which nothing has been sent yet.
   *
   * Exists so a server-backed store can skip asking a server for history that
   * cannot be there: the element mints an id on first mount and immediately tries
   * to restore it, which answers `404` and logs one in the console on every first
   * visit. Nothing is wrong, and it looks exactly like something being wrong.
   *
   * Optional, and deliberately narrow. A store that cannot tell omits it and the
   * fetch happens as before, which is also the right answer for a store that
   * holds nothing locally: "I have no messages for this id" is not the same claim
   * as "this id is new", and only the store that minted the id can make the
   * second one. A thread picked from the drawer was never minted here, so it is
   * still fetched.
   */
  isUnsent?(threadId: string): boolean;
}

const KEY_ROOT = "ag-ui-chat";
const THREAD_SUFFIX = "thread";
const THREADS_SUFFIX = "threads";
const MESSAGES_SUFFIX = "messages:";
const CHECKPOINT_SUFFIX = "checkpoint:";
// Marks an id this store minted and nothing has been sent in yet. Dropped on
// the first save, so it never outlives the one question it answers.
const MINTED_SUFFIX = "minted:";

const TITLE_LIMIT = 60;
const PREVIEW_LIMIT = 100;
const DEFAULT_TITLE = "New conversation";

// One warning per page, not one per write. The condition is origin-wide and
// persistent — a full quota stays full — so a message per persisted turn (or,
// on the resize path, per keystroke) would bury the one that matters.
let writeFailureReported = false;

/**
 * `sessionStorage.setItem` that survives a store which refuses to write.
 *
 * `setItem` throws on an exhausted quota (a long conversation, or one turn
 * carrying a large tool result) and in privacy modes that deny storage
 * altogether. Every write here is a *durability* concern — surviving a reload —
 * and none of them is worth an exception, because of where they are called
 * from: the element persists the transcript from inside the run loop, so an
 * unguarded throw escapes as a run error and tells the user the agent failed
 * when nothing but the browser's storage did. On the cancel path it escapes as
 * an unhandled rejection instead.
 *
 * So a failed write loses the reload, never the conversation on screen, and
 * says so once. Recovery is in the user's hands already: deleting the oversized
 * thread from the history drawer is a `removeItem`, which frees the quota.
 */
export function writeStoredItem(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    if (writeFailureReported) {
      return;
    }
    writeFailureReported = true;
    console.warn(
      "<ag-ui-chat>: the browser refused a sessionStorage write — the quota is " +
        "full, or storage is disabled for this context. The conversation " +
        "continues, but it will not survive a page reload. Deleting a long " +
        "conversation from the history drawer frees the quota.",
    );
  }
}

/** The storage-key root for a namespace; `""` is the pre-namespacing global root. */
function rootFor(namespace: string): string {
  return namespace === "" ? KEY_ROOT : `${KEY_ROOT}@${namespace}`;
}

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
 * Survives full page reloads and same-tab navigation, clears on tab close.
 * Tracks multiple threads per tab: the active id under one key, message history
 * and checkpoint namespaced by id, and a small index feeding the drawer with no
 * server involved.
 *
 * An optional `namespace` scopes every key to one element, so two
 * `<ag-ui-chat>` instances on the same origin keep separate active-thread
 * pointers and drawer indexes instead of clobbering each other. The default
 * empty namespace keeps the origin-global keys, which a namespaced store adopts
 * on construction; see {@link SessionStorageStore.adopt}.
 */
export class SessionStorageStore implements ClientConversationStore {
  readonly #root: string;

  constructor(namespace = "") {
    this.#root = rootFor(namespace);
    if (namespace !== "") {
      // One-time move of the pre-namespacing global keys, so an existing
      // conversation isn't orphaned by the upgrade. See {@link adopt}.
      SessionStorageStore.adopt("", namespace);
    }
  }

  /**
   * Move every key a store owns out of `from`'s namespace and into `to`'s.
   *
   * Two callers, one move. The constructor adopts the pre-namespacing global
   * keys (`from` = `""`); `<ag-ui-chat>` adopts an element-scoped conversation
   * into a principal-scoped one the first time a `user-key` arrives, which is a
   * host naming the user who was already there rather than a handover.
   *
   * Only this store's own suffixes move — the element's `collapsed` / `size` /
   * `theme` keys share the global root and are deliberately left where they
   * are. A value already present at the destination wins: the destination is
   * the durable record and the source is the stray this move exists to clear.
   */
  static adopt(from: string, to: string): void {
    const fromRoot = `${rootFor(from)}:`;
    const toRoot = `${rootFor(to)}:`;
    for (const [key, suffix] of ownedKeys(fromRoot)) {
      const value = sessionStorage.getItem(key);
      const destination = toRoot + suffix;
      if (value !== null && sessionStorage.getItem(destination) === null) {
        writeStoredItem(destination, value);
      }
      sessionStorage.removeItem(key);
    }
  }

  /**
   * Forget everything a store holds for `namespace`.
   *
   * The logout primitive: `<ag-ui-chat>` calls it when its `user-key` changes,
   * and a host driving its own store can call it from its own sign-out path.
   * Deliberately narrow — it removes only keys under this exact namespace whose
   * suffix parses as one this store writes, so it can never reach another
   * element's conversation or the host's own `sessionStorage` entries.
   */
  static purge(namespace: string): void {
    for (const [key] of ownedKeys(`${rootFor(namespace)}:`)) {
      sessionStorage.removeItem(key);
    }
  }

  threadId(): string {
    return sessionStorage.getItem(this.#key(THREAD_SUFFIX)) ?? this.newThread();
  }

  newThread(): string {
    const id = randomUUID();
    writeStoredItem(this.#key(THREAD_SUFFIX), id);
    writeStoredItem(this.#key(MINTED_SUFFIX + id), "1");
    return id;
  }

  isUnsent(threadId: string): boolean {
    return (
      sessionStorage.getItem(this.#key(MINTED_SUFFIX + threadId)) !== null &&
      sessionStorage.getItem(this.#key(MESSAGES_SUFFIX + threadId)) === null
    );
  }

  loadMessages(threadId: string): Promise<readonly Message[] | null> {
    return Promise.resolve(this.#readJson<Message[]>(this.#key(MESSAGES_SUFFIX + threadId)));
  }

  saveMessages(threadId: string, messages: readonly Message[]): void {
    writeStoredItem(this.#key(MESSAGES_SUFFIX + threadId), JSON.stringify(messages));
    sessionStorage.removeItem(this.#key(MINTED_SUFFIX + threadId));
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
    writeStoredItem(key, JSON.stringify(checkpoint));
  }

  clear(threadId: string): void {
    sessionStorage.removeItem(this.#key(MESSAGES_SUFFIX + threadId));
    sessionStorage.removeItem(this.#key(CHECKPOINT_SUFFIX + threadId));
    sessionStorage.removeItem(this.#key(MINTED_SUFFIX + threadId));
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
    writeStoredItem(this.#key(THREAD_SUFFIX), threadId);
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
    writeStoredItem(key, JSON.stringify(threads));
  }

  /** This store's fully-qualified key for a suffix (namespaced when set). */
  #key(suffix: string): string {
    return `${this.#root}:${suffix}`;
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

/**
 * Every `sessionStorage` key under `root` that this store wrote, as
 * `[key, suffix]`.
 *
 * Collected into an array before the caller mutates anything: `sessionStorage`
 * is enumerated by index, and removing an entry mid-loop shifts the ones after
 * it out from under the cursor.
 *
 * The suffix test is what makes {@link SessionStorageStore.purge} safe to point
 * at a namespace. It matters most for the global root, which the element's own
 * `collapsed` / `size` / `theme` keys share — but it also means a namespace
 * whose name happens to be a prefix of another cannot reach into it, since the
 * remainder would have to parse as one of these suffixes.
 */
function ownedKeys(root: string): Array<readonly [string, string]> {
  const found: Array<readonly [string, string]> = [];
  for (let index = 0; index < sessionStorage.length; index += 1) {
    const key = sessionStorage.key(index);
    if (key === null || !key.startsWith(root)) {
      continue;
    }
    const suffix = key.slice(root.length);
    if (isOwnedSuffix(suffix)) {
      found.push([key, suffix]);
    }
  }
  return found;
}

/** Whether a key suffix belongs to the store (vs the element's own keys). */
function isOwnedSuffix(suffix: string): boolean {
  return (
    suffix === THREAD_SUFFIX ||
    suffix === THREADS_SUFFIX ||
    suffix.startsWith(MESSAGES_SUFFIX) ||
    suffix.startsWith(CHECKPOINT_SUFFIX) ||
    suffix.startsWith(MINTED_SUFFIX)
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
