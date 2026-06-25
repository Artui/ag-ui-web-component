import { describe, expect, it, vi } from "vitest";
import type { AttachmentRef } from "../src/core/attachment.js";
import { AttachmentTray, type AttachmentTrayConfig } from "../src/ui/attachment_tray.js";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface UploadCall {
  file: File;
  onProgress: (fraction: number) => void;
  deferred: Deferred<AttachmentRef>;
}

function makeUploader(): { upload: AttachmentTrayConfig["upload"]; calls: UploadCall[] } {
  const calls: UploadCall[] = [];
  const upload: AttachmentTrayConfig["upload"] = (file, onProgress) => {
    const d = deferred<AttachmentRef>();
    calls.push({ file, onProgress, deferred: d });
    return d.promise;
  };
  return { upload, calls };
}

function makeTray(over: Partial<AttachmentTrayConfig> = {}): {
  tray: AttachmentTray;
  calls: UploadCall[];
  onChange: ReturnType<typeof vi.fn>;
} {
  const { upload, calls } = makeUploader();
  const onChange = vi.fn();
  const tray = new AttachmentTray({ upload, maxBytes: 0, accept: "", onChange, ...over });
  return { tray, calls, onChange };
}

function file(name = "notes.txt", type = "text/plain", size = 10): File {
  const blob = new File(["x".repeat(size)], name, { type });
  return blob;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
}

const REF: AttachmentRef = { id: "a1", name: "notes.txt", mime: "text/plain", size: 10 };

describe("AttachmentTray", () => {
  it("starts hidden and empty", () => {
    const { tray } = makeTray();
    expect(tray.element.hidden).toBe(true);
    expect(tray.isEmpty()).toBe(true);
    expect(tray.readyRefs()).toEqual([]);
  });

  it("shows an uploading chip, then a ready chip with the ref", async () => {
    const { tray, calls, onChange } = makeTray();
    tray.add(file());
    expect(tray.element.hidden).toBe(false);
    expect(tray.element.querySelector(".attachment-chip--uploading")).not.toBeNull();
    expect(tray.hasPending()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1); // on add

    calls[0]?.deferred.resolve(REF);
    await flush();

    expect(tray.element.querySelector(".attachment-chip--ready")).not.toBeNull();
    expect(tray.readyRefs()).toEqual([REF]);
    expect(tray.hasPending()).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(2); // + on settle
  });

  it("renders the progress bar from the upload fraction", () => {
    const { tray, calls } = makeTray();
    tray.add(file());
    calls[0]?.onProgress(0.42);
    const fill = tray.element.querySelector<HTMLDivElement>(".attachment-chip-bar-fill");
    expect(fill?.style.width).toBe("42%");
  });

  it("rejects an oversize file into an error chip without uploading", () => {
    const { tray, calls } = makeTray({ maxBytes: 5 });
    tray.add(file("big.txt", "text/plain", 10));
    expect(calls).toHaveLength(0);
    const chip = tray.element.querySelector(".attachment-chip--error");
    expect(chip?.querySelector(".attachment-chip-size")?.textContent).toContain("Too large");
  });

  it("rejects a disallowed type into an error chip", () => {
    const { tray, calls } = makeTray({ accept: "image/*" });
    tray.add(file("notes.txt", "text/plain"));
    expect(calls).toHaveLength(0);
    expect(tray.element.querySelector(".attachment-chip--error")?.textContent).toContain(
      "not allowed",
    );
  });

  it("accepts by extension, wildcard, and exact type", () => {
    const ext = makeTray({ accept: ".txt" });
    ext.tray.add(file("a.txt", ""));
    expect(ext.calls).toHaveLength(1);

    const wild = makeTray({ accept: "image/*" });
    wild.tray.add(file("a.png", "image/png"));
    expect(wild.calls).toHaveLength(1);

    const exact = makeTray({ accept: "text/plain , image/png" });
    exact.tray.add(file("a.txt", "text/plain"));
    expect(exact.calls).toHaveLength(1);
  });

  it("shows an error chip with the failure message and retries", async () => {
    const { tray, calls } = makeTray();
    tray.add(file());
    calls[0]?.deferred.reject(new Error("server exploded"));
    await flush();
    expect(tray.element.querySelector(".attachment-chip--error")?.textContent).toContain(
      "server exploded",
    );

    tray.element.querySelector<HTMLButtonElement>(".attachment-chip-retry")?.click();
    expect(calls).toHaveLength(2); // retried
    calls[1]?.deferred.resolve(REF);
    await flush();
    expect(tray.readyRefs()).toEqual([REF]);
  });

  it("uses a generic message for a non-Error rejection", async () => {
    const { tray, calls } = makeTray();
    tray.add(file());
    calls[0]?.deferred.reject("nope");
    await flush();
    expect(tray.element.querySelector(".attachment-chip--error")?.textContent).toContain(
      "upload failed",
    );
  });

  it("removes a chip via its ✕ control", async () => {
    const { tray, calls, onChange } = makeTray();
    tray.add(file());
    calls[0]?.deferred.resolve(REF);
    await flush();
    onChange.mockClear();

    tray.element.querySelector<HTMLButtonElement>(".attachment-chip-remove")?.click();
    expect(tray.isEmpty()).toBe(true);
    expect(tray.element.hidden).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clearReady drops settled chips but keeps in-flight uploads", async () => {
    const { tray, calls } = makeTray();
    tray.add(file("ready.txt"));
    tray.add(file("slow.txt"));
    calls[0]?.deferred.resolve(REF);
    await flush();

    tray.clearReady();
    expect(tray.readyRefs()).toEqual([]);
    expect(tray.hasPending()).toBe(true); // the slow one survives
    expect(tray.element.querySelectorAll(".attachment-chip")).toHaveLength(1);
  });

  it("clear drops every chip", async () => {
    const { tray, calls } = makeTray();
    tray.add(file());
    calls[0]?.deferred.resolve(REF);
    await flush();
    tray.clear();
    expect(tray.isEmpty()).toBe(true);
    expect(tray.element.hidden).toBe(true);
  });

  it("works without an onChange callback", () => {
    const { upload } = makeUploader();
    const tray = new AttachmentTray({ upload, maxBytes: 0, accept: "" });
    tray.add(file());
    expect(tray.isEmpty()).toBe(false);
  });
});
