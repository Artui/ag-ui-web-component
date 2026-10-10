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
  /** How many more constructions throw, then how many more `start()` calls. */
  static constructFailures = 0;
  static startFailures = 0;
  mimeType = "audio/webm";
  state: "inactive" | "recording" = "inactive";
  readonly #listeners = new Map<string, Listener[]>();

  constructor(readonly stream: FakeMediaStream) {
    // Before the push, so recorder() answers with the one that did construct.
    if (FakeMediaRecorder.constructFailures > 0) {
      FakeMediaRecorder.constructFailures -= 1;
      throw new DOMException("The stream cannot be recorded", "NotSupportedError");
    }
    FakeMediaRecorder.instances.push(this);
  }

  addEventListener(type: string, cb: Listener): void {
    const list = this.#listeners.get(type) ?? [];
    list.push(cb);
    this.#listeners.set(type, list);
  }

  start(): void {
    // The state stays inactive, as it does for a recorder the browser refused.
    if (FakeMediaRecorder.startFailures > 0) {
      FakeMediaRecorder.startFailures -= 1;
      throw new DOMException("The recorder could not start", "NotSupportedError");
    }
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
  /** Every stream `getUserMedia` has handed out, in order. */
  streams(): FakeMediaStream[];
  restore(): void;
}

/**
 * Install the fakes. With `deny: true`, `getUserMedia` rejects (permission
 * denied / no device). `failConstruct` and `failStart` make that many
 * recorders throw a `NotSupportedError` from the constructor, or from
 * `start()`, before behaving normally: a granted stream the browser then
 * cannot record. Call `restore()` afterwards.
 */
export function installFakeMedia({
  deny = false,
  failConstruct = 0,
  failStart = 0,
} = {}): FakeMediaController {
  FakeMediaRecorder.instances = [];
  FakeMediaRecorder.constructFailures = failConstruct;
  FakeMediaRecorder.startFailures = failStart;
  const streams: FakeMediaStream[] = [];
  const g = globalThis as Record<string, unknown>;
  const originalRecorder = g["MediaRecorder"];
  const originalMediaDevices = (globalThis.navigator as { mediaDevices?: unknown }).mediaDevices;

  g["MediaRecorder"] = FakeMediaRecorder;
  Object.defineProperty(globalThis.navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: () => {
        if (deny) {
          return Promise.reject(new Error("denied"));
        }
        const stream = new FakeMediaStream();
        streams.push(stream);
        return Promise.resolve(stream);
      },
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
    streams(): FakeMediaStream[] {
      return streams;
    },
    restore(): void {
      FakeMediaRecorder.constructFailures = 0;
      FakeMediaRecorder.startFailures = 0;
      g["MediaRecorder"] = originalRecorder;
      Object.defineProperty(globalThis.navigator, "mediaDevices", {
        configurable: true,
        value: originalMediaDevices,
      });
    },
  };
}
