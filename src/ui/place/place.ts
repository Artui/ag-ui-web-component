/**
 * Where in the host application the conversation is: the page, tab, record or
 * place the user is looking at. Drawn above the composer and sent to the agent
 * as one context entry, from the same read, so the label the user sees is the
 * one the agent is told.
 */
export interface Place {
  /** Short name of the place, e.g. "Order #4821" or "Billing settings". */
  readonly label: string;
  /** A second, quieter line of context, e.g. the section or the tab. */
  readonly detail?: string;
  /** An image URL for a leading icon; a pin glyph when absent. */
  readonly icon?: string;
  /** Where the place lives; the chip links to it and the agent is told it. */
  readonly href?: string;
}
