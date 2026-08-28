// Public surface re-exports. Per CLAUDE.md, this is the only re-export point.

export {
  ATTACHMENT_EVENT,
  CHART_ACTIVITY_TYPE,
  COMPACTION_ACTIVITY_TYPE,
  CUSTOM_AGENT_EVENT,
  ELEMENT_TAG,
  FEEDBACK_EVENT,
  INVALIDATE_CUSTOM_NAME,
  INVALIDATE_EVENT,
  LOAD_CAPABILITY_TOOL,
  MAX_TOOL_ROUNDS,
  MESSAGE_ROLE,
  RUN_FINISHED_EVENT,
  STATE_EVENT,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  UNREAD_EVENT,
  X_CONFIRM_KEY,
  X_DESTRUCTIVE_KEY,
  X_NAVIGATES_KEY,
  X_SUMMARY_KEY,
} from "./constants.js";
export {
  type ActivityRegistration,
  type ActivityRenderer,
  AgUiChat,
  type AttachmentsDetail,
  type CustomAgentDetail,
  type FeedbackDetail,
  type InvalidateDetail,
  type MessageRole,
  type RunFinishedDetail,
  type StateDetail,
  type SubmitDetail,
  type ToggleDetail,
  type ToolRun,
  type UnreadDetail,
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
export { RunIndex, type RunRow } from "./core/run_index.js";
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
  flash,
  focusWithFlash,
  type HighlightClickOptions,
  highlightThenClick,
  type PressOptions,
  prefersReducedMotion,
  pressThenClick,
  type ScrollOptions,
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
/**
 * @deprecated Renamed to `createPageStateTools` / `PageState`. The old names
 * read as AG-UI shared-state sync, which this component does not implement.
 */
export {
  createPageStateTools,
  createStateHookTools,
  type PageState,
  type StateHook,
} from "./tools/page_state.js";
export { parseToolCatalog, type ToolCatalogEntry } from "./tools/parse_tool_catalog.js";
export {
  createRouteTools,
  type Route,
  type RouteMap,
  type RouteWithParams,
} from "./tools/route_map.js";
export {
  type ApprovalOptions,
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "./ui/approval_card.js";
// Charts. `CHART_ACTIVITY_TYPE` above is the wire name a server sets on an
// ACTIVITY_SNAPSHOT; these are the shape it carries and the renderer itself,
// for a host building its own visual on the same seam.
export type { ChartKind, ChartSeries, ChartSpec } from "./ui/chart_block.js";
export { renderChart } from "./ui/chart_block.js";
export { chartSpecFrom } from "./ui/chart_spec_from.js";
export { CHART_TOOL_NAME } from "./ui/chart_tool.js";
export { CheckpointMenu, type CheckpointVerb } from "./ui/checkpoint_menu.js";
export {
  type ConfirmationOptions,
  type ConfirmationRequest,
  requestConfirmation,
} from "./ui/confirmation_card.js";
export {
  attachMessageActions,
  type MessageActionsOptions,
  messageActionBar,
} from "./ui/message_actions.js";
export { prettifyToolName } from "./ui/prettify_tool_name.js";
export {
  type QuestionOptions,
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "./ui/question_card.js";
export { type RenderMarkdownOptions, renderMarkdown } from "./ui/render_markdown.js";
export {
  MAX_SUGGESTION_CHARS,
  MAX_SUGGESTIONS,
  renderSuggestionChips,
  suggestionPrompts,
} from "./ui/suggestion_chips.js";
export {
  type SettledStatus,
  ToolCallCard,
  type ToolCallStatus,
  type ToolDisplayMode,
} from "./ui/tool_call_card.js";
export { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "./ui/ui_strings.js";
export { VERSION } from "./version.js";
