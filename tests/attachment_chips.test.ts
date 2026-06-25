import { describe, expect, it } from "vitest";
import type { AttachmentRef } from "../src/core/attachment.js";
import { formatBytes, iconFor, renderAttachmentChips } from "../src/ui/attachment_chips.js";

function ref(over: Partial<AttachmentRef> = {}): AttachmentRef {
  return { id: "a1", name: "notes.txt", mime: "text/plain", size: 1234, ...over };
}

describe("renderAttachmentChips", () => {
  it("renders one chip per ref with name and size", () => {
    const list = renderAttachmentChips([
      ref(),
      ref({ id: "a2", name: "photo.png", mime: "image/png" }),
    ]);
    const chips = list.querySelectorAll(".attachment-chip");
    expect(chips).toHaveLength(2);
    expect(list.querySelector(".attachment-chip-name")?.textContent).toBe("notes.txt");
    expect(list.querySelector(".attachment-chip-size")?.textContent).toBe("1.2 KB");
  });

  it("renders an empty container for no refs", () => {
    expect(renderAttachmentChips([]).children).toHaveLength(0);
  });
});

describe("iconFor", () => {
  it("maps mime families to icons", () => {
    expect(iconFor("image/png")).toBe("🖼");
    expect(iconFor("application/pdf")).toBe("📕");
    expect(iconFor("text/plain")).toBe("📄");
    expect(iconFor("application/zip")).toBe("📎");
  });
});

describe("formatBytes", () => {
  it("formats across units with sensible rounding", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(20 * 1024)).toBe("20 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3 GB");
  });
});
