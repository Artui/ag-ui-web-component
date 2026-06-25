import { randomUUID } from "@ag-ui/client";
import { ATTACHMENT_STATUS } from "../constants.js";
import type { AttachmentRef } from "../core/attachment.js";
import type { UploadHandler } from "../core/upload_attachment.js";
import { formatBytes, iconFor } from "./attachment_chips.js";

/** Status of a pending tray chip. */
type AttachmentStatus = (typeof ATTACHMENT_STATUS)[keyof typeof ATTACHMENT_STATUS];

/** Config the host ({@link AgUiChat}) hands the tray. */
export interface AttachmentTrayConfig {
  /** Upload one file, reporting `0..1` progress; resolves to a durable ref. */
  readonly upload: UploadHandler;
  /** Client-side size cap in bytes (`0` = no cap). The server stays authoritative. */
  readonly maxBytes: number;
  /** Client-side accept list (`<input accept>` syntax; `""` = any). */
  readonly accept: string;
  /** Fired when the set of attachments changes (add / settle / remove). */
  readonly onChange?: () => void;
}

/** One pending file in the tray, from pick to ready/error. */
interface TrayItem {
  readonly localId: string;
  readonly file: File;
  status: AttachmentStatus;
  progress: number;
  ref: AttachmentRef | null;
  error: string;
}

/**
 * The composer's pending-attachments tray: a chip per picked file with a
 * progress bar while it uploads, settling to a ready chip (holding the durable
 * ref) or an error chip (with retry). A *stateful view* in the spirit of
 * {@link ThreadDrawer} — the host appends {@link element}, calls {@link add} on
 * pick/drop, reads {@link readyRefs} when the user sends, and clears it.
 *
 * Client-side size/type guards reject a bad file into an error chip without
 * uploading — instant feedback, but the server is the authority.
 */
export class AttachmentTray {
  /** The tray root; append above the input row. Hidden while empty. */
  readonly element: HTMLDivElement;

  readonly #config: AttachmentTrayConfig;
  #items: TrayItem[] = [];

  constructor(config: AttachmentTrayConfig) {
    this.#config = config;
    this.element = document.createElement("div");
    this.element.className = "attachment-tray";
    this.element.hidden = true;
  }

  /** Queue a file: reject oversize/disallowed into an error chip, else upload. */
  add(file: File): void {
    const item: TrayItem = {
      localId: randomUUID(),
      file,
      status: ATTACHMENT_STATUS.UPLOADING,
      progress: 0,
      ref: null,
      error: "",
    };
    this.#items.push(item);
    const rejection = this.#reject(file);
    if (rejection !== null) {
      item.status = ATTACHMENT_STATUS.ERROR;
      item.error = rejection;
      this.#render();
      this.#config.onChange?.();
      return;
    }
    this.#render();
    this.#config.onChange?.();
    this.#upload(item);
  }

  /** The durable refs of every chip that finished uploading. */
  readyRefs(): readonly AttachmentRef[] {
    const refs: AttachmentRef[] = [];
    for (const item of this.#items) {
      if (item.ref !== null) {
        refs.push(item.ref);
      }
    }
    return refs;
  }

  /** Whether any chip is still uploading (a send would drop nothing if false). */
  hasPending(): boolean {
    return this.#items.some((item) => item.status === ATTACHMENT_STATUS.UPLOADING);
  }

  /** Whether the tray holds no chips. */
  isEmpty(): boolean {
    return this.#items.length === 0;
  }

  /** Drop the settled (ready / error) chips, leaving any still uploading. */
  clearReady(): void {
    this.#items = this.#items.filter((item) => item.status === ATTACHMENT_STATUS.UPLOADING);
    this.#render();
  }

  /** Drop every chip (a reset / new-chat). */
  clear(): void {
    this.#items = [];
    this.#render();
  }

  /** The size/type rejection reason for a file, or `null` when accepted. */
  #reject(file: File): string | null {
    if (this.#config.maxBytes > 0 && file.size > this.#config.maxBytes) {
      return `Too large (max ${formatBytes(this.#config.maxBytes)})`;
    }
    if (!accepts(this.#config.accept, file)) {
      return "File type not allowed";
    }
    return null;
  }

  #upload(item: TrayItem): void {
    item.status = ATTACHMENT_STATUS.UPLOADING;
    item.progress = 0;
    item.error = "";
    this.#render();
    this.#config
      .upload(item.file, (fraction) => {
        item.progress = fraction;
        this.#render();
      })
      .then((ref) => {
        item.status = ATTACHMENT_STATUS.READY;
        item.ref = ref;
      })
      .catch((error: unknown) => {
        item.status = ATTACHMENT_STATUS.ERROR;
        item.error = error instanceof Error ? error.message : "upload failed";
      })
      .finally(() => {
        this.#render();
        this.#config.onChange?.();
      });
  }

  #remove(item: TrayItem): void {
    this.#items = this.#items.filter((other) => other !== item);
    this.#render();
    this.#config.onChange?.();
  }

  #render(): void {
    this.element.replaceChildren();
    this.element.hidden = this.#items.length === 0;
    for (const item of this.#items) {
      this.element.appendChild(this.#renderChip(item));
    }
  }

  #renderChip(item: TrayItem): HTMLDivElement {
    const chip = document.createElement("div");
    chip.className = `attachment-chip attachment-chip--${item.status}`;

    const icon = document.createElement("span");
    icon.className = "attachment-chip-icon";
    icon.textContent = iconFor(item.file.type);
    icon.setAttribute("aria-hidden", "true");

    const name = document.createElement("span");
    name.className = "attachment-chip-name";
    name.textContent = item.file.name;
    name.title = item.file.name;

    const meta = document.createElement("span");
    meta.className = "attachment-chip-size";
    meta.textContent =
      item.status === ATTACHMENT_STATUS.ERROR ? item.error : formatBytes(item.file.size);

    chip.append(icon, name, meta);

    if (item.status === ATTACHMENT_STATUS.UPLOADING) {
      const bar = document.createElement("div");
      bar.className = "attachment-chip-bar";
      const fill = document.createElement("div");
      fill.className = "attachment-chip-bar-fill";
      fill.style.width = `${Math.round(item.progress * 100)}%`;
      bar.appendChild(fill);
      chip.appendChild(bar);
    }

    if (item.status === ATTACHMENT_STATUS.ERROR) {
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "attachment-chip-retry";
      retry.title = "Retry";
      retry.setAttribute("aria-label", "Retry upload");
      retry.textContent = "↻";
      retry.addEventListener("click", () => this.#upload(item));
      chip.appendChild(retry);
    }

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "attachment-chip-remove";
    remove.title = "Remove";
    remove.setAttribute("aria-label", "Remove attachment");
    remove.textContent = "✕";
    remove.addEventListener("click", () => this.#remove(item));
    chip.appendChild(remove);

    return chip;
  }
}

/** Whether `file` matches an `<input accept>` list (`""` accepts anything). */
function accepts(accept: string, file: File): boolean {
  const tokens = accept
    .split(",")
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token !== "");
  if (tokens.length === 0) {
    return true;
  }
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return tokens.some((token) => {
    if (token.startsWith(".")) {
      return name.endsWith(token);
    }
    if (token.endsWith("/*")) {
      return mime.startsWith(token.slice(0, -1));
    }
    return mime === token;
  });
}
