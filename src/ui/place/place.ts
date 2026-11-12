/**
 * Where in the host application the user is: the page, tab or record on
 * screen. The chip in the composer draws it and the next round sends it as one
 * context entry, both from the same read, so the place the user sees is the
 * place the agent is told.
 */
export interface Place {
  /** Short name of the place, e.g. "Order #4821" or "Billing settings". */
  readonly label: string;
  /** A quieter second part, e.g. the section or the tab. */
  readonly detail?: string;
  /** An image URL for the chip's mark; a pin when absent. Never sent. */
  readonly icon?: string;
  /** Where the place lives. Sent to the agent, and what identifies the place. */
  readonly href?: string;
}
