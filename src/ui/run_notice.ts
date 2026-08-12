/**
 * A muted one-line notice about something the run did (history condensed, a
 * skill loaded), rendered inline between turns.
 *
 * Distinct from a tool card, which reports work the agent asked for and
 * settles, and from an error, which is a failure. A notice never settles, takes
 * no action, and carries no controls.
 */
export function renderRunNotice(icon: string, text: string, kind: string): HTMLDivElement {
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
  return notice;
}
