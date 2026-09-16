import { randomUUID } from "@ag-ui/client";
import {
  type ClientConversationStore,
  SessionStorageStore,
  writeStoredItem,
} from "./conversation_store.js";

/**
 * Storage namespaces already spoken for in this document.
 *
 * Per document rather than per origin, and released on disconnect, because the
 * question it answers is "is another element on this page using these keys right
 * now" — not "has anything ever used them". A registry that never released would
 * turn every remount, and every framework re-render that moves the node, into a
 * false collision that costs the element its own conversation.
 *
 * Module-level on purpose, and the one piece of shared mutable state the
 * repository's `CLAUDE.md` exempts from its rule against it: the question is
 * about the *other* live elements, which no instance field can answer. See the
 * three conditions recorded there before adding anything beside it.
 */
const CLAIMED_NAMESPACES = new Set<string>();

/** What the storage scope needs from the element that owns it. */
export interface StorageScopeHost {
  /** The element's `id`, the namespace it prefers. */
  readonly id: () => string;
  /** The element's `endpoint`, the namespace it falls back to. */
  readonly endpoint: () => string;
}

/**
 * Which storage keys are this element's: the namespace it claims in the
 * document, the key a layout preference is stored under, and the built-in
 * conversation store scoped to it.
 *
 * Owned one-to-one by an `<ag-ui-chat>`. The one thing it shares is the record
 * of claimed namespaces above, which is what keeps two elements apart.
 */
export class StorageScope {
  readonly #host: StorageScopeHost;
  // Per-instance suffix for the origin-scoped storage keys (collapsed / theme /
  // size), so two instances on one origin don't clobber each other. Empty ⇒ the
  // pre-namespacing global keys (back-compat). Resolved on connect; the
  // conversation adds `user-key` on top of it, see conversationNamespace.
  #storageNs = "";
  // The entry this element put in CLAIMED_NAMESPACES, to take back out on
  // disconnect. `null` when it claimed nothing (no id, no endpoint, or it lost
  // the claim to an element that mounted first).
  #claimedNs: string | null = null;
  // The fallback namespace minted when the preferred one was already claimed,
  // with the preferred value it was minted for — so the element keeps it across
  // remounts, but re-resolves if the host answers the warning with an `id`.
  #generatedNs = "";
  #generatedFor = "";
  // The `sessionStorage`-backed store, which the element may therefore re-scope
  // on a principal change. `null` when the host injected a store of its own
  // kind, whose keying the element does not know and must not guess at.
  #builtinStore: SessionStorageStore | null = null;

  constructor(host: StorageScopeHost) {
    this.#host = host;
  }

  /**
   * Resolve the per-instance storage namespace, before any key is read or
   * written, so this instance doesn't share collapsed/theme/thread state with
   * another on the same origin.
   */
  claim(): void {
    this.#storageNs = this.#claimNamespace();
  }

  /**
   * Give the namespace back. A disconnect is not necessarily a farewell — a
   * DOM move and a framework re-render both look like one — and an element
   * that could not reclaim its own namespace on the way back in would lose its
   * conversation to a false collision.
   */
  release(): void {
    if (this.#claimedNs !== null) {
      CLAIMED_NAMESPACES.delete(this.#claimedNs);
      this.#claimedNs = null;
    }
  }

  /**
   * The conversation store's namespace: this element's, scoped to the principal
   * `key` names.
   *
   * Only the conversation is principal-scoped. The panel's own collapsed / size
   * / theme preferences stay on the element's own namespace, because they are
   * this element's UI state rather than anyone's data — they carry no word of
   * what was said — and because they are read once while connecting, so
   * re-scoping them under a live element would rearrange the panel around a
   * user who had only just signed in.
   */
  conversationNamespace(key: string): string {
    return key === "" ? this.#storageNs : `${this.#storageNs}#${key}`;
  }

  /**
   * Namespace the built-in default store, and hand back the store to use. A
   * host-injected store is used verbatim; the built-in one is remembered
   * either way, because it is the element's own store and a later `user-key`
   * change may move it to another namespace.
   */
  scopeStore(store: ClientConversationStore, key: string): ClientConversationStore {
    if (!(store instanceof SessionStorageStore)) {
      return store;
    }
    const namespace = this.conversationNamespace(key);
    this.#builtinStore = namespace === "" ? store : new SessionStorageStore(namespace);
    return this.#builtinStore;
  }

  /**
   * Rebuild the built-in store under `namespace`, or `null` for a store of the
   * host's own kind, which holds its data somewhere the element cannot see and
   * has to scope itself.
   */
  rescopeStore(namespace: string): SessionStorageStore | null {
    if (this.#builtinStore === null) {
      return null;
    }
    this.#builtinStore = new SessionStorageStore(namespace);
    return this.#builtinStore;
  }

  /** This instance's namespaced form of an origin-scoped storage key. */
  key(base: string): string {
    return this.#storageNs === "" ? base : `${base}:${this.#storageNs}`;
  }

  /**
   * Read a namespaced origin-scoped value, falling back once to the legacy
   * pre-namespacing global key (left in place) so an existing collapsed/theme
   * preference survives the upgrade.
   */
  readScopedItem(base: string): string | null {
    const scoped = sessionStorage.getItem(this.key(base));
    if (scoped !== null || this.#storageNs === "") {
      return scoped;
    }
    return sessionStorage.getItem(base);
  }

  /**
   * Read a layout preference: where the widget sits, how big it is, which
   * theme it wears.
   *
   * These live in `localStorage` rather than beside the transcript, because a
   * layout preference is not a conversation. The transcript is deliberately
   * per-tab -- two tabs are two conversations, and closing the tab ends it --
   * and everything else inherited that scoping without earning it. A user who
   * dragged the panel clear of their own UI did it again in the next tab, and
   * again after every restart.
   *
   * Whether the widget is *currently open* stays per-tab with the transcript.
   * It is a statement about this tab rather than a preference: carrying it
   * across would pop the panel open on every new tab because it was opened
   * once, somewhere else.
   *
   * Falls back to the session value it used to be written to, so an existing
   * position survives the upgrade rather than resetting once.
   */
  readPreference(base: string): string | null {
    try {
      const stored = localStorage.getItem(this.key(base));
      if (stored !== null) {
        return stored;
      }
    } catch {
      // Fall through to the per-tab copy below.
    }
    return this.readScopedItem(base);
  }

  /**
   * Persist a layout preference as durably as this browser allows: to
   * `localStorage` so it outlives the tab, and to the per-tab store as well.
   *
   * The second write is not redundancy for its own sake. A privacy mode can
   * deny `localStorage` while allowing `sessionStorage`, and losing the
   * durable copy should degrade to the per-tab behaviour this replaced rather
   * than to no persistence at all. The read above prefers the durable copy, so
   * a tab that has both cannot be shadowed by its own stale one.
   *
   * Neither write is worth an exception. Losing where the panel sat is not
   * worth a warning either -- unlike the transcript, which says so once,
   * because losing that loses the conversation on the next reload.
   */
  writePreference(base: string, value: string): void {
    const key = this.key(base);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Quota, or a store that denies writes.
    }
    writeStoredItem(key, value);
  }

  /**
   * Drop a layout preference from both stores.
   *
   * The mirror of {@link writePreference}, and it has to clear both for the
   * same reason that writes both: leaving either copy behind means the value
   * comes back on the next read.
   */
  clearPreference(base: string): void {
    const key = this.key(base);
    try {
      localStorage.removeItem(key);
    } catch {
      // A store that denies access; the per-tab copy below still goes.
    }
    try {
      sessionStorage.removeItem(key);
    } catch {
      // Nothing left to do: the value was never persisted in the first place.
    }
  }

  /**
   * Claim this element's storage namespace: its `id`, else its `endpoint`.
   *
   * The endpoint fallback exists so a lone widget restores its conversation
   * across reloads with nothing asked of the page author. It stops working the
   * moment there are two of them — a docked support panel and an inline page
   * assistant against one agent mount, neither carrying an `id`, which nothing
   * requires — because both resolve to the same string and then share a thread
   * pointer, a drawer index and every message key. Whichever mounts second
   * adopts the first's active thread and rehydrates its transcript into its own
   * panel: one conversation's content inside another, on the same page.
   *
   * So the namespace is claimed by the first element to mount under it, and a
   * second is given one of its own plus a warning naming the fix. The first
   * element keeps the endpoint namespace, which is what leaves the ordinary
   * single-element case exactly as it was.
   *
   * The generated namespace is random rather than derived from mount order.
   * That costs the second element its history across reloads — the warning says
   * so, and an `id` fixes it — which is the honest trade against an order-based
   * name that would silently hand a stored conversation to whichever element
   * happened to mount second on the next load.
   */
  #claimNamespace(): string {
    const id = this.#host.id();
    const preferred = id !== "" ? id : this.#host.endpoint();
    // Nothing to key on. The pre-namespacing global keys, as before: an element
    // with neither an id nor an endpoint cannot send anything, so what it would
    // be claiming is an empty conversation.
    if (preferred === "") {
      return "";
    }
    // Already lost this claim once. Keep the fallback rather than drifting back
    // onto a namespace the other element may since have released, which would
    // swap this panel's conversation for that one's.
    if (this.#generatedFor === preferred) {
      return this.#generatedNs;
    }
    if (!CLAIMED_NAMESPACES.has(preferred)) {
      CLAIMED_NAMESPACES.add(preferred);
      this.#claimedNs = preferred;
      return preferred;
    }
    this.#generatedFor = preferred;
    this.#generatedNs = `${preferred}~${randomUUID()}`;
    console.warn(
      `<ag-ui-chat>: another element on this page already stores its ` +
        `conversation under "${preferred}", so this one has been given a ` +
        "throwaway namespace of its own — the two would otherwise share a " +
        "thread pointer, a history drawer and every message. Give each " +
        "<ag-ui-chat> its own id to keep them apart and let this one restore " +
        "its conversation across reloads.",
    );
    return this.#generatedNs;
  }
}
