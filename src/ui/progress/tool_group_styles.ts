// The folded tool-step group: one row per run of consecutive tool calls,
// with the per-call cards one click down.

/** The four per-call card modes, as attribute selectors on the host. */
const CARD_MODES = [
  '[data-tool-display="inline"]',
  '[data-tool-display="minimal"]',
  '[data-tool-display="compact"]',
  '[data-tool-display="full"]',
].join(", ");

/**
 * The host in grouped mode: any data-tool-display but the four card modes,
 * which is how the element's toolDisplay getter reads it, so an absent or
 * unknown value groups here as it does there. Wrapped in :where so it weighs
 * what a bare :host weighs, and a theme restating a group rule on its own
 * :host selector still wins at equal weight.
 */
const GROUPED = `:host(:where(:not(${CARD_MODES})))`;

/** The host in one of the four card modes, where a group drawn earlier is flattened. */
const CARDS = `:host(:is(${CARD_MODES}))`;

/**
 * A card inside an opened group, with the host in grouped mode and the given
 * data-tool-group-display. The inner attribute sits inside the same :host()
 * as the grouped test, since the host is featureless outside it, and being
 * grouped-only is what lets an outer card mode flatten the group into its own
 * cards: none of these rules match there. Full is no rule at all, so an absent
 * or unknown inner value draws the full card a group always drew.
 */
function inner(mode: string): string {
  return `:host(:where(:not(${CARD_MODES}))[data-tool-group-display="${mode}"]) .tool-group-list .tool-call`;
}

export const TOOL_GROUP_STYLES: string = `
/* ── The folded tool-step group ──────────────────────────────────
   One quiet row per run of consecutive calls, the cards one click down as
   plain lines rather than boxes. Every rule is scoped to grouped mode, so
   none of it reaches a group drawn earlier once the host moves to a card
   mode. */
${GROUPED} .tool-group {
  align-self: stretch;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

${GROUPED} .tool-group-head {
  appearance: none;
  align-self: flex-start;
  max-width: 100%;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 0 -6px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--_muted);
  font: inherit;
  font-size: var(--_text-sm);
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}

${GROUPED} .tool-group-head:hover {
  background: var(--_hover);
  color: var(--_fg);
}

${GROUPED} .tool-group-head:focus-visible {
  outline: 2px solid var(--_ring);
  outline-offset: 1px;
}

${GROUPED} .tool-group-label {
  min-width: 0;
  font-weight: 500;
  color: var(--_ink-2);
  overflow-wrap: anywhere;
}

${GROUPED} .tool-group-meta {
  min-width: 0;
  color: var(--_muted);
  overflow-wrap: anywhere;
}

/* Each note opens with a middle dot, which also parts the first note from
   the label. */
${GROUPED} .tool-group-note::before {
  content: "\\00B7";
  margin: 0 6px 0 2px;
}

${GROUPED} .tool-group[data-state="error"] .tool-group-meta {
  color: var(--_danger);
}

${GROUPED} .tool-group-icon {
  flex: none;
  box-sizing: border-box;
  width: 14px;
  height: 14px;
  background: currentColor;
  mask: var(--_ico-check) center / contain no-repeat;
  color: var(--_success);
}

${GROUPED} .tool-group[data-state="error"] .tool-group-icon {
  mask-image: var(--_ico-error);
  color: var(--_danger);
}

${GROUPED} .tool-group[data-state="running"] .tool-group-icon {
  mask: none;
  background: none;
  border: 2px solid var(--_muted);
  border-top-color: transparent;
  border-radius: 50%;
  animation: ag-ui-tool-spin var(--_tool-spin-duration) linear infinite;
}

/* Waiting on the user: a steady accent dot rather than a spinner, and the
   count in the accent's ink. */
${GROUPED} .tool-group[data-state="waiting"] .tool-group-icon {
  mask: none;
  border-radius: 50%;
  transform: scale(0.6);
  background: var(--_accent);
}

${GROUPED} .tool-group[data-state="waiting"] .tool-group-meta {
  color: var(--_accent-ink);
  font-weight: 500;
}

${GROUPED} .tool-group-chevron {
  flex: none;
  width: 12px;
  height: 12px;
  background: currentColor;
  mask: var(--_ico-chevron) center / contain no-repeat;
  opacity: 0.7;
  transition: transform var(--_motion) var(--_ease);
}

${GROUPED} .tool-group[data-open="true"] .tool-group-chevron {
  transform: rotate(90deg);
}

@media (prefers-reduced-motion: reduce) {
  ${GROUPED} .tool-group[data-state="running"] .tool-group-icon {
    animation: none;
  }
}

${GROUPED} .tool-group-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 2px 0 4px 6px;
  padding-left: 13px;
  border-left: 1px solid var(--_border);
}

${GROUPED} .tool-group[data-open="false"] .tool-group-list {
  display: none;
}

/* A card inside the group is one line of the list: icon, name, and its
   Details control at the end, with the arguments and result opening under
   the whole row. */
${GROUPED} .tool-group .tool-call {
  max-width: 100%;
  align-self: stretch;
  flex-flow: row wrap;
  align-items: center;
  gap: 2px 10px;
  padding: 3px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--_ink-2);
  font-family: inherit;
  font-size: var(--_text-sm);
}

${GROUPED} .tool-group .tool-call-head {
  flex: 1 1 auto;
  justify-content: flex-start;
}

${GROUPED} .tool-group .tool-call-name {
  flex: 0 1 auto;
  font-weight: 450;
}

/* The repeat ordinal on a step whose label an earlier step has. */
${GROUPED} .tool-call-repeat {
  color: var(--_muted);
  font-variant-numeric: tabular-nums;
}

${GROUPED} .tool-group .tool-call-toggle {
  font-family: inherit;
  font-size: var(--_text-xs);
  color: var(--_muted);
}

${GROUPED} .tool-group .tool-call-body,
${GROUPED} .tool-group .tool-call-approval,
${GROUPED} .tool-group .tool-call-subagent {
  flex-basis: 100%;
}

/* The inner display mode: how an opened group draws its calls. The same
   visibility rules the card modes apply to a flat card, so a call inside the
   group shows the regions the flat card of that mode shows. The flat inline
   mode's chrome rule is left out on purpose: a card in the group has already
   lost its box and is laid out as a row of the list, and that rule's padding
   and gap would undo the row. Selected from the host attribute, so changing it
   restyles groups already on screen. */
${inner("compact")}[data-expanded="false"] .tool-call-section {
  display: none;
}

${inner("inline")} .tool-call-section--args {
  display: none;
}

${inner("minimal")} .tool-call-toggle,
${inner("minimal")} .tool-call-body {
  display: none;
}

/* A call waiting on an approval shows its arguments in every inner mode, as it
   does in every card mode, and for the same reason: the arguments are what
   tell three gated calls of one tool apart. These come after the hides above,
   which they tie with on weight. The arguments region only, never every
   section, since the result region carries the hidden attribute until a
   result exists and a display value here would override it. The arguments
   region carries it too when the call has none, so it is excluded while
   hidden rather than framed empty. */
${inner("minimal")}[data-status="deferred"] .tool-call-body {
  display: flex;
}

${inner("compact")}[data-status="deferred"] .tool-call-section--args:not([hidden]),
${inner("inline")}[data-status="deferred"] .tool-call-section--args:not([hidden]) {
  display: flex;
}

/* Grouping is decided as each card is built, so a card mode set afterwards
   finds groups already drawn. It flattens them: the group and its list stop
   generating boxes, the row and the repeat ordinals go, and every card lays
   out as a direct child of the answer, exactly as a card built in that mode
   does. */
${CARDS} .tool-group,
${CARDS} .tool-group-list {
  display: contents;
}

${CARDS} .tool-group-head,
${CARDS} .tool-call-repeat {
  display: none;
}

/* Each of these declares its own display, which beats the user-agent rule for
   the hidden attribute, so each needs its own. The host prefix is there for
   weight, not scope: it lifts these over the card-mode rules above that set
   display, which are heavier than a bare class and attribute. */
:host .tool-group[hidden],
:host .tool-group-head[hidden],
:host .tool-group-list[hidden] {
  display: none;
}
`;
