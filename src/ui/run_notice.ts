/**
 * A muted one-line notice about something the run did (history condensed, a
 * skill loaded), rendered inline between turns.
 *
 * Distinct from a tool card, which reports work the agent asked for and
 * settles, and from an error, which is a failure. A notice never settles and
 * takes no action of its own.
 *
 * It may carry exactly one control, and only ever an undo. That is a narrower
 * rule than "no controls", which is what this said until the agent could move
 * the panel it speaks from: something that rearranges the user's window without
 * being asked has to be both visible and reversible, and a notice is already
 * the surface that says what the run did. Anything the user has to *decide* is
 * a confirmation card instead -- the difference is that this reports something
 * already done.
 */
export function renderRunNotice(
  icon: string,
  text: string,
  kind: string,
  undo?: { readonly label: string; readonly onActivate: () => void },
): HTMLDivElement {
  const notice = document.createElement("div");
  notice.className = `run-notice run-notice--${kind}`;
  notice.setAttribute("part", `run-notice run-notice-${kind}`);
  // status, not alert: informational, so it must not interrupt a screen reader
  // mid-sentence. Polite announcements land after the current utterance.
  notice.setAttribute("role", "status");

  const glyph = document.createElement("span");
  glyph.className = "run-notice-icon";
  glyph.setAttribute("part", "run-notice-icon");
  glyph.textContent = icon;
  // Decorative: the adjacent text already says what happened, so announcing the
  // glyph's name would only add noise.
  glyph.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "run-notice-text";
  label.setAttribute("part", "run-notice-text");
  label.textContent = text;

  notice.append(glyph, label);

  if (undo !== undefined) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "run-notice-undo";
    button.setAttribute("part", "run-notice-undo");
    button.textContent = undo.label;
    button.addEventListener("click", () => {
      // One use. The state it restores is the state as it was when the notice
      // was written, so offering it twice would put back something that has
      // since moved again.
      button.disabled = true;
      undo.onActivate();
    });
    notice.append(button);
  }
  return notice;
}
