import type { ActivityRenderer } from "./activity_renderer.js";

/** One `activity_type` a host can draw. See {@link AgUiChat.registerActivityRenderer}. */
export interface ActivityRegistration {
  /**
   * The AG-UI `activity_type` this draws, matched exactly.
   *
   * An open string the protocol does not enumerate -- which is the whole reason
   * this is a registry rather than a branch.
   */
  readonly type: string;
  readonly render: ActivityRenderer;
  /**
   * Shown in the transcript when something already drawn under this type stops
   * being renderable. Omit for an activity whose disappearance needs no
   * explanation.
   */
  readonly removedNotice?: string;
}
