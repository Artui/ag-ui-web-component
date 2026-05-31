// Public surface re-exports. Per CLAUDE.md, this is the only re-export point.
export { AgUiChat, type MessageRole, type SubmitDetail } from "./ag_ui_chat.js";
export {
  AgUiClient,
  type AgUiClientConfig,
  type AgUiClientHandlers,
  type AgUiRunInputs,
  type AgUiToolCall,
} from "./agui_client.js";
export { ELEMENT_TAG, MESSAGE_ROLE, SUBMIT_EVENT } from "./constants.js";
export {
  type AgentFactory,
  createHttpAgent,
  type HttpAgentOptions,
} from "./create_http_agent.js";
export { defineAgUiChat } from "./define_ag_ui_chat.js";
export { VERSION } from "./version.js";
