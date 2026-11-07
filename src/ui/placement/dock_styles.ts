// Where a docked panel stands: above the bottom bar under collapse-to="bar",
// above the host's anchor under collapse-to="none". Token restatements only;
// the bar's own shape is in the collapse module, after the launcher it
// restyles.
export const DOCK_STYLES: string = `
/* ── Dock ────────────────────────────────────────────────────────────────────
   A docked panel rises from the bar along the bottom edge, or from the host's
   own control, instead of resting in a corner of its own. The element stamps
   what it collapses to as data-collapsed-to, and writes where the dock is as
   two private properties: --_dock-bottom, the bar's height or the distance
   from the layout viewport's bottom to the anchor's top, and --_dock-right,
   the anchor's distance from the right edge. Both are read with a 0px
   fallback, so a panel measured before the bar has laid out stands where a
   bar of no height would put it.

   The cap follows the token block's rule: what the host left free less the
   one gutter the anchored edge spends, so a panel grown to the cap runs from
   just above the bar to the far edge. A host therefore needs no inset to keep
   the panel off its bar; --ag-ui-inset still wins when set. A panel the user
   dragged off its dock is written there inline, which is how the dragged spot
   outranks every rule below, the anchor gap included; the element holds that
   spot above the bar or the anchor itself, and drops it on a phone, where the
   small-viewport block reads the same property first.

   These blocks restate tokens and nothing else, and sit ahead of the phone
   block at no more weight than it has, so on a phone the panel is the screen
   as every other placement is there. The bar measures 0 while it is not drawn
   (a phone with the panel open), which is what lets the side and full shapes
   below fall back to the whole height without a phone rule of their own.

   Each placement keeps its own side and shape; only the bottom edge moves. */
:host([data-collapsed-to="bar"]) {
  --_inset: var(
    --ag-ui-inset,
    auto calc(var(--_edge-gutter) + var(--_viewport-inset-right))
      calc(
        var(--_edge-gutter) + var(--_viewport-inset-bottom) +
          max(var(--_dock-bottom, 0px), var(--_keyboard-inset))
      )
      auto
  );
  --_max-height: var(--ag-ui-max-height, calc(var(--_viewport-height) - var(--_dock-bottom, 0px) - var(--_edge-gutter)));
}

:host([data-collapsed-to="bar"][placement="bottom-left"]) {
  --_inset: var(
    --ag-ui-inset,
    auto auto
      calc(
        var(--_edge-gutter) + var(--_viewport-inset-bottom) +
          max(var(--_dock-bottom, 0px), var(--_keyboard-inset))
      )
      calc(var(--_edge-gutter) + var(--_viewport-inset-left))
  );
}

/* The column and the full-screen panel stop at the bar rather than covering
   it, so the bar stays where the user minimises from. */
:host([data-collapsed-to="bar"][placement="side"]) {
  --_inset: var(
    --ag-ui-inset,
    calc(var(--_viewport-inset-top) + var(--_keyboard-inset-top)) var(--_viewport-inset-right)
      calc(var(--_viewport-inset-bottom) + var(--_dock-bottom, 0px)) auto
  );
  --_height: var(--ag-ui-height, calc(var(--_viewport-height) - var(--_dock-bottom, 0px)));
  --_max-height: var(--ag-ui-max-height, calc(var(--_viewport-height) - var(--_dock-bottom, 0px)));
}

:host([data-collapsed-to="bar"][placement="full"]) {
  --_inset: var(
    --ag-ui-inset,
    calc(var(--_viewport-inset-top) + var(--_keyboard-inset-top)) var(--_viewport-inset-right)
      calc(var(--_viewport-inset-bottom) + var(--_dock-bottom, 0px)) var(--_viewport-inset-left)
  );
  --_height: var(--ag-ui-height, calc(var(--_viewport-height) - var(--_dock-bottom, 0px)));
  --_max-height: var(--ag-ui-max-height, calc(var(--_viewport-height) - var(--_dock-bottom, 0px)));
}

/* The host's own bar: the panel stands the anchor gap (8px unless the host
   says otherwise) above the anchor and lines up with its right edge. Only
   once the element found the anchor; until then, and when it never does, the
   placement's own corner stands.

   The cap spends the larger of the gap and the gutter. The gutter alone is
   what this always spent, so the default is unchanged; but a host that opens
   the gap past the gutter to clear a tall toolbar would otherwise push a
   panel grown to the cap off the top of the window by the difference. */
:host([data-collapsed-to="none"][data-dock-anchored]) {
  --_inset: var(--ag-ui-inset, auto var(--_dock-right, 0px) calc(var(--_dock-bottom, 0px) + var(--_anchor-gap)) auto);
  --_max-height: var(
    --ag-ui-max-height,
    calc(var(--_viewport-height) - var(--_dock-bottom, 0px) - max(var(--_edge-gutter), var(--_anchor-gap)))
  );
}
`;
