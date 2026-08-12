import { ICON_FILE, ICON_FILE_IMAGE, ICON_FILE_PDF, ICON_FILE_TEXT } from "../constants.js";
import type { AttachmentRef } from "../core/attachment.js";

/**
 * Render the read-only attachment chips shown on a sent user message bubble
 * (and on restored history) — one chip per ref with a type icon, the filename,
 * and a human size. Static by design: no progress, no remove (that lives in the
 * composer tray); a restored bubble re-renders these with no animation.
 */
export function renderAttachmentChips(refs: readonly AttachmentRef[]): HTMLDivElement {
  const list = document.createElement("div");
  list.className = "attachment-chips";
  list.setAttribute("part", "attachment-chips");
  for (const ref of refs) {
    list.appendChild(renderChip(ref));
  }
  return list;
}

function renderChip(ref: AttachmentRef): HTMLDivElement {
  const chip = document.createElement("div");
  chip.className = "attachment-chip attachment-chip--ready";
  chip.setAttribute("part", "attachment-chip");

  const icon = document.createElement("span");
  icon.className = "attachment-chip-icon";
  icon.setAttribute("part", "attachment-chip-icon");
  icon.innerHTML = iconFor(ref.mime);
  icon.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "attachment-chip-name";
  name.setAttribute("part", "attachment-chip-name");
  name.textContent = ref.name;
  name.title = ref.name;

  const size = document.createElement("span");
  size.className = "attachment-chip-size";
  size.setAttribute("part", "attachment-chip-size");
  size.textContent = formatBytes(ref.size);

  chip.append(icon, name, size);
  return chip;
}

/**
 * A coarse type mark for a chip — image, PDF, text document, or generic file —
 * as the inline SVG markup of one of the built-in glyphs.
 *
 * Returns markup rather than a character because chips sit beside the
 * composer's SVG send, attach and mic buttons: emoji render at a different
 * optical weight, vary by platform, and take neither the glyph size nor
 * `currentColor`, so the two never matched.
 *
 * The MIME string only selects among author-written constants and is never
 * interpolated into one, so the result is safe to assign as markup.
 */
export function iconFor(mime: string): string {
  if (mime.startsWith("image/")) {
    return ICON_FILE_IMAGE;
  }
  if (mime === "application/pdf") {
    return ICON_FILE_PDF;
  }
  if (mime.startsWith("text/")) {
    return ICON_FILE_TEXT;
  }
  return ICON_FILE;
}

/** A compact human-readable byte size (e.g. `1.2 MB`). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded} ${units[unit]}`;
}
