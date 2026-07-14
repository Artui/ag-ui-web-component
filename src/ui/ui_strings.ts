/**
 * The flat table of every user-facing string the chat shell renders — labels,
 * placeholders, `aria-label`s, and `title` tooltips. A localizable seam, not a
 * framework: a host overrides any subset (via the element's `strings` property
 * or its `data-strings` JSON attribute) and the rest fall back to the English
 * defaults.
 *
 * A handful of values are **templates** carrying `{token}` placeholders the call
 * site fills in (e.g. `minutesAgo` → `"{n}m ago"`); the token names are noted on
 * each key. Translators keep the token verbatim.
 *
 * This module is one cohesive unit — the `UiStrings` shape, its `DEFAULT_UI_STRINGS`
 * constant-like backing, and the {@link mergeUiStrings} merge over those defaults —
 * so it bends the one-symbol-per-file rule the way `tool_call_card.ts` (class +
 * its types) and `route_map.ts` (factory + its types) already do.
 */
export interface UiStrings {
  // ── Header ────────────────────────────────────────────────────────────────
  /** Default header title (the `title-text` attribute overrides per element). */
  title: string;
  /** History button + drawer dialog label. */
  chatHistory: string;
  /** New-chat button (header + drawer). */
  newChat: string;
  /** Collapse button. */
  collapse: string;
  /** Expand affordance (the sidebar rail toggle). */
  expand: string;
  /** Built-in header theme toggle (light ⇄ dark). */
  toggleTheme: string;

  // ── Messages region ─────────────────────────────────────────────────────────
  /** `aria-label` of the scrolling message log. */
  conversation: string;
  /** `aria-label` of the "thinking" pending indicator, and the thoughts region's
   * header while the model is still reasoning. */
  thinking: string;
  /** The thoughts region's header once reasoning has streamed (collapsed label). */
  thoughts: string;
  /** The muted note after a cancelled run. */
  stopped: string;
  /** Error shown when the stream drops without a terminal AG-UI event. */
  connectionLost: string;
  /** Fallback when a tool call produced no result. */
  noResult: string;
  /** Tool-result content when the user declines a confirmed action. */
  declinedAction: string;
  /** A navigating tool's card text while the page reloads. */
  navigating: string;
  /** Missing-placeholder skill hint. Tokens: `{title}`, `{fields}`. */
  skillNeeds: string;

  // ── Composer ────────────────────────────────────────────────────────────────
  /** `aria-label` of the message textarea. */
  message: string;
  /** Placeholder of the message textarea. */
  inputPlaceholder: string;
  /** Send button (idle composer). */
  send: string;
  /** Stop button (composer while a run is in flight). */
  stop: string;
  /** Attach-files button. */
  attachFiles: string;
  /** Mic button while idle (start recording). */
  recordVoice: string;
  /** Mic button while recording (stop + transcribe). */
  stopRecording: string;
  /** Mic button while the clip is being transcribed. */
  transcribing: string;
  /** Mic button fallback message when transcription fails. */
  transcriptionFailed: string;

  // ── Tool-call card ──────────────────────────────────────────────────────────
  /** Status pill while the call runs. */
  toolRunning: string;
  /** Status pill on success. */
  toolDone: string;
  /** Status pill on error. */
  toolError: string;
  /** Status pill on a declined call. */
  toolDeclined: string;
  /** Toggle label revealing a successful result (full mode). */
  resultLabel: string;
  /** Toggle label revealing an error (full mode). */
  errorLabel: string;
  /** Toggle label revealing a declined call (full mode). */
  declinedLabel: string;
  /** Toggle label revealing args + result together (compact mode). */
  details: string;

  // ── Confirmation card ───────────────────────────────────────────────────────
  /** `aria-label` of the inline confirmation card. */
  confirmAction: string;
  /** Generic confirmation prompt when a tool has no `x-confirm`. Token: `{tool}`. */
  confirmRun: string;
  /** Confirm button. */
  confirm: string;
  /** Cancel button (confirmation + delete confirm). */
  cancel: string;

  // ── Approval card (server-side tool gate) ───────────────────────────────────
  /** `aria-label` of the inline server-side-tool approval card. */
  approveAction: string;
  /** Fallback approval prompt when the interrupt carries no message. */
  approvalPrompt: string;
  /** Approve button (runs the gated server-side tool). */
  approve: string;
  /** Deny button (declines the gated server-side tool). */
  deny: string;

  // ── Question card (the `ask_user` frontend tool) ────────────────────────────
  /** `aria-label` of the inline question card. */
  askUserAction: string;
  /** Radio label for the free-text "other" choice (when custom answers are allowed). */
  otherOption: string;
  /** Placeholder for the free-text answer field. */
  answerPlaceholder: string;
  /** Submit button for the question card. */
  submit: string;

  // ── Chat-history drawer ─────────────────────────────────────────────────────
  /** Drawer heading. */
  chats: string;
  /** Empty-state line when there are no threads. */
  noConversations: string;
  /** Rename row button (`title`). */
  rename: string;
  /** Rename row button `aria-label`. */
  renameConversation: string;
  /** Delete row button (`title`) + the inline-confirm action. */
  delete: string;
  /** Delete row button `aria-label`. */
  deleteConversation: string;
  /** Inline delete-confirm prompt. */
  deletePrompt: string;

  // ── Attachments ─────────────────────────────────────────────────────────────
  /** Oversize rejection. Token: `{size}`. */
  tooLarge: string;
  /** Disallowed-type rejection. */
  fileTypeNotAllowed: string;
  /** Generic upload failure (when the error carries no message). */
  uploadFailed: string;
  /** Retry-upload button (`title`). */
  retry: string;
  /** Retry-upload button `aria-label`. */
  retryUpload: string;
  /** Remove-attachment button (`title`). */
  remove: string;
  /** Remove-attachment button `aria-label`. */
  removeAttachment: string;

  // ── Relative time (drawer rows) ─────────────────────────────────────────────
  /** Under a minute ago. */
  justNow: string;
  /** Minutes ago. Token: `{n}`. */
  minutesAgo: string;
  /** Hours ago. Token: `{n}`. */
  hoursAgo: string;
  /** Days ago. Token: `{n}`. */
  daysAgo: string;
  /** Weeks ago. Token: `{n}`. */
  weeksAgo: string;
}

/** The built-in English strings — the fallback every override merges over. */
export const DEFAULT_UI_STRINGS: UiStrings = {
  title: "Assistant",
  chatHistory: "Chat history",
  newChat: "New chat",
  collapse: "Collapse",
  expand: "Expand",
  toggleTheme: "Toggle theme",

  conversation: "Conversation",
  thinking: "Assistant is thinking…",
  thoughts: "Thoughts",
  stopped: "⏹ Stopped",
  connectionLost: "Connection lost",
  noResult: "No result returned.",
  declinedAction: "User declined the action.",
  navigating: "Navigating…",
  skillNeeds: "“{title}” needs: {fields}",

  message: "Message",
  inputPlaceholder: "Ask anything…",
  send: "Send",
  stop: "Stop",
  attachFiles: "Attach files",
  recordVoice: "Record voice",
  stopRecording: "Stop recording",
  transcribing: "Transcribing…",
  transcriptionFailed: "Transcription failed",

  toolRunning: "running…",
  toolDone: "✓ done",
  toolError: "⚠ error",
  toolDeclined: "⊘ declined",
  resultLabel: "Result",
  errorLabel: "Error",
  declinedLabel: "Declined",
  details: "Details",

  confirmAction: "Confirm action",
  confirmRun: "Run “{tool}”?",
  confirm: "Confirm",
  cancel: "Cancel",

  approveAction: "Approve action",
  approvalPrompt: "Approve this action?",
  approve: "Approve",
  deny: "Deny",

  askUserAction: "Question",
  otherOption: "Other…",
  answerPlaceholder: "Type your answer…",
  submit: "Submit",

  chats: "Chats",
  noConversations: "No conversations yet.",
  rename: "Rename",
  renameConversation: "Rename conversation",
  delete: "Delete",
  deleteConversation: "Delete conversation",
  deletePrompt: "Delete?",

  tooLarge: "Too large (max {size})",
  fileTypeNotAllowed: "File type not allowed",
  uploadFailed: "upload failed",
  retry: "Retry",
  retryUpload: "Retry upload",
  remove: "Remove",
  removeAttachment: "Remove attachment",

  justNow: "just now",
  minutesAgo: "{n}m ago",
  hoursAgo: "{n}h ago",
  daysAgo: "{n}d ago",
  weeksAgo: "{n}w ago",
};

/**
 * Merge a partial set of overrides over {@link DEFAULT_UI_STRINGS}, yielding a
 * complete {@link UiStrings}. Keys whose override is `undefined` keep the
 * default (so a `data-strings` JSON with only a few keys — or a property carrying
 * explicit `undefined` — leaves the rest English).
 */
export function mergeUiStrings(overrides: Partial<UiStrings>): UiStrings {
  const merged: UiStrings = { ...DEFAULT_UI_STRINGS };
  for (const key of Object.keys(overrides) as (keyof UiStrings)[]) {
    const value = overrides[key];
    if (value !== undefined) {
      merged[key] = value;
    }
  }
  return merged;
}
