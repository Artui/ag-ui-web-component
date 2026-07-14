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
  icon.textContent = iconFor(ref.mime);
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

/** A coarse type icon for a chip — image, document, or generic file. */
export function iconFor(mime: string): string {
  if (mime.startsWith("image/")) {
    return "🖼";
  }
  if (mime === "application/pdf") {
    return "📕";
  }
  if (mime.startsWith("text/")) {
    return "📄";
  }
  return "📎";
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
