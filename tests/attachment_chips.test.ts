import { describe, expect, it } from "vitest";
import { ICON_FILE, ICON_FILE_IMAGE, ICON_FILE_PDF, ICON_FILE_TEXT } from "../src/constants.js";
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

  it("draws the type mark as an inline SVG glyph", () => {
    const list = renderAttachmentChips([ref({ mime: "application/pdf" })]);
    const icon = list.querySelector(".attachment-chip-icon");
    expect(icon?.querySelector("svg")?.getAttribute("class")).toBe("glyph");
    expect(icon?.textContent).toBe("");
  });

  it("renders an empty container for no refs", () => {
    expect(renderAttachmentChips([]).children).toHaveLength(0);
  });

  it("exposes ::part() attributes for external styling", () => {
    const list = renderAttachmentChips([ref()]);
    expect(list.getAttribute("part")).toBe("attachment-chips");
    const parts = [list, ...list.querySelectorAll("[part]")].map((n) => n.getAttribute("part"));
    for (const part of [
      "attachment-chips",
      "attachment-chip",
      "attachment-chip-icon",
      "attachment-chip-name",
      "attachment-chip-size",
    ]) {
      expect(parts).toContain(part);
    }
  });
});

describe("iconFor", () => {
  it("maps mime families to the built-in glyphs", () => {
    expect(iconFor("image/png")).toBe(ICON_FILE_IMAGE);
    expect(iconFor("application/pdf")).toBe(ICON_FILE_PDF);
    expect(iconFor("text/plain")).toBe(ICON_FILE_TEXT);
    expect(iconFor("application/zip")).toBe(ICON_FILE);
  });

  it("returns inline SVG carrying the shared glyph class, not a character", () => {
    // The chips sit beside the composer's SVG buttons, so they have to be the
    // same kind of mark: sized and painted by the .glyph rule rather than by
    // whatever the platform's emoji font decides.
    for (const mime of ["image/png", "application/pdf", "text/plain", "application/zip"]) {
      expect(iconFor(mime)).toMatch(/^<svg class="glyph" viewBox="0 0 24 24"/);
    }
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
