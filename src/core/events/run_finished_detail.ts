import type { ToolRun } from "./tool_run.js";

/** `detail` shape of the {@link RUN_FINISHED_EVENT} CustomEvent. */
export interface RunFinishedDetail {
  /** In settle order. Empty when the interaction called no tools. */
  readonly tools: readonly ToolRun[];
  /**
   * Every key announced during the interaction, de-duplicated, first-seen order.
   *
   * **This is the field that makes adoption one line** for a host already
   * listening here, and the `else` is the whole compatibility story:
   *
   * ```js
   * if (detail.invalidated.length > 0) refetchOnly(detail.invalidated);
   * else if (detail.tools.some((t) => t.side === "server")) refetchEverything();
   * ```
   *
   * Empty against a server that announces nothing, so an old server and a new
   * client fall through to the coarse refetch that shipped before either.
   */
  readonly invalidated: readonly string[];
}
