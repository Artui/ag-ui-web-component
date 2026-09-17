import {
  ATTACHMENT_EVENT,
  DEFAULT_ATTACHMENT_MAX_BYTES,
  PASTE_ATTACH_CHARS,
} from "../../constants.js";
import type { AttachmentsDetail } from "../../core/events/attachments_detail.js";
import { type UploadHandler, uploadAttachment } from "../../core/upload_attachment.js";
import type { UiStrings } from "../ui_strings.js";
import { AttachmentTray } from "./attachment_tray.js";

/** What the composer's attachments need from the element that owns them. */
export interface ComposerAttachmentsHost {
  /** The custom element: its upload attributes, and where the event is dispatched. */
  readonly element: HTMLElement;
  /** The chat shell, which a file can be dropped or pasted anywhere on. */
  readonly chat: HTMLElement;
  /** Where the tray mounts, above the composer. */
  readonly slot: HTMLElement;
  /** The hidden multi-file input the paperclip opens. */
  readonly fileInput: HTMLInputElement;
  /** The paperclip, revealed once uploads are possible. */
  readonly button: HTMLButtonElement;
  /** The resolved string table. */
  readonly strings: () => UiStrings;
  /** The host's `uploadHandler`, read when the tray is wired. */
  readonly uploadHandler: () => UploadHandler | null;
  /** The headers a request to `url` carries. */
  readonly headersFor: (url: string) => Record<string, string>;
  /** The cookie policy every request carries, when one is configured. */
  readonly credentialsOption: () => { credentials?: RequestCredentials };
}

/**
 * Files handed to the composer: the tray they upload through, and the four
 * ways into it -- the picker, a drop, a paste, and a host's `attachFile`.
 *
 * Owned one-to-one by an `<ag-ui-chat>`, and holding no state outside the
 * instance.
 */
export class ComposerAttachments {
  readonly #host: ComposerAttachmentsHost;
  /** Upload tray; created on connect only when `data-attachments-url` is set. */
  #tray: AttachmentTray | null = null;

  constructor(host: ComposerAttachmentsHost) {
    this.#host = host;
  }

  /** The tray, once uploads are wired; `null` while the chat is text-only. */
  get tray(): AttachmentTray | null {
    return this.#tray;
  }

  /**
   * Enable the composer's file-upload tray when uploads are possible — either a
   * custom `uploadHandler` is set or `data-attachments-url` provides the
   * built-in multipart endpoint: reveal the 📎 button, wire the hidden file
   * input + drag-and-drop, and mount the tray. With neither, the affordance
   * stays hidden and the chat degrades to text-only.
   *
   * Called on every connect, so it starts by taking down the tray the last
   * connection mounted: that one was disposed when the element left, and the
   * attributes that decide whether there is a tray at all may have changed
   * since. The shell outlives a connection, so its listeners go under `signal`.
   */
  wire(signal: AbortSignal): void {
    this.#tray?.element.remove();
    this.#tray = null;
    const url = this.#host.element.getAttribute("data-attachments-url");
    const upload = this.#host.uploadHandler() ?? this.#defaultUploadHandler(url);
    if (upload === null) {
      return;
    }
    const accept = this.#host.element.getAttribute("data-attachment-accept") ?? "";
    // Bound to the local rather than the field: the hook can only fire from a
    // tray that exists, so passing it removes a null check no caller can reach.
    const tray: AttachmentTray = new AttachmentTray({
      upload,
      maxBytes: this.#maxBytes(),
      accept,
      strings: this.#host.strings(),
      // The tray's change hook, surfaced to the host as an event. A host
      // driving its own composer could otherwise not tell a settled upload from
      // one still in flight, which is the state sendMessage() has to be called
      // with knowledge of.
      onChange: () => this.#dispatch(tray),
    });
    this.#tray = tray;
    this.#host.slot.appendChild(this.#tray.element);
    this.#host.fileInput.accept = accept;
    this.#host.button.hidden = false;
    this.#enableDragAndDrop(signal);
    this.#enablePaste(tray, signal);
  }

  /** The queueing behind `AgUiChat.attachFile`, whose doc is the contract. */
  attach(file: File): boolean {
    if (this.#tray === null) {
      return false;
    }
    this.#tray.add(file);
    return true;
  }

  /** Queue every file from the picker into the tray, then reset the input. */
  onFilesPicked(): void {
    const input = this.#host.fileInput;
    const files = input.files;
    if (files !== null) {
      for (const file of Array.from(files)) {
        this.#tray?.add(file);
      }
    }
    // Reset so re-picking the same file fires `change` again.
    input.value = "";
  }

  /** The built-in multipart upload handler for `data-attachments-url`, or `null`. */
  #defaultUploadHandler(url: string | null): UploadHandler | null {
    if (url === null) {
      return null;
    }
    // Forward the tray's abort signal so removing a chip (or tearing the
    // element down) cancels the XHR.
    return (file, onProgress, signal) =>
      uploadAttachment(file, {
        url,
        headers: this.#host.headersFor(url),
        ...this.#host.credentialsOption(),
        onProgress,
        signal,
      });
  }

  /** The client-side upload size cap from `data-attachment-max-bytes`. */
  #maxBytes(): number {
    const attr = this.#host.element.getAttribute("data-attachment-max-bytes");
    if (attr === null) {
      return DEFAULT_ATTACHMENT_MAX_BYTES;
    }
    const parsed = Number.parseInt(attr, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_ATTACHMENT_MAX_BYTES;
  }

  /** Accept files dropped anywhere on the chat shell into the tray. */
  #enableDragAndDrop(signal: AbortSignal): void {
    const chat = this.#host.chat;
    chat.addEventListener(
      "dragover",
      (event) => {
        event.preventDefault();
        chat.classList.add("chat--dragover");
      },
      { signal },
    );
    chat.addEventListener(
      "dragleave",
      () => {
        chat.classList.remove("chat--dragover");
      },
      { signal },
    );
    chat.addEventListener(
      "drop",
      (event) => {
        event.preventDefault();
        chat.classList.remove("chat--dragover");
        const files = event.dataTransfer?.files;
        if (files !== undefined) {
          for (const file of Array.from(files)) {
            this.#tray?.add(file);
          }
        }
      },
      { signal },
    );
  }

  /**
   * Turn a very long text paste into an attachment instead of a wall of text.
   *
   * A composer capped at `40vh` is not where forty thousand characters go: the
   * user cannot read what they pasted, cannot edit around it, and sends one
   * enormous turn. As a file it stays whole, the model still receives it, and
   * the box is left for the question about it.
   *
   * Only where the host has configured uploads -- and structurally so, rather
   * than by a check here: the paste listener is wired inside the attachment
   * setup, so with no tray there is no listener at all and an ordinary paste is
   * untouched. Quietly dropping a paste for being long would be far worse than
   * an awkward composer. The tray is passed rather than read off the field for
   * the same reason its `onChange` hook is: it can only be called from one that
   * exists, so taking it as an argument removes a null check no caller can
   * reach.
   *
   * Nothing is lost by removing the chip: the text is still on the clipboard,
   * so pasting again brings it back. That is why this needs no undo of its own.
   */
  #pasteLongTextAsFile(event: ClipboardEvent, clipboard: DataTransfer, tray: AttachmentTray): void {
    const threshold = this.#pasteAttachThreshold();
    const text = clipboard.getData("text/plain");
    if (threshold === null || text.length < threshold) {
      return;
    }
    event.preventDefault();
    tray.add(new File([text], `pasted-${pasteStamp()}.txt`, { type: "text/plain" }));
  }

  /**
   * How long a pasted string has to be before it becomes a file, or `null` to
   * leave every paste in the composer.
   *
   * One attribute with three answers rather than three attributes: absent is
   * the default, `off` refuses, and a number states the threshold. A value that
   * is neither says so, because a typo silently meaning "off" is the failure
   * this whole release keeps finding.
   */
  #pasteAttachThreshold(): number | null {
    const raw = this.#host.element.getAttribute("data-paste-attach");
    if (raw === null) {
      return PASTE_ATTACH_CHARS;
    }
    if (raw === "off") {
      return null;
    }
    const stated = Number.parseInt(raw, 10);
    if (Number.isNaN(stated) || stated <= 0) {
      console.warn(
        `<ag-ui-chat>: data-paste-attach="${raw}" is neither "off" nor a positive ` +
          `number of characters, so the default of ${PASTE_ATTACH_CHARS} is used.`,
      );
      return PASTE_ATTACH_CHARS;
    }
    return stated;
  }

  /**
   * Accept files pasted into the composer.
   *
   * The whole tray already exists behind this: a paste is one more way to hand
   * it a `File`, alongside the picker and a drop.
   *
   * Two rules keep it from stealing a paste that was never about files.
   * `clipboardData.files` is empty for text, so ordinary pasting is untouched.
   * And the default is only prevented when the clipboard carries **no text**:
   * copying a rich selection that happens to contain an image puts both on the
   * clipboard, and swallowing the words someone meant to paste in order to
   * attach a picture they did not is the worse of the two failures.
   */
  #enablePaste(tray: AttachmentTray, signal: AbortSignal): void {
    this.#host.chat.addEventListener(
      "paste",
      (event: ClipboardEvent) => {
        // Nullish rather than a null check: the property is typed as nullable,
        // and an engine that fires a plain Event for a paste leaves it absent
        // instead, which is not the same value and is the same situation.
        const clipboard = event.clipboardData ?? null;
        if (clipboard === null) {
          return;
        }
        const files = Array.from(clipboard.files);
        if (files.length === 0) {
          this.#pasteLongTextAsFile(event, clipboard, tray);
          return;
        }
        if (clipboard.getData("text/plain") === "") {
          event.preventDefault();
        }
        for (const file of files) {
          this.#tray?.add(named(file));
        }
      },
      { signal },
    );
  }

  /** Tell the host what the tray now holds — see {@link ATTACHMENT_EVENT}. */
  #dispatch(tray: AttachmentTray): void {
    this.#host.element.dispatchEvent(
      new CustomEvent<AttachmentsDetail>(ATTACHMENT_EVENT, {
        detail: { attachments: tray.readyRefs(), pending: tray.pendingCount() },
        bubbles: true,
        composed: true,
      }),
    );
  }
}

/**
 * The moment of a paste, as a string a filename can carry.
 *
 * ISO 8601 with its colons and the decimal point replaced, because both are
 * reserved in a filename on at least one platform a download lands on. Shared
 * by the two paste paths, so a pasted image and a long text pasted as a file
 * are named the same way.
 */
function pasteStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * A pasted file, guaranteed to have a name.
 *
 * A file dropped or picked always carries one; a pasted one need not. Some
 * engines hand over a blob with an empty name, which travels all the way to
 * the upload as an empty `filename` and lands on the server as a file nobody
 * can identify -- while the chip in the tray shows an empty label. A file that
 * already has a name keeps it, including the generic one Chrome gives a pasted
 * screenshot: it is at least what the file is, and the chip shows the size
 * beside it.
 */
function named(file: File): File {
  if (file.name !== "") {
    return file;
  }
  // The subtype is the extension for every clipboard image type worth naming.
  // A type with no slash in it falls back to the whole string, and an absent
  // one leaves a bare stamp rather than a name ending in a dot.
  const subtype = file.type.split("/")[1] ?? file.type;
  const stamp = pasteStamp();
  return new File([file], subtype === "" ? `pasted-${stamp}` : `pasted-${stamp}.${subtype}`, {
    type: file.type,
  });
}
