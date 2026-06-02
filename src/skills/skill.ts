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
   * The prompt inserted (or sent). May contain `{placeholder}`s filled from the
   * host's skill context before send; an unfilled placeholder blocks send.
   */
  readonly prompt: string;
  /** Send immediately on pick instead of pre-filling the input (default false). */
  readonly sendImmediately?: boolean;
  /** Also surface this skill as a chip (default false; the palette shows all). */
  readonly chip?: boolean;
}
