/**
 * A muted one-line notice about something the *run* did, rendered inline in the
 * transcript between turns.
 *
 * Distinct from a tool card (which reports work the agent asked for and is
 * settleable) and from an error (which is a failure). A notice is ambient: the
 * agent condensed earlier turns, or loaded a skill. It never settles, never
 * takes an action, and carries no controls — so it stays visually quiet and out
 * of the way of the conversation it annotates.
 */
export function renderRunNotice(icon: string, text: string, kind: string): HTMLDivElement {
  const notice = document.createElement("div");
  notice.className = `run-notice run-notice--${kind}`;
  notice.setAttribute("part", `run-notice run-notice-${kind}`);
  // A status role, not an alert: this is informational and must not interrupt a
  // screen reader mid-sentence. Polite announcements land after the current
  // utterance, which is right for an annotation about turns already spoken.
  notice.setAttribute("role", "status");

  const glyph = document.createElement("span");
  glyph.className = "run-notice-icon";
  glyph.setAttribute("part", "run-notice-icon");
  glyph.textContent = icon;
  // Decorative: the adjacent text already says what happened, and a screen
  // reader announcing the emoji's name would just add noise.
  glyph.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "run-notice-text";
  label.setAttribute("part", "run-notice-text");
  label.textContent = text;

  notice.append(glyph, label);
  return notice;
}
