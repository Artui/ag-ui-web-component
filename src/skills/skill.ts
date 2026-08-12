/**
 * A pre-defined prompt the user can launch from the chat — surfaced as a chip
 * and/or in the `/`-command palette. One catalog feeds both surfaces; the host
 * provides skills via the `skills` property / `data-skills` attribute / a
 * fetched endpoint (see {@link AgUiChat}).
 */
export interface Skill {
  /** Stable id; the `/token` (kebab-case) in the palette. */
  readonly name: string;
  /** Label shown in chips and the palette. */
  readonly title: string;
  /** Secondary line shown in the palette. */
  readonly description?: string;
  /**
   * The prompt to send. May contain `{placeholder}`s filled from the host's
   * skill context before send; an unfilled placeholder blocks send.
   *
   * Omit it to keep the prompt server-side: the skill then sends the bare
   * `/name` token for the agent to resolve, and the wording never reaches the
   * browser. Prefer that for anything internal — a fetched catalog is a plain
   * GET and an embedded one sits in the page source.
   */
  readonly prompt?: string;
  /**
   * Set `false` to pre-fill the composer instead of sending on pick. Defaults
   * to sending, and is only meaningful for a skill carrying its own `prompt`;
   * a server-resolved one always sends.
   */
  readonly sendImmediately?: boolean;
  /** Also surface this skill as a chip (default false; the palette shows all). */
  readonly chip?: boolean;
}
