// The shadow stylesheet, composed from one module per concern. Each module is
// a plain string constant so the element can adopt the whole sheet without a
// build-time CSS pipeline, and the shadow boundary scopes every class name.
//
// The list below is in cascade order, and that order is load-bearing: two
// rules of equal specificity resolve by which comes later, and several
// modules restate a state another module set at rest. A module moves in this
// list only with a browser test that pins what the move changes. The split
// that produced these modules moved no rule, so the composed sheet is the
// single stylesheet it replaced, byte for byte, which is also why a few small
// rules still sit in a neighbouring concern's module.
//
// Every module is a template literal: a backtick or a dollar-brace inside a
// CSS comment ends it, and tsc reports the error far from the edit.

import { CHART_STYLES } from "./charts/chart_styles.js";
import { ATTACHMENT_STYLES } from "./composer/attachment_styles.js";
import { COMPOSER_STYLES } from "./composer/composer_styles.js";
import { SKILL_STYLES } from "./composer/skill_styles.js";
import { HISTORY_STYLES } from "./history/history_styles.js";
import { APPROVAL_STYLES } from "./interrupts/approval_styles.js";
import { CONFIRMATION_STYLES } from "./interrupts/confirmation_styles.js";
import { QUESTION_STYLES } from "./interrupts/question_styles.js";
import { COLLAPSE_STYLES } from "./placement/collapse_styles.js";
import { EMBEDDED_STYLES } from "./placement/embedded_styles.js";
import { LAUNCHER_STYLES } from "./placement/launcher_styles.js";
import { PAGE_STYLES } from "./placement/page_styles.js";
import { PRESET_STYLES } from "./placement/preset_styles.js";
import { RESIZE_STYLES } from "./placement/resize_styles.js";
import { SIDEBAR_STYLES } from "./placement/sidebar_styles.js";
import { SMALL_VIEWPORT_STYLES } from "./placement/small_viewport_styles.js";
import { RUN_NOTICE_STYLES } from "./progress/run_notice_styles.js";
import { THOUGHTS_STYLES } from "./progress/thoughts_styles.js";
import { TOOL_STEP_STYLES } from "./progress/tool_step_styles.js";
import { FRAME_STYLES } from "./shell/frame_styles.js";
import { THEME_STYLES } from "./shell/theme_styles.js";
import { TOKEN_STYLES } from "./shell/token_styles.js";
import { ATTACHMENT_CHIP_STYLES } from "./transcript/attachment_chip_styles.js";
import { GREETING_STYLES } from "./transcript/greeting_styles.js";
import { MESSAGE_ACTION_STYLES } from "./transcript/message_action_styles.js";
import { MESSAGE_STYLES } from "./transcript/message_styles.js";
import { TRANSCRIPT_STYLES } from "./transcript/transcript_styles.js";

export const STYLES: string = [
  TOKEN_STYLES,
  THEME_STYLES,
  PRESET_STYLES,
  PAGE_STYLES,
  SMALL_VIEWPORT_STYLES,
  SIDEBAR_STYLES,
  LAUNCHER_STYLES,
  EMBEDDED_STYLES,
  FRAME_STYLES,
  COLLAPSE_STYLES,
  TRANSCRIPT_STYLES,
  GREETING_STYLES,
  MESSAGE_STYLES,
  THOUGHTS_STYLES,
  TOOL_STEP_STYLES,
  RESIZE_STYLES,
  COMPOSER_STYLES,
  ATTACHMENT_STYLES,
  CHART_STYLES,
  RUN_NOTICE_STYLES,
  ATTACHMENT_CHIP_STYLES,
  CONFIRMATION_STYLES,
  MESSAGE_ACTION_STYLES,
  APPROVAL_STYLES,
  QUESTION_STYLES,
  SKILL_STYLES,
  HISTORY_STYLES,
].join("");
