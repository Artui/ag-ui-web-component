// The place chip: where in the app the conversation is, shown where the next
// message is written.
export const PLACE_STYLES: string = `
/* One quiet line: a glyph, the place, its detail, and the share toggle. Muted
   at rest so it reads as a fact about the message rather than a control. */
.place {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  height: var(--_tool-btn-size);
  padding: 0 2px 0 8px;
  border: 1px solid var(--_border);
  border-radius: 999px;
  background: transparent;
  color: var(--_muted);
  font-size: 0.85em;
  line-height: 1;
}

/* An author display beats the user-agent rule for the hidden property. */
.place[hidden],
.place-detail[hidden] {
  display: none;
}

.place-icon {
  display: inline-flex;
  flex: none;
}

.place-icon .glyph,
.place-toggle .glyph {
  width: 14px;
  height: 14px;
}

.place-icon img {
  width: 14px;
  height: 14px;
  border-radius: 3px;
}

.place-text {
  display: inline-flex;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.place-label {
  color: var(--_fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.place-detail {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.place-detail::before {
  content: "\\00B7";
  margin-inline-end: 6px;
}

.place-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--_muted);
  cursor: pointer;
}

.place-toggle:hover {
  background: var(--_hover);
  color: var(--_fg);
}

/* Taken out of the next message: struck through, so the chip still says
   where the user is while saying plainly the agent will not be told. */
.place[data-excluded] {
  border-style: dashed;
}

.place[data-excluded] .place-label,
.place[data-excluded] .place-detail {
  color: var(--_muted);
  text-decoration: line-through;
}

/* In the composer's tool row, the chip takes what the buttons leave and
   truncates before it pushes Send off the row. */
.composer-tools .place {
  flex: 0 1 auto;
  margin-inline-start: 4px;
}

/* As its own row above the field, aligned with the composer's inset. */
.place-row {
  display: flex;
  padding: 8px 12px 0;
}

.place-row[hidden],
.place-row:has(> .place[hidden]),
.place-row:has(> slot > .place[hidden]) {
  display: none;
}

:host([placement="page"]) .place-row {
  padding-inline: max(12px, calc((100% - var(--_content-max-width)) / 2));
}

:host([collapsed][placement="embedded"]) .place-row {
  display: none;
}
`;
