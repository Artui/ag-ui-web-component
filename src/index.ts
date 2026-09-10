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
  MESSAGE_ACTIONS,
  MESSAGE_ROLE,
  RUN_FINISHED_EVENT,
  STATE_EVENT,
  SUBMIT_EVENT,
  SUGGESTIONS_ACTIVITY_TYPE,
  TOGGLE_EVENT,
  TOOL_CALL_STATUS,
  TOOL_DISPLAY,
  TOOL_OUTCOME,
  UNREAD_EVENT,
  X_CONFIRM_KEY,
  X_DESTRUCTIVE_KEY,
  X_NAVIGATES_KEY,
  X_SUMMARY_KEY,
} from "./constants.js";
export type { ActivityRegistration } from "./core/activity_registration.js";
export type { ActivityRenderer } from "./core/activity_renderer.js";
export { AgUiChat } from "./core/ag_ui_chat.js";
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
export type { AttachmentsDetail } from "./core/events/attachments_detail.js";
export type { CustomAgentDetail } from "./core/events/custom_agent_detail.js";
export type { FeedbackDetail } from "./core/events/feedback_detail.js";
export type { InvalidateDetail } from "./core/events/invalidate_detail.js";
export type { RunFinishedDetail } from "./core/events/run_finished_detail.js";
export type { StateDetail } from "./core/events/state_detail.js";
export type { SubmitDetail } from "./core/events/submit_detail.js";
export type { ToggleDetail } from "./core/events/toggle_detail.js";
export type { ToolRun } from "./core/events/tool_run.js";
export type { UnreadDetail } from "./core/events/unread_detail.js";
export type { MessageRole } from "./core/message_role.js";
export { RemoteConversationStore } from "./core/remote_conversation_store.js";
export { RunIndex, type RunRow } from "./core/run_index.js";
export { type ToolOutcome, toolStatusFromOutcome } from "./core/tool_outcome.js";
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
export {
  type HighlightOverlayOptions,
  showHighlightOverlay,
} from "./dom/highlight_overlay.js";
export { setNativeChecked, setNativeValue } from "./dom/native_setter.js";
export type { Skill } from "./skills/skill.js";
export {
  CHAT_CORNERS,
  type ChatCorner,
  type ChatSurface,
  type ChatSurfaceReport,
  createChatSurfaceTools,
  isChatCorner,
} from "./tools/chat_surface_tools.js";
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
// Charts. `CHART_ACTIVITY_TYPE` above is the wire name a server sets on an
// ACTIVITY_SNAPSHOT; these are the shape it carries and the renderer itself,
// for a host building its own visual on the same seam.
export type { ChartKind, ChartSeries, ChartSpec } from "./ui/charts/chart_block.js";
export { renderChart } from "./ui/charts/chart_block.js";
export { chartSpecFrom } from "./ui/charts/chart_spec_from.js";
export { CHART_TOOL_NAME } from "./ui/charts/chart_tool.js";
export {
  attachQuoteOffer,
  type PageQuoteOffer,
  type PageQuoteOfferOptions,
} from "./ui/excerpts/page_quote_offer.js";
// Quoting. The transcript wires these itself; they are exported for the half
// the component cannot reach -- a selection made in the **host page**, which
// a host reads its own way and hands to `AgUiChat.quote()`.
export {
  asQuote,
  MAX_QUOTE_CHARS,
  type QuotableSelection,
  quotableSelection,
} from "./ui/excerpts/quote_selection.js";
export { CheckpointMenu, type CheckpointVerb } from "./ui/history/checkpoint_menu.js";
export {
  type RelativeTimeFormatter,
  relativeTime,
} from "./ui/history/relative_time.js";
export {
  type ApprovalOptions,
  type ApprovalRenderer,
  type ApprovalRequest,
  requestApproval,
} from "./ui/interrupts/approval_card.js";
export {
  type ConfirmationOptions,
  type ConfirmationRequest,
  requestConfirmation,
} from "./ui/interrupts/confirmation_card.js";
export {
  type QuestionOptions,
  type QuestionRenderer,
  type QuestionRequest,
  requestQuestion,
} from "./ui/interrupts/question_card.js";
export { prettifyToolName } from "./ui/progress/prettify_tool_name.js";
export {
  type SettledStatus,
  ToolCallCard,
  type ToolCallCardOptions,
  type ToolCallStatus,
  type ToolDisplayMode,
  type ToolPayload,
  type ToolPayloadFormatter,
} from "./ui/progress/tool_call_card.js";
export {
  attachMessageActions,
  type MessageActionsOptions,
  messageActionBar,
} from "./ui/transcript/message_actions.js";
export { type RenderMarkdownOptions, renderMarkdown } from "./ui/transcript/render_markdown.js";
export {
  MAX_SUGGESTION_CHARS,
  MAX_SUGGESTIONS,
  renderSuggestionChips,
  suggestionPrompts,
} from "./ui/transcript/suggestion_chips.js";
export { DEFAULT_UI_STRINGS, mergeUiStrings, type UiStrings } from "./ui/ui_strings.js";
export { VERSION } from "./version.js";
