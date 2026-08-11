import { afterEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "../src/core/transcribe_audio.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("transcribeAudio", () => {
  it("POSTs the clip as multipart audio and returns the text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: "hello there" }));
    vi.stubGlobal("fetch", fetchMock);

    const audio = new Blob(["bytes"], { type: "audio/webm" });
    const text = await transcribeAudio(audio, {
      url: "/agent/transcribe/",
      headers: { "X-CSRFToken": "t" },
    });

    expect(text).toBe("hello there");
    const call = fetchMock.mock.calls[0];
    if (call === undefined) {
      throw new Error("expected a fetch call");
    }
    const [url, init] = call;
    expect(url).toBe("/agent/transcribe/");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "X-CSRFToken": "t" });
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("audio")).toBeInstanceOf(Blob);
  });

  it("sends the configured credentials mode, and none when unset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: "hi" }));
    vi.stubGlobal("fetch", fetchMock);

    await transcribeAudio(new Blob(["x"]), { url: "/t/", credentials: "include" });
    await transcribeAudio(new Blob(["x"]), { url: "/t/" });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
    expect(fetchMock.mock.calls[1]?.[1]).not.toHaveProperty("credentials");
  });

  it("rejects with the server error message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "audio exceeds the limit" }, false, 413)),
    );
    await expect(transcribeAudio(new Blob(["x"]), { url: "/agent/transcribe/" })).rejects.toThrow(
      "audio exceeds the limit",
    );
  });

  it("falls back to the status code when the error body has no message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("not json")),
      } as unknown as Response),
    );
    await expect(transcribeAudio(new Blob(["x"]), { url: "/agent/transcribe/" })).rejects.toThrow(
      "transcription failed (500)",
    );
  });

  it("falls back to the status code when the error field is not a string", async () => {
    // A well-formed JSON error body whose `error` is a nested object — DRF's
    // own validation-error shape. Only a string is safe to surface verbatim.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { audio: ["too large"] } }, false, 400)),
    );
    await expect(transcribeAudio(new Blob(["x"]), { url: "/agent/transcribe/" })).rejects.toThrow(
      "transcription failed (400)",
    );
  });

  it("rejects when the success body has no text field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ nope: 1 })));
    await expect(transcribeAudio(new Blob(["x"]), { url: "/agent/transcribe/" })).rejects.toThrow(
      "unreadable response",
    );
  });

  it("omits custom headers when none are given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ text: "ok" }));
    vi.stubGlobal("fetch", fetchMock);
    await transcribeAudio(new Blob(["x"]), { url: "/agent/transcribe/" });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({});
  });
});
