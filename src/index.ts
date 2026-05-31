// Public surface re-exports. Per CLAUDE.md, this is the only re-export point.
export { AgUiChat, type MessageRole, type SubmitDetail } from "./ag_ui_chat.js";
export {
  AgUiClient,
  type AgUiClientConfig,
  type AgUiClientHandlers,
  type AgUiRunInputs,
  type AgUiToolCall,
  type ExecuteTool,
  type ToolExecution,
} from "./agui_client.js";
export { type ClientTool, ClientToolRegistry } from "./client_tool_registry.js";
export { type ConfirmationRequest, requestConfirmation } from "./confirmation_modal.js";
export {
  ELEMENT_TAG,
  MAX_TOOL_ROUNDS,
  MESSAGE_ROLE,
  SUBMIT_EVENT,
  X_DESTRUCTIVE_KEY,
} from "./constants.js";
export {
  type AgentFactory,
  createHttpAgent,
  type HttpAgentOptions,
} from "./create_http_agent.js";
export { defineAgUiChat } from "./define_ag_ui_chat.js";
export { isDestructive } from "./is_destructive.js";
export { VERSION } from "./version.js";
