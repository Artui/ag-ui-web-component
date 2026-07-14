// Public surface re-exports. Per CLAUDE.md, this is the only re-export point.

export {
  ELEMENT_TAG,
  MAX_TOOL_ROUNDS,
  MESSAGE_ROLE,
  SUBMIT_EVENT,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  X_CONFIRM_KEY,
  X_DESTRUCTIVE_KEY,
  X_NAVIGATES_KEY,
  X_SUMMARY_KEY,
} from "./constants.js";
export {
  AgUiChat,
  type MessageRole,
  type SubmitDetail,
  type ToggleDetail,
} from "./core/ag_ui_chat.js";
export {
  AgUiClient,
  type AgUiClientConfig,
  type AgUiClientHandlers,
  type AgUiRunInputs,
  type AgUiToolCall,
  ConnectionLostError,
  type ExecuteTool,
  type InterruptResponse,
  type ResolveInterrupts,
  type ToolExecution,
} from "./core/agui_client.js";
export { type AttachmentRef, messageAttachments } from "./core/attachment.js";
export {
  type ClientConversationStore,
  type NavigationCheckpoint,
  SessionStorageStore,
  type ThreadMeta,
} from "./core/conversation_store.js";
export {
  type AgentFactory,
  createHttpAgent,
  type HttpAgentOptions,
} from "./core/create_http_agent.js";
export { defineAgUiChat } from "./core/define_ag_ui_chat.js";
export { RemoteConversationStore } from "./core/remote_conversation_store.js";
export {
  type TranscribeHandler,
  type TranscribeOptions,
  transcribeAudio,
} from "./core/transcribe_audio.js";
export {
  type UploadHandler,
  type UploadOptions,
  uploadAttachment,
} from "./core/upload_attachment.js";
export {
  type FlashOptions,
  focusWithFlash,
  type HighlightClickOptions,
  highlightThenClick,
  type PressOptions,
  prefersReducedMotion,
  pressThenClick,
  type SelectOptions,
  scrollIntoCenterView,
  selectOption,
  type TextLikeElement,
  type ToggleOptions,
  type TypeOptions,
  toggleControl,
  typeInto,
} from "./dom/animations.js";
export {
  clickElement,
  type FillFieldOptions,
  fillField,
  pressButton,
  selectControl,
  setControlValue,
  toggleCheckbox,
} from "./dom/dom_driver.js";
export { setNativeChecked, setNativeValue } from "./dom/native_setter.js";
export type { Skill } from "./skills/skill.js";
export { type ClientTool, ClientToolRegistry } from "./tools/client_tool_registry.js";
export { isDestructive } from "./tools/is_destructive.js";
export { isNavigates } from "./tools/is_navigates.js";
export {
  createPageActionTools,
  PAGE_ACTIONS,
  type ResolvePageTarget,
} from "./tools/page_action_tools.js";
export { createPageMapContext, type PageMap } from "./tools/page_map.js";
export { parseToolCatalog, type ToolCatalogEntry } from "./tools/parse_tool_catalog.js";
export {
  createRouteTools,
  type Route,
  type RouteMap,
  type RouteWithParams,
} from "./tools/route_map.js";
export { createStateHookTools, type StateHook } from "./tools/state_hook.js";
export {
  type ApprovalOptions,
  type ApprovalRequest,
  requestApproval,
} from "./ui/approval_card.js";
export {
  type ConfirmationOptions,
  type ConfirmationRequest,
  requestConfirmation,
} from "./ui/confirmation_card.js";
export { prettifyToolName } from "./ui/prettify_tool_name.js";
export {
  type QuestionOptions,
  type QuestionRequest,
  requestQuestion,
} from "./ui/question_card.js";
export { type RenderMarkdownOptions, renderMarkdown } from "./ui/render_markdown.js";
export {
  type SettledStatus,
  ToolCallCard,
  type ToolCallStatus,
  type ToolDisplayMode,
} from "./ui/tool_call_card.js";
export { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "./ui/ui_strings.js";
export { VERSION } from "./version.js";
