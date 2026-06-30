/** Controllable fakes for `navigator.mediaDevices.getUserMedia` + `MediaRecorder`
 * (neither exists in happy-dom), for the voice-input tests. */

type Listener = (event?: unknown) => void;

/** A fake mic track that records whether it was stopped. */
class FakeTrack {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

/** A fake `MediaStream` exposing one stoppable track. */
export class FakeMediaStream {
  readonly track = new FakeTrack();
  getTracks(): FakeTrack[] {
    return [this.track];
  }
}

/** A fake `MediaRecorder` driven by {@link stop} (which flushes data + fires stop). */
export class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  mimeType = "audio/webm";
  state: "inactive" | "recording" = "inactive";
  readonly #listeners = new Map<string, Listener[]>();

  constructor(readonly stream: FakeMediaStream) {
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, cb: Listener): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(cb);
    this.#listeners.set(type, list);
  }

  start(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.#emit("dataavailable", { data: new Blob(["audio-bytes"], { type: this.mimeType }) });
    this.#emit("stop");
  }

  #emit(type: string, event?: unknown): void {
    for (const cb of this.#listeners.get(type) ?? []) {
      cb(event);
    }
  }
}

/** Handle returned by {@link installFakeMedia}. */
export interface FakeMediaController {
  /** The most recently constructed recorder (throws if none). */
  recorder(): FakeMediaRecorder;
  restore(): void;
}

/**
 * Install the fakes. With `deny: true`, `getUserMedia` rejects (permission
 * denied / no device). Call `restore()` afterwards.
 */
export function installFakeMedia({ deny = false } = {}): FakeMediaController {
  FakeMediaRecorder.instances = [];
  const g = globalThis as Record<string, unknown>;
  const originalRecorder = g["MediaRecorder"];
  const originalMediaDevices = (globalThis.navigator as { mediaDevices?: unknown }).mediaDevices;

  g["MediaRecorder"] = FakeMediaRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () =>
        deny ? Promise.reject(new Error("denied")) : Promise.resolve(new FakeMediaStream()),
    },
  });

  return {
    recorder(): FakeMediaRecorder {
      const last = FakeMediaRecorder.instances.at(-1);
      if (last === undefined) {
        throw new Error("no MediaRecorder was created");
      }
      return last;
    },
    restore(): void {
      g["MediaRecorder"] = originalRecorder;
      Object.defineProperty(globalThis.navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    },
  };
}
