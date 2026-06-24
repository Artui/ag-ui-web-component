// Shadow-DOM-scoped styles for the chat shell. Kept as a string constant so
// the Custom Element can inject it into its shadow root without a build-time
// CSS pipeline. Scoped by the shadow boundary, so class names stay terse.

export const STYLES = `
:host {
  /* Colors */
  --ag-ui-bg: #ffffff;
  --ag-ui-fg: #1a1a2e;
  --ag-ui-accent: #4f46e5;
  --ag-ui-user-bg: #4f46e5;
  --ag-ui-user-fg: #ffffff;
  --ag-ui-assistant-bg: #f1f1f6;
  --ag-ui-input-bg: var(--ag-ui-bg);
  --ag-ui-tool-bg: var(--ag-ui-assistant-bg);
  --ag-ui-tool-fg: var(--ag-ui-accent);
  --ag-ui-header-bg: var(--ag-ui-accent);
  --ag-ui-header-fg: #ffffff;
  --ag-ui-border: #e2e2ec;
  --ag-ui-radius: 12px;

  /* Status accents for tool-call cards. */
  --ag-ui-success: #15803d;
  --ag-ui-danger: #b91c1c;
  --ag-ui-muted: #6b7280;

  /* Surface — set --ag-ui-shadow: none for a flush, embedded panel. */
  --ag-ui-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
  --ag-ui-font: inherit;
  --ag-ui-font-size: 14px;
  --ag-ui-code-font: ui-monospace, "SF Mono", Menlo, monospace;

  /* Spacing — the density preset overrides these. */
  --ag-ui-space: 10px;
  --ag-ui-pad: 16px;
  --ag-ui-msg-pad: 8px 12px;
  --ag-ui-msg-radius: 14px;

  /* Layout — override from outside to dock the widget anywhere.
     Set --ag-ui-position: static (and place this element in your own
     grid/flex layout) to embed it in the page flow instead of floating. */
  --ag-ui-position: fixed;
  --ag-ui-z-index: 2147483000;
  --ag-ui-width: 380px;
  --ag-ui-height: 560px;
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-max-width: calc(100vw - 48px);
  --ag-ui-max-height: calc(100vh - 48px);

  position: var(--ag-ui-position);
  inset: var(--ag-ui-inset);
  z-index: var(--ag-ui-z-index);
  width: var(--ag-ui-width);
  max-width: var(--ag-ui-max-width);
  height: var(--ag-ui-height);
  max-height: var(--ag-ui-max-height);
  display: flex;
  font-family: var(--ag-ui-font);
  font-size: var(--ag-ui-font-size);
  color: var(--ag-ui-fg);
}

/* ── Themes ─────────────────────────────────────────────────────────────
   Themes only re-set the colour variables; layout/spacing are unaffected.
   theme="auto" follows the OS via prefers-color-scheme. */
:host([theme="dark"]) {
  --ag-ui-bg: #15151f;
  --ag-ui-fg: #e8e8f2;
  --ag-ui-assistant-bg: #25253a;
  --ag-ui-header-bg: #1f1f30;
  --ag-ui-header-fg: #e8e8f2;
  --ag-ui-border: #33334a;
  --ag-ui-muted: #9aa0b4;
  --ag-ui-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
}

@media (prefers-color-scheme: dark) {
  :host([theme="auto"]) {
    --ag-ui-bg: #15151f;
    --ag-ui-fg: #e8e8f2;
    --ag-ui-assistant-bg: #25253a;
    --ag-ui-header-bg: #1f1f30;
    --ag-ui-header-fg: #e8e8f2;
    --ag-ui-border: #33334a;
    --ag-ui-muted: #9aa0b4;
    --ag-ui-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  }
}

/* A terminal-flavoured "code" theme: dark, monospace, green accent. */
:host([theme="code"]) {
  --ag-ui-bg: #0d1117;
  --ag-ui-fg: #c9d1d9;
  --ag-ui-accent: #3fb950;
  --ag-ui-user-bg: #238636;
  --ag-ui-assistant-bg: #161b22;
  --ag-ui-header-bg: #010409;
  --ag-ui-header-fg: #c9d1d9;
  --ag-ui-border: #30363d;
  --ag-ui-muted: #8b949e;
  --ag-ui-font: var(--ag-ui-code-font);
  --ag-ui-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
}

/* ── Density ────────────────────────────────────────────────────────────── */
:host([density="compact"]) {
  --ag-ui-font-size: 13px;
  --ag-ui-space: 6px;
  --ag-ui-pad: 10px;
  --ag-ui-msg-pad: 5px 9px;
  --ag-ui-msg-radius: 10px;
}

/* ── Placement presets ──────────────────────────────────────────────────── */
:host([placement="bottom-left"]) {
  --ag-ui-inset: auto auto 24px 24px;
}

:host([placement="side"]) {
  --ag-ui-inset: 0 0 0 auto;
  --ag-ui-width: 420px;
  --ag-ui-height: 100vh;
  --ag-ui-max-height: 100vh;
  --ag-ui-radius: 0;
}

:host([placement="full"]) {
  --ag-ui-inset: 0;
  --ag-ui-width: 100vw;
  --ag-ui-height: 100vh;
  --ag-ui-max-width: 100vw;
  --ag-ui-max-height: 100vh;
  --ag-ui-radius: 0;
}

/* Embedded: drop the floating chrome and the high z-index stacking context so
   the widget lives in the host's own layout (fixes overlay/z-index clashes). */
:host([placement="embedded"]) {
  --ag-ui-position: static;
  --ag-ui-width: 100%;
  --ag-ui-height: 100%;
  --ag-ui-max-width: 100%;
  --ag-ui-max-height: 100%;
  --ag-ui-shadow: none;
  --ag-ui-z-index: auto;
}

.chat {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: var(--ag-ui-radius);
  box-shadow: var(--ag-ui-shadow);
  overflow: hidden;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--ag-ui-border);
  background: var(--ag-ui-header-bg);
  color: var(--ag-ui-header-fg);
}

.header-title {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-controls {
  display: flex;
  gap: 2px;
  flex: none;
}

.header-btn {
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: 1;
  padding: 4px 7px;
  border-radius: 6px;
  cursor: pointer;
  opacity: 0.85;
}

.header-btn:hover {
  opacity: 1;
  background: rgba(255, 255, 255, 0.18);
}

/* Collapsed: keep just the header bar — hide the whole body, and let the host
   shrink to the header. (A host can also fully hide the element itself.) */
:host([collapsed]) {
  height: auto;
  max-height: none;
}

:host([collapsed]) .messages,
:host([collapsed]) .input-row,
:host([collapsed]) .skill-chips,
:host([collapsed]) .skill-palette,
:host([collapsed]) .skill-hint {
  display: none;
}

/* Edge-docked placements pin top *and* bottom, which would otherwise keep the
   panel full-height when collapsed; unpin the bottom so it shrinks to the
   header. (Floating/bottom-left pin only the bottom, so they already shrink.) */
:host([collapsed][placement="side"]),
:host([collapsed][placement="full"]) {
  bottom: auto;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--ag-ui-pad);
  display: flex;
  flex-direction: column;
  gap: var(--ag-ui-space);
}

.message {
  max-width: 80%;
  padding: var(--ag-ui-msg-pad);
  border-radius: var(--ag-ui-msg-radius);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Incoming-text animations (data-text-animation) ─────────────────────── */
/* .message--restored (rehydrated history) is excluded: entrance animations are
   for freshly-arriving messages, not the whole transcript replaying on reload.
   Word mode is excluded implicitly — restored bubbles aren't wrapped. */
:host([data-text-animation="fade"]) .message--assistant:not(.message--restored) {
  animation: ag-ui-msg-fade 0.25s ease both;
}

@keyframes ag-ui-msg-fade {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

.message--assistant .word {
  animation: ag-ui-word-in 0.3s ease both;
  animation-delay: calc(var(--ag-ui-word-index, 0) * 35ms);
}

@keyframes ag-ui-word-in {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  :host([data-text-animation="fade"]) .message--assistant,
  .message--assistant .word {
    animation: none;
  }
}

.message--user {
  align-self: flex-end;
  background: var(--ag-ui-user-bg);
  color: var(--ag-ui-user-fg);
  border-bottom-right-radius: 4px;
}

.message--assistant {
  align-self: flex-start;
  background: var(--ag-ui-assistant-bg);
  border-bottom-left-radius: 4px;
  /* Assistant bubbles hold rendered markdown/HTML, so collapse the source
     whitespace the renderer leaves between block tags. */
  white-space: normal;
}

/* Rendered-markdown elements inside an assistant bubble. */
.message--assistant > :first-child {
  margin-top: 0;
}

.message--assistant > :last-child {
  margin-bottom: 0;
}

.message--assistant p,
.message--assistant ul,
.message--assistant ol,
.message--assistant blockquote,
.message--assistant pre {
  margin: 0.5em 0;
}

.message--assistant ul,
.message--assistant ol {
  padding-left: 1.3em;
}

.message--assistant a {
  color: var(--ag-ui-accent);
  text-decoration: underline;
}

.message--assistant code {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  font-size: 0.92em;
  background: rgba(127, 127, 127, 0.16);
  padding: 1px 4px;
  border-radius: 4px;
}

.message--assistant pre {
  padding: 8px 10px;
  overflow: auto;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: 6px;
}

.message--assistant pre code {
  background: none;
  padding: 0;
}

.message--assistant blockquote {
  padding-left: 10px;
  border-left: 3px solid var(--ag-ui-border);
  color: var(--ag-ui-muted);
}

.pending {
  align-self: flex-start;
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 12px 14px;
  background: var(--ag-ui-assistant-bg);
  border-radius: 14px;
  border-bottom-left-radius: 4px;
}

.pending-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ag-ui-muted);
  animation: ag-ui-pending 1.2s infinite ease-in-out both;
}

.pending-dot:nth-child(2) {
  animation-delay: 0.16s;
}

.pending-dot:nth-child(3) {
  animation-delay: 0.32s;
}

@keyframes ag-ui-pending {
  0%, 80%, 100% { opacity: 0.3; transform: translateY(0); }
  40% { opacity: 1; transform: translateY(-3px); }
}

@media (prefers-reduced-motion: reduce) {
  .pending-dot {
    animation: none;
    opacity: 0.6;
  }
}

.tool-call {
  align-self: flex-start;
  max-width: 80%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--ag-ui-tool-bg);
  border: 1px solid var(--ag-ui-border);
  color: var(--ag-ui-tool-fg);
}

.tool-call-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.tool-call-name {
  font-weight: 600;
  word-break: break-word;
}

.tool-call-status {
  flex: none;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(127, 127, 127, 0.16);
  color: var(--ag-ui-muted);
}

.tool-call[data-status="done"] .tool-call-status {
  color: var(--ag-ui-success);
}

.tool-call[data-status="error"] .tool-call-status {
  color: var(--ag-ui-danger);
}

.tool-call[data-status="declined"] .tool-call-status {
  color: var(--ag-ui-muted);
}

.tool-call-args,
.tool-call-result {
  margin: 0;
  padding: 6px 8px;
  max-height: 160px;
  overflow: auto;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--ag-ui-fg);
}

.tool-call-toggle {
  align-self: flex-start;
  border: none;
  padding: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--ag-ui-accent);
  cursor: pointer;
}

.tool-call-toggle::before {
  content: "▸ ";
}

.tool-call-toggle[aria-expanded="true"]::before {
  content: "▾ ";
}

.input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--ag-ui-border);
}

.input {
  flex: 1;
  resize: none;
  background: var(--ag-ui-input-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: 8px;
  padding: 8px 10px;
  font: inherit;
  color: inherit;
  outline: none;
}

.input:focus {
  border-color: var(--ag-ui-accent);
}

.send {
  border: none;
  border-radius: 8px;
  padding: 0 16px;
  background: var(--ag-ui-accent);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}

.send:disabled {
  opacity: 0.5;
  cursor: default;
}

/* The composer button doubles as the Stop control while a run is in flight. */
.send[data-state="running"] {
  background: var(--ag-ui-muted);
}

/* Muted "⏹ Stopped" line after a cancelled run — a note, not an error bubble. */
.stopped-note {
  align-self: flex-start;
  color: var(--ag-ui-muted);
  font-size: 12px;
  padding: 2px 4px;
}

/* Inline confirmation card — lives in the transcript, no focus-stealing overlay. */
.confirm {
  align-self: stretch;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-accent);
  border-radius: 10px;
}

.confirm[data-resolved] {
  opacity: 0.7;
  border-color: var(--ag-ui-border);
}

.confirm-body {
  font-weight: 600;
}

.confirm-args {
  margin: 0;
  padding: 8px 10px;
  max-height: 140px;
  overflow: auto;
  font-size: 12px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  background: var(--ag-ui-assistant-bg);
  border-radius: 8px;
  white-space: pre-wrap;
  word-break: break-word;
}

.confirm-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.confirm-btn {
  border: 1px solid var(--ag-ui-border);
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--ag-ui-bg);
  color: var(--ag-ui-fg);
}

.confirm-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.confirm-btn--confirm {
  border-color: var(--ag-ui-accent);
  background: var(--ag-ui-accent);
  color: #ffffff;
}

/* Skills — chips row + the /-command palette, above the input. */
.skill-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 12px;
}

.skill-chip {
  border: 1px solid var(--ag-ui-border);
  border-radius: 999px;
  padding: 4px 12px;
  font: inherit;
  font-size: 0.9em;
  cursor: pointer;
  background: var(--ag-ui-assistant-bg);
  color: var(--ag-ui-fg);
}

.skill-chip:hover {
  border-color: var(--ag-ui-accent);
}

.skill-palette {
  margin: 8px 12px 0;
  display: flex;
  flex-direction: column;
  max-height: 220px;
  overflow: auto;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(20, 20, 50, 0.16);
}

.skill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  padding: 8px 12px;
  border: none;
  background: none;
  font: inherit;
  text-align: left;
  cursor: pointer;
  color: var(--ag-ui-fg);
}

.skill-item[aria-selected="true"] {
  background: var(--ag-ui-assistant-bg);
}

.skill-item-title {
  font-weight: 600;
}

.skill-item-desc {
  font-size: 0.85em;
  color: var(--ag-ui-muted);
}

.skill-hint {
  margin: 8px 12px 0;
  font-size: 0.85em;
  color: var(--ag-ui-danger);
}

/* Chat-history drawer — a slide-over within the chat panel. */
.drawer {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
}

.drawer[hidden] {
  display: none;
}

.drawer-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(20, 20, 50, 0.32);
}

.drawer-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(300px, 85%);
  height: 100%;
  background: var(--ag-ui-bg);
  border-right: 1px solid var(--ag-ui-border);
  box-shadow: var(--ag-ui-shadow);
  overflow: hidden;
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ag-ui-space);
  padding: var(--ag-ui-pad);
  border-bottom: 1px solid var(--ag-ui-border);
}

.drawer-title {
  font-weight: 600;
}

.drawer-new {
  border: 1px solid var(--ag-ui-border);
  border-radius: var(--ag-ui-radius);
  background: var(--ag-ui-bg);
  color: var(--ag-ui-accent);
  padding: 4px 10px;
  font: inherit;
  font-size: 0.85em;
  cursor: pointer;
}

.drawer-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.drawer-empty {
  padding: var(--ag-ui-pad);
  font-size: 0.9em;
  color: var(--ag-ui-muted);
}

.drawer-row {
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid var(--ag-ui-border);
}

.drawer-row--active {
  background: var(--ag-ui-assistant-bg);
}

.drawer-row-select {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.drawer-row-title {
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.drawer-row-time {
  font-size: 0.72em;
  color: var(--ag-ui-muted);
}

.drawer-row-preview {
  font-size: 0.8em;
  color: var(--ag-ui-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.drawer-row-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
}

.drawer-row-rename,
.drawer-row-delete {
  border: none;
  background: none;
  color: var(--ag-ui-muted);
  font-size: 0.9em;
  padding: 4px;
  cursor: pointer;
}

.drawer-rename-input {
  flex: 1;
  min-width: 0;
  margin: 6px 10px;
  padding: 4px 8px;
  border: 1px solid var(--ag-ui-accent);
  border-radius: 6px;
  background: var(--ag-ui-input-bg);
  color: var(--ag-ui-fg);
  font: inherit;
}

.drawer-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 0.85em;
}

.drawer-confirm-label {
  color: var(--ag-ui-danger);
}

.drawer-confirm-yes {
  border: none;
  border-radius: 6px;
  background: var(--ag-ui-danger);
  color: #ffffff;
  padding: 3px 10px;
  font: inherit;
  cursor: pointer;
}

.drawer-confirm-no {
  border: 1px solid var(--ag-ui-border);
  border-radius: 6px;
  background: none;
  color: inherit;
  padding: 3px 10px;
  font: inherit;
  cursor: pointer;
}

/* Embedded placement: an inline, flush side panel rather than a dimmed,
   floating slide-over. */
:host([placement="embedded"]) .drawer-backdrop {
  background: none;
}

:host([placement="embedded"]) .drawer-panel {
  width: 100%;
  border-right: none;
  box-shadow: none;
}
`;
