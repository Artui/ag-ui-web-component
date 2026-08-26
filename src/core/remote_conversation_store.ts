import type { Message } from "@ag-ui/core";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  type ThreadMeta,
} from "./conversation_store.js";
import { mintThread, withCredentials } from "./utils.js";

/** One row of the server thread index (django-ag-ui's `ThreadsView` wire shape). */
interface ServerThreadRow {
  readonly thread_id: string;
  readonly title: string;
  readonly updated_at: string | null;
  readonly preview: string;
}

/** Live header source, read per request so rotated tokens / CSRF reach the server. */
type HeadersProvider = () => Record<string, string>;

/**
 * Live cookie policy, read per request. A provider rather than a value: the
 * store is built once on connect, but a host may configure the element after
 * inserting it, and a captured value would pin that first frame's setting.
 */
type CredentialsProvider = () => RequestCredentials | undefined;

/**
 * A {@link ClientConversationStore} backed by a server thread-index endpoint —
 * django-ag-ui's owner-scoped `ThreadsView`, the URL passed to `<ag-ui-chat>`
 * as `data-threads-url`:
 *
 * - `GET  <url>`        → list the user's threads (metadata only);
 * - `GET  <url><id>/`   → that thread's messages;
 * - `PATCH <url><id>/`  → rename (`{ "title": … }`);
 * - `DELETE <url><id>/` → delete.
 *
 * Wraps a local store (default {@link SessionStorageStore}) for the client-only
 * concerns — active thread id, navigation checkpoint, message cache — and as
 * the fallback when a request fails. Rename and delete apply optimistically via
 * a local overlay, so the drawer reflects them before the fire-and-forget
 * round-trip lands.
 */
export class RemoteConversationStore implements ClientConversationStore {
  readonly #url: string;
  readonly #headers: HeadersProvider;
  readonly #local: ClientConversationStore;
  readonly #credentials: CredentialsProvider;
  readonly #dropped = new Set<string>();
  readonly #renamed = new Map<string, string>();

  constructor(
    url: string,
    headers: HeadersProvider = () => ({}),
    local: ClientConversationStore = new SessionStorageStore(),
    credentials: CredentialsProvider = () => undefined,
  ) {
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#headers = headers;
    this.#local = local;
    this.#credentials = credentials;
  }

  threadId(): string {
    return this.#local.threadId();
  }

  setActiveThread(threadId: string): void {
    this.#local.setActiveThread(threadId);
  }

  /**
   * Delegated to the local store, which owns the active id — and deliberately
   * silent on the wire: the server learns of a thread when its first message is
   * persisted, so an abandoned new chat costs no round-trip and leaves no row.
   */
  newThread(): string {
    return mintThread(this.#local);
  }

  /** Delegated, so wrapping a store does not lose what it knows about its own ids. */
  isUnsent(threadId: string): boolean {
    return this.#local.isUnsent?.(threadId) === true;
  }

  saveMessages(threadId: string, messages: readonly Message[]): void {
    // The agent run persists server-side; keep a local cache for offline replay.
    this.#local.saveMessages(threadId, messages);
  }

  loadCheckpoint(threadId: string): NavigationCheckpoint | null {
    return this.#local.loadCheckpoint(threadId);
  }

  saveCheckpoint(threadId: string, checkpoint: NavigationCheckpoint | null): void {
    this.#local.saveCheckpoint(threadId, checkpoint);
  }

  renameThread(threadId: string, title: string): void {
    this.#local.renameThread(threadId, title);
    this.#renamed.set(threadId, title);
    void this.#mutate(threadId, "PATCH", { title });
  }

  clear(threadId: string): void {
    this.#local.clear(threadId);
    this.#dropped.add(threadId);
    void this.#mutate(threadId, "DELETE");
  }

  async listThreads(): Promise<readonly ThreadMeta[]> {
    const rows = await this.#fetchThreads();
    if (rows === null) {
      return this.#local.listThreads();
    }
    return rows.filter((row) => !this.#dropped.has(row.thread_id)).map((row) => this.#toMeta(row));
  }

  async loadMessages(threadId: string): Promise<readonly Message[] | null> {
    // Don't ask the server for a thread it cannot have. The element mints an id
    // on first mount and immediately tries to restore it, so every first visit
    // spent a request to be told `404` — and logged one in the console, on a page
    // where nothing had gone wrong. Only the store that minted the id can say
    // that; a thread chosen from the drawer, or one created on another device, is
    // still fetched. See `ClientConversationStore.isUnsent`.
    if (this.#local.isUnsent?.(threadId) === true) {
      return null;
    }
    const response = await this.#get(`${this.#url}${encodeURIComponent(threadId)}/`);
    if (response === null || !response.ok) {
      return this.#local.loadMessages(threadId);
    }
    // A 200 whose body isn't JSON (a proxy's HTML error page, a truncated
    // stream) must not throw an unhandled rejection that the caller's
    // `void #rehydrate()` swallows; fall back to the local cache.
    const body = await this.#readJson<{ messages?: readonly Message[] }>(response);
    if (body === null) {
      return this.#local.loadMessages(threadId);
    }
    return body.messages ?? null;
  }

  async #fetchThreads(): Promise<readonly ServerThreadRow[] | null> {
    const response = await this.#get(this.#url);
    if (response === null || !response.ok) {
      return null;
    }
    const body = await this.#readJson<{ threads?: readonly ServerThreadRow[] }>(response);
    if (body === null) {
      return null;
    }
    return body.threads ?? [];
  }

  /** Parse a `Response` body as JSON, or `null` when it isn't valid JSON. */
  async #readJson<T>(response: Response): Promise<T | null> {
    try {
      return (await response.json()) as T;
    } catch {
      return null;
    }
  }

  #toMeta(row: ServerThreadRow): ThreadMeta {
    return {
      threadId: row.thread_id,
      title: this.#renamed.get(row.thread_id) ?? row.title,
      // `null` and an unparseable date both become NaN, Date.parse's own
      // signal, which `relativeTime` renders as a neutral label rather than an
      // epoch-0 or NaN duration.
      updatedAt: row.updated_at === null ? Number.NaN : Date.parse(row.updated_at),
      preview: row.preview,
    };
  }

  /** GET that resolves to the `Response`, or `null` on a network error. */
  async #get(url: string): Promise<Response | null> {
    try {
      return await fetch(url, withCredentials({ headers: this.#headers() }, this.#credentials()));
    } catch {
      return null;
    }
  }

  /** Fire a best-effort write to the thread endpoint; failures are tolerated. */
  async #mutate(
    threadId: string,
    method: "PATCH" | "DELETE",
    body?: { title: string },
  ): Promise<void> {
    const headers = this.#headers();
    try {
      await fetch(
        `${this.#url}${encodeURIComponent(threadId)}/`,
        withCredentials(
          {
            method,
            headers:
              body === undefined ? headers : { ...headers, "content-type": "application/json" },
            body: body === undefined ? null : JSON.stringify(body),
          },
          this.#credentials(),
        ),
      );
    } catch {
      // Best-effort; the optimistic overlay keeps the drawer consistent.
    }
  }
}
