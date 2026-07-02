import type { Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { type AttachmentRef, messageAttachments } from "../src/core/attachment.js";

const REF: AttachmentRef = { id: "a1", name: "notes.txt", mime: "text/plain", size: 12 };

describe("messageAttachments", () => {
  it("reads the refs a user message carries", () => {
    const message = { id: "u1", role: "user", content: "hi", attachments: [REF] } as Message;
    expect(messageAttachments(message)).toEqual([REF]);
  });

  it("returns an empty array when the message has none", () => {
    const message = { id: "u1", role: "user", content: "hi" } as Message;
    expect(messageAttachments(message)).toEqual([]);
  });

  it("ignores a non-array attachments field", () => {
    const message = { id: "u1", role: "user", content: "hi", attachments: "nope" } as Message;
    expect(messageAttachments(message)).toEqual([]);
  });

  it("drops malformed entries, keeping the valid ones", () => {
    const message = {
      id: "u1",
      role: "user",
      content: "hi",
      attachments: [
        null,
        REF,
        "nope",
        { id: "a2", name: "x", mime: "text/plain" }, // missing size
        { id: 1, name: "x", mime: "text/plain", size: 2 }, // non-string id
        { ...REF, url: 42 }, // non-string url
      ],
    } as Message;
    expect(messageAttachments(message)).toEqual([REF]);
  });

  it("keeps an entry with a valid string url", () => {
    const withUrl: AttachmentRef = { ...REF, url: "https://x/f" };
    const message = { id: "u1", role: "user", content: "hi", attachments: [withUrl] } as Message;
    expect(messageAttachments(message)).toEqual([withUrl]);
  });
});
