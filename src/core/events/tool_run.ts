/** One tool that ran during an interaction, as {@link RunFinishedDetail} lists it. */
export interface ToolRun {
  readonly name: string;
  /**
   * Where it executed. `"server"` is the one a data-rendering host cares about:
   * a `"client"` tool ran in the host's own handler, so the host already knows
   * whatever it did.
   */
  readonly side: "server" | "client";
}
