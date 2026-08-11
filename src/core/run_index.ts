import { withCredentials } from "./utils.js";

/** One row of the server run index (django-ag-ui's `RunsView` wire shape). */
export interface RunRow {
  readonly run_id: string;
  readonly thread_id: string | null;
  readonly parent_run_id: string | null;
  readonly started_at: string | null;
  /** Whether the run has a snapshot to seed from — see {@link RunIndex}. */
  readonly continuable: boolean;
}

/** Live header source, read per request so rotated tokens / CSRF reach the server. */
type HeadersProvider = () => Record<string, string>;

/**
 * Live cookie policy, read per request. A provider rather than a value because
 * the index is built once (on connect) and kept, while a host may configure the
 * element after inserting it — a captured value would pin whatever was set
 * during that first frame.
 */
type CredentialsProvider = () => RequestCredentials | undefined;

/**
 * Reads the server's run index and derives the resume / fork URLs beside it.
 *
 * Backed by django-ag-ui's owner-scoped `RunsView` — the URL passed to
 * `<ag-ui-chat>` as `data-runs-url`:
 *
 * - `GET <url>` → the user's runs, newest first.
 *
 * **Only `continuable` rows can be resumed.** The server reports whether a run
 * has a saved snapshot to seed from; a run that never reached a provider-valid
 * boundary has none, so resuming it would start from nothing. Callers should
 * offer the action only for those rows and treat the rest as informational — a
 * crashed run worth showing, not worth continuing. {@link continuable} filters
 * for exactly that.
 *
 * **Resume and fork are siblings of the index**, not separate configuration.
 * django-ag-ui mounts all three under one prefix whenever a step store is
 * configured (`runs/`, `resume/<id>/`, `fork/<id>/`), so one URL locates them
 * all and there is no way to configure a half-working set.
 */
export class RunIndex {
  readonly #url: string;
  readonly #headers: HeadersProvider;
  readonly #credentials: CredentialsProvider;

  constructor(
    url: string,
    headers: HeadersProvider = () => ({}),
    credentials: CredentialsProvider = () => undefined,
  ) {
    this.#url = url.endsWith("/") ? url : `${url}/`;
    this.#headers = headers;
    this.#credentials = credentials;
  }

  /**
   * The user's runs, or `[]` when the endpoint is unreachable or answers with
   * an error. A history affordance that cannot load is empty, never broken:
   * the caller renders its empty state rather than surfacing a transport fault
   * the user can do nothing about.
   */
  async list(): Promise<readonly RunRow[]> {
    try {
      const response = await fetch(
        this.#url,
        withCredentials(
          {
            method: "GET",
            headers: { Accept: "application/json", ...this.#headers() },
          },
          this.#credentials(),
        ),
      );
      if (!response.ok) {
        return [];
      }
      const body = (await response.json()) as { runs?: readonly RunRow[] };
      return body.runs ?? [];
    } catch {
      return [];
    }
  }

  /** The rows a client may actually continue. */
  async continuable(): Promise<readonly RunRow[]> {
    return (await this.list()).filter((run) => run.continuable);
  }

  /** The endpoint that continues `runId` as a new run. */
  resumeUrl(runId: string): string {
    return this.#sibling("resume", runId);
  }

  /** The endpoint that branches `runId` into a new run, leaving the source untouched. */
  forkUrl(runId: string): string {
    return this.#sibling("fork", runId);
  }

  /**
   * `<mount>/<verb>/<runId>/`, derived from the index URL's own prefix.
   *
   * Built by string surgery on the trailing `runs/` rather than with `new URL`,
   * because the configured value may be root-relative (`/agent/runs/`) — the
   * common case in a Django template — and `new URL` needs an absolute base.
   */
  #sibling(verb: string, runId: string): string {
    const prefix = this.#url.slice(0, -"runs/".length);
    return `${prefix}${verb}/${encodeURIComponent(runId)}/`;
  }
}
