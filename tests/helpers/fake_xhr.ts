/** A controllable fake `XMLHttpRequest` for upload tests (progress + result). */

type Listener = (event?: unknown) => void;

/** One fake request; drive it with {@link succeed} / {@link fail} / {@link emitProgress}. */
export class FakeXhr {
  method = "";
  url = "";
  status = 0;
  responseText = "";
  body: unknown = null;
  aborted = false;
  readonly headers: Record<string, string> = {};
  readonly #listeners = new Map<string, Listener[]>();
  readonly #uploadListeners = new Map<string, Listener[]>();
  readonly upload = {
    addEventListener: (type: string, cb: Listener): void => {
      this.#push(this.#uploadListeners, type, cb);
    },
  };

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string): void {
    this.headers[key] = value;
  }

  addEventListener(type: string, cb: Listener): void {
    this.#push(this.#listeners, type, cb);
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.#emit(this.#listeners, "abort");
  }

  /** Drive an upload-progress event. */
  emitProgress(loaded: number, total: number, lengthComputable = true): void {
    this.#emit(this.#uploadListeners, "progress", { loaded, total, lengthComputable });
  }

  /** Settle the request with a status + body, firing `load`. */
  succeed(status: number, responseText: string): void {
    this.status = status;
    this.responseText = responseText;
    this.#emit(this.#listeners, "load");
  }

  /** Fire a network `error`. */
  fail(): void {
    this.#emit(this.#listeners, "error");
  }

  #push(map: Map<string, Listener[]>, type: string, cb: Listener): void {
    const list = map.get(type) ?? [];
    list.push(cb);
    map.set(type, list);
  }

  #emit(map: Map<string, Listener[]>, type: string, event?: unknown): void {
    for (const cb of map.get(type) ?? []) {
      cb(event);
    }
  }
}

/** Handle returned by {@link installFakeXhr}. */
export interface FakeXhrController {
  readonly instances: FakeXhr[];
  /** The most recently created request (throws if none). */
  last(): FakeXhr;
  restore(): void;
}

/** Replace `globalThis.XMLHttpRequest` with the fake; call `restore()` after. */
export function installFakeXhr(): FakeXhrController {
  const instances: FakeXhr[] = [];
  const original = globalThis.XMLHttpRequest;
  class Ctor extends FakeXhr {
    constructor() {
      super();
      instances.push(this);
    }
  }
  (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = Ctor;
  return {
    instances,
    last(): FakeXhr {
      const xhr = instances.at(-1);
      if (xhr === undefined) {
        throw new Error("no XHR was created");
      }
      return xhr;
    },
    restore(): void {
      (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = original;
    },
  };
}
