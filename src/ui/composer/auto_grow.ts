/**
 * Size the field to its content: one row when empty, growing with what is
 * typed until the CSS ceiling takes over and it scrolls.
 *
 * Resetting to `auto` first is what makes it shrink again — `scrollHeight`
 * never reports less than the current height, so measuring without the reset
 * would ratchet the composer taller and never back down.
 */
export function autoGrow(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${input.scrollHeight}px`;
}
