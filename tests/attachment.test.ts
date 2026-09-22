import type { Message } from "@ag-ui/core";
import { describe, expect, it } from "vitest";
import { type AttachmentRef, messageAttachments } from "../src/core/attachment.js";

const REF: AttachmentRef = { id: "a1", name: "notes.txt", mime: "text/plain", size: 12 };
const OTHER: AttachmentRef = { id: "a2", name: "older.txt", mime: "text/plain", size: 3 };

/** A user message carrying `refs` in its metadata, where this release writes them. */
function carrying(refs: unknown): Message {
  return { id: "u1", role: "user", content: "hi", metadata: { attachments: refs } } as Message;
}

describe("messageAttachments", () => {
  it("reads the refs a user message carries in its metadata", () => {
    expect(messageAttachments(carrying([REF]))).toEqual([REF]);
  });

  it("reads the refs an earlier release stored at the top level", () => {
    // Every conversation stored before the refs moved into metadata, which a
    // reload has to keep showing with its chips.
    const message = { id: "u1", role: "user", content: "hi", attachments: [REF] } as Message;
    expect(messageAttachments(message)).toEqual([REF]);
  });

  it("reads the metadata first when a message carries both", () => {
    const message = {
      id: "u1",
      role: "user",
      content: "hi",
      attachments: [OTHER],
      metadata: { attachments: [REF] },
    } as Message;
    expect(messageAttachments(message)).toEqual([REF]);
  });

  it("falls back to the top level when the metadata holds something else", () => {
    const message = {
      id: "u1",
      role: "user",
      content: "hi",
      attachments: [REF],
      metadata: { note: "unrelated" },
    } as Message;
    expect(messageAttachments(message)).toEqual([REF]);
  });

  it("returns an empty array when the message has none", () => {
    const message = { id: "u1", role: "user", content: "hi" } as Message;
    expect(messageAttachments(message)).toEqual([]);
  });

  it("ignores a non-array attachments field", () => {
    expect(messageAttachments(carrying("nope"))).toEqual([]);
    const message = { id: "u1", role: "user", content: "hi", attachments: "nope" } as Message;
    expect(messageAttachments(message)).toEqual([]);
  });

  it("reads no metadata out of a metadata that is not an object", () => {
    // A store is not trusted to hold the shape anything here wrote.
    const message = { id: "u1", role: "user", content: "hi", metadata: "nope" } as never;
    expect(messageAttachments(message)).toEqual([]);
  });

  it("drops malformed entries, keeping the valid ones", () => {
    const refs = [
      null,
      REF,
      "nope",
      { id: "a2", name: "x", mime: "text/plain" }, // missing size
      { id: 1, name: "x", mime: "text/plain", size: 2 }, // non-string id
      { ...REF, url: 42 }, // non-string url
    ];
    expect(messageAttachments(carrying(refs))).toEqual([REF]);
    const legacy = { id: "u1", role: "user", content: "hi", attachments: refs } as Message;
    expect(messageAttachments(legacy)).toEqual([REF]);
  });

  it("keeps an entry with a valid string url", () => {
    const withUrl: AttachmentRef = { ...REF, url: "https://x/f" };
    expect(messageAttachments(carrying([withUrl]))).toEqual([withUrl]);
  });
});
