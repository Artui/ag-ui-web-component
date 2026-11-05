// Every public --ag-ui-* token read into its private --_* alias on :host.
// This is where the token defaults are declared; see the block comment below.
export const TOKEN_STYLES: string = `
/* ── Token defaults ─────────────────────────────────────────────────────────
   Every public --ag-ui-* token is read here into a private --_* alias, and
   only the alias is used by the rules below.

   The indirection is what makes ancestor theming work. Declaring the public
   name on :host would set it on the host element, and a value on an element
   always beats one inherited from an ancestor, so tokens put on a wrapper
   would have no effect. Reading the public name with the default as a var()
   fallback leaves it undeclared on the element, so an ancestor's value
   inherits normally while one aimed at the element still wins.

   Two invariants hold this together:
   1. No rule outside a :host block may reference a public name
      directly. A public name read outside these blocks resolves to nothing and
      silently drops its declaration rather than erroring, so the miss shows up
      as a missing colour, not a failure.
   2. Every --_* alias in use is declared here. Aliases inherit like any custom
      property, so an undeclared one would pick up a same-named property from
      the host page; declaring it on :host shields the shadow tree from that. */
:host {
  /* Colors. The default theme, Quiet: three seeds, and every other shade
     mixed from them in oklch, so a host that sets only --ag-ui-accent (or
     only the background and text) gets a whole widget rethemed. The seeds use
     light-dark, so the scheme word on the theme attribute picks the half;
     see scheme_styles in the themes directory. Every derived shade still
     reads its own public token first, so each stays an override point. */
  color-scheme: light;
  --_bg: var(--ag-ui-bg, light-dark(#ffffff, #161618));
  --_fg: var(--ag-ui-fg, light-dark(#1b1b1d, #ececee));
  --_accent: var(--ag-ui-accent, light-dark(#232326, #f0f0f2));
  --_ink-2: var(--ag-ui-ink-2, color-mix(in oklch, var(--_fg) 78%, var(--_bg)));
  --_ink-3: var(--ag-ui-ink-3, color-mix(in oklch, var(--_fg) 64%, var(--_bg)));
  --_line: var(--ag-ui-line, color-mix(in oklch, var(--_fg) 11%, var(--_bg)));
  --_line-strong: var(--ag-ui-line-strong, color-mix(in oklch, var(--_fg) 20%, var(--_bg)));
  --_wash: var(--ag-ui-wash, color-mix(in oklch, var(--_fg) 4.5%, var(--_bg)));
  --_accent-ink: var(--ag-ui-accent-ink, color-mix(in oklch, var(--_accent) 82%, var(--_fg)));
  /* The user's turn is the accent at a whisper. With Quiet's graphite accent
     that is a neutral wash; once a host sets a brand accent it becomes a tint
     of the brand, which is the one thing Soft does that Quiet keeps. */
  --_user-bg: var(--ag-ui-user-bg, color-mix(in oklch, var(--_accent) 12%, var(--_bg)));
  --_user-fg: var(--ag-ui-user-fg, var(--_fg));
  --_assistant-bg: var(--ag-ui-assistant-bg, transparent);
  --_hover: var(--ag-ui-hover, color-mix(in oklch, var(--_fg) 6%, var(--_bg)));
  --_input-bg: var(--ag-ui-input-bg, var(--_bg));
  --_tool-bg: var(--ag-ui-tool-bg, transparent);
  --_tool-fg: var(--ag-ui-tool-fg, var(--_ink-2));
  --_header-bg: var(--ag-ui-header-bg, var(--_bg));
  --_header-fg: var(--ag-ui-header-fg, var(--_fg));
  --_border: var(--ag-ui-border, var(--_line));
  --_radius: var(--ag-ui-radius, 12px);
  /* The panel's own frame, which is the one corner a placement can put against
     the edge of the viewport. The placements that do (page, sidebar, side, full,
     and all but embedded on a small viewport) square this and leave --_radius alone, so
     the answer well and the controls inside the panel stay as round as the
     theme says: none of them meets that edge. */
  /* What a theme sets for the frame; the effective value below is what a
     placement squares, so the two never fight over one property. A host's
     --ag-ui-radius still rounds the frame, as it did before themes gave the
     frame a radius of its own; only the theme's own default differs. */
  --_frame-radius: var(--ag-ui-frame-radius, var(--ag-ui-radius, 14px));
  --_panel-radius: var(--ag-ui-panel-radius, var(--_frame-radius));

  /* Body text and raised chrome, read only by the code-block copy button.
     The defaults restate what it inherits, so a host that sets neither sees
     no repaint — see the note on .code-copy. */
  --_text: var(--ag-ui-text, var(--_fg));
  --_surface: var(--ag-ui-surface, transparent);

  /* Message action row: the control box and the mark inside it. The box has a
     floor of 24px so it stays a reliable target at every density. */
  --_action-size: var(--ag-ui-action-size, 28px);
  /* The header's own controls. Sized rather than left to their contents: a row
     of buttons each as wide as the glyph inside it comes out uneven, and uneven
     buttons two pixels apart read as one smudge rather than five controls. */
  --_header-btn-size: var(--ag-ui-header-btn-size, 30px);
  --_header-gap: var(--ag-ui-header-gap, 4px);
  --_action-icon-size: var(--ag-ui-action-icon-size, 15px);
  --_tooltip-bg: var(--ag-ui-tooltip-bg, var(--_fg));
  --_tooltip-fg: var(--ag-ui-tooltip-fg, var(--_bg));

  /* Text and marks drawn on top of the accent and danger fills. Separate
     tokens because they are not free: a host that themes the accent to a pale
     colour has white-on-pale with no way to correct it, which is the one
     theming change that makes a control unreadable rather than merely off. */
  /* Picked from the accent's own luminance where relative colour syntax is
     supported (the block after this rule). Without it, the fallback below:
     the scheme's colour, which is the right side for each newer theme's own
     accent in both schemes. A theme sets the fallback rather than the value,
     so a theme rule never outweighs the computed pick; classic and code set
     white, the colour they always drew. */
  --_on-accent-fallback: light-dark(#ffffff, #111111);
  --_on-accent: var(--ag-ui-on-accent, var(--_on-accent-fallback));
  --_on-danger: var(--ag-ui-on-danger, #ffffff);

  /* Resize grips: the corner squares and the edge strips between them. Wide
     enough to hit without being wide enough to swallow a click on the content
     underneath, and adjustable for a host with a coarser pointer. */
  --_grip-corner: var(--ag-ui-grip-corner, 14px);
  --_grip-edge: var(--ag-ui-grip-edge, 6px);
  --_grip-edge-docked: var(--ag-ui-grip-edge-docked, 8px);
  /* The mark drawn inside a grip, as opposed to the area it answers to. */
  --_grip-mark-length: var(--ag-ui-grip-mark-length, 28px);
  --_grip-mark-thickness: var(--ag-ui-grip-mark-thickness, 3px);

  /* Status accents for tool-call cards. */
  --_success: var(--ag-ui-success, light-dark(#15803d, #4ade80));
  --_danger: var(--ag-ui-danger, light-dark(#b91c1c, #f87171));
  --_muted: var(--ag-ui-muted, var(--_ink-3));

  /* Tool-call status icon glyphs (override to re-theme) + spinner speed.
     The pending state is the animated ring; the settled states use these. */
  --_tool-icon-done: var(--ag-ui-tool-icon-done, "✓");
  --_tool-icon-error: var(--ag-ui-tool-icon-error, "✕");
  --_tool-icon-declined: var(--ag-ui-tool-icon-declined, "⊘");
  --_tool-icon-interrupted: var(--ag-ui-tool-icon-interrupted, "◌");

  /* Disclosure marks on every expandable row. Tokenised for the same reason
     the status icons above are: a host re-theming one set and not the other
     ends up with two vocabularies in one transcript. */
  --_disclosure-collapsed: var(--ag-ui-disclosure-collapsed, "▸");
  --_disclosure-expanded: var(--ag-ui-disclosure-expanded, "▾");
  --_tool-spin-duration: var(--ag-ui-tool-spin-duration, 0.7s);

  /* Answer well (opt-in via data-answer-well) — boxes a whole assistant turn. */
  --_well-bg: var(--ag-ui-well-bg, transparent);
  --_well-border: var(--ag-ui-well-border, var(--_border));
  --_well-radius: var(--ag-ui-well-radius, var(--_radius));

  /* Surface — set --ag-ui-shadow: none for a flush, embedded panel. */
  --_frame-shadow: var(--ag-ui-frame-shadow, 0 1px 2px light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.04)), 0 12px 32px -16px light-dark(rgb(0 0 0 / 0.22), rgb(0 0 0 / 0.7)));
  --_shadow: var(--ag-ui-shadow, var(--_frame-shadow));
  --_font: var(--ag-ui-font, Inter, ui-sans-serif, system-ui, sans-serif);
  --_serif: var(--ag-ui-serif, Charter, "Bitstream Charter", "Iowan Old Style", Georgia, serif);
  --_font-size: var(--ag-ui-font-size, var(--_text-md));
  /* The type scale. */
  --_text-xs: var(--ag-ui-text-xs, 11.5px);
  --_text-sm: var(--ag-ui-text-sm, 12.5px);
  --_text-md: var(--ag-ui-text-md, 14px);
  --_text-lg: var(--ag-ui-text-lg, 16px);
  --_leading: var(--ag-ui-leading, 1.55);
  --_code-font: var(--ag-ui-code-font, ui-monospace, "SF Mono", Menlo, monospace);

  /* Header / launcher icon box. */
  --_icon-size: var(--ag-ui-icon-size, 22px);
  --_icon-radius: var(--ag-ui-icon-radius, 4px);

  /* Composer — one bordered surface holding the field and its tool row. */
  --_composer-radius: var(--ag-ui-composer-radius, 12px);
  --_composer-max-height: var(--ag-ui-composer-max-height, 40vh);
  --_tool-btn-size: var(--ag-ui-tool-btn-size, 30px);
  --_send-size: var(--ag-ui-send-size, 30px);
  --_glyph-size: var(--ag-ui-glyph-size, 18px);
  --_glyph-stroke: var(--ag-ui-glyph-stroke, 1.75);

  /* How wide a chart is allowed to get. A cap rather than a width: below it
     the chart fills its column, and above it a wider panel is just a wider
     panel. */
  --_chart-max-width: var(--ag-ui-chart-max-width, 480px);
  /* Chart series. Quiet draws in ink and keeps hues for the series past two. */
  --_chart-1: var(--ag-ui-chart-1, var(--_fg));
  --_chart-2: var(--ag-ui-chart-2, color-mix(in oklch, var(--_fg) 32%, var(--_bg)));
  --_chart-3: var(--ag-ui-chart-3, #e0803c);
  --_chart-4: var(--ag-ui-chart-4, #b563d8);
  --_chart-5: var(--ag-ui-chart-5, #d84f6e);
  --_chart-6: var(--ag-ui-chart-6, #3ba7c4);

  /* Unread badge on the launcher. */
  --_badge-bg: var(--ag-ui-badge-bg, var(--_danger));
  --_badge-fg: var(--ag-ui-badge-fg, #ffffff);
  --_badge-size: var(--ag-ui-badge-size, 18px);
  --_badge-font-size: var(--ag-ui-badge-font-size, 11px);

  /* The floating launcher a collapsed widget shrinks to. */
  --_launcher-size: var(--ag-ui-launcher-size, 48px);
  --_launcher-bg: var(--ag-ui-launcher-bg, var(--_bg));
  --_launcher-fg: var(--ag-ui-launcher-fg, var(--_fg));
  --_launcher-radius: var(--ag-ui-launcher-radius, 14px);
  --_launcher-icon-size: var(--ag-ui-launcher-icon-size, 22px);
  --_launcher-inset: var(--ag-ui-launcher-inset, auto 0 0 auto);

  /* Motion. One duration and two curves drive every collapse, expand and
     slide-over, so the widget accelerates and settles as one thing. The
     default curve decelerates into place; the pop curve overshoots slightly,
     for something arriving. */
  --_motion: var(--ag-ui-motion, 0.28s);
  --_ease: var(--ag-ui-ease, cubic-bezier(0.32, 0.72, 0, 1));
  --_ease-pop: var(--ag-ui-ease-pop, cubic-bezier(0.34, 1.36, 0.64, 1));

  /* Spacing — the density preset overrides these. */
  --_space: var(--ag-ui-space, 10px);
  --_pad: var(--ag-ui-pad, 16px);
  --_msg-pad: var(--ag-ui-msg-pad, 8px 12px);
  --_msg-radius: var(--ag-ui-msg-radius, 12px);

  /* Edges of the viewport the host has already spent, and that a fixed
     placement must therefore stay out of: a sticky nav bar, a docked toolbar,
     a device's safe area. Four longhands rather than one shorthand because a
     custom property is a token stream and CSS cannot index one -- the height
     arithmetic below needs the vertical pair on its own.

     Every fixed placement derives from these, and the heights subtract them in
     one place. A host that reserved its chrome by restating --ag-ui-inset per
     placement had to keep --ag-ui-height in step by hand, and forgetting it
     overflowed the panel past the bottom of the screen with nothing to say so.

     These take env(safe-area-inset-*) verbatim, which is what a full-bleed
     placement wants on a device with a notch. */
  --_viewport-inset-top: var(--ag-ui-viewport-inset-top, 0px);
  --_viewport-inset-right: var(--ag-ui-viewport-inset-right, 0px);
  --_viewport-inset-bottom: var(--ag-ui-viewport-inset-bottom, 0px);
  --_viewport-inset-left: var(--ag-ui-viewport-inset-left, 0px);
  /* What is left of the viewport once the host's chrome is taken out, on both
     axes, so a placement never composes this itself and no host can subtract
     an edge from the position and forget it in the height.

     Settable in their own right, and that is not only convention: an on-screen
     keyboard changes no viewport-percentage length -- not vh, not dvh, not svh
     -- so a full-bleed panel on a phone has to be told the height rather than
     deriving it. The value to publish there is the visual viewport's. */
  --_viewport-height: var(
    --ag-ui-viewport-height,
    calc(
      min(var(--_visual-viewport-inset-top) + var(--_visual-viewport-height), 100dvh - var(--_viewport-inset-bottom)) -
        var(--_viewport-inset-top) - var(--_keyboard-inset-top)
    )
  );
  /* That default is the host's box cut to the part of the screen the user can
     see: from the top the panel starts at, the host's reserved top moved down
     by the keyboard inset below, to whichever is further up, the bottom of the
     visible area or the host's reserved bottom. Where nothing has measured, the
     visible area is the layout viewport with no pan, and this is the host's
     box exactly.

     Cut rather than replaced. A measured height used as the whole answer kept
     a bar the host reserved at the top in the position and out of the height,
     so the panel ran that far past the bottom of the visible area, with its
     composer behind the keyboard. */
  /* The measured height of the part of the screen the user can actually see,
     written by the element from the visual viewport and falling back to the
     layout viewport where nothing has measured yet.

     This is the on-screen keyboard, and it needs measuring because no CSS
     length describes it: an on-screen keyboard has no effect on any
     viewport-percentage unit, so 100vh, 100dvh and 100svh are all the same
     number with the keyboard up as without it. A full-bleed panel sized from
     any of them puts its composer behind the keyboard the user is typing into.

     Separate from the token above so a host that states the usable height
     outright still wins: the element writes this one inline, and an inline
     value would otherwise outrank the host's own rule.

     The fallback is dvh rather than vh because the browser's own bars do move
     it, where a keyboard does not. iOS Safari resolves vh to the viewport with
     its bars collapsed, so on a page that does not scroll them away a panel
     sized from it ran under the address bar by the bars' height -- 40px on
     the phone measured -- with a docked composer underneath. dvh is the
     viewport with the bars as they are. */
  --_visual-viewport-height: var(--ag-ui-visual-viewport-height, 100dvh);
  /* How much of the layout viewport is hidden below the visible one, measured
     and written by the element alongside the height above.

     A shorter panel is not enough on its own for anything anchored to the
     bottom. A floating widget is positioned against the layout viewport, so
     with a keyboard up its bottom edge -- and the launcher that lives at that
     corner -- sits behind the keyboard however tall the panel is. This is what
     lifts it clear. */
  /* Two tokens, for the same reason the height above has two: the element
     writes the measurement inline, and a host that states its own value needs
     a knob that outranks that write rather than one the next write replaces.
     A host wanting no keyboard lift at all sets --ag-ui-keyboard-inset: 0px. */
  --_keyboard-inset: var(--ag-ui-keyboard-inset, var(--_visual-viewport-inset-bottom));
  --_visual-viewport-inset-bottom: var(--ag-ui-visual-viewport-inset-bottom, 0px);
  /* How far a panel anchored at the top moves down for a keyboard, below the
     top the host reserved. With the same two-token shape as the lift above;
     0px keeps the panel at the host's top.

     To show the field being typed into, a browser pans the visible area down
     the layout viewport, and a fixed element stays against the layout top, so
     a panel that did not move showed only its lower part, from the pan down,
     with its header off the screen and an empty band under it. It moves by
     what the pan goes past the host's reserved top, not by the whole pan: the
     pan scrolls a bar reserved there away with the rest of the page rather
     than pushing it down, and adding the two put the panel a whole bar below
     the visible area. A corner panel anchored at the bottom does not use this,
     because the band below already accounts for the pan. */
  --_keyboard-inset-top: var(--ag-ui-keyboard-inset-top, max(0px, var(--_visual-viewport-inset-top) - var(--_viewport-inset-top)));
  /* How much of the layout viewport is hidden above the visible one: how far
     the browser panned. Measured and written by the element with the two
     above. */
  --_visual-viewport-inset-top: var(--ag-ui-visual-viewport-inset-top, 0px);
  --_viewport-width: var(
    --ag-ui-viewport-width,
    calc(100vw - var(--_viewport-inset-left) - var(--_viewport-inset-right))
  );

  /* Layout — override from outside to dock the widget anywhere.
     Set --ag-ui-position: static (and place this element in your own
     grid/flex layout) to embed it in the page flow instead of floating. */
  --_position: var(--ag-ui-position, fixed);
  --_z-index: var(--ag-ui-z-index, 2147483000);
  --_width: var(--ag-ui-width, 380px);
  --_height: var(--ag-ui-height, 560px);
  /* The gutter a resting floating panel keeps between itself and the edge of
     the box the host left free. One number, because the inset below spends it
     and the cap beneath has to know it was spent. */
  --_edge-gutter: var(--ag-ui-edge-gutter, 24px);
  --_inset: var(
    --ag-ui-inset,
    auto calc(var(--_edge-gutter) + var(--_viewport-inset-right))
      calc(var(--_edge-gutter) + var(--_viewport-inset-bottom) + var(--_keyboard-inset)) auto
  );
  /* The cap is what the host left free, less the *one* gutter the inset above
     spends on the anchored edge -- not two, and not none.

     Two was the first answer and it was felt on one axis only. The arithmetic
     says why: the default panel is 560 tall against a cap of the viewport
     minus 48, which on an 800px screen with a header reserved is 72px of
     headroom, so the height reaches its cap almost immediately; the default
     width is 380 against a cap near 1230, which is 850px nothing ever reaches.
     Once the size is capped a grip cannot grow the panel, so a pull on the
     anchored edge is written as position instead and the panel travels, and a
     pull on the free edge stops a whole gutter short of an edge a drag can
     reach.

     None was the correction, and it overshot: the panel is anchored bottom-
     right with a gutter already spent there, so a cap of the full usable
     height puts the far edge exactly one gutter outside it. On an 800px screen
     with nothing reserved that is a top of -24 -- the header, and every
     control in it, off the top of the window. Reserve a 120px header and it
     sits inside that instead, which is the one thing the reservation exists to
     prevent.

     One is the fixed point of both complaints. A resting panel grown to the
     cap runs from the usable near edge to its gutter on the far one, so the
     near edge is reachable by a resize exactly as it is by a drag, and neither
     can put any part of the panel outside the box. */
  --_max-width: var(--ag-ui-max-width, calc(var(--_viewport-width) - var(--_edge-gutter)));
  --_max-height: var(--ag-ui-max-height, calc(var(--_viewport-height) - var(--_edge-gutter)));
  /* Reading-column width for placement="page" (full-bleed, centred content). */
  --_content-max-width: var(--ag-ui-content-max-width, 820px);
  /* The greeting over an empty full-page conversation. The size scales with
     the viewport between a phone and a desktop rather than stepping at a
     breakpoint. */
  --_greeting-font: var(--ag-ui-greeting-font, var(--_font));
  --_greeting-size: var(--ag-ui-greeting-size, clamp(1.5rem, 4vw, 2.25rem));
  /* Slim rail the sidebar placement collapses to. Only that placement reads
     it, but it is declared here so every alias has a default in one place. */
  --_rail-width: var(--ag-ui-rail-width, 52px);

  position: var(--_position);
  inset: var(--_inset);
  z-index: var(--_z-index);
  width: var(--_width);
  max-width: var(--_max-width);
  height: var(--_height);
  max-height: var(--_max-height);
  display: flex;
  font-family: var(--_font);
  font-size: var(--_font-size);
  color: var(--_fg);

  /* Surfaces a theme can tint; Quiet leaves them neutral. */
  --_tint: var(--ag-ui-tint, var(--_wash));
  --_tint-2: var(--ag-ui-tint-2, var(--_user-bg));

  /* Status marks drawn as masks, so they take the colour of their state. */
  --_ico-check: var(--ag-ui-ico-check, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.9' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.5l3 3 6-7'/%3E%3C/svg%3E"));
  --_ico-error: var(--ag-ui-ico-error, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='6.2'/%3E%3Cpath d='M8 4.9v3.7M8 11.1v.1'/%3E%3C/svg%3E"));
  --_ico-declined: var(--ag-ui-ico-declined, url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.6' stroke-linecap='round'%3E%3Ccircle cx='8' cy='8' r='6.2'/%3E%3Cpath d='M3.8 12.2l8.4-8.4'/%3E%3C/svg%3E"));
}

/* The colour drawn on the accent, from the accent's own luminance: white on
   an accent darker than WCAG relative luminance 0.179, black on a lighter
   one. That is the crossover where the two give the same contrast, so the
   pick is always the better of the two and never under 4.58:1. A threshold on
   oklch lightness was tried first and missed: indigo 500 sits under the
   threshold that works for greys and took white at 4.47:1. Each channel is
   the same expression over the linear channels, so the result is pure black
   or pure white. A host that sets a mid-tone brand accent in the dark scheme
   would otherwise get the scheme's near-black on it. Relative colour syntax
   with channel arithmetic is Chrome 119, Firefox 128 and Safari 18; Safari 17
   parses an older form of it, so the test below asks for the exact expression
   this uses, and an engine that cannot read it keeps the scheme-based
   fallback above. */
@supports (color: color(from red srgb-linear clamp(0, (0.179 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 100000, 1) 0 0)) {
  :host {
    --_on-accent: var(--ag-ui-on-accent, color(from var(--_accent) srgb-linear clamp(0, (0.179 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 100000, 1) clamp(0, (0.179 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 100000, 1) clamp(0, (0.179 - (0.2126 * r + 0.7152 * g + 0.0722 * b)) * 100000, 1)));
  }
}
`;
