import type { Message } from "@ag-ui/core";
import {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  type ThreadMeta,
} from "./conversation_store.js";

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
 * A {@link ClientConversationStore} backed by a server thread-index endpoint —
 * django-ag-ui's owner-scoped `ThreadsView`, the URL passed to `<ag-ui-chat>`
 * as `data-threads-url`:
 *
 * - `GET  <url>`        → list the user's threads (metadata only);
 * - `GET  <url><id>/`   → that thread's messages;
 * - `PATCH <url><id>/`  → rename (`{ "title": … }`);
 * - `DELETE <url><id>/` → delete.
 *
 * It wraps a local store (default {@link SessionStorageStore}) for the
 * client-only concerns — the active thread id, the navigation checkpoint, and a
 * message cache — and as the graceful fallback when a request fails. Rename and
 * delete apply **optimistically** (a small local overlay) so the drawer
 * reflects them at once, before the fire-and-forget server round-trip lands.
 */
export class RemoteConversationStore implements ClientConversationStore {
  readonly #url: string;
  readonly #headers: HeadersProvider;
  readonly #local: ClientConversationStore;
  readonly #dropped = new Set<string>();
  readonly #renamed = new Map<string, string>();

  constructor(
    url: string,
    headers: HeadersProvider = () => ({}),
    local: ClientConversationStore = new SessionStorageStore(),
  ) {
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#headers = headers;
    this.#local = local;
  }

  threadId(): string {
    return this.#local.threadId();
  }

  setActiveThread(threadId: string): void {
    this.#local.setActiveThread(threadId);
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
    const response = await this.#get(this.#url + encodeURIComponent(threadId) + "/");
    if (response === null || !response.ok) {
      return this.#local.loadMessages(threadId);
    }
    // A 200 whose body isn't the expected JSON (a proxy's HTML error page, a
    // truncated stream) must not throw an unhandled rejection that the caller's
    // `void #rehydrate()` swallows — fall back to the local cache instead.
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
      // `null` or an unparseable date both become `NaN` (Date.parse's own
      // signal), which `relativeTime` renders as a neutral label rather than
      // "~2950w ago" (epoch 0) or "NaNw ago".
      updatedAt: row.updated_at === null ? Number.NaN : Date.parse(row.updated_at),
      preview: row.preview,
    };
  }

  /** GET that resolves to the `Response`, or `null` on a network error. */
  async #get(url: string): Promise<Response | null> {
    try {
      return await fetch(url, { headers: this.#headers() });
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
      await fetch(this.#url + encodeURIComponent(threadId) + "/", {
        method,
        headers: body === undefined ? headers : { ...headers, "content-type": "application/json" },
        body: body === undefined ? null : JSON.stringify(body),
      });
    } catch {
      // Best-effort; the optimistic overlay keeps the drawer consistent.
    }
  }
}
