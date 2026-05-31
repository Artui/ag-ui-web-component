// Shadow-DOM-scoped styles for the chat shell. Kept as a string constant so
// the Custom Element can inject it into its shadow root without a build-time
// CSS pipeline. Scoped by the shadow boundary, so class names stay terse.

export const STYLES = `
:host {
  --ag-ui-bg: #ffffff;
  --ag-ui-fg: #1a1a2e;
  --ag-ui-accent: #4f46e5;
  --ag-ui-user-bg: #4f46e5;
  --ag-ui-user-fg: #ffffff;
  --ag-ui-assistant-bg: #f1f1f6;
  --ag-ui-border: #e2e2ec;
  --ag-ui-radius: 12px;

  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483000;
  width: 380px;
  max-width: calc(100vw - 48px);
  height: 560px;
  max-height: calc(100vh - 48px);
  display: flex;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 14px;
  color: var(--ag-ui-fg);
}

.chat {
  display: flex;
  flex-direction: column;
  flex: 1;
  background: var(--ag-ui-bg);
  border: 1px solid var(--ag-ui-border);
  border-radius: var(--ag-ui-radius);
  box-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
  overflow: hidden;
}

.header {
  padding: 12px 16px;
  font-weight: 600;
  border-bottom: 1px solid var(--ag-ui-border);
  background: var(--ag-ui-accent);
  color: #ffffff;
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

.input-row {
  display: flex;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--ag-ui-border);
}

.input {
  flex: 1;
  resize: none;
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
`;
