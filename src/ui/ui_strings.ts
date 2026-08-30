/**
 * The flat table of every user-facing string the chat shell renders — labels,
 * placeholders, `aria-label`s, and `title` tooltips. A localizable seam, not a
 * framework: a host overrides any subset (via the element's `strings` property
 * or its `data-strings` JSON attribute) and the rest fall back to the English
 * defaults.
 *
 * Some values are templates carrying `{token}` placeholders the call site fills
 * in; the token names are noted on each key, and a translation must keep them
 * verbatim.
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
  /** Expand affordance (the launcher, and the sidebar rail). */
  expand: string;
  /**
   * The launcher's label while unread answers wait behind it. Token: `{count}`.
   * Replaces {@link expand} rather than appending to it, so a translation can
   * order the two parts as its language needs.
   */
  expandUnread: string;
  /** Built-in header theme toggle (light ⇄ dark). */
  toggleTheme: string;

  // ── Messages region ─────────────────────────────────────────────────────────
  /** `aria-label` of the scrolling message log. */
  conversation: string;
  /** The button offering to return to the foot of the transcript. */
  jumpToLatest: string;
  /** Announced when a turn starts. Screen-reader only; never rendered. */
  announceResponding: string;
  /** Announced when the answer has finished arriving. Screen-reader only. */
  announceAnswerReady: string;
  /** Announced when a card is waiting for the user's decision. Token: `{count}`. */
  announceAwaitingDecision: string;
  /** Announced when the user stopped the run. Screen-reader only. */
  announceStopped: string;
  /** Announced when the run failed. Screen-reader only. */
  announceFailed: string;
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
  /** Notice shown when the server replaced the conversation wholesale. */
  historyReplaced: string;
  /** Notice shown when a pushed chart could not be drawn and was removed. */
  chartUndrawable: string;
  /** Missing-placeholder skill hint. Tokens: `{title}`, `{fields}`. */
  skillNeeds: string;
  /** Notice shown when the agent condensed earlier turns. Token: `{count}`. */
  historyCompacted: string;
  /** Notice shown when the agent loads an agent skill. Token: `{name}`. */
  usingSkill: string;
  /** Notice shown on mount when the previous run never produced a response. */
  runInterrupted: string;
  /** Tool-result content (and card text) when the page moved mid-run. */
  pageMoved: string;
  /** Notice when Send ran while a file was still uploading. Token: `{n}`. */
  attachmentsStillUploading: string;

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
  /**
   * Mic button message after a recording hit its length cap and stopped itself.
   * The clip is kept and transcribed, so this explains the silence rather than
   * reporting a loss. Token: `{n}` (the cap, in minutes).
   */
  recordingLimit: string;

  // ── Tool-call card ──────────────────────────────────────────────────────────
  /** Status pill while the call runs. */
  toolRunning: string;
  /** Status pill on a gated call the run deferred, waiting on a person. */
  toolDeferred: string;
  /** Status pill on success. */
  toolDone: string;
  /** Status pill on error. */
  toolError: string;
  /** Status pill on a declined call. */
  toolDeclined: string;
  /** Accessible label on the panel resize handle. */
  resizePanel: string;
  /** Note on a tool card whose call a human approved. */
  decisionApproved: string;
  /** Note on a tool card whose call a human declined. */
  decisionDeclined: string;
  /** Heading over a tool card's arguments region. */
  argumentsLabel: string;
  /** Heading over a tool card's result region when the call succeeded. */
  resultLabel: string;
  /** Heading over a tool card's result region when the call failed. */
  errorLabel: string;
  /** Heading over a tool card's result region when the call was declined. */
  declinedLabel: string;
  /** Label on the toggle that expands a tool card's body. */
  details: string;

  // ── Delegated sub-agent ─────────────────────────────────────────────────────
  /**
   * The delegation row's text before the server's own status line lands.
   *
   * A fallback, not a state: every announcement carries a pre-rendered `status`,
   * and this only shows if one arrives unusable. The row is the expander, so it
   * must never be blank.
   */
  subAgentWorking: string;
  /** `aria-label` of the region holding the sub-agent's own tool calls. */
  subAgentSteps: string;

  // ── Confirmation card ───────────────────────────────────────────────────────
  /** `aria-label` of the editable arguments field on an approval card. */
  approvalEditArgs: string;
  /** Shown when the edited arguments are not valid JSON. */
  approvalArgsInvalid: string;
  /** Shown when the edited arguments parse but are not a JSON object. */
  approvalArgsNotAnObject: string;
  /** `aria-label` of the follow-up suggestion chips row. */
  suggestions: string;
  /** `aria-label` of a message's action row. */
  messageActions: string;
  /** The offer that floats beside a selection in the transcript. */
  quoteSelection: string;
  /** Copy this message (button `title` / `aria-label`). Its confirmation and
   * failure text are the code block's `copied` / `copyFailed`, which say the
   * same thing about the same clipboard. */
  copyMessage: string;
  /** Ask for a different answer to the same question. */
  retryMessage: string;
  /** Rate this answer as good. */
  feedbackUp: string;
  /** Rate this answer as poor. */
  feedbackDown: string;
  /** `aria-label` of the inline confirmation card. */
  confirmAction: string;
  /** Waive confirmation for this tool for the rest of the session. Token: `{tool}`. */
  confirmAlways: string;
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

  // ── Code blocks ─────────────────────────────────────────────────────────────
  /** Label on a code block's copy button. */
  copyCode: string;
  /** Shown on the copy button after the code reached the clipboard. */
  copied: string;
  /** Shown when the clipboard was unavailable or refused the write. */
  copyFailed: string;

  // ── Checkpoint panel (continue a run) ───────────────────────────────────────
  /** Title of the checkpoint panel. */
  checkpoints: string;
  /** Empty state when no run can be continued. */
  noCheckpoints: string;
  /** Action: continue a run from its last checkpoint. */
  resumeRun: string;
  /** Action: branch a run without touching the original. */
  forkRun: string;
  /** Badge on a run that branched from another. */
  forkedRun: string;

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
  expandUnread: "Expand — {count} unread",
  toggleTheme: "Toggle theme",
  copyCode: "Copy",
  copied: "Copied",
  copyFailed: "Copy failed",
  checkpoints: "Continue a run",
  noCheckpoints: "Nothing to continue yet.",
  resumeRun: "Resume",
  forkRun: "Fork",
  forkedRun: "branched",

  conversation: "Conversation",
  jumpToLatest: "Jump to latest",
  announceResponding: "Assistant is responding",
  announceAnswerReady: "Assistant answered",
  announceAwaitingDecision: "{count} action is waiting for your approval",
  announceStopped: "Response stopped",
  announceFailed: "The response failed",
  thinking: "Assistant is thinking…",
  thoughts: "Thoughts",
  stopped: "⏹ Stopped",
  connectionLost: "Connection lost",
  noResult: "No result returned.",
  declinedAction: "User declined the action.",
  navigating: "Navigating…",
  historyReplaced:
    "The server replaced this conversation's history. Reload to see the updated transcript.",
  chartUndrawable: "A chart could not be drawn from the data sent, so it was removed.",
  historyCompacted: "Earlier turns condensed to fit the context window ({count} removed)",
  usingSkill: "Using skill {name}",
  runInterrupted: "The previous response didn’t finish — the page changed before it arrived.",
  pageMoved:
    "The page changed since you last looked at it. Call read_page to see the current page, then retry.",
  attachmentsStillUploading:
    "{n} file still uploading — it was not sent with this message and is still attached.",
  skillNeeds: "“{title}” needs {fields} — fill it in below, then send.",

  message: "Message",
  inputPlaceholder: "Ask anything…",
  send: "Send",
  stop: "Stop",
  attachFiles: "Attach files",
  recordVoice: "Record voice",
  stopRecording: "Stop recording",
  transcribing: "Transcribing…",
  transcriptionFailed: "Transcription failed",
  recordingLimit: "Stopped at the {n}-minute limit — transcribing what was recorded.",

  toolRunning: "running…",
  toolDeferred: "waiting for you",
  toolDone: "✓ done",
  toolError: "⚠ error",
  toolDeclined: "⊘ declined",
  resizePanel: "Resize the chat panel",
  decisionApproved: "approved by you",
  decisionDeclined: "declined by you",
  argumentsLabel: "Arguments",
  resultLabel: "Result",
  errorLabel: "Error",
  declinedLabel: "Declined",
  details: "Details",

  subAgentWorking: "Working…",
  subAgentSteps: "Steps the sub-agent took",

  approvalEditArgs: "Edit the arguments before approving",
  approvalArgsInvalid: "That is not valid JSON, so nothing was sent.",
  approvalArgsNotAnObject: "Arguments have to be a JSON object.",
  suggestions: "Suggested follow-ups",
  messageActions: "Message actions",
  quoteSelection: "Quote",
  copyMessage: "Copy message",
  retryMessage: "Try again",
  feedbackUp: "Good answer",
  feedbackDown: "Poor answer",
  confirmAction: "Confirm action",
  confirmAlways: "Always allow",
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
