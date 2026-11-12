import { ICON_ATTACH, ICON_SEND, ICON_STOP } from "../../constants.js";
import { glyphSlot } from "../shell/glyph_slot.js";
import type { UiStrings } from "../ui_strings.js";

/** The composer's parts, owned by the element, and what they call back into. */
export interface ComposerOptions {
  readonly input: HTMLTextAreaElement;
  readonly send: HTMLButtonElement;
  readonly attachButton: HTMLButtonElement;
  readonly fileInput: HTMLInputElement;
  readonly voiceSlot: HTMLElement;
  /** The place chip; sits in the tool row between the voice slot and Send. */
  readonly place: HTMLElement;
  /** The line saying what the composer still needs; sits above the input. */
  readonly hint: HTMLElement;
  /** The queued-message row; sits above the input beside the tray. */
  readonly queuedRow: HTMLElement;
  /** Where the attachment tray mounts; sits above the input. */
  readonly attachSlot: HTMLElement;
  readonly strings: UiStrings;
  readonly signal: AbortSignal;
  readonly onKeydown: (event: KeyboardEvent) => void;
  readonly onInput: () => void;
  /** Send while idle, Stop while a run is in flight: the element decides. */
  readonly onSend: () => void;
  readonly onFilesPicked: () => void;
}

/**
 * Build the composer row -- the field, and the tool row under it with the
 * attach and voice controls, the place chip and Send -- and ready the composer surfaces the
 * element mounts above it: the hint, the queued row and the attachment slot.
 * Returns the row; the element places it and the surfaces.
 */
export function buildComposer(options: ComposerOptions): HTMLElement {
  const { input, send, attachButton, fileInput, strings, signal } = options;

  const queued = options.queuedRow;
  queued.className = "queued";
  queued.setAttribute("part", "queued");
  queued.setAttribute("role", "group");
  queued.setAttribute("aria-label", strings.queued);
  queued.hidden = true;

  const inputRow = document.createElement("div");
  inputRow.className = "input-row";
  inputRow.setAttribute("part", "composer");

  // One bordered surface holds the field and the tool row under it, so the
  // icon buttons stop competing with the field for weight.
  const composer = document.createElement("div");
  composer.className = "composer";
  composer.setAttribute("part", "composer-surface");

  const tools = document.createElement("div");
  tools.className = "composer-tools";
  tools.setAttribute("part", "composer-tools");

  input.className = "input";
  input.setAttribute("part", "input");
  input.setAttribute("aria-label", strings.message);
  input.rows = 1;
  input.placeholder = strings.inputPlaceholder;
  input.addEventListener("keydown", options.onKeydown, { signal });
  input.addEventListener("input", options.onInput, { signal });

  // Icon-only, with both glyphs mounted at once and CSS showing the one the
  // state calls for — swapping a single glyph would leave a host that slotted
  // its own Send mark holding a stop icon mid-run.
  send.className = "send";
  send.type = "button";
  send.setAttribute("part", "send");
  send.replaceChildren(
    glyphSlot("icon-send", "send-send", ICON_SEND),
    glyphSlot("icon-stop", "send-stop", ICON_STOP),
  );
  send.title = strings.send;
  send.setAttribute("aria-label", strings.send);
  send.dataset["state"] = "idle";
  send.addEventListener("click", options.onSend, { signal });

  const hint = options.hint;
  hint.className = "skill-hint";
  hint.setAttribute("part", "skill-hint");
  hint.hidden = true;

  // File-upload affordance: a paperclip button (hidden until
  // `data-attachments-url` is wired) opening a hidden multi-file input.
  // Drag-and-drop covers the whole shell (wired by ComposerAttachments).
  attachButton.className = "attach-btn";
  attachButton.type = "button";
  attachButton.setAttribute("part", "attach-button");
  attachButton.replaceChildren(glyphSlot("icon-attach", "attach-glyph", ICON_ATTACH));
  attachButton.title = strings.attachFiles;
  attachButton.setAttribute("aria-label", strings.attachFiles);
  attachButton.hidden = true;
  attachButton.addEventListener("click", () => fileInput.click(), { signal });

  fileInput.className = "attach-input";
  fileInput.type = "file";
  fileInput.multiple = true;
  fileInput.hidden = true;
  fileInput.addEventListener("change", options.onFilesPicked, { signal });

  options.attachSlot.className = "attachment-slot";

  // Mic button mount point (kept empty until ComposerVoice mounts the control).
  options.voiceSlot.className = "voice-slot";

  tools.append(attachButton, options.voiceSlot, options.place, send);
  composer.append(input, tools);
  inputRow.append(composer, fileInput);
  return inputRow;
}
