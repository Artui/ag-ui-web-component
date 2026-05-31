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
  --ag-ui-header-bg: var(--ag-ui-accent);
  --ag-ui-header-fg: #ffffff;
  --ag-ui-border: #e2e2ec;
  --ag-ui-radius: 12px;

  /* Surface — set --ag-ui-shadow: none for a flush, embedded panel. */
  --ag-ui-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
  --ag-ui-font: inherit;
  --ag-ui-font-size: 14px;

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
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--ag-ui-border);
  background: var(--ag-ui-header-bg);
  color: var(--ag-ui-header-fg);
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.message {
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 14px;
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
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
}

.tool-call {
  align-self: flex-start;
  font-size: 12px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--ag-ui-tool-bg);
  border: 1px solid var(--ag-ui-border);
  color: var(--ag-ui-accent);
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

.modal-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(20, 20, 50, 0.4);
  backdrop-filter: blur(2px);
}

.modal {
  width: 100%;
  max-width: 320px;
  background: var(--ag-ui-bg);
  border-radius: 12px;
  box-shadow: 0 16px 40px rgba(20, 20, 50, 0.3);
  overflow: hidden;
}

.modal-title {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--ag-ui-border);
}

.modal-body {
  padding: 12px 16px 4px;
}

.modal-args {
  margin: 0 16px 12px;
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

.modal-actions {
  display: flex;
  gap: 8px;
  padding: 0 16px 16px;
  justify-content: flex-end;
}

.modal-btn {
  border: 1px solid var(--ag-ui-border);
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  background: var(--ag-ui-bg);
  color: var(--ag-ui-fg);
}

.modal-btn--confirm {
  border-color: var(--ag-ui-accent);
  background: var(--ag-ui-accent);
  color: #ffffff;
}
`;
