// The place chip: where in the app the user is, drawn in the composer's tool
// row between the attach and voice controls and Send.
export const PLACE_STYLES: string = `
/* One quiet pill: a mark, the place, its detail, and the eye toggle. Muted at
   rest so it reads as a fact about the message rather than a control. It takes
   what the row's buttons leave and shrinks before Send can leave the row: the
   label truncates with an ellipsis and the chip's title carries it in full. */
.place {
  display: inline-flex;
  align-items: center;
  flex: 0 1 auto;
  gap: 6px;
  min-width: 0;
  height: var(--_tool-btn-size);
  box-sizing: border-box;
  margin-inline-start: 4px;
  padding: 0 2px 0 8px;
  border: 1px solid var(--_border);
  border-radius: 999px;
  color: var(--_muted);
  font-size: 0.85em;
  line-height: 1;
}

.place-icon {
  display: inline-flex;
  flex: none;
}

.place-icon .glyph,
.place-toggle .glyph,
.place-icon img {
  width: 14px;
  height: 14px;
}

.place-icon img {
  border-radius: 3px;
}

.place-text {
  display: inline-flex;
  gap: 6px;
  min-width: 0;
  overflow: hidden;
}

.place-label,
.place-detail {
  flex: 0 1 auto;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.place-label {
  color: var(--_fg);
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

/* An author display beats the user-agent rule for the hidden property, so each
   class above that sets one says it again for the hidden state: a chip with no
   place takes no space in the row. */
.place[hidden],
.place-icon[hidden],
.place-text[hidden],
.place-detail[hidden],
.place-toggle[hidden] {
  display: none;
}

/* Withheld from the next message: dashed and struck through, so the chip still
   says where the user is while saying plainly the agent is not told. */
.place[data-excluded] {
  border-style: dashed;
}

.place[data-excluded] .place-label,
.place[data-excluded] .place-detail {
  color: var(--_muted);
  text-decoration: line-through;
}
`;
