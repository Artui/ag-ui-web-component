# @artooi/ag-ui-web-component

[![CI](https://github.com/Artui/ag-ui-web-component/workflows/tests/badge.svg)](https://github.com/Artui/ag-ui-web-component/actions/workflows/tests.yml)
[![npm](https://img.shields.io/npm/v/@artooi/ag-ui-web-component.svg)](https://www.npmjs.com/package/@artooi/ag-ui-web-component)
[![License](https://img.shields.io/npm/l/@artooi/ag-ui-web-component.svg)](https://github.com/Artui/ag-ui-web-component/blob/main/LICENSE)

A **framework-free** `<ag-ui-chat>` Web Component over the [AG-UI](https://docs.ag-ui.com)
protocol. Drop it into any page — SPA or MPA, any framework or none — point it at an AG-UI
endpoint, and you get a streaming chat sidebar that can call tools you register in the browser.

It wraps [`@ag-ui/client`](https://www.npmjs.com/package/@ag-ui/client)'s `HttpAgent` and ships:

- A Custom Element with a self-contained Shadow DOM chat UI (header, scrolling transcript,
  input row), themeable via CSS custom properties.
- A pluggable **client-side tool registry** — `registerTool({ name, description, parameters,
  handler })`; every registered tool is added to each run's `RunAgentInput.tools`.
- Generic **DOM-driver primitives** (`fillField`, `clickElement`, `setControlValue`) and
  **animation primitives** (`typeInto`, `highlightThenClick`, …) so the agent can drive the page
  at human-readable speed.
- An **inline confirmation card** that intercepts tool calls needing confirmation (those whose
  JSON Schema carries `x-destructive: true`, or a per-call `confirmPredicate`) before the handler
  runs — rendered right in the transcript, never a modal overlay.
- **Markdown + HTML rendering** of assistant replies (sanitized `marked` + DOMPurify), with
  themes, density/placement presets, incoming-text animations, tool-call display modes, an
  animated thinking indicator, and an opt-in **skills** palette (prompt chips + `/`-commands).
- A **new-chat** button and a **collapse** toggle built into the header.
- An **MPA durability story**: a durable conversation store, a stable thread id, and a resumable
  run loop that survives full page reloads (`x-navigates` + `navigationResult`).
- **Host seams** for SPAs: a route map, an auto-injected page map, state hooks, and an optional
  `navigate()` callback.

No framework, no Django, no admin specifics live here. Downstream consumers (e.g.
`django-admin-agent`) register their own tool handlers on top via the pluggable registry.

---

## Table of contents

- [Install](#install)
- [Quickstart](#quickstart)
- [Authenticating requests](#authenticating-requests)
- [Core concepts](#core-concepts)
  - [The run loop and the AG-UI client](#the-run-loop-and-the-ag-ui-client)
  - [Stopping a run](#stopping-a-run)
  - [Registering tools](#registering-tools)
  - [Inline confirmation (`x-destructive` / `x-confirm` / `confirmPredicate`)](#inline-confirmation-x-destructive--x-confirm--confirmpredicate)
  - [DOM-driver and animation primitives](#dom-driver-and-animation-primitives)
  - [Page-action tools](#page-action-tools)
- [New chat and collapse](#new-chat-and-collapse)
  - [Collapsing to the launcher](#collapsing-to-the-launcher)
- [Tool-call display modes](#tool-call-display-modes)
- [Delegated sub-agents](#delegated-sub-agents)
- [Markdown rendering](#markdown-rendering)
- [Follow-up suggestions](#follow-up-suggestions)
- [Editing a gated call before approving it](#editing-a-gated-call-before-approving-it)
- [Localizing the timestamps](#localizing-the-timestamps)
- [Message actions: copy, retry, feedback](#message-actions-copy-retry-feedback)
- [Quoting a selection](#quoting-a-selection)
- [Run notices: compaction and agent skills](#run-notices-compaction-and-agent-skills)
- [Skills: prompt chips and slash palette](#skills-prompt-chips-and-slash-palette)
- [MPA durability: surviving full page reloads](#mpa-durability-surviving-full-page-reloads)
  - [Who the stored conversation belongs to (`user-key`)](#who-the-stored-conversation-belongs-to-user-key)
  - [Mounting more than one chat on a page](#mounting-more-than-one-chat-on-a-page)
- [Host seams: the SPA story](#host-seams-the-spa-story)
- [Public API surface](#public-api-surface)
- [Theming, density, and placement](#theming-density-and-placement)
- [Internationalization (i18n)](#internationalization-i18n)
- [Building the bundle](#building-the-bundle)
- [Compatibility](#compatibility)

---

## Install

```bash
npm install @artooi/ag-ui-web-component
```

The package ships two builds (see [`package.json` exports](package.json)):

| Entry | What it is | When to use |
| --- | --- | --- |
| `@artooi/ag-ui-web-component` | ESM library build; `@ag-ui/*` stay **external** | You bundle the app yourself (Vite, webpack, esbuild) and want to dedupe `@ag-ui/*`. |
| `@artooi/ag-ui-web-component/bundle` | ESM bundle with `@ag-ui/*` **inlined**, minified | Drop in via a single `<script type="module">` with no build step. |

### The vendored-bundle story

The `/bundle` entry inlines every dependency into one self-contained ESM file
(`dist/ag-ui-web-component.bundle.js`). This is the artefact intended for **vendoring**: a host
that can't (or won't) run a JS build — for example a Django app — copies the built bundle into its
`static/` directory and serves it directly. `django-admin-agent` re-vendors a pinned built bundle
on every release. For SPA hosts that already have a bundler, import the bare package name instead
so `@ag-ui/client` / `@ag-ui/core` are deduped against the rest of your app.

---

## Quickstart

Drop the element into your page and register the tools the agent may call:

```html
<script type="module">
  import {
    defineAgUiChat,
    fillField,
    clickElement,
    X_DESTRUCTIVE_KEY,
  } from "@artooi/ag-ui-web-component";

  // Register the <ag-ui-chat> Custom Element. Idempotent and SSR-safe — it is an
  // explicit call, not an import side effect, so the package stays tree-shakeable.
  defineAgUiChat();

  const chat = document.querySelector("ag-ui-chat");

  // Extra request headers (e.g. CSRF), sent with every request the element makes.
  // For a credential that rotates, set chat.getHeaders instead - it is consulted
  // per request. See "Authenticating requests".
  chat.headers = { "X-CSRFToken": getCsrfToken() };

  // A non-destructive tool: fills a text field with a typing animation.
  chat.registerTool({
    name: "fill_field",
    description: "Fill a text input by id with a value.",
    parameters: {
      type: "object",
      properties: { field: { type: "string" }, value: { type: "string" } },
      required: ["field", "value"],
    },
    handler: async ({ field, value }) => {
      await fillField(document.getElementById(field), String(value));
      return "ok";
    },
  });

  // A destructive tool: x-destructive at the JSON-Schema root gates it behind
  // the inline confirmation card before the handler runs.
  chat.registerTool({
    name: "save_article",
    description: "Save the article. Destructive — asks for confirmation.",
    parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true },
    handler: async () => {
      await clickElement(document.getElementById("save"));
      return "saved";
    },
  });
</script>

<ag-ui-chat endpoint="/agent/" title-text="Assistant"></ag-ui-chat>
```

!!! note "If nothing appears, check `defineAgUiChat()` ran"
    Forgetting it looks like nothing. `<ag-ui-chat>` is then an *unknown
    element*, which every browser renders as an inline 0x0 box, in flow, with no
    console warning and no error — so the page looks finished and the chat is
    simply absent. A bare `import "@artooi/ag-ui-web-component"` does not
    register anything, deliberately: registration is an explicit call so the
    package stays tree-shakeable.

    `customElements.get("ag-ui-chat")` in a console answers it in one line —
    `undefined` means the call did not run.

That's the whole integration: an `endpoint` attribute pointing at your AG-UI server, optional
`headers`, and the tools you want the agent to be able to invoke in the browser. If your API is on
another origin, add `credentials="include"` too; see
[Authenticating requests](#authenticating-requests).

### Attributes and properties

**Attributes** (set in HTML; the CSS-only ones are styling presets with no JS API):

| Attribute | Property | Notes |
| --- | --- | --- |
| `endpoint` | `endpoint` | The AG-UI endpoint URL. Required to send. Reflecting getter + setter. |
| `credentials` | `credentials` | Cookie policy for every request the element makes: `omit` / `same-origin` / `include`. Unset means the browser default (`same-origin`), which sends no cookies cross-origin. See [Authenticating requests](#authenticating-requests). |
| `title-text` | — | Header label; defaults to `"Assistant"`. Live: writing it after the element connects re-labels the header. See [When each attribute is read](#when-each-attribute-is-read). |
| `data-tool-display` | `toolDisplay` | Tool-call card detail: `inline` / `minimal` / `compact` / `full` (default `full`). |
| `data-text-animation` | — | Incoming-text reveal: `none` (default) / `fade` / `word`. |
| `data-prompt-chips` | — | Present (bare, or any value but `"false"`) to surface skills as chips. |
| `data-slash-commands` | — | Present (bare, or any value but `"false"`) to enable the `/`-command palette. |
| `data-skills` | — | Inline JSON skill catalog. |
| `data-skills-url` | — | URL of a JSON skill catalog (fetched with the element's headers and cookie policy). |
| `data-tools-url` | — | URL of a server tool-label catalog (`[{ name, summary, description? }]`), fetched with the element's headers and cookie policy; labels tool-call cards for server-side tools. |
| `user-key` | `userKey` | Who the stored conversation belongs to — any string identifying the signed-in principal. Joins the storage namespace, and **changing it purges what the previous principal left behind**. Live (not connect-time): a logout is the host's to announce. See [Who the stored conversation belongs to](#who-the-stored-conversation-belongs-to-user-key). |
| `data-threads-url` | — | URL of a server thread index (django-ag-ui's `ThreadsView`); enables durable, cross-device chat history. |
| `data-threads-cache` | — | **On by default.** `="false"` stops mirroring message bodies into `sessionStorage` when `data-threads-url` is set, for a deployment that put history on the server so transcripts stay off the client. Only meaningful alongside `data-threads-url`. |
| `data-runs-url` | — | URL of a server run index (django-ag-ui's `RunsView`); reveals the header's ⭯ *Continue a run* panel. See [Resuming a run](#resuming-a-run). |
| `data-attachments-url` | — | URL of the file-upload endpoint (django-ag-ui's `AttachmentsView`); reveals the composer's paperclip picker, drag-and-drop, and paste. |
| `data-attachment-accept` | — | `<input accept>` list for client-side type filtering (e.g. `image/*,.pdf`). The server stays authoritative. |
| `data-attachment-max-bytes` | — | Client-side upload size cap in bytes (default 10 MiB; `0` disables). The server stays authoritative. |
| `data-transcribe-url` | — | URL of the voice-transcription endpoint (django-ag-ui's `TranscribeView`); reveals the composer's mic button. See [Voice input](#voice-input). |
| `data-theme-toggle` | — | Boolean: show a built-in header light⇄dark toggle (persists per tab). Off by default. See [Theme toggle](#theme-toggle). |
| `data-strings` | `strings` | Partial JSON override of the UI string table (localization). The property wins key-by-key over the attribute; see [Internationalization](#internationalization-i18n). |
| `data-icon-url` | — | Header (and launcher) icon image URL. A slotted `slot="icon"` wins; see [Header & launcher icon](#header-and-launcher-icon). |
| `data-launcher-icon-url` | — | Icon image URL for the collapsed launcher only, when it should differ from the header's. Falls back to `data-icon-url`; a slotted `slot="launcher"` wins over both. |
| `data-unread-badge` | — | **On by default.** `="false"` hides the launcher's unread badge; the count and the `ag-ui-unread` event keep running. See [Collapsing to the launcher](#collapsing-to-the-launcher). |
| `data-launcher-drag` | — | **On by default.** `="false"` leaves the widget wherever your CSS puts it. Otherwise the collapsed launcher can be dragged anywhere on screen (the panel opens into the clearest space) and the open panel can be dragged by its header. See [Moving the launcher](#moving-the-launcher) and [Moving the panel](#moving-the-panel). |
| `data-quote-selection` | — | **On by default.** `="false"` stops the transcript offering to quote a selection. `quote()` keeps working either way. See [Quoting a selection](#quoting-a-selection). |
| `data-message-actions` | — | **All on by default.** A comma list of the actions a finished answer keeps: `copy` / `retry` / `feedback` (e.g. `"copy,retry"`). `="false"` removes the row entirely. See [Message actions](#message-actions-copy-retry-feedback). |
| `data-max-tool-rounds` | — | Upper bound on frontend tool-call → re-run rounds within one send (default 10; a value below 1 is ignored). Raise it for a page-driving agent whose turn takes many small steps. See [The run loop](#the-run-loop-and-the-ag-ui-client). |
| `data-page-actions` | — | Opt-in built-in page-action tools: a comma list of `scroll` / `drag` / `chat` (e.g. `"scroll,drag"`). See [Page-action tools](#page-action-tools). |
| `data-side` | — | CSS-only, for `placement="sidebar"`: which edge it docks to — `right` (default) / `left`. |
| `data-answer-well` | — | CSS-only boolean: box each assistant turn (its text, tool cards, and thinking) in one bordered "well". Off by default. See [The answer well](#the-answer-well). |
| `collapsed` | `collapsed` | Reflected boolean; collapses the widget to its [launcher](#collapsing-to-the-launcher) (a rail under `placement="sidebar"`, the header bar under `embedded`). Persisted per tab. `placement="page"` has no collapsed state and ignores it. |
| `data-dragging` | — | **Written by the element, not by you.** Stamped on whichever handle a gesture is currently using, so the styles can react and so the element knows not to re-place the widget under a drag in progress. Cleared on `pointerup` and on `pointercancel`. |
| `data-expand-corner` | — | **Written by the element, not by you.** It stamps the corner a dragged or agent-moved panel opens from, so the collapse animation starts where the panel actually is. Listed because the element reads its own stamp back; setting it yourself is overwritten on the next move. |
| `data-small-viewport` | — | CSS-only: `off` keeps the desktop layout at every width, opting out of the [small-viewport override](#small-viewports). Everything that override sets is a token you can re-state; its trigger is a media query, which is the one thing you cannot. |
| `data-paste-attach` | — | When to turn a long text paste into an attachment instead of composer text: absent for the 5000-character default, `off` to never, or a positive number of characters. Only acts where `data-attachments-url` (or a custom `uploadHandler`) gives it somewhere to go. |
| `data-starters` | — | JSON array of prompts offered on an empty transcript, e.g. `'["Summarise this page"]'`. Fallback content for `slot="empty"`, so slotting your own replaces them. Shares the four-prompt and 120-character limits with the suggestion chips a run pushes. Read once at connect. |
| `data-start-open` | — | Mount the panel open on a first visit. The corner placements otherwise rest at their launcher, the way every corner chat does; a stored choice wins over both. The placements that place themselves are unaffected. |
| `theme` | — | CSS-only: `light` (default) / `dark` / `auto` / `code`. |
| `density` | — | CSS-only: `comfortable` (default) / `compact`. |
| `placement` | — | CSS-only: `floating` (default) / `sidebar` / `page` / `embedded`. |

Each header control also takes its own icon slot — `icon-history`, `icon-checkpoints`,
`icon-new`, `icon-collapse` — with the built-in glyph as the fallback, so a host can project a
brand `<img>` or `<svg>` rather than only restyling the character. The composer's glyphs work the
same way: `icon-send`, `icon-stop`, `icon-attach`, `icon-voice`.

```html
<ag-ui-chat endpoint="/agent/">
  <svg slot="icon-new" width="16" height="16"><!-- ... --></svg>
</ag-ui-chat>
```

#### When each attribute is read

The element observes two groups of attributes, and they behave differently once it is in the DOM.
Nothing outside those groups is observed: a CSS-only attribute (`theme`, `density`, `data-side`,
`data-answer-well`) is read by the stylesheet rather than by script, and `endpoint`,
`data-tool-display`, `data-text-animation`, `data-runs-url`, `data-page-actions`,
`data-message-actions`, `data-max-tool-rounds`, `data-unread-badge`, `data-launcher-drag` and
`data-quote-selection` are re-read at each use, so a late write to any of those simply takes effect. The one attribute in
neither camp is `data-launcher-icon-url`: it is read while the element connects, like the group
below, but is not observed, so a late write is inert and says nothing.

**Live attributes.** Written at any time, before or after the element connects, and acted on
either way: `title-text`, `placement`, `credentials`, `user-key`.

**Connect-time attributes.** Read once, while the element connects, to decide what chrome exists at
all — the tray, the mic, the skills menu, the header mark. Writing one afterwards has **no effect**;
the element logs a console warning naming the attribute rather than failing silently, because the
symptom is an affordance that never appears and that reads as a broken component. Set them before
the element enters the DOM, or remove and re-insert it. See
[Framework hosts](#framework-hosts-configure-before-you-insert), where the boundary bites hardest.
The list: `data-attachments-url`, `data-attachment-accept`, `data-attachment-max-bytes`,
`data-transcribe-url`, `data-threads-url`, `data-threads-cache`, `data-tools-url`,
`data-skills-url`, `data-skills`, `data-prompt-chips`, `data-slash-commands`, `data-theme-toggle`,
`data-strings`, `data-icon-url`.

**Properties** (JS only, not attributes): `headers`, `getHeaders`, `trustedOrigins`, `allowImages`,
`autoConfirm`, `confirmPredicate`, `askUser`, `askUserRenderer`, `approvalRenderer`,
`approveWithEdits`, `agentFactory`, `getTools`, `getContext`, `routeMap`, `navigate`, `getPageMap`,
`autoInjectPageMap`, `conversationStore`, `uploadHandler`, `transcribeHandler`, `navigationResult`,
`skillContext`, `toolSummaries`, `formatToolPayload`, `formatRelativeTime`, `strings`,
`resolvePageTarget`, `sharedState`, plus the read-only `unread` and `unhandledActivityTypes`, and
the attribute mirrors `endpoint` / `userKey` / `toolDisplay` / `collapsed` / `credentials`.

`headers` and `getHeaders` authenticate **every** request the element makes, not only the agent
run; `getHeaders` is the one to use for a credential that rotates. See
[Authenticating requests](#authenticating-requests).

`allowImages` (default `false`) re-enables `<img>` in rendered assistant markdown.
It is off by default because a model-controlled image URL is fetched by the browser
with no user interaction — a zero-click exfiltration channel for prompt-injected
page data. Enable only when the content source is trusted.

`toolSummaries` is a `Record<string, string>` mapping tool name → a friendly card
label, used when a tool has no `x-summary` in its own schema. Built-in and client tools
should carry `x-summary` directly; this map is the seam for **server-side tools** (drf-mcp,
the django-ag-ui `@tool` registry), whose schema never reaches the browser — e.g.
`chat.toolSummaries = { list_projects: "Search projects" }`. Or point
`data-tools-url` at a server catalog endpoint (django-ag-ui's `tools/`) and the
labels are fetched automatically — per card, `x-summary` → an explicit
`toolSummaries` entry → the fetched catalog → the raw name.

`sharedState` is AG-UI shared state, documented under
[the run loop](#the-run-loop-and-the-ag-ui-client); `unread` and `unhandledActivityTypes` are
read-only counters, covered under [the unread badge](#the-unread-badge) and
[finding out what arrived](#finding-out-what-arrived).

Code blocks in an agent's answer carry a **copy button**, revealed on hover or
keyboard focus and styleable via the `code-copy` part. Override its labels with
the `copyCode` / `copied` / `copyFailed` strings.

**Methods**: `registerTool`, `registerPageState`, `registerActivityRenderer`, `setSkills`,
`sendMessage`, `attachFile`, `appendMessage`, `retryLastTurn`, `quote`, `offerQuoteInPage`,
`enableCharts`, `newChat`, `setCollapsed`, `toggleCollapsed`, `describeSurface`, `moveTo`,
`toggleTheme`, `openThreads`, `closeThreads`,
`openCheckpoints`, `closeCheckpoints`, `toggleCheckpoints`, `reload`, and the deprecated
`registerStateHook` (renamed to `registerPageState`).

### Sending from your own UI

`sendMessage(content, attachments?)` sends as if the user had typed it — user bubble,
`ag-ui-submit` event, run started. Use it for an "Ask about this order" button, a command
palette, or a composer of your own replacing the built-in one. It no-ops while a run is in
flight and for an entirely empty message, and unlike the built-in Send it does **not** consult
the attachment tray: what you pass is what is sent, so your composer stays in charge of its
own state.

`attachFile(file)` queues a file into the tray exactly as the picker and drag-and-drop do, with
the same validation and progress chip. It returns `false` when uploads are not configured
(no `data-attachments-url` and no `uploadHandler`) — the only way to tell, since with no tray
there is nothing to report through.

Uploading is asynchronous, so watch `ag-ui-attachments` for the result. Its `detail` carries
`{ attachments, pending }`: the durable refs of everything that has finished, and how many are
still in flight. Send once `pending` is `0`, or you will leave files behind.

```js
chat.addEventListener("ag-ui-attachments", (e) => {
  const { attachments, pending } = e.detail;
  sendButton.disabled = pending > 0;
  sendButton.onclick = () => chat.sendMessage(input.value, attachments);
});
chat.attachFile(fileInput.files[0]);
```

A self-contained live playground lives in [`demo/`](demo/) — run `make demo` to serve it against a
mock AG-UI server.

---

## Authenticating requests

The element talks to more than one endpoint. Beyond the AG-UI run itself, it may fetch the thread
index and a thread's messages, the tool-label and skill catalogs, the run index, and it may POST an
upload or a voice clip. **Every one of them is authenticated the same way**, by the element rather
than by the agent — so configuring authentication on a custom `agentFactory` authenticates the run
and nothing else, and the history drawer comes back empty because its request was anonymous.

| Request | Endpoint | Transport |
| --- | --- | --- |
| The agent run | `endpoint` | `fetch` (SSE), via `agentFactory` |
| Thread index / a thread's messages / rename / delete | `data-threads-url` | `fetch` |
| Tool-label catalog | `data-tools-url` | `fetch` |
| Skill catalog | `data-skills-url` | `fetch` |
| Run index | `data-runs-url` | `fetch` |
| Voice transcription | `data-transcribe-url` | `fetch` |
| File upload | `data-attachments-url` | `XMLHttpRequest` (for progress events) |

### `headers` and `getHeaders`

`headers` is a plain record sent with every request above:

```js
chat.headers = { "X-CSRFToken": getCsrfToken() };
```

It is read at request time, but only an assignment changes it — so a token captured there is pinned
until you remember to assign again. For anything that rotates (a short-lived JWT, a re-issued CSRF
token) set **`getHeaders`** instead, a function consulted immediately before every request:

```js
chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
```

Because it is called per request, a token refreshed between two requests reaches the second one —
including mid-conversation, on the cached agent's own stream.

The two **compose**: they are merged per key, `getHeaders` winning, so a fixed header and a rotating
one can be configured independently and neither silently drops the other.

```js
chat.headers = { "X-Client": "admin" };
chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
// every request: X-Client: admin + a freshly-read Authorization
```

### Cross-origin cookies (`credentials`)

If your API is on a different origin from the page — `app.example.com` calling `api.example.com`
counts, subdomains are cross-origin — the browser's default of `same-origin` sends **no cookies at
all**. The requests still go out; they arrive unauthenticated, and the server answers `401` while
looking perfectly configured. Set the cookie policy explicitly:

```html
<ag-ui-chat endpoint="https://api.example.com/agent/" credentials="include"></ag-ui-chat>
```

```js
chat.credentials = "include"; // mirrors the attribute
```

It takes `fetch`'s own three modes — `omit`, `same-origin`, `include` — applies to every request in
the table above, and is read per request, so a late assignment applies to everything after it.
Anything else is rejected where you wrote it: an unknown value assigned as a property throws, and an
unknown value in the attribute is reported to the console and ignored, rather than becoming a `401`
later on.

The server has to agree: `Access-Control-Allow-Credentials: true` and a concrete
`Access-Control-Allow-Origin` (the wildcard is invalid with credentials).

One asymmetry: uploads use `XMLHttpRequest` for real progress events, and its cookie switch is
two-state. `include` turns it on; every other value leaves it off. `omit` therefore cannot suppress
cookies on a *same-origin* upload — supply your own `uploadHandler` if that matters.

### Where those credentials are allowed to go

Every URL in the table above is a plain HTML attribute, and `headers` / `getHeaders` are attached to
whatever they name. That is what makes a cross-origin agent work — and it is also why a page must
never build one of those attributes out of a URL parameter, a CMS field, or anything else it did not
choose itself. Whoever supplies the value chooses where the token goes: the browser preflights the
custom header, any server willing to answer receives it, and it leaves on the element's first
request, before the user has typed anything.

Treat all seven as trusted configuration. When any of them resolves to another origin, the element
says so on the console once per origin, naming the destination and the header names it is about to
send. That covers all seven, not the agent endpoint alone: the tool catalog, the skills list, the
thread index, the attachment upload and the transcription endpoint carry the same headers, and
reporting only the agent would report the least interesting of them.

To confirm destinations you chose on purpose and silence the notice, name their origins:

```js
chat.trustedOrigins = ["https://api.example.com"];
```

That covers every endpoint the element requests itself, and is forwarded to `createHttpAgent`, so a
host that does not override `agentFactory` needs nothing else. A custom factory can also be given
the option directly:

```js
chat.agentFactory = (options) =>
  createHttpAgent({ ...options, trustedOrigins: ["https://api.example.com"] });
```

Origins are compared as `URL.origin` produces them — scheme, host and port. A notice is a notice,
not a refusal: nothing is blocked, because a cross-origin agent is a supported deployment and
refusing would break working installations to defend against a page that is already interpolating
untrusted data into its own markup.

### Framework hosts: configure before you insert

`headers`, `getHeaders` and `credentials` are read when a request is made, so they can be set at any
time. Several other things are read once, while the element **connects**: `strings`, `uploadHandler`
and `transcribeHandler` (they decide whether the attach and voice affordances exist at all) and
every chrome-building `data-*` attribute — and the catalogs and thread history are requested at, or
just after, that same moment.

React attaches `ref`s *after* it inserts the node, which puts the canonical integration on the wrong
side of that boundary. Create the element, configure it, then append:

```jsx
function Assistant() {
  const host = useRef(null);

  useEffect(() => {
    defineAgUiChat();
    const chat = document.createElement("ag-ui-chat");

    // Configure first - every one of these is read as the element connects.
    chat.setAttribute("endpoint", "/agent/");
    chat.setAttribute("data-threads-url", "/agent/threads/");
    chat.credentials = "include";
    chat.getHeaders = () => ({ Authorization: `Bearer ${auth.accessToken()}` });
    chat.registerTool(myTool);

    // ...then insert it.
    host.current.appendChild(chat);
    return () => chat.remove();
  }, []);

  return <div ref={host} />;
}
```

Writing it as `<ag-ui-chat ref={...} />` in JSX and configuring in the ref callback mostly works —
the catalog requests are held back one microtask precisely so a ref assigned in the same commit is
honoured — but the thread-history request is **not** deferred (a deferred replay could land after a
`sendMessage()` and duplicate the transcript), so that one goes out with whatever was configured at
insertion.

If your credentials can only arrive later still — an awaited token, a passive effect — call
**`reload()`** once they land:

```js
const token = await auth.login();
chat.getHeaders = () => ({ Authorization: `Bearer ${token}` });
await chat.reload();
```

`reload()` re-runs everything the element loads on startup (tool catalog, skills, thread history)
with the configuration as it then stands. It is a reload, not a merge: the in-flight run is
cancelled and the transcript is rebuilt from the persisted history, so call it when configuration
lands rather than between turns.

#### The same boundary in four frameworks

Each framework reaches that pre-insertion window differently, and only one of them reaches it
declaratively. Built and driven in all four:

| Host | Pre-insertion window | What to do |
| --- | --- | --- |
| React | None — refs attach after insertion | `createElement`, configure, `appendChild` (above) |
| **Vue 3** | **Yes** — a directive's `beforeMount` | Attributes in the template, properties in the directive |
| Svelte 5 | None — `use:` actions and `$effect` run after insertion | Same as React |
| Angular | None — bindings apply during change detection | Same as React, in `ngOnInit` with `@ViewChild({ static: true })` |

**Vue** is the one host that can configure declaratively, because a custom directive's `beforeMount`
runs while the element is still detached:

```vue
<script setup>
const vConfigure = {
  beforeMount(element) {
    element.getHeaders = () => ({ Authorization: `Bearer ${token()}` });
    element.registerTool(myTool);
  },
};
</script>

<template>
  <ag-ui-chat v-configure endpoint="/agent/" data-threads-url="/agent/threads/" />
</template>
```

Tell Vue's compiler the tag is a custom element, or it will warn and try to resolve a component:
`vue({ template: { compilerOptions: { isCustomElement: (tag) => tag === "ag-ui-chat" } } })`.

**Svelte 5**'s `use:` action and `$effect` both run after the node is in the DOM, so build the
element by hand in an `$effect` and append it — the React shape, in runes. **Angular** needs
`CUSTOM_ELEMENTS_SCHEMA` on the component and, if it wraps the panel in its own component, one line
of CSS: `:host { display: contents }`. Angular's host element otherwise lands between your grid and
the children it sizes, and the panel renders a few hundred pixels tall in the middle of the page.

---

## Core concepts

### The run loop and the AG-UI client

`<ag-ui-chat>` is the view; [`AgUiClient`](src/core/agui_client.ts) is the orchestration layer over
an AG-UI `AbstractAgent`. On the first send the element builds a client (via the overridable
`agentFactory`, which defaults to [`createHttpAgent`](src/core/create_http_agent.ts)). Each turn:

1. The user message is appended and the agent runs once.
2. AG-UI subscriber events are translated into the element's handlers — streaming text deltas
   render into a bubble; each `TOOL_CALL_END` becomes a tool-call card.
3. Any **frontend** tool calls collected during the run are executed locally, their results are
   appended as `tool` messages, and the agent is re-run with the results.
4. This repeats until the agent stops calling frontend tools, bounded by `MAX_TOOL_ROUNDS`
   (10) — raise it with `data-max-tool-rounds`, or `AgUiClientConfig.maxToolRounds` when you
   drive the client yourself. The default suits a chat whose tools answer questions; a
   page-driving deployment reaches it legitimately, one round per field filled, and the symptom
   is not an error but an answer that stops mid-task. A value below 1 is ignored rather than
   honoured — it would be a send that never runs the agent at all.

Tool calls the client doesn't own (server-side tools the server already executed) are left alone —
the loop doesn't re-run them, but their streamed `TOOL_CALL_RESULT` is rendered into the tool-call
card (honouring `data-tool-display`), so server-side output is visible too. The current tool catalog
and context are read **fresh on every run** (`getTools()` / `getContext()`), so they always reflect
the current page state.

The catalog a run advertises is also the set that run can execute. Override `getTools` to scope
what a page offers — say, exposing `delete_record` only where deleting makes sense — and a call
naming a tool you withheld is treated exactly as a call naming a tool you never registered: no
handler runs, and the card settles with the no-result label. Withholding is per run, so the
mount-wide registry can stay complete. Hosts that leave `getTools` alone advertise the built-ins
plus everything registered, which is precisely what dispatch could reach anyway.

### Stopping a run

While a run is in flight the **Send button becomes Stop** (same button, label/`aria-label` swap,
`data-state="running"` for styling); clicking it — or pressing **Escape** in the composer (when
the skills palette is closed; the palette owns Escape while open) — calls `AgUiClient.cancel()`.
AG-UI has no server-side cancel route: cancelling **aborts the streaming request**
(`abortRun()`), and the server observes the disconnect. On cancel:

- Partial assistant text already streamed **stays in the transcript** and is persisted via
  `onPersist`, so a reload shows the truncated exchange. A muted **"⏹ Stopped"** note is appended
  (`.stopped-note`) — a deliberate stop is not an error, so no bubble.
- The run loop stops: tool calls collected before the abort are **not executed**, and no further
  round starts. A frontend tool handler already running completes, but its result doesn't trigger
  a re-run.
- An **open confirmation card is declined** (`data-resolved="declined"`) — cancelling the run
  answers the pending question. Likewise an open **approval card** is denied and an open
  **question card** (`ask_user`) resolves with an empty answer.
- The new `onCancelled()` handler fires instead of `onError()`; `onSettled()` still follows
  (the terminal-rest guarantee), returning the button to **Send**.

`cancel()` with no run in flight is a safe no-op. `newChat()` cancels any in-flight run before
discarding the client.

### Registering tools

A tool is a `ClientTool`: `{ name, description, parameters, handler }`, where `parameters` is a
**JSON Schema** and `handler` receives the parsed args and returns a value that is JSON-serialised
into the tool-result message. Register them on the element:

```js
chat.registerTool({
  name: "search_products",
  description: "Search the catalog.",
  parameters: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  handler: async ({ query }) => await api.search(query),
});
```

Registering a name twice replaces the earlier handler rather than throwing, so a re-fired
host ref or React StrictMode's double-invoke is harmless -- but two different tools sharing
a name means the second silently wins. Each `<ag-ui-chat>` element owns its own
registry, AG-UI client, and Shadow DOM, so **multiple instances on one page never interfere** —
there is no module-level shared state anywhere in the package.

**A handler's thrown message leaves the browser.** If a handler rejects, its `Error.message` is
posted back as that call's tool result: into the conversation, on to the AG-UI endpoint, persisted
there, and replayed to the model provider on every later round. That is deliberate — a real reason
is what lets the agent recover — but it means an internal hostname, a signed URL or a
stack-derived path in a rethrown error is disclosed to parties you never chose. Throw the message
you would be content for the model to read, and log the detail instead.

### Inline confirmation (`x-destructive` / `x-confirm` / `confirmPredicate`)

When a tool call needs confirmation, the element appends an **inline confirmation card** (a
`<div class="confirm">`) to the transcript via
[`requestConfirmation`](src/ui/confirmation_card.ts) — it is not a modal overlay. The card reads
naturally after the assistant's explanation, never steals focus from the page, and stays in the
transcript as a resolved record after the decision:

- **Confirm** → the handler runs and the result is posted back.
- **Cancel** → a `"User declined the action."` result is posted; the agent acknowledges on its
  next turn.
- **Always allow** → the handler runs *and* this tool stops prompting for the rest of the
  session. See below for when this button appears.

Whether a call is gated is decided in this order:

1. If `chat.autoConfirm === true`, the call **never** prompts (an "autopilot" toggle).
2. Else if `chat.confirmPredicate` is set, its boolean return is authoritative — given the tool
   name + parsed args it decides per-call (so one tool can be instant for some args and confirmed
   for others, which a static flag can't express).
3. Else if the user has waived this tool name for the session, the call runs.
4. Else the element falls back to [`isDestructive(parameters)`](src/tools/is_destructive.ts),
   which reads the `x-destructive` JSON-Schema flag.

#### "Always allow", and why only sometimes

A prompt that is approved nearly every time is not a decision, it is a speed bump — and the
reflex it trains is what makes the rare refusal easy to miss. Anthropic published that users
approve **~93%** of Claude Code permission prompts manually and called interactive confirmation
*"behaviorally unreliable as a sole safety mechanism"* on that basis. The waiver exists so the
prompts that remain still mean something.

**The button is offered only on cards raised by step 4** — the `x-destructive` default. Where
`confirmPredicate` is what gated the call, there is no button, because that predicate is
documented as authoritative and letting one click retire it would silently defeat a host policy.
The offer and the allowlist sit on the same path, so there is no dead button either.

The waiver is **per tool name and per element**, held in memory and never persisted. A session
decision that outlived the tab would be a permanent grant made by one click — which is what
`autoConfirm` already exists to say deliberately. It is cleared when the element goes away.

AG-UI has no built-in risk flag, so destructiveness is carried as a JSON-Schema extension at the
**schema root**: `parameters["x-destructive"] = true` (use the exported `X_DESTRUCTIVE_KEY`
constant). There is no parallel metadata channel and no name heuristic — destructiveness is exactly
the `x-destructive` flag (or `confirmPredicate`). The registry forwards the flag verbatim to
`RunAgentInput.tools`.

If the schema carries an `x-confirm` string (use `X_CONFIRM_KEY`), the card shows it as the prompt;
otherwise it falls back to a generic `Run "<tool>"?`.

**This gate covers frontend tools only.** A server-side tool's schema never reaches the browser —
tool definitions travel client-to-server on `RunAgentInput.tools`, and the only channel coming back
is the label catalog (`data-tools-url`), which carries `{ name, summary, description? }` and no
flags. So marking a server tool destructive does not produce a card here; gate it server-side
instead (see [Server-side tool approval](#server-side-tool-approval-interrupts)), which surfaces as
an approval card in the same transcript.

```js
// Per-call: confirm a delete only when it would remove more than one row.
chat.confirmPredicate = (name, args) =>
  name === "delete_rows" && Array.isArray(args.ids) && args.ids.length > 1;

// Prompt text via x-confirm:
chat.registerTool({
  name: "activate_project",
  description: "Activate the current project.",
  parameters: { type: "object", properties: {}, [X_DESTRUCTIVE_KEY]: true, [X_CONFIRM_KEY]: "Activate this project?" },
  handler: async () => await api.activate(),
});
```

The confirmation card gates **client-registered** tools *before* they run. A **server-side**
tool runs on the server, so the browser can't intercept it the same way — that is what the
approval card below is for.

### Server-side tool approval (interrupts)

When the server gates a destructive tool (e.g. django-ag-ui's `ToolGuard`), the tool **defers**
instead of executing and the run finishes on an AG-UI *interrupt*. The element then renders an
**inline approval card** (a `<div class="approval">`) via
[`requestApproval`](src/ui/approval_card.ts) **inside the tool card of the call it gates**:

- **Approve** → the run resumes and the server runs the tool; its result streams back into the
  same card.
- **Deny** → the run resumes carrying a `cancelled` answer, so the model learns the tool was
  declined; the card settles as declined.

This uses the AG-UI protocol's own interrupt/resume mechanism (`RunAgentInput.resume[]`) — the
wire stays vanilla AG-UI. A **Stop** while an approval card is open denies every open card and
cancels the run. No configuration is needed on the client; the gate is enabled server-side.

**A run can defer several calls, and each is answered on its own.** Importing three rows defers
three `create_event` calls, and the wire takes a different answer for each. So every question is
asked **at once**, each in its own tool card, above that call's own arguments — which is what says
*which* call it is about. The prompt cannot: it comes from the tool, so all three read "Add this
event to the board?". While the run waits, those cards read **`waiting for you`**
(`data-status="deferred"`), not "running…" — nothing is running, the stream is over and the server
is idle. A card asking a question shows its arguments in every `data-tool-display` mode, since
hiding them would hide the answer to "which one is this".

A **frontend** tool such as `ask_user` stays at "running…" while its card is open, because the
browser really is running it. Only a deferred call was claiming something untrue.

**What the card asks.** An AG-UI interrupt carries the question as `message`, and the default is the
call spelled out — `Approve create_event({"title": "Design sync", …})?` — which is accurate and not
something to put in front of a person. A server can supply its own wording as **`x-confirm` in the
interrupt's `metadata`**, the same key a client-side confirmation reads off the tool's schema, and
the card prefers it:

```json
{ "id": "int-1", "reason": "tool_call", "toolCallId": "call-1",
  "message": "Approve create_event({\"title\": \"Design sync\"})?",
  "metadata": { "x-confirm": "Book Design sync on Friday at 14:00?" } }
```

Anything non-string or blank under that key is ignored in favour of `message`, and with neither the
card falls back to `strings.approvalPrompt`.

**The card approves or denies, and nothing else.** The interrupt's `responseSchema` also advertises
`editedArgs` and `reason` — the protocol allows a client to rewrite a gated call's arguments before
letting it run. The built-in card does not offer that; a host that wants it can implement
`approvalRenderer` and resolve the interrupt itself.

**A gated write is still a write the page cannot see.** Approving one runs a *server-side* tool, so
if your page renders the data it touched, listen for
[`ag-ui-run-finished`](#host-seams-the-spa-story) and refetch.

Like the question card, the approval card is customizable at three levels: **text** (`strings`:
`approveAction` / `approvalPrompt` / `approve` / `deny` / `toolDeferred`), **CSS** (`::part()`:
`approval`, `approval-body`, `approval-actions`, `approval-button`, `approval-approve`,
`approval-deny`, and `tool-card-approval` for the region inside the card), and **full replacement**
via `chat.approvalRenderer` — given the request (`message` + `toolName`) and a Stop `AbortSignal`,
render your own UI and resolve `true`/`false`. A renderer is called **once per interrupt,
concurrently**, so a host that can only ask one thing at a time should queue inside it:

```js
chat.approvalRenderer = (request, { signal }) =>
  myConfirmDialog(request.message ?? `Run ${request.toolName}?`, { signal });
```

### Asking the user a question (`ask_user`)

Set `chat.askUser = true` to offer the agent a built-in `ask_user` frontend tool. When the agent
calls it, the element renders an **inline question card** (a `<div class="question">`) via
[`requestQuestion`](src/ui/question_card.ts) and returns the user's answer as the tool result:

```js
chat.askUser = true; // opt in; off by default so the tool catalog is unchanged otherwise
```

`ask_user(question, options?, allow_custom?)` renders `options` as radio buttons, adds a free-text
field when `allow_custom` is set (or when no options are given), and feeds the chosen or typed
answer back through the normal frontend-tool path — no new protocol. A **Stop** dismisses an open
question with an empty answer.

The question card is **fully customizable** at three levels:

- **Text** — every label is a `strings` key: `askUserAction` (the card's `aria-label`),
  `otherOption`, `answerPlaceholder`, `submit`.
- **CSS** — every element exposes a `::part()`: `question`, `question-body`, `question-options`,
  `question-choice`, `question-radio`, `question-input`, `question-actions`, `question-button`
  (plus the `--ag-ui-*` theme variables). No shadow piercing.
- **Full replacement** — set `chat.askUserRenderer` to own the entire UI. Given the parsed request
  and an `AbortSignal` (fired on Stop), render anything — a native modal, a framework component —
  and resolve with the answer (empty string = no answer). The built-in card is bypassed entirely.

```js
// Level 1+2: restyle the built-in card.
chat.strings = { submit: "Answer", answerPlaceholder: "Type here…" };
// ag-ui-chat::part(question) { border-radius: 0; }

// Level 3: replace the card with your own UI.
chat.askUserRenderer = (request, { signal }) =>
  myModal.ask(request.question, request.options, { allowCustom: request.allowCustom, signal });
```

### DOM-driver and animation primitives

So the agent can visibly drive the host page, the package ships generic, framework-free
primitives. The **animation** primitives ([`animations.ts`](src/dom/animations.ts)) operate at
human-readable speed (configurable; pass small/zero durations in tests):

- `typeInto(el, value, { charDelayMs })` — clears and types a value character by character,
  firing `input`/`change` events as a real user would.
- `highlightThenClick(el, { highlightMs })` / `pressThenClick(el, options)` — outline/press an
  element, pause, then click.
- `selectOption(el, value)` / `toggleControl(el, checked)` — animate a `<select>` / checkbox.
- `scrollIntoCenterView(el, { settleMs })` — scrolls the element to the vertical centre and
  resolves once the scroll has **settled**, so the ring that follows is drawn where the user is
  looking rather than mid-glide. Awaiting is optional; the scroll is requested synchronously
  either way. Settlement is `scrollend` where the browser has it, a short probe when nothing
  actually moved (the element was already in view), and a 600 ms cap otherwise.
- `flash(el, { flashMs, color })` / `focusWithFlash(el, { flashMs, color, focus })` — ring the
  element so the user can find it. The ring is an `outline`, not a `box-shadow`, because a shadow
  paints outside the border box and any `overflow: hidden` ancestor sharing the element's box (a
  card, a table cell) clips it away entirely. It holds for **1200 ms** by default and fades out
  over the last third — a 200 ms blink is not long enough to be *found* by someone who does not
  yet know where to look. The colour comes from the target's own `--ag-ui-accent` (so a themed
  page is flashed in its own colour), or from `color`.
  `flash` leaves focus alone; `focusWithFlash` moves it — see "Flash versus focus" below.
- `prefersReducedMotion()` — honoured by every primitive that *moves* something: the hold delays
  in `pressThenClick` / `selectOption` / `toggleControl` collapse to instant, `scrollIntoCenterView`
  jumps instead of gliding and settles immediately, and the flash drops its fade while still
  holding the ring for its full duration. Reduced motion asks for no animation, not for no
  feedback. `typeInto` and `highlightThenClick` are the exceptions: they keep their
  explicit-duration contract, so pass `charDelayMs: 0` / `highlightMs: 0` yourself if you want
  them instant.

The **DOM-driver** primitives ([`dom_driver.ts`](src/dom/dom_driver.ts)) compose those into the
operations a tool handler typically wants:

- `fillField(el, value, options)` — scroll to, focus-flash, and type into a text field. The
  flash defaults to `flashMs: 0` here: the field is about to be typed into, which is its own
  highlight. Pass `flashMs` (and optionally `color`) to ring it first.
- `clickElement(el, options)` / `pressButton(el, options)` — scroll to, highlight/press, and click.
- `showHighlightOverlay(el, options)` — ring an element from an **overlay drawn outside it**, and
  optionally dim everything else (`scrim`) or flow a gradient round it (`gradient`). Returns a
  function that removes it. `flash` and `focusWithFlash` take `scrim` and `gradient` too and route
  through this when either is asked for.

  **Why a second mechanism.** The plain ring is an `outline` on the element, which is deliberate:
  a `box-shadow` paints outside the border box, so an `overflow: hidden` ancestor sharing the
  target's box clips the whole ring away while the helper still reports success. But an outline
  takes a *colour* — there is no `outline-image` — so a gradient cannot be one, and anything else
  that can be is a property of the target and lands back inside whatever is clipping it. Dimming
  everything else needs a surface larger than the target, which is the same problem from the other
  side. So they are one overlay rather than two features.

  **It is inert.** The overlay never takes a pointer event, at the cut-out or anywhere else — a dim
  that swallows clicks is a modal the user did not open, and `highlightThenClick` has to reach the
  control it just finished pointing at. It follows the target on scroll and resize, and under
  reduced motion the gradient is drawn but does not travel.

  **Themed from the element you point at, not from the widget.** The overlay is appended to the
  document body so it can escape the clipping it exists to avoid, which means a `var()` in its own
  style would resolve against the body — so every token is read from the *target's* computed style
  instead, the same place the flat ring reads `--ag-ui-accent`. Set them wherever they inherit to
  the elements the agent touches, usually `:root`:

  ```css
  :root {
    --ag-ui-highlight-scrim: rgba(15, 15, 25, 0.45);
    --ag-ui-highlight-gradient: linear-gradient(115deg, transparent 20%, #4f46e5 50%, transparent 80%);
    --ag-ui-highlight-ring-width: 3;    /* unitless; px */
    --ag-ui-highlight-flow-ms: 2400;    /* one pass of the gradient */
    --ag-ui-highlight-z-index: 2147483001;
  }
  ```

  `ringWidth` and `flowMs` options override the tokens per call; `color`, `padding` and `radius`
  have no token because they are per-target rather than per-theme. The overlay's own styles are
  inline and it lives in the light DOM, so neither a stylesheet rule nor `::part` can reach it —
  these tokens and options are the whole surface, which is why they cover every value it draws.
- `selectControl(el, value)` / `toggleCheckbox(el, checked)` — animate a `<select>` / checkbox.
- `setControlValue(el, value)` — set a `<select>` or checkbox without animation, dispatching
  `input`/`change`.

Every driver primitive **awaits the scroll** before it animates. A smooth scroll is not awaitable
on its own, so a highlight fired straight after `scrollIntoView` could be applied and removed
while the element was still travelling — visible to nobody. Budget up to ~600 ms of settle time
per action in a browser without `scrollend`; an element already in view costs ~100 ms.

**Flash versus focus.** `focusWithFlash` does what its name says: it moves keyboard focus. That is
rarely what you want just to *point at* something — it takes focus off the composer, can fire blur
validation on whatever the user was mid-edit in, and can close an open menu. Reach for `flash(el)`
to highlight, and keep `focusWithFlash(el)` for the case where the agent is about to type. Either
way you can be explicit with `focus`:

```js
await flash(el);                            // highlight, focus untouched
await focusWithFlash(el);                   // highlight and take focus
await focusWithFlash(el, { focus: false }); // same as flash(el)
```

`focusWithFlash` focuses with `preventScroll: true`, so it cannot fight a smooth scroll that is
still in flight.

The native-setter helpers ([`native_setter.ts`](src/dom/native_setter.ts)) — `setNativeValue` /
`setNativeChecked` — set a control through its native prototype setter so React-controlled inputs
register the change.

Each takes an element the caller has already located; host packages wrap them with
environment-aware lookups (e.g. "find `#id_<name>`, then `fillField`").

### Page-action tools

Two built-in client tools let the agent perform common page interactions without every host
re-implementing them. They are **opt-in** via `data-page-actions` — a comma list of the tokens you
want — so you control the agent's interaction surface:

```html
<ag-ui-chat endpoint="/agent/" data-page-actions="scroll,drag"></ag-ui-chat>
```

- **`scroll_to`** — scroll a target into view. `target` is `"top"`, `"bottom"`, or a CSS selector
  / page-map element id. Read-only (no confirmation). It centres the target **vertically** and
  brings it into view **horizontally** (`inline: "nearest"`), so on a two-axis surface a
  horizontal target lands at the near edge rather than in the middle. In view is the contract;
  "centred" is not, in that axis.
- **`drag_and_drop`** — drag the `from` element onto the `to` element (selectors / page-map ids),
  firing the standard HTML5 drag sequence (`dragstart` → `dragenter`/`dragover`/`drop` → `dragend`)
  so the page's own drop handler reacts. Useful for reordering sortable lists.
- **`chat`** — four tools that let the agent move the panel it is speaking from:
  `read_chat_surface`, `move_chat`, `minimise_chat`, `restore_chat`.

  This is the one nobody else can offer. Every other assistant's chat is a surface of its own, so
  there is nothing for it to be in the way *of*; ours is mounted in the page the user is working
  in, which makes "let me move this aside so you can see the table" something the agent can act on
  rather than apologise for.

  **They report what happened, not what was asked.** A panel that fills the screen has nowhere to
  move to, and a placement that places itself owns its position — so `move_chat` answers
  `moved: false` with the reason and what would work instead, rather than reporting success on a
  panel that did not budge. `read_chat_surface` is there so the agent can ask before it acts
  instead of learning through a failure; it is read-only.

  None of them is stamped `x-destructive`. Moving a window destroys nothing, and a confirmation
  card in front of it would be worse than the move.

**Your drag surface must listen to drag events, and many "modern" ones do not.** `drag_and_drop`
dispatches the native HTML5 sequence with one shared `DataTransfer`. A surface built on a
pointer-event drag library — dnd-kit, most React DnD packages, the Angular CDK — listens to
`pointerdown`/`pointermove` and **never sees any of it**: the agent's drag is a silent no-op that
still reports success. Either use the native API or pick a library that listens to drag events.
React's synthetic `onDrop` does receive the dispatched sequence, `DataTransfer` included.

**A page action reports that it fired, not that it worked.** `drag_and_drop` returns as soon as the
sequence is dispatched; whether your drop handler's save succeeded is invisible to it, so a refused
change still looks like a successful tool call. Two things follow. Have the page report its own
refusals somewhere the agent can read them, and have the agent re-read the page before claiming
anything. Where the outcome matters more than the gesture, call the operation as a **server tool**
instead — it can return the real error.

**A page that saves asynchronously should say so.** A verification read straight after a drag can
outrun the page's own save and conclude that nothing happened. Report a busy flag in your
`getPageMap` (`{ saving: true }` while a write is in flight) and the agent can wait for a page that
says it is busy. It cannot wait for one that does not.

Targets resolve through the overridable `resolvePageTarget` property — `(target) => HTMLElement |
null`, defaulting to `document.querySelector`. A host with a page map overrides it to map its own
element ids (the same way the DOM-driver primitives are wrapped with environment-aware lookups):

```js
chat.resolvePageTarget = (id) => myPageMap.elementFor(id);
```

**Destructiveness.** Page actions are *not* stamped `x-destructive` — a drag rearranges transient
state, and the durable change happens at the page's explicit commit (a Save), which stays in the
user's hands. If your page persists *on drop* (a kanban board firing a PATCH from the drop
handler), gate `drag_and_drop` with [`confirmPredicate`](#inline-confirmation-x-destructive--x-confirm--confirmpredicate)
— or don't enable it. A target that resolves to nothing returns a clean, model-readable tool error.

---

## New chat and collapse

The header carries two built-in buttons: a new-chat (✚) button and a collapse (—) toggle. The
matching JS API:

- `newChat()` — clears the transcript, drops the in-memory run state, and mints a new thread id.
  The conversation it leaves is **kept**: it stays in the history drawer to return to, and on a
  server-backed store it stays on the server. Deleting one is the drawer row's own action. A chat
  nothing was ever sent in is the exception — it was never listed, so it is dropped rather than
  left behind.
- `describeSurface()` — where the panel is and what can be done to it: placement, collapsed,
  whether it can be moved, whether it fills the screen, its box and the viewport. `movable` folds
  the two reasons a move can fail into the one answer a caller needs.
- `moveTo(corner)` — send the panel to `top-left` / `top-right` / `bottom-left` / `bottom-right`,
  returning whether it went. It takes the axes the same way a user drag does, so the launcher
  travels with it and switching placement hands them back. Returns `false` rather than pretending
  when the placement owns its position or the panel fills the screen.
- `setCollapsed(collapsed)` / `toggleCollapsed()` — collapse or expand the widget. The state is
  reflected as the boolean `collapsed` attribute/property and persisted per-tab in
  `sessionStorage`, so it survives a reload.

Each change emits an `ag-ui-toggle` event (the `TOGGLE_EVENT` constant) with
`detail: { collapsed: boolean }` (typed `ToggleDetail`), so a host can mirror the state in its own
chrome — or hide the built-in toggle and drive the `collapsed` attribute itself.

```js
chat.newChat();
chat.toggleCollapsed();
chat.addEventListener("ag-ui-toggle", (e) => console.log(e.detail.collapsed));
```

### The composer's own keys

**Enter during a run queues.** A second run cannot start while one is in flight —
it would orphan the first — so that key used to do nothing at all, silently. What
is waiting shows above the composer as chips, each of which takes its message
back when pressed, and the next one is sent when the run settles. Stopping the
run discards them: sending into a conversation someone has just stopped is the
opposite of what stopping meant. It is not thrown away, though — a queued
message has already left the composer, so it goes to the front of the recall
history below rather than nowhere.

The composer also walks back through what you have already sent, on **Up** and
**Down** — the shape every shell and every coding agent uses. Only from an empty
composer and only with the skills palette closed: an arrow inside text is how you
move the caret, and taking it unconditionally would break editing to add a
shortcut. Arrowing forward past the newest turn empties the box again, so the way
out is the key that got you in. The history is this conversation's: starting a
new chat, switching threads or changing `user-key` clears it with the transcript.

### Collapsing to the launcher

A collapsed widget shrinks to a round **floating launcher** in the corner it already occupies: the
panel scales down into it and fades, the launcher grows out of the same point, and clicking the
launcher reverses it. Only `transform` and `opacity` animate, so the motion is compositor-only and
never reflows your page. Two placements collapse to something else instead — `sidebar` slides out
to its [edge rail](#sidebar-placement), and `embedded` / `page` keep the header bar, since one is
laid out by your page and the other is a full-screen route.

The launcher's mark comes from the same seam as the header icon, most specific first: a slotted
`slot="launcher"` child, then `data-launcher-icon-url`, then `data-icon-url`, then the built-in
speech bubble.

```html
<ag-ui-chat endpoint="/agent/" data-launcher-icon-url="/mark.svg"></ag-ui-chat>

<!-- or any markup at all -->
<ag-ui-chat endpoint="/agent/">
  <svg slot="launcher" width="26" height="26"><!-- ... --></svg>
</ag-ui-chat>
```

```css
ag-ui-chat {
  --ag-ui-launcher-size: 56px;
  --ag-ui-launcher-radius: 50%;   /* 12px for a squircle */
  --ag-ui-launcher-bg: #14532d;   /* defaults to the header background */
  --ag-ui-launcher-fg: #ffffff;
  --ag-ui-launcher-icon-size: 26px;
  --ag-ui-launcher-inset: auto 0 0 auto;  /* which corner of the widget's box */
}
```

> **The collapsed host keeps its box.** Animating the element's own width and height would animate
> layout; instead the box stays put with `pointer-events: none`, and the launcher takes the clicks.
> A host measuring `getBoundingClientRect()` on a collapsed widget still sees the panel's
> footprint — nothing there paints or takes input.

#### The unread badge

A collapsed widget is the one state where an answer can arrive with nothing on screen to say so,
so the launcher carries a count of the answers that finished while it was closed (capped at `9+`).
Expanding — or `newChat()` — marks them read. It is the only affordance here that is **on by
default**; `data-unread-badge="false"` turns the badge off.

The count is also the launcher's accessible name (`Expand — 2 unread`, from the `expandUnread`
string), because a coloured dot says nothing to a screen reader.

#### Moving the launcher

The collapsed launcher can be dragged anywhere on screen, and it stays there — per tab, in
`sessionStorage`, namespaced per element exactly like the collapsed, theme and size preferences.
Arrow keys move it from the keyboard (`Shift` for a larger step). `data-launcher-drag="false"`
turns it off; so does any placement that already places the launcher itself — `sidebar` collapses
it to a full-height rail, `embedded` and `page` hide it and keep their header bar, and a
full-bleed panel has no clear space to open into.

**The panel then opens into whichever side of the launcher has more room.** For each axis the
element compares the space a panel would have on either side of the launcher and pins the side
with more of it, so a launcher dragged to the top-left opens down and to the right. What it
compares is the room the *panel* would get, not which half of the screen the launcher is in —
those give different answers either side of centre, and only the first one is about whether the
panel fits.

A launcher parked where the panel fits neither way — the middle of a short viewport — keeps its
position anyway: the panel is clamped into the viewport and the launcher carries the difference,
which is why it can end up sitting outside its own host box. Nothing clips it there.

A drag writes `--ag-ui-inset` and `--ag-ui-launcher-inset` on the host, and an inline custom
property outranks your stylesheet's rule for the same one — the same trade a dragged size makes
against a placement. Switching to a placement that places itself hands both back.

> **An undragged launcher is untouched.** With nothing stored, the element writes neither
> property and your CSS decides, exactly as before. The geometry is built so that feeding it the
> resting position reproduces the default `auto 24px 24px auto` unchanged.

#### Moving the panel

An open panel moves by its **header**, the way a window moves by its title bar.

**The launcher travels the same distance.** Drag the panel 100px left and the bubble it collapses
into is 100px left of where it was — it is one widget being moved, not two things being placed.
The distance is the panel's own, so a panel held against the viewport's margin stops and the
bubble stops with it, and the bubble is then held on screen in its own right.

**A position you state is kept, not re-derived.** That is the difference between the two drags: a
launcher drag says where the bubble goes and lets the panel open into whatever room the viewport
has, which is re-decided on every expand and every window resize; a header drag states the
panel's own position, so it survives collapsing, reopening and reloading. Dragging the bubble
again hands the decision back. Both are stored per tab, and `data-launcher-drag="false"` turns
off both.

Which corner the panel is *pinned* by is re-picked when the drag ends, from where the bubble has
ended up, so the next expand still opens into clear space. Re-picking it moves nothing: the
corner only says which edges the two insets are written from, and both are written from positions
that are already decided.

The controls in the header keep their own presses — a drag started on a button, a link or a field
never begins, including one you slot in.

There is no keyboard shortcut on the header, deliberately. A header is not a control, and making
it focusable would put a tab stop with no role ahead of the controls a keyboard user came for —
while arrow keys on the collapsed launcher already move the widget, panel included.

```js
chat.unread; // 2

// Every change, whether or not the badge renders it — so a host that hides the
// badge can put the count in its own chrome.
chat.addEventListener("ag-ui-unread", (e) => setDockBadge(e.detail.unread));
```

```css
ag-ui-chat {
  --ag-ui-badge-bg: #b91c1c;   /* defaults to --ag-ui-danger */
  --ag-ui-badge-fg: #ffffff;
  --ag-ui-badge-size: 18px;
  --ag-ui-badge-font-size: 11px;
}
```

---

## Charts

Markdown here goes through a narrow sanitiser and images are off by default — a
model-controlled image URL is fetched with no user interaction, which turns
prompt-injected page data into a zero-click exfiltration channel. So a chart
does not arrive as markup. It arrives as **data**, and the component builds the
SVG itself: the model chooses the numbers, the component chooses the DOM.

Off unless you ask for it, by either route or both:

```js
const chat = document.querySelector("ag-ui-chat");
chat.enableCharts(["tool", "activity"]);
```

Order does not matter. Calling it after the element is on the page redraws any
charts already in the restored history, so you do not have to reach the element
before it connects — which you generally cannot.

Specs are bounded, and anything outside is dropped rather than half-drawn: at
most **20,000 points** and **2,000 labels**, and every point a finite number no
larger than **1e15**. The first two keep a stored transcript from blocking the
main thread on every reload; the last one keeps the value range finite, since
scaling divides by it.

**`"tool"`** registers a `render_chart` tool the agent may call. The numbers are
in its context, so it can talk about them; it costs one model round.

**`"activity"`** draws a chart the server pushes as an `ACTIVITY_SNAPSHOT` with
`activityType: "chart"` (exported as `CHART_ACTIVITY_TYPE`). The data never
reaches the model, there is no extra round, and this is the only route that can
**update a chart in place** — the server repeats the same `messageId` to redraw
it, or sends an `ACTIVITY_DELTA` to move one series as a computation advances.

**Whether a pushed chart survives a reload depends on where the conversation is
stored.** A client-side store keeps activities, so it comes back. A server that
stores the thread as the model's message history does not — a pushed chart is
deliberately not in that history, which is the reason to push it. A chart the
agent asked for survives either way, because its spec travels as the tool call's
arguments and the component redraws from those without re-running anything.

Either way the payload is the same shape:

```json
{
  "kind": "bar",
  "title": "Signups this week",
  "labels": ["Mon", "Tue", "Wed"],
  "series": [{ "label": "new", "points": [12, 19, 9] }]
}
```

`kind` is one of `bar`, `line`, `pie`, `scatter`, `stacked`; anything else is
drawn as a bar rather than refused. Every series needs exactly one point per
label — a shorter one misaligns every value after the gap, and a chart that is
subtly wrong still reads as authoritative, so the whole spec is dropped instead.
A pie's slices are its labels, so it draws the first series only.

Theme the series with `--ag-ui-chart-1` … `--ag-ui-chart-6`, size it with
`--ag-ui-chart-max-width`, and style the block through the `chart-block`,
`chart-title` and `chart-legend` parts.

**A chart stops at its own width, and is sized in pixels rather than scaled to
them.** Two separate things, and a widened panel needs both.

It is drawn for the width the block actually has -- one SVG unit per CSS pixel
-- and redrawn when that width changes, so a 10px axis label is 10px in a 380px
panel and in a 1200px one. Where the labels no longer fit, the axis draws every
second or third rather than a smear of overlapping words. Below 220px it goes
back to scaling, since at that size nothing fits either way.

And it takes the width it needs rather than the width it is offered, capping at
`--ag-ui-chart-max-width` (**480px**): widening the panel should no more resize
a chart than it resizes a message. Raise the token for a bigger chart and the
labels stay 10px -- the cap is about how much room the drawing gets, never
about how big its type is. Height follows width inside a 160-320px band.

### Drawing something other than a chart

`render_chart` is built on a seam any tool can use. A `ClientTool` may declare a
pure `render` beside its `handler`:

```js
chat.registerTool({
  name: "show_route",
  description: "Draw the route on a map.",
  parameters: { type: "object", properties: { stops: { type: "array" } } },
  handler: () => "route shown",
  render: (args) => buildMapElement(args.stops),   // pure; no side effects
});
```

**`render` is the only half a restored transcript replays.** Replaying a tool's
*effect* is out of the question — re-running a form-filling tool on every reload
is a bug. The replay path is handed the `render` function alone, never the tool
that owns it, so the code that runs on restore cannot reach `handler` even by
mistake: adding a "no render? fall back to the handler" convenience there means
changing a type signature first, which is the moment the question gets asked.

That is why `render` has to be a pure, deterministic function of its arguments —
it runs again every time the conversation is restored.

---

## Drawing other things the server pushes

`activityType` is an open string the protocol does not enumerate — `"chart"` is
just the one the component ships a renderer for. Register your own and the
server can push anything it likes into the transcript:

```js
chat.registerActivityRenderer({
  type: "build_status",
  render: (content) => {
    const el = document.createElement("div");
    el.className = "build";
    el.textContent = `Build ${content.status}`;
    return el;   // return null for content not worth drawing
  },
});
```

**`render` runs again on every thread load**, so it carries the same contract as
a client tool's `render`: a pure function of `content`, deterministic, and free
of effects outside the node it returns. Activities are materialised into
`role: "activity"` messages and persisted with the transcript, so a renderer that
writes to the page instead of returning DOM fires again on every restore.

The component places what you return, keyed by the activity's `messageId`, so a
server repeating an id **replaces** your node rather than adding a second one —
the same in-place update charts get. Returning `null` removes whatever was there:
live and reload should agree, and the stored content is the version that could
not be drawn.

`chart` and `compaction` are registrations exactly like yours, not privileged
branches, so registering either name **replaces the built-in**.

### Which carrier should the server use?

AG-UI leaves exactly two payload names open, and they are not
interchangeable:

| | Carrier | Reaches | Persisted | Replayed |
| --- | --- | --- | --- | --- |
| **Content** | `ACTIVITY_SNAPSHOT` | the transcript | yes | yes |
| **Imperative** | `CUSTOM` | your page, as [`ag-ui-custom`](#host-seams-the-spa-story) | no | no |

⇒ **Content has a place in the conversation and should come back. An imperative
has no place and no meaning once acted on** — replaying "refetch the board" on
every thread load is a bug, not a feature. If it has to survive a reload, it is
content.

### Finding out what arrived

An activity nobody registered for draws nothing and logs nothing — that is the
protocol's own answer, and warning would fire on every forward-compatible
server. But silence is hard to debug, so the names are readable:

```js
chat.unhandledActivityTypes; // ["pydantic_ai_thinking", …]
```

Note `"chart"` appears there until you call `enableCharts(["activity"])`, which
is the honest answer to "I pushed a chart and nothing happened".

## Tool-call display modes

How much a tool-call card shows is set via the `data-tool-display` attribute (or `toolDisplay`
property), one of `inline` / `minimal` / `compact` / `full` (default `full`):

- `inline` — the lightest mode: a single status row (icon + summary, no card chrome) with the
  result behind its own toggle. Reads as one line of the answer — pairs with [the answer
  well](#the-answer-well).
- `minimal` — tool name + status pill only.
- `compact` — name + status, with arguments *and* result behind a single collapsed toggle.
- `full` — arguments visible, result behind the toggle (the default).

Whichever mode is on, a settled card's body holds **two labelled regions** — `Arguments` and
`Result` (or `Error` / `Declined`) — each with its own part and each pretty-printed. They are
never run together into one block, so where the call ends and the answer begins is always
visible. Style them via the `tool-card-args` / `tool-card-result` parts, their headings via
`tool-card-section-label`, and the whole body via `tool-card-body`.

**The attribute is live.** Changing `data-tool-display` restyles every card already in the
transcript, the way `data-answer-well` does — the modes are pure visibility over one DOM shape,
selected by the shadow CSS from the host attribute.

### Drawing a card's body yourself

A thirty-field result is a wall of JSON where a host wanted a table, or a
sentence. `formatToolPayload` is the seam: it is asked about each region of each
card and may return a `Node` to take it over, a `string` to replace its text, or
`null` to leave the built-in pretty-print alone.

```js
chat.formatToolPayload = (payload) => {
  if (payload.kind !== "result" || payload.toolName !== "list_orders") {
    return null; // everything else keeps the default rendering
  }
  const table = document.createElement("table");
  // ... build it from JSON.parse(payload.text)
  return table;
};
```

Both halves come through the same hook, told apart by `kind`: `arguments`
carries the parsed record the call was made with, `result` the raw string the
tool returned plus the outcome it settled on. A region a formatter took over is
marked `data-formatted`, which relaxes the preformatted whitespace the default
JSON block relies on — a table would otherwise inherit it as mangled cell
spacing. Whitespace only: the card's face, frame and scroll cap stay, so one long
payload still cannot stretch the transcript, and a host wanting different
typography restyles the `tool-card-result` part.

This is **presentation, not translation.** The card and the model already read
separate copies of a tool result — the model's is maintained by `@ag-ui/client`
from the same event — so a formatter changes what the person reads and nothing
the agent reads. That is what makes restyling safe here, and it is also why
*rewording* belongs on the server: renamed there, the new wording reaches the
model's prose too, instead of leaving the card disagreeing with the answer beside
it. A returned string is set as text, never parsed as markup — this is not a
second HTML channel into the transcript.

A gated call carries the decision (`approved by you` / `declined by you`, part
`tool-card-decision`, attribute `data-decision`) — from the client-side confirmation card and
from the server-side approval interrupt alike. The prompt itself disappears once answered: a
prompt and a record are different objects, and the record is the card.

**The annotation is session-scoped**, like the "run interrupted" notice. AG-UI carries no
approval message — the answer rides `resume[]` as transient run input — so a reload restores the
tool call and its result but not the note that a human waved it through. If you need "who
approved what" durably, that is an audit concern rather than a transcript one; record it
server-side.

If a tool's schema carries an `x-summary` string (use `X_SUMMARY_KEY`), the card shows it on the
label instead of the raw tool name.

Every card leads with a **status icon** drawn entirely in CSS — a spinning ring while the call
runs, then a check / cross / slash on success / error / decline. Re-theme it via custom
properties (or the `tool-card-icon` part): `--ag-ui-tool-icon-done`, `--ag-ui-tool-icon-error`,
`--ag-ui-tool-icon-declined` (quoted-string glyphs) and `--ag-ui-tool-spin-duration` (spinner
speed; the spin respects `prefers-reduced-motion`).

```html
<ag-ui-chat endpoint="/agent/" data-tool-display="compact"></ag-ui-chat>
```

---

## Delegated sub-agents

A run that hands work to a sub-agent reads as a stall. The parent's
`delegate_task` card sits at "running…" for the child's entire duration —
however many tools the child calls, however long it takes — with nothing on
screen to say anything is happening.

If your server narrates that, the component draws it. The wire is an ordinary
AG-UI `CUSTOM` event named `ag_ui.subagent`, carrying:

| Key | Meaning |
| --- | --- |
| `delegationId` | the **parent's own `delegate_task` tool-call id** — not the child's run id |
| `agent` | the child agent's name |
| `phase` | one of `started`, `tool_call`, `tool_result`, `finished`, `failed` |
| `status` | a pre-rendered line, ready to show |
| `tool` | `toolCallId`, `name` and `ok`, on the two tool phases only |

Exactly one `started` opens a delegation and exactly one `finished` or `failed`
closes it. `ok` is a tri-state: `null` while the child's call runs, `true` on a
result it accepted, `false` on one that came back to it.

Because the key is the *parent's* call id, the surface attaches to a card that
already exists rather than floating a second element with the same identity: one
**collapsed row per delegation**, live, carrying the server's `status` line and
nothing else, expanding onto the child's own tool calls. A ten-step child costs
one row until somebody opens it, and there is no second visual language — it
reads the way tool cards already read.

`status` is why the collapsed row needs no wording of its own. The structured
keys are there for a host that would rather write its own.

The row shows in **every** [display mode](#tool-call-display-modes), including
`minimal`. It sits outside the card body rather than in it, because the body is
what the density modes hide — and a live progress line that only appeared in
`full` would leave exactly the stall it exists to end. Same reasoning that shows
a deferred card's arguments whatever the mode.

**A failure carries no exception text on this channel, deliberately** — the same
reasoning that redacts a `RUN_ERROR`, since an exception's words are written for
an operator. The detail rides the ordinary tool result for that delegation, which
lands in the same card's `Result` region a few pixels below. Nothing here invents
words the server declined to send.

**None of it is persisted.** A `CUSTOM` event never enters the message list, so
nothing replays on a thread restore — which is the right half of the
[carrier split](#which-carrier-should-the-server-use): a delegation that was live
an hour ago is not live now, and replaying its progress would be a lie about a
run that is over. Reload mid-run and the tool card is still there; the nested
detail is not. That is the intended behaviour.

Like `ag_ui.invalidate`, this name is **routed** rather than forwarded: it draws
itself and does not also arrive as an `ag-ui-custom` event. Every other name
still reaches your page untouched.

Style it through `tool-card-subagent` (the region inside the card), `subagent`,
`subagent-row`, `subagent-icon`, `subagent-status`, `subagent-steps`,
`subagent-step`, `subagent-step-icon` and `subagent-step-name`. The two glyph
states reuse the card's own `--ag-ui-tool-icon-done` / `--ag-ui-tool-icon-error`
properties and its spinner speed, so re-theming the cards re-themes these. The
row's own chrome comes from `subAgentWorking` and `subAgentSteps` in
[`UiStrings`](#internationalization-i18n); everything else on the row is the
server's text.

---

## Resizing the panel

The panel carries a grip on **every edge and every corner**, so it can be
dragged from whichever side you are already near.

- `placement="page"` gets **no grips** — a full-bleed layout
  is `100vw`/`100vh` by definition, so there is nothing to drag.
- `placement="sidebar"` keeps only the two vertical edges;
  the placement owns the height, so a horizontal edge or a corner would
  advertise a drag that does nothing.
- Everything else gets all eight.

**The edge a grip does not drag is the one that stays put.** That is the whole
model: the left grip moves the left edge and holds the right, the right grip
does the reverse, a corner does both axes. A grip names its own edge, so no
layout can invert it.

### Dragging the edge your layout was holding still

A floating panel pinned bottom-right cannot grow rightward on its own — its
right edge is what the placement fixed. So **a drag on a pinned edge moves the
panel as well as resizing it**, and the component takes the position over by
writing `--ag-ui-inset`, the same ownership a dragged launcher takes.

A grip on a free edge writes nothing but the size, exactly as before, so a host
positioning the panel with its own rule keeps that rule until someone drags the
edge it was holding.

Which edges those are belongs to *your* CSS rather than to `placement` — a
floating panel a host right-aligns is anchored bottom-left — so the element
probes its own geometry and reflects the result as `data-resize-anchor` (e.g.
`bottom-right` means those two edges are fixed). Nothing in the stylesheet reads
it any more; the element uses it to decide what a drag on a pinned edge costs,
and which grip carries the keyboard.

> **The probe shrinks rather than grows.** Growing by a pixel cannot answer the
> question at a size already resting against `max-width` or `max-height`: the
> box does not change, no edge moves, and every clamped axis reads as pinned on
> the side that is actually free. That was reachable with no user action at all
> — the default panel is 380px wide against a max-width of `100vw - 48px`, so
> any viewport under 428px was born clamped, with the grip on the wrong corner
> and the drag inverted.

### Sizes, keyboard, and parts

A drag writes `--ag-ui-width` / `--ag-ui-height` on the host as custom
properties.

**That alone does not leave placement in charge** — an inline custom property
still outranks a `:host([placement=…])` rule setting the same property. So the
component enforces the split directly: **a placement owns the axes it fixes**,
and a dragged or persisted size is only ever applied to the ones it leaves free.
Switching placement hands the owned axes back. Without that, a height dragged
while floating capped a docked sidebar that had asked for `100vh`.

**A host rule that sizes the element wins over both.** `ag-ui-chat { flex: 1 }`
stretches the panel to its container and the dragged width has no visible
effect — which reads as a broken control rather than as your stylesheet winning.
Give the element `flex: 0 1 auto` (plus `max-width: 100%`) if it lives in a flex
container.

The size persists per tab (`sessionStorage`, namespaced per element like the
collapsed and theme preferences) and is restored before the first paint.

**Exactly one grip is in the tab order** — the corner diagonally opposite the
pinned one, so an arrow key changes the size and never the position. Eight
separators between the transcript and the composer would be a keyboard
obstacle rather than keyboard parity, and one grip already reaches both axes.
Arrow keys resize from it (`Shift` for a larger step).

Each grip draws a short pill centred on its edge — a dot in a corner — on hover
and focus as well as during a drag. **The hit area and the mark are separate on
purpose**: the area is the whole strip, so the grip is easy to catch, while the
mark stays small enough that it cannot be read as a border and never meets the
panel's corner radius.

Every grip has its own part (`resize-handle-left`, `resize-handle-bottom-right`,
and so on, plus `resize-handle` on all of them). Hit areas and marks are sized
separately, so a coarser pointer can get a bigger target without a heavier mark.

```css
ag-ui-chat {
  --ag-ui-grip-corner: 20px;          /* the corner squares */
  --ag-ui-grip-edge: 10px;            /* the edge strips */
  --ag-ui-grip-mark-length: 28px;     /* the pill drawn inside them */
  --ag-ui-grip-mark-thickness: 3px;
}
```

---

## Markdown rendering

Assistant bubbles render sanitized markdown/HTML via [`marked`](https://www.npmjs.com/package/marked)
(GitHub-flavoured, single-newline line breaks) piped through
[DOMPurify](https://www.npmjs.com/package/dompurify). User messages stay literal text. The
allowlist permits emphasis, code, lists, quotes, headings, links, tables, and — when `allowImages`
is set — images; links are hardened with `target="_blank" rel="noopener noreferrer"`;
`iframe`/`style`/scripting are excluded, as are every `data-*` and `aria-*` attribute and every
`class` but a code fence's `language-*` hint, so model output cannot dress itself up as the
component's own approval or tool-call chrome. The exported helper `renderMarkdown(text)` does this
standalone. `marked` and `dompurify`
are runtime dependencies.

An animated 3-dot "thinking" indicator (`role="status"`, with an aria-label) appears before the
first token and between tool rounds, honouring `prefers-reduced-motion`. It has no public API.

### Incoming-text animations

The `data-text-animation` attribute controls how a fully-received assistant message reveals:
`none` (default) / `fade` (a CSS fade) / `word` (JS word-by-word via the internal `wrapWords`
reveal). It honours `prefers-reduced-motion` (collapsing to instant).

```html
<ag-ui-chat endpoint="/agent/" data-text-animation="word"></ag-ui-chat>
```

---

## Follow-up suggestions

The agent can offer the *next* question, not just answer this one. Registered
skill chips are static and host-configured, so they can say "summarize this" but
never "want me to update the shipping address too?" after a tool has run.

The server pushes an `ACTIVITY_SNAPSHOT` under the `suggestions` type — with
django-ag-ui, `suggestions_activity([...])`. The component draws each prompt as
a chip; clicking one sends it as the user's message, exactly as if they had
typed it.

```json
{ "activityType": "suggestions",
  "content": { "prompts": ["Update the shipping address too"] } }
```

**Chips are content.** They ride the same activity envelope as charts, so they
persist and a reload puts them back, and a set pushed under an id already on
screen replaces that row rather than adding a second one.

At most **4** prompts of **120** characters each — `MAX_SUGGESTIONS` and
`MAX_SUGGESTION_CHARS`, both exported. The server-side helper *raises* past
those bounds while this side silently drops: that asymmetry is deliberate, since
the producer can report the problem and the client cannot.

Nothing to enable. A `suggestions` activity from a server that pushes one is
drawn; an `activity_type` this component does not know is ignored, which is what
the open field is for.

## Editing a gated call before approving it

AG-UI's resume payload carries `editedArgs`, and the protocol gates it on the
agent's own `approveWithEdits` capability. The approval card can offer it:

```js
chat.approveWithEdits = true; // your server accepts editedArgs
```

**Off by default, and an assertion about your server rather than a
negotiation** — capabilities are not on the wire this component reads, so it
cannot check. Turned on against a server that ignores `editedArgs`, a user would
edit arguments it silently discards, which is worse than not offering.

The card then shows the call's arguments as editable JSON. `editedArgs` rides
the resume payload **only when something actually changed**, so a server can tell
"approved as proposed" from "approved, but like this" without diffing what it
already sent. Unparseable JSON, or JSON that is not an object, keeps the card
open with the reason on it rather than approving the original behind the user's
back.

Only offered for an interrupt naming a tool call this component holds a card
for — the card is where the arguments still are.

## Localizing the timestamps

There is **no `Intl` anywhere in this component**. The relative timestamps in the
thread drawer and checkpoint panel (`"5m ago"`, `"2d ago"`) are deliberately
locale-neutral: a component that guessed a locale would disagree with the page
it is embedded in, and being wrong in a second language is worse than being
neutral in one.

That is a good default and a bad requirement, so it is replaceable:

```js
const rtf = new Intl.RelativeTimeFormat("de", { numeric: "auto" });
chat.formatRelativeTime = (ts) =>
  rtf.format(Math.round((ts - Date.now()) / 60000), "minute");
```

`relativeTime` is exported too, for a host that wants to build on the built-in
rather than replace it.

## Message actions: copy, retry, feedback

Every finished assistant message carries a small row of actions beneath it —
a **sibling** of the bubble, never a child, so the buttons never join the
message's own text.

- **Retry** re-asks the question. History is truncated to the most recent user
  message inclusive and the run repeats, so the agent answers what it was asked
  rather than being told its last answer was wrong.
- **Copy** puts the message's text on the clipboard, and says so on the button.
  A refused clipboard permission is reported there too, rather than thrown.
- **Thumbs up / down** fire `ag-ui-feedback` (wired below) and **store nothing**.
  **Off unless you ask for them** — `data-message-actions="copy,retry,feedback"`.
  Without a listener the buttons still latch, so a reader is told a rating was
  taken while nothing recorded it.

Retry sits on the **last** answer only. Re-running an older turn is branching,
and for a page-driving agent editing a past turn is not neutral — those turns
clicked buttons, and re-running turn 3 does not un-save what turn 5 saved.

!!! note
    A retried turn **re-runs its tools.** The previous attempt already did what
    it did, and this does not undo it. Confirmation still applies, so a
    destructive tool asks again — unless the user waived it for this session
    with *Always allow*.

A failed run gets the same row, with Retry and Copy and no rating: error text is
what people paste into a bug report, but "the connection dropped" is not a
statement about answer quality and mixing it into feedback makes that signal say
less. This is why a dropped connection is still rendered as an **error** rather
than demoted to a run notice — a notice "never settles, takes no action, and
carries no controls", and a failure with a way back needs one.

The row can be trimmed, or removed, with `data-message-actions` — a comma list of
the actions to keep, or `="false"` for none at all:

```html
<!-- copy only: nothing here listens for a rating, and the surface forbids re-runs -->
<ag-ui-chat endpoint="/agent/" data-message-actions="copy"></ag-ui-chat>
```

The default is `copy,retry`. Those two work with nothing wired; the rating pair
needs a listener, so it is asked for rather than assumed.

### What Copy puts on the clipboard

Both flavours of the message: `text/plain` for anywhere, and `text/html` for a
target that understands it. A table therefore pastes into a spreadsheet as
columns and into a document as a table.

The plain flavour is serialised structurally rather than read off `textContent`,
which is the obvious source and loses everything: it concatenates descendants
with no separator, so a table arrives as one unbroken run of cells with the
headers welded to the first row. Rows are tab separated because that is what a
spreadsheet splits on; list items keep their bullets and numbers; a code block
keeps its own whitespace.

Both flavours are taken from a copy of the message with the component's own
buttons removed. The code blocks' copy buttons live *inside* their `pre`, so
they are descendants of the message: before this, copying an answer containing a
code block copied the word Copy along with it.

A host that drives its own bar gets the same by passing `html` alongside `text`
to `attachMessageActions`; with `text` alone the clipboard gets plain text only,
exactly as before.

### Sizing and theming the row

The controls are icon-only, so the whole box is the target. It is sized from
`--ag-ui-action-size`, with a floor rather than a fixed height so the compact
density cannot shrink it below the 24px that keeps it reliably tappable.

Each control draws its own label on hover **and on keyboard focus**. That is not
the `title` attribute repeated: a `title` never appears on focus, so an
icon-only button is unnamed for anyone tabbing to it. On a touch device, where
there is no hover to reveal it and it would sit over the answer, it is not
drawn at all.

```css
ag-ui-chat {
  --ag-ui-action-size: 28px;        /* the control box; floors at 24px */
  --ag-ui-action-icon-size: 15px;   /* the mark inside it */
  --ag-ui-tooltip-bg: #1f2430;
  --ag-ui-tooltip-fg: #f5f6fa;
}
```

To swap a mark for your own, style its part — `message-action-icon-copy` and its
siblings. A slot would be the better channel and cannot be used: these repeat
once per message, and a named slot can only be filled once.

It is per-action rather than one switch because the three disappear for
different reasons. Thumbs are only useful to a host listening for
`ag-ui-feedback`, and two buttons that lead nowhere are worse than none. Retry
re-runs the agent, which a constrained surface may not permit. Copy is the one
nobody objects to — and with a single switch, dropping either of the others would
have cost it too. Nothing survives, and no row is built at all: an empty row
still takes its margin and still announces itself as a group of actions.

`retryLastTurn()` is public, for a host driving its own message UI.

```js
chat.addEventListener("ag-ui-feedback", (e) => {
  analytics.track("assistant_rating", e.detail); // { content, rating }
});

await chat.retryLastTurn(); // false when there is nothing to ask again
```

## Quoting a selection

Select any text in the transcript and a small **Quote** offer floats beside it.
Taking it drops the selection into the composer as a markdown blockquote and
leaves the caret on a fresh line under it — a quotation is how a question
narrows to one part of an answer, so nothing is sent until you say what you are
asking.

Quoting **appends**, after whatever is already typed, so a second quotation is a
second thing being asked about rather than a replacement for the first. Long
selections are capped at 500 characters: select-all-then-quote is a gesture the
transcript already answers, and pasting the whole conversation back costs tokens
to say nothing.

Set `data-quote-selection="false"` to turn the offer off. The `quote-selection`
`part` styles it.

### The half that matters: selection in **your** page

The transcript is the easy half. A chat mounted beside a table, a diff or a
report is sitting in the surface the user actually works in — and *that*
selection is one no hosted chat can reach.

`offerQuoteInPage()` extends the same select-then-offer gesture to the whole
page. It is opt-in, because it listens on your document:

```js
const stop = chat.offerQuoteInPage();       // the whole page
chat.offerQuoteInPage(document.querySelector("#report")); // or one region
```

For a deliberate trigger instead of a selection, `quote(text)` is the seam
underneath:

```js
// "Ask about this row" — a button on each row of your own table.
row.querySelector(".ask").addEventListener("click", () => {
  chat.quote(row.innerText);
});
```

`quote()` never sends — pair it with [`sendMessage()`](#sending-from-your-own-ui)
if you want a one-click "explain this" that skips the composer entirely.

> **Do not write the four-line version of `offerQuoteInPage()`.**
> A `mouseup` listener that quotes every settled selection appends to the
> composer on every drag the user made to *read*, to copy, or to fix a typo —
> and it cannot tell a selection in your prose from one inside the user's own
> half-typed `<input>`, because Chrome reports a field's internal selection
> through `document.getSelection()` as an ordinary range over the field's
> **wrapper**. The text reads back perfectly and nothing about the range says
> where it came from; the only signal is `document.activeElement`. That guard,
> plus skipping the widget's own transcript, plus retiring a fixed-position
> affordance on scroll, is what the method is for.

> **Reading a selection out of a shadow tree takes care too.**
> Engines disagree about what `document.getSelection()` reports for a selection
> made *inside* a shadow root: WebKit rescopes the endpoints to the host element,
> so you get the whole widget and none of the words, while Chromium hands back
> the shadow nodes directly. `getComposedRanges` settles it, and this component
> uses it where it exists. `quotableSelection(container, roots)` is exported if
> you have the same problem in your own component.

## Run notices: compaction and agent skills

Some things a run does are neither text nor a tool the user asked for — the server condensed
earlier turns to fit the context window, or the model pulled in an agent skill. Those render as
**run notices**: a muted one-line annotation inline in the transcript, styleable via the
`run-notice`, `run-notice-icon` and `run-notice-text` `part`s.

> **Two different things are called "skills".**
> The [prompt chips and slash palette](#skills-prompt-chips-and-slash-palette) below are a
> **human** affordance — prompts *the user* launches. An **agent skill** is a folder of
> instructions *the model* chooses to load mid-run. Only the second produces a run notice.

Neither notice needs configuration here — both appear when the server is set up to produce them.

**Compaction.** `django-ag-ui` emits a standard AG-UI `ACTIVITY_SNAPSHOT` with
`activityType: "compaction"` when a compaction capability trimmed the history; the notice reports
how many messages went. Server side, that means wrapping the capability in `CompactionObserver` —
see [django-ag-ui's compaction guide](https://artui.github.io/django-ag-ui/compaction/). Activity
events of any other type pass through untouched, so another producer on that channel is not
mistaken for a compaction.

**Agent skills.** There is no dedicated event for these: loading a deferred capability *is* an
ordinary `load_capability` tool call, which is what reaches the client. The component recognises
it, renders `Using skill <id>`, and suppresses the raw tool card that would otherwise appear
beside it — on the live stream and on restored history alike, so a reload shows the same
transcript. A `load_capability` call with no usable id falls back to a normal tool card rather
than being dropped, since it is still real activity.

Both strings are overridable like every other — `historyCompacted` (token `{count}`) and
`usingSkill` (token `{name}`).

## Skills: prompt chips and slash palette

Skills are pre-defined prompts the user can launch from a chip or the `/`-command palette. They are
opt-in via two attributes:

```html
<ag-ui-chat endpoint="/agent/" data-prompt-chips="true" data-slash-commands="true"></ag-ui-chat>
```

A `Skill` is `{ name, title, description?, prompt?, sendImmediately?, chip? }`. Skills are merged
from three sources — **backend → embed → client** (later wins by `name`):

- `data-skills-url` — a JSON endpoint, fetched with the element's `headers`.
- `data-skills` — an inline JSON catalog.
- `setSkills(skills)` — set the client catalog from JS.

```js
chat.setSkills([
  // Server-resolved: no prompt here, so picking it sends the bare "/triage"
  // token and the agent decides what it means.
  { name: "triage", title: "Triage this", chip: true },
  // Client-side: the page owns the wording and fills the placeholders.
  { name: "summarize", title: "Summarize page", prompt: "Summarize {title}.", chip: true },
]);
```

**Prefer omitting `prompt` for anything internal.** A skill is often where a project's workflow is
written down most plainly, and a catalog is either a plain `GET` or sits in the page source — so
shipping the wording to the browser publishes it. Without a `prompt` the component sends `/name`
and the agent expands it (from the harness `Skills` capability, or your own instructions); the text
never leaves the server. `django-ag-ui`'s `SkillRegistry` supports this by leaving `prompt` unset.

A skill that *does* carry a `prompt` may use `{placeholder}` tokens; the `skillContext` property
(`() => Record<string, unknown>`) supplies the values, filled in before send. A missing placeholder
blocks the send and shows a hint instead.

```js
chat.skillContext = () => ({ title: document.title });
```

**Picking a skill sends it.** A chip that needs a second click to do anything is a two-step
shortcut. Set `sendImmediately: false` on a prompt-carrying skill to pre-fill the composer instead —
useful when the user is expected to edit before sending. A server-resolved skill always sends.

---

## MPA durability: surviving full page reloads

In a multi-page app, a tool that navigates reloads the whole page and destroys the in-memory run
loop. The package keeps the conversation continuous across that boundary with three generic
mechanisms.

**1. Thread identity.** AG-UI's `thread_id` is the conversation key. It is generated once and
persisted (so the element reattaches after a reload) by the
[`ClientConversationStore`](src/core/conversation_store.ts).

**2. Durable conversation.** A pluggable `ClientConversationStore` holds the message list. The
default [`SessionStorageStore`](src/core/conversation_store.ts) keeps everything per-tab in
`sessionStorage`, so the chat survives full page reloads and clears on tab close. `loadMessages`
is async-friendly, so a host can inject a server-backed store (e.g. one that rehydrates from a
history endpoint) for cross-tab/device durability:

```js
chat.conversationStore = new MyServerBackedStore();
```

On mount the element rehydrates the transcript from the store, so the chat looks continuous —
including tool-call cards and their results (reconstructed from the persisted `toolCalls` and `tool`
messages), not just the text turns.

**3. Resumable loop (`x-navigates` + `navigationResult`).** A tool whose schema carries
`x-navigates: true` (use `X_NAVIGATES_KEY`; read back by [`isNavigates`](src/tools/is_navigates.ts))
triggers a full reload. Before the handler navigates, the element writes a checkpoint
(`{ toolCallId }`) to the store. On the next page mount it:

1. restores the transcript,
2. completes the dangling navigating tool call by supplying a result built from the landed page
   via the overridable **`navigationResult(checkpoint)`** callback (defaults to
   `{ navigated: true, url }`; a host can return a page snapshot or post-reload validation errors
   instead),
3. and resumes the run loop from there.

The MPA round-trip becomes a clean observation point instead of a dropped conversation.

### Who the stored conversation belongs to (`user-key`)

`sessionStorage` is scoped to a tab, not to a session. It survives every same-tab navigation,
and a logout is a navigation — so on a shared workstation, one user's transcript is still sitting
there when the next user signs in and the chat mounts again. Transcripts routinely quote record
data, so treat that as the default and turn it off:

```html
<ag-ui-chat endpoint="/agent/" user-key="{{ request.user.pk }}"></ag-ui-chat>
```

The value is any string that identifies the principal — a user id, an account id, a hash of one.
It joins the storage namespace, so two principals in the same tab cannot reach each other's
conversation, and **changing it purges everything the previous principal stored**: transcript,
history drawer index and navigation checkpoints, for this element's namespace only.

Set it live, from script, as part of signing out or in:

```js
chat.userKey = String(session.userId); // or "" on sign-out
```

That is why it is a live attribute rather than a connect-time one. A single-page app signs a user
out through its own router without remounting anything, so the host naming the new principal — or
dropping the attribute — is the only signal the element will ever get. Removing the attribute
purges too, so a sign-out that simply clears it is safe.

The **first** value to arrive is treated as a host naming the user who was already there, not as a
handover: the conversation in progress moves into the principal's namespace instead of being
destroyed. So an element configured by an async auth handshake — the shape described in
[Framework hosts](#framework-hosts-configure-before-you-insert) — keeps what is on screen.

Two things it deliberately does not do. It does not scope the panel's own collapsed / dragged-size
/ theme preferences, which are this element's UI state and carry no conversation content. And it
does not encrypt or hide anything from the page: any script on the origin can still read
`sessionStorage`. It scopes and it purges.

**Without it, nothing changes** — including the carry-over above. A conversation is scoped to the
element and to nobody in particular, and on a shared workstation it will be there for whoever signs
in next in the same tab.

For a deployment that keeps history server-side, `data-threads-cache="false"` stops the local
mirror of the message bodies as well, so choosing `data-threads-url` actually keeps transcripts off
the client:

```html
<ag-ui-chat endpoint="/agent/" data-threads-url="/agent/threads/" data-threads-cache="false">
</ag-ui-chat>
```

The client-only concerns (the active thread id, the navigation checkpoint) keep their local store
either way, so reloads and navigating tools still work. What is lost is the offline fallback: when
the thread endpoint is unreachable the transcript comes back empty rather than stale, and the
drawer's offline list loses its previews — a preview being an excerpt of a message, which is the
thing being kept off the client. Constructing the store yourself takes the same option:

```js
chat.conversationStore = new RemoteConversationStore(
  "/agent/threads/",
  () => ({ "X-CSRFToken": token }),
  new SessionStorageStore(),
  () => "same-origin",
  false, // cacheMessages
);
```

`SessionStorageStore.purge(namespace)` is the same primitive the element uses, for a host driving
its own store from its own sign-out path.

### Mounting more than one chat on a page

Give each `<ag-ui-chat>` its own `id`. The storage namespace is the element's `id`, falling back to
its `endpoint` — so two elements with no `id` against the same agent mount (a docked support panel
and an inline page assistant, say) would resolve to the same namespace and share a thread pointer,
a history drawer and every message key.

They no longer do: the first element to mount keeps the namespace, and a second is given a
throwaway one of its own plus a console warning. That keeps the two conversations apart, but the
throwaway namespace is minted per mount, so the second element will not restore its conversation
across a reload until it has an `id`.

---

## Host seams: the SPA story

`<ag-ui-chat>` is a generic embedding kit; these typed seams let a host feed the agent richer
context up front so it explores less. All are framework-free and admin-agnostic.

**`routeMap: RouteMap`** — a manifest of navigable routes (`{ id, path, title?, group?,
description? }`). When set, the element exposes two built-in tools so the agent navigates by intent
rather than by exploring:

- `list_routes` — read-only; lists the routes.
- `navigate_to_route(route_id, params?)` — resolves the id to a path and navigates.

A route `path` may contain `:param` segments — e.g. `/projects/:id/users/:userId/`.
`navigate_to_route` substitutes the path params (URL-encoded) and sends any leftover params as a
query string; a missing or empty required path param throws. The resolved shape is the exported
`RouteWithParams` type.

```js
chat.routeMap = [
  { id: "users", path: "/users", title: "Users", description: "Manage user accounts" },
  { id: "billing", path: "/billing", title: "Billing" },
  { id: "user-detail", path: "/projects/:id/users/:userId/", title: "User detail" },
];
```

**`getPageMap(): PageMap`** — a per-run provider returning the current page's compact actionable
surface (field names/types/labels, button labels+handles — *not* values). It is auto-injected into
each run's `context` as a `page_map` entry (toggle with `autoInjectPageMap`):

```js
chat.getPageMap = () => ({ fields: introspectForm(), buttons: visibleButtons() });
```

It is recomputed at the top of **every tool round**, not once per `send()` — so after the agent
acts, the next round already sees the resulting page. Within a round the agent can pull a fresh
view at any time with the built-in `read_page` tool, which is registered whenever this provider is
set.

**Check that your server reads `context` at all — pydantic-ai's AG-UI adapter does not.** The
auto-injected `page_map` rides in `RunAgentInput.context`, and an adapter that ignores that field
drops it silently: nothing errors, and the model simply never sees the page. On such a backend
`read_page` is the channel that works, and it is the one to rely on. Nothing to configure — just do
not assume the injected copy arrived, and if the page map matters to your prompt, put it there
server-side or let the agent call `read_page`.

That leaves one window: the page can move *after* a round's context was built but *before* the
agent's tool call arrives — the user clicks a link, or presses back. Calls landing in that window
are **refused** with a result telling the agent to call `read_page` and retry. Most would have
missed anyway; the guard exists for the case where a same-named control on the new page matches and
the agent would otherwise act on the wrong page without either side noticing. `read_page` and tools
marked `x-navigates` are exempt, and the guard is inert when no `getPageMap` is set.

**`registerPageState({ name, read, write?, schema? })`** — ergonomic sugar over `registerTool` for
SPA app state (Redux/Zustand/signals). It auto-generates a `read_<name>` (read-only) tool and, when
`write` is supplied, a `set_<name>` tool stamped `x-destructive`:

```js
chat.registerPageState({
  name: "cart",
  read: () => store.getState().cart,
  write: ({ items }) => store.dispatch(setCart(items)),
  schema: { type: "object", properties: { items: { type: "array" } } },
});
```

**This is not AG-UI shared state** — that is `sharedState`, below. `registerPageState` generates two
ordinary client tools; the agent reads or writes your store by *calling a tool*. The method was
called `registerStateHook` through 0.12, a name that read as protocol state sync; the old spelling
still works and is deprecated.

**`sharedState`** *(property)* — AG-UI **shared state**: the protocol's own state channel, sent as
`RunAgentInput.state` on every run and replaced in place when the server streams `STATE_SNAPSHOT` /
`STATE_DELTA`. Assign to seed it, listen for `ag-ui-state` to react:

```js
chat.sharedState = { document: "" };

chat.addEventListener("ag-ui-state", (e) => {
  editor.value = e.detail.state.document;   // the agent rewrote it
});
```

Server-side, a tool mutates `ctx.deps.state` and returns the snapshot as `ToolReturn` metadata —
pydantic-ai does not emit deltas for you:

```python
@tool(registry)
async def write_document(ctx: RunContext[AgentDeps], body: str) -> ToolReturn:
    """Replace the shared document."""
    ctx.deps.state = {**(ctx.deps.state or {}), "document": body}
    return ToolReturn(
        return_value="written",
        metadata=[StateSnapshotEvent(type=EventType.STATE_SNAPSHOT, snapshot=ctx.deps.state)],
    )
```

Use this when the agent and the page are editing **the same object** (a document, a form, a
canvas). Use `registerPageState` when the agent should *ask* for a value or *request* a change —
the tool call is visible in the transcript and can be gated by a confirmation card, which state
events cannot.

**`navigate(path): void`** *(optional)* — a host routing callback. **This single seam is what
distinguishes an SPA from an MPA.** When set, `navigate_to_route` routes client-side (no reload) and
the in-memory run loop simply continues — the whole resumable-loop / checkpoint machinery is
bypassed. When unset, navigation falls back to `window.location` and the MPA reload model above
applies.

```js
chat.navigate = (path) => router.push(path); // SPA: in-page, no reload
// leave unset for an MPA: window.location + checkpoint/resume
```

Route map + `navigate()` and the reload model are the same feature seen from two ends.

**`ag-ui-run-finished`** *(event)* — an interaction has ended, and here is what ran in it.
`detail: { tools: readonly ToolRun[] }` (typed `RunFinishedDetail`), where each `ToolRun` is
`{ name, side: "server" | "client" }` in settle order.

**This is the seam for a host that renders data the agent can change.** A server-side tool writes
without your page's knowledge: nothing else the element dispatches implies "something may have moved
underneath you", so a page that fetched its data on mount has no reason to refetch and quietly goes
stale. Approve a server-side booking on a calendar and the row exists while the calendar keeps
showing the week it loaded.

```js
chat.addEventListener("ag-ui-run-finished", (e) => {
  // A "client" tool ran in your own handler, so you already know what it did.
  if (e.detail.tools.some((tool) => tool.side === "server")) {
    void refetchBoard();
  }
});
```

It fires **once per interaction**, not once per tool round, and it fires on completion, error and
cancellation alike — a partial write is still a write. A capability load (an agent skill activating)
is not counted: it moves nothing a host renders.

`sharedState` above is the richer channel and this is not a replacement for it — but it is not a
substitute the other way round either, because shared state requires the *agent* to emit
`STATE_SNAPSHOT`, which is not the host's decision to make. Use state when the two ends edit one
object; use this when your page owns the data and just needs to know it moved.

**`ag-ui-custom`** *(event)* — the agent sent an AG-UI `CUSTOM` event.
`detail: { name, value }` (typed `CustomAgentDetail`), both verbatim and uninterpreted.

```js
chat.addEventListener("ag-ui-custom", (e) => {
  if (e.detail.name === "invalidate") {
    void refetch(e.detail.value);
  }
  // Any other name: no listener, nothing happens. That is the intended outcome.
});
```

`CUSTOM` is one of exactly two AG-UI carriers whose payload name is an open
string the protocol does not enumerate, and it is the **imperative** one:
something for your page to *do*. Its sibling `ACTIVITY_SNAPSHOT` carries
transcript **content**, which is why an activity is materialised into a message,
persisted with the thread and replayed on restore, and this is not.

**That asymmetry is the rule for choosing between them.** Content has a place in
the conversation and should replay. An imperative has no place and no meaning
once acted on — replaying "refetch the board" on every thread load is a bug, not
a feature. If it must survive a reload, it belongs on the other carrier.

The element takes no view of what a name means and forwards every one, so a name
it has never heard of reaches you unchanged. A host with no listener for a name
simply ignores it, which is the graceful outcome an open field exists for.

**`ag-ui-invalidate`** *(event)* — the agent named resources its write moved.
`detail: { keys, reason }` (typed `InvalidateDetail`).

One `CUSTOM` name routed to its own event so you do not have to string-match;
every other name still arrives as `ag-ui-custom`. It fires **as each
announcement arrives**, during the run, and the same keys ride
`ag-ui-run-finished` again at the end as `invalidated`, de-duplicated.

> **Do not reload the page on this.** The user was probably typing. An
> agent-triggered reload or a blind refetch into a live form destroys unsaved
> input, and from their side the page threw their work away on its own. Check
> first, and offer rather than act:

```js
chat.addEventListener("ag-ui-invalidate", (e) => {
  if (formIsDirty()) {
    showBanner("This data changed. Refresh when you're ready.", e.detail.keys);
    return;
  }
  refetch(e.detail.keys);   // e.detail.keys → ["orders", "orders/42"]
});
```

**Keys are opaque and matching is exact.** `orders/42` does not imply `orders` —
a prefix rule would be the component guessing at a scheme it does not own, and
`orders/1` would match `orders/11`. A server that wants the collection refreshed
names it. Your own matching may be hierarchical, because in your vocabulary the
scheme is known; that is what TanStack query keys are built for.

Already listening on `ag-ui-run-finished`? Upgrading is one line, and the `else`
is the whole compatibility story:

```js
if (detail.invalidated.length > 0) refetchOnly(detail.invalidated);
else if (detail.tools.some((t) => t.side === "server")) refetchEverything();
```

| Server | Client | Result |
| --- | --- | --- |
| old | old | coarse refetch, as today |
| new | old | the `CUSTOM` event is ignored; coarse refetch still fires |
| old | new | `invalidated` is empty; the `else` branch runs |
| new | new | precise, and live during the run |

Nothing negotiates and nothing handshakes, which is what makes this shippable
across repos with independent release cadences.

**Note:** it reaches **the page that started the run**, during the run. There is one
response stream per run and no channel to anybody else's browser.

## Resuming a run

When the server persists run checkpoints (django-ag-ui's `step_store`), a run
that stopped part-way can be **continued** rather than restarted. Point the
component at the run index and a ⭯ button appears in the header:

```html
<ag-ui-chat endpoint="/agent/" data-runs-url="/agent/runs/"></ag-ui-chat>
```

The panel lists runs the server marked **continuable** — those with a saved
snapshot to seed from. A run that never reached a provider-valid boundary has
none, so it isn't offered: resuming it would start from nothing.

A row leads with the run's **first user message**, from the index's `preview`
field, and shows when it started beside it. That is what makes the list a list of
conversations: a time is not an identity, since two runs a minute apart both read
"just now", and a run id is not something a person recognises. Where the server
sends no preview — an older index, or a run that opened on an image with no
caption — the row falls back to the time plus the first eight characters of the
id (full id on hover, for correlating with server logs), and so does a row whose
preview another row repeats: words shared with a second row identify neither, and
one board tends to be asked about more than once. Either way a run that branched
from another is marked, so a fork doesn't read as a duplicate of its parent.

Type the next turn in the composer, then pick a row:

- **Resume** — continue that run.
- **Fork** — branch it, leaving the original untouched.

Both send to the matching server endpoint and stream into the same transcript.

### One URL, three endpoints

`data-runs-url` is the only thing to configure. `resume/<id>/` and `fork/<id>/`
are siblings of the index — django-ag-ui mounts all three under one prefix
whenever a step store is set — so they're derived, and there's no way to end up
with a half-configured set.

### The client contract, handled for you

Those endpoints expect a request carrying a **fresh run id** and **only the new
turn**: the server supplies the prior turns from the snapshot, so re-sending
them would duplicate the conversation.

The component satisfies that structurally rather than by remembering a rule. A
continuation runs on its own short-lived agent, built pointing at the resume
endpoint and seeded with **no** history — so "only the new turn" is the only
thing it *can* send, and the fresh run id comes free because a new agent mints
one. Your main agent's history is never touched.

A resumed run is a normal run in every other respect: frontend tools execute,
approval interrupts render their card, and `headers` are re-read per request so
a rotated CSRF token or JWT still reaches the endpoint.

If the index can't be reached, the panel shows its empty state rather than an
error — a history affordance that fails is empty, not broken.

## File uploads

Set **`data-attachments-url`** (django-ag-ui's `AttachmentsView`) to let the user attach files
to a message. A button, drag-and-drop, and **paste** appear on the composer; each picked file uploads
out-of-band (multipart, with the element's `headers`) and shows a chip in a pending tray —
`uploading` (with a progress bar) → `ready`, or `error` with a retry. On send, the ready files'
**refs** ride on the user bubble as read-only chips and the agent reads their contents
server-side via the `read_attachment` tool. The wire stays vanilla AG-UI: only lightweight refs
(`{ id, name, mime, size }`) travel, never the bytes.

### Pasting

A paste carrying files puts them on the tray, the same way the picker and a drop
do — a screenshot straight from the clipboard, or a file copied in the file
manager.

Two rules keep it from stealing a paste that was never about files. Text pastes
carry no files at all, so ordinary pasting is untouched. And the default is
prevented **only when the clipboard carries no text**: copying a rich selection
that happens to contain an image puts both on the clipboard, and swallowing the
words someone meant to paste in order to attach a picture they did not is the
worse of the two failures.

A pasted blob that arrives with no filename — some engines hand one over that
way — is given one, rather than reaching the server as an empty `filename` and
showing in the tray as a chip with no label.

```html
<ag-ui-chat
  endpoint="/agent/"
  data-attachments-url="/agent/attachments/"
  data-attachment-accept="image/*,application/pdf,text/plain"
  data-attachment-max-bytes="10485760"
></ag-ui-chat>
```

Client-side `accept` / size checks are an instant-feedback nicety — **the server is
authoritative**. Refs persist on the message, so a restored conversation re-renders its chips.
Without the attribute the affordance stays hidden and the chat is text-only.

The built-in handler sends the element's `headers` / `getHeaders` with every upload, and honours
`credentials="include"` — with the caveat that it is an `XMLHttpRequest` (for real progress
events), whose cookie switch is two-state: `include` turns it on, every other value leaves it off.
See [Authenticating requests](#authenticating-requests).

**Swapping the upload transport.** The built-in multipart `POST` is just the default
`uploadHandler`. Set your own to use a different transport — a resumable
[`tus-js-client`](https://github.com/tus/tus-js-client) adapter, direct-to-S3 multipart, etc.
— without touching the tray, the chips, or the AG-UI wire (refs are transport-agnostic). The
handler is `(file, onProgress) => Promise<AttachmentRef>`; when set, the affordance appears
even with no `data-attachments-url`, and your handler owns its own endpoint and headers:

```js
import { Upload } from "tus-js-client";

chat.uploadHandler = (file, onProgress) =>
  new Promise((resolve, reject) => {
    const up = new Upload(file, {
      endpoint: "/tus/",
      headers: chat.headers,
      onProgress: (sent, total) => onProgress(sent / total),
      onError: reject,
      onSuccess: () =>
        resolve({ id: up.url.split("/").pop(), name: file.name, mime: file.type, size: file.size }),
    });
    up.start();
  });
```

The server side is the matching half: the agent reads bytes by ref id, so point the
`read_attachment` store at wherever your transport persisted them (django-ag-ui's
`AttachmentStore` is the seam). The refs themselves never change shape.

---

## Public API surface

Everything below is re-exported from the package root ([`src/index.ts`](src/index.ts)) — the only
re-export point. Internal modules import from leaf paths.

### Element & registration

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiChat` | class | The `<ag-ui-chat>` Custom Element. |
| `defineAgUiChat()` | function | Idempotently register the element. |
| `MessageRole` | type | Role of a rendered chat message. |
| `SubmitDetail` | type | `detail` shape of the submit event. |
| `ToggleDetail` | type | `detail` shape of the `ag-ui-toggle` event (`{ collapsed }`). |
| `UnreadDetail` | type | `detail` shape of the `ag-ui-unread` event (`{ unread }`). |
| `AttachmentsDetail` | type | `detail` shape of the `ag-ui-attachments` event (`{ attachments, pending }`). |
| `StateDetail` | type | `detail` shape of the `ag-ui-state` event (`{ state }`). |

### AG-UI client & agent

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiClient` | class | Orchestration layer over an AG-UI `AbstractAgent`. |
| `AgUiClientConfig` / `AgUiClientHandlers` / `AgUiRunInputs` | type | Client config, lifecycle handlers, per-run input providers. |
| `AgUiToolCall` / `ToolExecution` / `ExecuteTool` | type | Tool-call shape, execution result, executor signature. |
| `ConnectionLostError` | class | Raised (→ `onError`) when a run's stream closes with no terminal AG-UI event. |
| `createHttpAgent(options)` | function | Default agent factory (wraps `HttpAgent`). |
| `AgentFactory` / `HttpAgentOptions` | type | Factory signature and its options. |
| `ResolveInterrupts` | type | Resolver for server-side-tool approval interrupts (one decision per interrupt). |
| `InterruptResponse` | type | One interrupt's answer: `resolved` (with an optional payload) or `cancelled`. |

### Tools & flags

| Export | Kind | Summary |
| --- | --- | --- |
| `ClientToolRegistry` | class | Per-element tool registry. |
| `ClientTool` | type | A frontend tool declaration. |
| `isDestructive(parameters)` | function | Read the `x-destructive` flag. |
| `isNavigates(parameters)` | function | Read the `x-navigates` flag. |
| `createPageActionTools(enabled, resolveTarget)` | function | Build the opt-in `scroll_to` / `drag_and_drop` tools. |
| `PAGE_ACTIONS` | const | The page-action opt-in tokens (`scroll` / `drag`). |
| `createChatSurfaceTools(surface)` | function | Build the opt-in `read_chat_surface` / `move_chat` / `minimise_chat` / `restore_chat` tools, which let the agent move the panel it is speaking from. |
| `ChatSurface` | type | The narrow port those tools drive — `describeSurface` / `moveTo` / `setCollapsed`. The element satisfies it. |
| `ChatSurfaceReport` | type | What `describeSurface()` answers: placement, collapsed, collapsible, movable, draggable, fullBleed, and the panel's box against the viewport it sits in. |
| `ChatCorner` | type | `"top-left"` / `"top-right"` / `"bottom-left"` / `"bottom-right"` — the argument to `moveTo`. |
| `CHAT_CORNERS` | const | Those four, as a list. |
| `isChatCorner(value)` | function | Whether a string names one of them. |
| `ResolvePageTarget` | type | `(target) => HTMLElement \| null` — the page-target resolver. |
| `X_DESTRUCTIVE_KEY` / `X_NAVIGATES_KEY` | const | The JSON-Schema extension keys. |
| `parseToolCatalog(data)` | function | Parse a fetched `data-tools-url` catalog into a `Record<string, ToolCatalogEntry>` — whole entries, not bare summaries, so a caller can reach `description` too. Malformed input yields an empty map rather than throwing. |
| `ToolCatalogEntry` | type | One row of that catalog. |
| `prettifyToolName(name)` | function | Last fallback of the tool-card label chain (`delete_record` reads as *Delete record*). |

### Host seams

| Export | Kind | Summary |
| --- | --- | --- |
| `createRouteTools(...)` | function | Build the built-in `route.*` tools. |
| `Route` / `RouteMap` | type | Navigable-route shapes. |
| `RouteWithParams` | type | A route resolved with `:param` path segments + leftover query params. |
| `createPageMapContext(...)` | function | Build the per-run `page_map` context entry. |
| `PageMap` | type | The compact page-surface shape. |
| `createPageStateTools(binding)` | function | Build `read_<name>` / `set_<name>` tools. |
| `PageState` | type | A page-state binding declaration. |
| `Skill` | type | A launchable prompt (chip / `/`-command). |
| `RunFinishedDetail` / `ToolRun` | type | `ag-ui-run-finished` detail: the tools an interaction ran, and which side ran them. |
| `CustomAgentDetail` | type | `ag-ui-custom` detail: an AG-UI `CUSTOM` event's `name` and `value`, verbatim. |
| `InvalidateDetail` | type | `ag-ui-invalidate` detail: the resource `keys` that moved, and the `reason`. |
| `FeedbackDetail` | type | `ag-ui-feedback` detail: the rated message's `content` and the `rating`. |
| `relativeTime` | function | The built-in locale-neutral timestamp formatter (`"5m ago"`), for a host building on it. |
| `RelativeTimeFormatter` | type | What `formatRelativeTime` takes: an epoch-ms timestamp in, row text out. |
| `renderSuggestionChips` | function | Draw a `suggestions` activity as chips that send themselves; `null` when nothing survives. |
| `suggestionPrompts` | function | The usable prompts in a `suggestions` activity's content, bounded and trimmed. |
| `attachMessageActions` | function | Give a finished bubble its action row (copy, and feedback when a handler is passed). |
| `messageActionBar` | function | The empty action row for a bubble, created if it has none — the shared shell both callers use. |
| `MessageActionsOptions` | type | What `attachMessageActions` takes: `strings`, a `text` source, an optional `html` source for the rich clipboard flavour, an optional `onFeedback`. |
| `ActivityRenderer` | type | Draws one activity from its `content`. Pure: it runs again on every restore. |
| `ActivityRegistration` | type | What `registerActivityRenderer` takes: `type`, `render`, and an optional `removedNotice`. |
| `createStateHookTools(binding)` / `StateHook` | deprecated | The former names for `createPageStateTools` / `PageState`. |

### Durability

| Export | Kind | Summary |
| --- | --- | --- |
| `SessionStorageStore` | class | Default per-tab conversation store. |
| `RemoteConversationStore` | class | Server-backed store over a `data-threads-url` endpoint. |
| `ClientConversationStore` | type | The persistence seam. |
| `ThreadMeta` | type | A thread-drawer row (`{ threadId, title, updatedAt, preview }`). |
| `NavigationCheckpoint` | type | The pre-reload checkpoint marker. |
| `RunIndex` | class | Reads a `data-runs-url` run index and derives its resume / fork endpoints. |
| `RunRow` | type | One run index row (`{ run_id, thread_id, parent_run_id, started_at, continuable, preview? }`). |
| `CheckpointMenu` | class | The *Continue a run* panel. |
| `CheckpointVerb` | type | `"resume" \| "fork"`. |

### Attachments

| Export | Kind | Summary |
| --- | --- | --- |
| `uploadAttachment(file, options)` | function | The built-in upload (multipart, progress) → `AttachmentRef`. |
| `UploadOptions` | type | `{ url, headers?, credentials?, onProgress?, signal? }`. `credentials` is spelled as a fetch mode but carried by `XMLHttpRequest.withCredentials`, so only `"include"` is distinguishable. |
| `UploadHandler` | type | `(file, onProgress, signal?) => Promise<AttachmentRef>` — the `uploadHandler` swap seam (tus / S3). The signal fires when the tray removes a chip or the element is torn down; a handler that honours it aborts its own transport, so a cancelled upload leaves no orphaned file on the server. |
| `AttachmentRef` | type | The durable upload ref (`{ id, name, mime, size, url? }`). |
| `messageAttachments(message)` | function | Read the refs a restored user message carries. |

### Voice input

| Export | Kind | Summary |
| --- | --- | --- |
| `transcribeAudio(audio, options)` | function | The built-in transcription POST (multipart) → the transcript text. |
| `TranscribeOptions` | type | `{ url, headers?, credentials? }` — `credentials` as fetch's own cookie mode. |
| `TranscribeHandler` | type | `(audio) => Promise<string>` — the `transcribeHandler` swap seam (Web Speech, direct-to-provider). |

### UI & DOM primitives

| Export | Kind | Summary |
| --- | --- | --- |
| `ToolCallCard` | class | A live tool-call card for the transcript. |
| `ToolCallStatus` / `SettledStatus` / `ToolDisplayMode` | type | Card lifecycle states + display mode. |
| `ToolPayloadFormatter` | type | Draws one region of a card's body (`AgUiChat.formatToolPayload`); `null` falls through to the built-in pretty-print. |
| `ToolPayload` | type | The region being drawn: `arguments` (the parsed record) or `result` (the raw string and its outcome). |
| `ToolCallCardOptions` | type | Per-card wiring beyond name / args / label / strings — currently `formatPayload`. |
| `requestConfirmation(host, request, options?)` | function | Append the inline confirmation card to the transcript. |
| `ConfirmationRequest` | type | What the card displays. |
| `ConfirmationOptions` | type | `{ signal?, strings?, onAlwaysAllow? }` — abort resolves the card as declined; `strings` localizes it; passing `onAlwaysAllow` is what adds the third button. |
| `UiStrings` | type | The flat table of every user-facing string. |
| `DEFAULT_UI_STRINGS` | const | The English defaults (the override floor). |
| `mergeUiStrings(overrides)` | function | Merge a partial override over the defaults. |
| `renderMarkdown(text, options?)` | function | Render sanitized markdown/HTML (marked + DOMPurify). |
| `RenderMarkdownOptions` | type | `{ allowImages? }` — opt `<img>` back into the sanitized output. |
| `requestApproval(host, request, options?)` | function | Append the inline approval card that gates a server-side tool. |
| `ApprovalRequest` | type | What that card displays (`{ message?, toolName?, args? }`). |
| `ApprovalOptions` | type | `{ signal?, strings?, onEdit? }` — abort resolves the card as denied; `strings` localizes it; passing `onEdit` offers the call's arguments for editing and is called only when they actually changed. |
| `ApprovalRenderer` | type | Replace the built-in approval card outright (`AgUiChat.approvalRenderer`). |
| `requestQuestion(host, request, options?)` | function | Append the inline `ask_user` card (radios and/or free text). |
| `QuestionRequest` | type | What that card asks. |
| `QuestionOptions` | type | `{ signal?, strings? }` — abort resolves it with an empty answer. |
| `QuestionRenderer` | type | Replace the built-in question card outright (`AgUiChat.askUserRenderer`). |
| `renderChart(spec)` | function | Draw one spec as a self-contained block, or `null` when it says nothing. |
| `chartSpecFrom(value)` | function | Read an arbitrary payload into a `ChartSpec`, or `null` if it cannot be drawn honestly. |
| `ChartSpec` / `ChartSeries` / `ChartKind` | type | A chart as data, one named series, and how it is drawn. |
| `attachQuoteOffer(options)` | function | The page-side select-then-quote offer, with its guards. `AgUiChat.offerQuoteInPage()` is the one-line form. |
| `PageQuoteOffer` / `PageQuoteOfferOptions` | type | The live offer (`{ element, detach }`) and what it takes. |
| `quotableSelection(container, roots, near?)` | function | The current selection when it lies inside `container`, read through the shadow-aware API where the engine has one. `near` is where the gesture ended, used to pick the line the offer hangs from. |
| `QuotableSelection` | type | `{ text, rect }` — what was selected, and where it sits. |
| `asQuote(text)` | function | Shape text as a markdown blockquote with a blank line after it. |
| `MAX_QUOTE_CHARS` | const | The cap a quotation is truncated to (500). |
| `typeInto` / `highlightThenClick` / `pressThenClick` / `selectOption` / `toggleControl` / `scrollIntoCenterView` / `flash` / `focusWithFlash` / `prefersReducedMotion` | function | Animation primitives. |
| `showHighlightOverlay` | function | Ring a host-page element from an overlay drawn outside it, optionally dimming everything else or flowing a gradient round it. Returns a function that removes it. |
| `HighlightOverlayOptions` | type | Options for `showHighlightOverlay`. |
| `fillField` / `clickElement` / `pressButton` / `selectControl` / `setControlValue` / `toggleCheckbox` | function | DOM-driver primitives. |
| `setNativeValue` / `setNativeChecked` | function | Set a control via its native prototype setter (React-controlled inputs). |
| `TypeOptions` / `HighlightClickOptions` / `PressOptions` / `SelectOptions` / `ToggleOptions` / `FlashOptions` / `ScrollOptions` / `FillFieldOptions` / `TextLikeElement` | type | Primitive option shapes. |

### Constants

| Export | Summary |
| --- | --- |
| `ELEMENT_TAG` | The registered tag name (`ag-ui-chat`). |
| `SUBMIT_EVENT` | The submit CustomEvent name. |
| `TOGGLE_EVENT` | The collapse-toggle CustomEvent name (`ag-ui-toggle`). |
| `UNREAD_EVENT` | The unread-count CustomEvent name (`ag-ui-unread`). |
| `RUN_FINISHED_EVENT` | The interaction-finished CustomEvent name (`ag-ui-run-finished`). |
| `CUSTOM_AGENT_EVENT` | The agent-`CUSTOM` CustomEvent name (`ag-ui-custom`). |
| `INVALIDATE_EVENT` | The resource-invalidation CustomEvent name (`ag-ui-invalidate`). |
| `FEEDBACK_EVENT` | The message-rating CustomEvent name (`ag-ui-feedback`). |
| `SUGGESTIONS_ACTIVITY_TYPE` | The `activity_type` carrying follow-up prompts (`suggestions`). |
| `MAX_SUGGESTIONS` | Most prompts one push draws (4). Mirrors the server's cap. |
| `MAX_SUGGESTION_CHARS` | Longest one prompt may be (120). Mirrors the server's cap. |
| `INVALIDATE_CUSTOM_NAME` | The AG-UI `CUSTOM` `name` that carries one (`ag_ui.invalidate`). |
| `ATTACHMENT_EVENT` | The attachments-changed CustomEvent name (`ag-ui-attachments`). |
| `STATE_EVENT` | The shared-state CustomEvent name (`ag-ui-state`). |
| `CHART_ACTIVITY_TYPE` | The `ACTIVITY_SNAPSHOT` type a server sets to push a chart. |
| `CHART_TOOL_NAME` | The name the built-in chart tool registers under (`render_chart`). |
| `COMPACTION_ACTIVITY_TYPE` | The `ACTIVITY_SNAPSHOT` type reporting a trimmed history. |
| `LOAD_CAPABILITY_TOOL` | The agent-side capability-loading tool's name. |
| `MESSAGE_ROLE` | Message role constants. |
| `MESSAGE_ACTIONS` | The message-action tokens `data-message-actions` selects by (`copy` / `retry` / `feedback`). |
| `TOOL_CALL_STATUS` | Tool-call card status constants. |
| `TOOL_DISPLAY` | Tool-call display-mode constants (`inline` / `minimal` / `compact` / `full`). |
| `X_CONFIRM_KEY` | Confirmation-prompt key: on a tool's JSON Schema for a client-side confirmation, and in an AG-UI interrupt's `metadata` for a server-side approval. |
| `X_SUMMARY_KEY` | JSON-Schema key carrying a short tool-card label. |
| `MAX_TOOL_ROUNDS` | Upper bound on tool-call → re-run rounds per send. |
| `VERSION` | The package version string. |

---

## Theming, density, and placement

The chat shell is styled inside its Shadow DOM and exposes a large set of `--ag-ui-*` CSS custom
properties (colors, status, surface, spacing, layout), so you theme it from outside without
piercing the shadow boundary. Set them anywhere above the element and they inherit in — on the
element itself, on a wrapper, or on `:root` for a whole page. The closest declaration wins, the
way any inherited CSS property behaves:

```css
/* All three work. The most specific one that applies wins. */
:root      { --ag-ui-accent: #4f46e5; }  /* whole page */
.chat-dock { --ag-ui-accent: #0f766e; }  /* one region */
ag-ui-chat { --ag-ui-accent: #b91c1c; }  /* one widget */
```

> Until 0.20.x the defaults were declared on `:host`, which set them *on the element* — and an
> element's own value beats anything inherited from an ancestor, so only the `ag-ui-chat { … }`
> form did anything and the wrapper form silently did nothing. The defaults now sit behind an
> internal alias, so all three forms work.

A few of the knobs:

```css
ag-ui-chat {
  --ag-ui-accent: #4f46e5;
  --ag-ui-bg: #ffffff;
  --ag-ui-fg: #1a1a2e;
  --ag-ui-radius: 12px;
  --ag-ui-header-btn-size: 30px;  /* the header's controls; 44px on touch */
  --ag-ui-header-gap: 4px;

  /* What is drawn on top of the accent and danger fills. Change these with
     the fills: a pale accent leaves white-on-pale everywhere they are used. */
  --ag-ui-on-accent: #ffffff;
  --ag-ui-on-danger: #ffffff;

  /* Layout */
  --ag-ui-width: 380px;
  --ag-ui-height: 560px;
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
}
```

### Small viewports

At **600px wide and below** every placement but `embedded` becomes one full-bleed
shape: edge to edge, no radius, no shadow, no resize grips. A phone is not an
eighth placement — it is an override that collapses the others onto one of them.
The host picked a placement for the desktop it was designing, and a 380x560
panel with a 24px margin is not a smaller version of that decision, it is most
of the screen with a frame drawn round it.

`embedded` is left alone deliberately: it sits in a box you sized and placed, and
only you know whether that column should become the whole screen.

The corner placements still rest at their launcher, so a full-bleed panel is
something the user opens rather than something they are given.

### The conversation list on a full page

On `placement="page"`, once the panel is at least **900px** wide, the chat-history
list **docks beside the transcript** instead of covering it — no backdrop, no
focus trap, and `role="region"` rather than a modal dialog. Covering the
conversation to show the list of conversations hides the thing you are trying to
get back to, and a dedicated route is the one surface with width to spare.

Narrower than that, or under any other placement, it stays the slide-over it was:
a few hundred pixels of panel with a list docked into it leaves a column of
transcript narrower than the messages in it. Width alone is not the test — an app
shell can hand `embedded` a page-sized box, and that box is still a column of
somebody's layout.

`--ag-ui-threads-rail-width` sets the docked width (default 280px). While it is
docked the host carries `data-threads-docked`, so your own CSS can react.

The list also grows a filter once there are eight or more conversations in it
— above that a search box is worth having, below it it is a control asking to be
used on a list you can already read in one glance. It matches the title **and**
the preview, because the title is often the model's one-line summary and the
phrase you remember is as likely to be inside the conversation as on it, and it
filters what the drawer already holds rather than going back to the server for a
list that is already in memory.

**To keep your desktop layout at every width**, set `data-small-viewport="off"`.
That exists because the *trigger* is the one part of this you cannot reach: every
value the override sets is a `--ag-ui-*` token you can re-state, but a media
query cannot read a custom property, so the breakpoint itself is a literal.

The breakpoint is a width rather than a pointer test, and that is on purpose: a
touch laptop is coarse-pointered and wide, a narrow desktop window is
fine-pointered and small. Width decides the layout; the pointer decides which
controls make sense.

### Reserving the space your own chrome occupies

A fixed placement covers the viewport it is given, and it does not know about
your sticky header. Tell it which edges are already spent and every placement
does its own arithmetic:

```css
ag-ui-chat {
  --ag-ui-viewport-inset-top: 64px;    /* your nav bar */
}
```

`page` and `full` inset by all four edges; `sidebar` and `side` by three, leaving
the docked edge free; `floating` adds them to its own margins.
**The heights follow on their own** — that is the point of these rather than
restating `--ag-ui-inset` per placement, which leaves you to keep
`--ag-ui-height` and `--ag-ui-max-height` in step by hand and overflows the panel
off the bottom of the screen the one time you forget.

Four longhands rather than one shorthand because a custom property is a token
stream and CSS cannot index one; the height arithmetic needs the vertical pair on
its own. Any CSS length works — `px`, `rem`, `env(safe-area-inset-*)`, or a
`calc()` combining them; the widget reads the resolved value rather than the text
you wrote, so the number it clamps against is the one the stylesheet uses:

```css
ag-ui-chat {
  --ag-ui-viewport-inset-top: env(safe-area-inset-top);
  --ag-ui-viewport-inset-bottom: env(safe-area-inset-bottom);
}
```

If your chrome changes height — a bar that wraps at narrow widths — measure it
and publish the value, since no CSS length tracks it:

```js
new ResizeObserver(() => {
  document.documentElement.style.setProperty("--bar-h", `${bar.offsetHeight}px`);
}).observe(bar);
```

```css
ag-ui-chat { --ag-ui-viewport-inset-top: var(--bar-h, 0px); }
```

`--ag-ui-edge-gutter` (default `24px`) is the gap a resting `floating` panel
keeps between itself and that box. The size cap subtracts the same one, so a
panel grown to its limit reaches the far edge of the usable box and no further —
set it to `0` for a panel flush against the corner.

`--ag-ui-keyboard-inset` overrides the lift an on-screen keyboard earns. The
widget measures the hidden band and publishes it as
`--ag-ui-visual-viewport-inset-bottom`; state this one instead to outrank that
measurement, or set it to `0px` to opt out of the lift entirely.

`--ag-ui-viewport-height` and `--ag-ui-viewport-width` state the usable box
outright, for the case where no viewport-percentage length describes it. An
on-screen keyboard is the one that matters: it changes neither `vh` nor `dvh` nor
`svh` on any current mobile browser, so a full-bleed panel has to be told the
visual viewport's height rather than deriving it.

Marks are variables too, so one vocabulary covers a re-theme rather than
leaving half the transcript in the built-in set: `--ag-ui-tool-icon-done` /
`-error` / `-declined` for tool status, and `--ag-ui-disclosure-collapsed` /
`--ag-ui-disclosure-expanded` for every expandable row.

```css
ag-ui-chat {
  --ag-ui-disclosure-collapsed: "+";
  --ag-ui-disclosure-expanded: "-";
}
```

### Where to put the variables

There is one vocabulary — the `--ag-ui-*` names above — and it works from any ancestor. What
differs is only *which* declaration wins, and that is ordinary CSS inheritance:

```css
/* A whole page or design-system scope. */
:root { --ag-ui-accent: var(--brand-600); --ag-ui-radius: 4px; }

/* One region — the widget picks this up through the wrapper. */
aside.support-dock { --ag-ui-accent: #0f766e; }

/* One widget. Beats both of the above, because it targets the element. */
ag-ui-chat#support { --ag-ui-accent: #b91c1c; }

/* Set at runtime with el.style.setProperty(...) — an inline style beats all of the above. */
```

Two that do not work:

```css
/* ::part() reaches structural elements, not variables — a custom property set
   here applies to that part's own subtree, not to the whole shell. */
ag-ui-chat::part(panel) { --ag-ui-accent: #b91c1c; }

/* The internal --_* aliases are private and unversioned; they are renamed
   without notice. Always set the public --ag-ui-* name. */
ag-ui-chat { --_accent: #b91c1c; }
```

The preset attributes below sit *underneath* anything you declare: a `theme="dark"` widget still
honours an explicit `--ag-ui-bg` from your CSS, so you can adopt a preset and correct one token
rather than re-declaring the whole palette.

`--ag-ui-accent` reaches further than the widget: it also colours the rings the DOM driver draws
on **your** page. Each primitive reads it from the computed style of the element it is about to
touch, so setting it on `:root` (or on any ancestor of the elements the agent drives) themes the
highlights too. Without it they fall back to the package indigo.

For the common cases there are three CSS-reactive **preset attributes** (no JS API), so you don't
have to hand-tune the variables:

- `theme` — `light` (default) / `dark` / `auto` (follow the OS) / `code`.
- `density` — `comfortable` (default) / `compact`.
- `placement` — `floating` (default) / `sidebar` / `page` / `embedded`. `embedded` drops the
  fixed positioning and z-index so the widget sits in normal document flow; `page` is a
  full-screen [centred reading column](#page-placement) for a route of its own.

  Four, because those are the four shapes that differ structurally: a corner panel, a docked
  rail, a surface that owns the screen, and a thing in your layout. Three older values --
  `bottom-left`, `side` and `full` -- still parse and still work, and are no longer documented:
  each is a variant of one of the four rather than a shape of its own. `full` is `page` with
  `--ag-ui-content-max-width: none`, `bottom-left` is `floating` with a different
  `--ag-ui-inset`, and `side` is `sidebar` that collapses to the floating launcher instead of
  an edge rail. Nothing warns and nothing breaks; there is simply less to choose between.

**`embedded` fills the box your page gives it, so give it one.** It is the placement app-shell
layouts reach for, and a grid or flex item defaults to `min-height: auto` — which lets a growing
transcript push the composer off the bottom of the window instead of scrolling inside the panel. The
fix belongs to the containing element, not to the widget:

```css
.assistant-pane { min-height: 0; overflow: hidden; }   /* the box the element is given */
```

```html
<ag-ui-chat endpoint="/agent/" theme="dark" density="compact" placement="sidebar"></ag-ui-chat>
```

See [`src/ui/styles.ts`](src/ui/styles.ts) for the full variable + preset list. The
[`demo/`](demo/) live playground (`node demo/mock-server.mjs`) flips theme, density, placement,
text-animation, tool-display, and the answer well live from a single page, and demos the
streamed thoughts region, the mic, and the header theme toggle.

It binds every interface and prints the addresses this machine can be reached on, so you can open the playground on a phone — which is the only way to see the small-viewport layout with a real on-screen keyboard rather than a resized desktop window. `HOST=127.0.0.1` keeps it to this machine.

### Parts and slots

For styling beyond the `--ag-ui-*` variables, every structural element exposes a `part` so you can
reach it from outside the Shadow DOM with `::part()` — no shadow piercing. The part names are
**public API** (additions are non-breaking; renames are breaking):

```css
ag-ui-chat::part(panel)   { border-radius: 0; }
ag-ui-chat::part(header)  { background: #111; }
ag-ui-chat::part(send)    { text-transform: uppercase; }
ag-ui-chat::part(tool-card) { font-family: var(--my-mono); }
```

Every part, by the feature it belongs to. Spelled out rather than abbreviated: the list used to
read `tool-card` *plus* `-icon` / `-name`, which is compact and is also how an entire feature went
missing from it for two releases. A test reads this table and compares it with the parts the
component sets, so a new one cannot ship undocumented.

| Feature | Parts |
| --- | --- |
| Shell | `panel`, `header`, `title`, `icon`, `header-controls`, `messages`, `empty`, `pending`, `stopped`, `jump-latest`, and one per resize grip: `resize-handle` plus `resize-handle-top`, `resize-handle-bottom`, `resize-handle-left`, `resize-handle-right`, `resize-handle-top-left`, `resize-handle-top-right`, `resize-handle-bottom-left`, `resize-handle-bottom-right` |
| Header buttons | `header-button` on each, plus `history-button`, `checkpoints-button`, `new-button`, `collapse-button`, `theme-toggle` |
| Collapsed widget | `launcher`, `launcher-icon`, `launcher-badge`, `rail-label` |
| Answers | `answer` (the per-turn group), `message` (plus `message-user`, `message-assistant`), `code-copy` |
| Reasoning | `thoughts`, `thoughts-toggle`, `thoughts-body`, `thoughts-label` |
| Follow-up suggestions | `suggestions`, `suggestion-chip` |
| Message actions | `message-actions`, `message-action` (plus `message-action-retry`, `message-action-copy`, `message-action-up`, `message-action-down`), and the icon holder inside each: `message-action-icon` (plus `message-action-icon-retry`, `message-action-icon-copy`, `message-action-icon-up`, `message-action-icon-down`) |
| Queued messages | `queued`, `queued-chip` |
| Run notices | `run-notice` (plus `run-notice-interrupted`, `run-notice-attachment-pending`, `run-notice-compaction`, `run-notice-skill`, `run-notice-history-replaced`, `run-notice-chart-undrawable`, `run-notice-surface`), `run-notice-icon`, `run-notice-text`, `run-notice-undo` |
| Tool cards | `tool-card`, `tool-card-head`, `tool-card-icon`, `tool-card-name`, `tool-card-status`, `tool-card-decision`, `tool-card-toggle`, `tool-card-body`, `tool-card-section` (plus `tool-card-args-section`, `tool-card-result-section`), `tool-card-section-label` (plus `tool-card-args-label`, `tool-card-result-label`), `tool-card-args`, `tool-card-result`, `tool-card-approval`, `tool-card-subagent` |
| Delegated sub-agents | `subagent`, `subagent-row`, `subagent-icon`, `subagent-status`, `subagent-steps`, `subagent-step`, `subagent-step-icon`, `subagent-step-name` |
| Client-side confirmation | `confirm`, `confirm-body`, `confirm-args`, `confirm-actions`, `confirm-button` (plus `confirm-confirm`, `confirm-cancel`, `confirm-always`) |
| Server-side approval | `approval`, `approval-body`, `approval-actions`, `approval-button` (plus `approval-approve`, `approval-deny`), `approval-edit`, `approval-args`, `approval-error` |
| Typed question | `question`, `question-body`, `question-options`, `question-choice`, `question-choice-text`, `question-radio`, `question-input`, `question-actions`, `question-button` |
| Composer | `composer`, `composer-surface`, `composer-tools`, `input`, `send`, `attach-button`, `voice-button` |
| Attachments | `attachment-tray`, `attachment-chips` (the read-only chips on sent bubbles), and the shared chip parts `attachment-chip`, `attachment-chip-icon`, `attachment-chip-name`, `attachment-chip-size`, `attachment-chip-bar`, `attachment-chip-bar-fill`, `attachment-chip-retry`, `attachment-chip-remove` |
| Skills | `skill-chips`, `skill-chip`, `skill-palette`, `skill-item`, `skill-item-title`, `skill-item-desc`, `skill-item-token`, `skill-hint` (the missing-placeholder hint) |
| Thread drawer | `drawer`, `drawer-backdrop`, `drawer-panel`, `drawer-header`, `drawer-title`, `drawer-new`, `drawer-close`, `drawer-filter`, `drawer-list`, `drawer-empty`, `drawer-row`, `drawer-row-select`, `drawer-row-title`, `drawer-row-time`, `drawer-row-preview`, `drawer-row-actions`, `drawer-row-rename`, `drawer-row-delete`, `drawer-rename-input`, `drawer-confirm`, `drawer-confirm-label`, `drawer-confirm-yes`, `drawer-confirm-no` |
| Charts | `chart-block`, `chart-title`, `chart-legend` |
| Checkpoints panel | `checkpoints`, `checkpoints-header`, `checkpoints-title`, `checkpoints-list`, `checkpoints-empty`, `checkpoint-row`, `checkpoint-label`, `checkpoint-time`, `checkpoint-id`, `checkpoint-branch`, `checkpoint-action` (plus `checkpoint-resume`, `checkpoint-fork`) |

> **Hiding `::part(header)` hides the controls inside it.** The history, checkpoints, new-chat,
> theme and collapse buttons are all children of the header, so a host that renders its own title
> bar and does `ag-ui-chat::part(header) { display: none }` loses thread switching entirely. Every
> one of them has an imperative equivalent, so your own chrome can drive them:
>
> | Control | Method |
> | --- | --- |
> | History drawer | `chat.openThreads()` |
> | Checkpoints panel | `chat.openCheckpoints()` |
> | New chat | `chat.newChat()` |
> | Collapse | `chat.toggleCollapsed()` / `chat.setCollapsed(bool)` |
> | Theme toggle | `chat.toggleTheme()` |
>
> ```js
> myHeaderButton.onclick = () => chat.openThreads();
> ```
>
> The built-in buttons call exactly these methods, so the two routes cannot drift. If you only want
> to restyle the header, prefer `::part(header)` styling or the `header-actions` slot over hiding it.

Coarse **slots** let you replace whole regions with your own markup (project light-DOM children
with a matching `slot=`):

| Slot | Where |
| --- | --- |
| `icon` | A header brand icon, before the title. |
| `header-actions` | Extra controls between the title and the built-in buttons. |
| `empty` | The empty-state shown before any message. |
| `footer` | Below the composer. |
| `launcher` | The collapsed widget's mark — the floating launcher, or the sidebar rail. |
| `icon-send` / `icon-stop` | The composer button's two glyphs (idle and mid-run). |
| `icon-attach` / `icon-voice` | The paperclip and mic glyphs. |
| `icon-history` / `icon-checkpoints` / `icon-new` / `icon-collapse` | The header controls' glyphs. |

```html
<ag-ui-chat endpoint="/agent/">
  <img slot="icon" src="/logo.svg" alt="" />
  <button slot="header-actions" onclick="openHelp()">?</button>
</ag-ui-chat>
```

### Header and launcher icon

Give the header a brand icon with either the `icon` slot (any markup) or the `data-icon-url`
convenience attribute (an `<img>`); the slot wins when both are set, and with neither the header
stays icon-less. The same icon seam feeds the collapsed sidebar rail. Size it via
`--ag-ui-icon-size` (default `22px`) and round it with `--ag-ui-icon-radius` (default `4px`).

```html
<ag-ui-chat endpoint="/agent/" data-icon-url="/logo.png"></ag-ui-chat>
```

### Sidebar placement

`placement="sidebar"` is a full-height **docked** panel that slides open/closed and collapses to a
slim **icon rail** rather than the [floating launcher](#collapsing-to-the-launcher) — the same
element, shaped by the placement. It docks right by default; `data-side="left"` docks it left. The
panel slides out through the edge it docks against. Collapse state reuses the `collapsed` attribute
(persisted per-tab), and the rail carries `aria-expanded`. The slide honours
`prefers-reduced-motion`.

```html
<ag-ui-chat endpoint="/agent/" placement="sidebar" data-side="left"></ag-ui-chat>
```

It overlays the page by default (no host-layout coupling). To make the host content reflow around
it instead, set `--ag-ui-position: static` and place the element in your own grid/flex layout.

### Page placement

`placement="page"` turns the widget into a full-screen chat **page**: a full-bleed background with
the conversation in a centred reading column (default ~820px, set via `--ag-ui-content-max-width`).
The assistant turn spans the column width while the user message stays a right-aligned pill. Unlike
`full` (edge-to-edge, left-aligned), it's the layout you want for a dedicated `/chat` route. Pairs
naturally with the [answer well](#the-answer-well).

```html
<ag-ui-chat endpoint="/agent/" placement="page" data-answer-well></ag-ui-chat>
```

### The answer well

Each assistant turn renders inside one `.answer` group (part `answer`) that holds its streamed
text, tool cards, and pending indicator — so a turn that calls tools reads as a single answer
rather than a string of loose siblings. Add the boolean `data-answer-well` attribute to box that
group in a bordered, padded "well"; without it the layout is the flat stack as before. The well is
pure CSS and turn-scoped — no JS API — and themeable via `--ag-ui-well-bg` / `--ag-ui-well-border`
(and `::part(answer)`).

```html
<ag-ui-chat endpoint="/agent/" data-answer-well></ag-ui-chat>
```

### Model reasoning (thoughts)

When a reasoning model streams its chain-of-thought (django-ag-ui forwards it as AG-UI reasoning
events — enable a thinking budget via `MODEL_SETTINGS`, see its docs), the element renders a muted,
collapsible **thoughts region** (part `thoughts`) at the top of the current answer group. It opens
while the model reasons and folds away on the answer's first token; the reader can reopen it. The
web component handles the `REASONING_*` event family (and the deprecated `THINKING_*`, which
`@ag-ui/client` maps onto it), so no client config is needed — the thoughts appear whenever the
server forwards reasoning.

### The composer

The composer is one bordered surface (part `composer-surface`) that owns the border and the focus
ring: the field sits on top and grows with what is typed until it hits its ceiling and scrolls,
and a tool row (part `composer-tools`) sits underneath with the paperclip and mic as quiet icon
buttons on the left and a circular **Send** on the right. Send is icon-only — its accessible name
still comes from the `send` / `stop` [strings](#internationalization-i18n) — and it becomes the
Stop control mid-run by swapping its glyph, so nothing moves when a run starts.

```css
ag-ui-chat {
  --ag-ui-composer-radius: 14px;
  --ag-ui-composer-max-height: 40vh;  /* where the growing field starts scrolling */
  --ag-ui-tool-btn-size: 30px;        /* the paperclip / mic hit targets */
  --ag-ui-send-size: 30px;            /* the send circle */
  --ag-ui-glyph-size: 18px;
  --ag-ui-glyph-stroke: 1.75;
}
```

Every glyph is a slot with the built-in mark as its fallback (`icon-send`, `icon-stop`,
`icon-attach`, `icon-voice`), so projecting your own icon set never means restyling a character.

### Motion

One duration and two curves drive every collapse, expand and slide-over, so the whole widget
settles as one thing:

```css
ag-ui-chat {
  --ag-ui-motion: 0.28s;
  --ag-ui-ease: cubic-bezier(0.32, 0.72, 0, 1);      /* the settle */
  --ag-ui-ease-pop: cubic-bezier(0.34, 1.36, 0.64, 1); /* the arrival, with overshoot */
}
```

Under `prefers-reduced-motion: reduce` the duration collapses to a single frame: states still
change, nothing travels. Set `--ag-ui-motion: 0s` to switch the animation off outright.

### Voice input

Set `data-transcribe-url` (django-ag-ui's `TranscribeView`) to reveal a mic button in the
composer (part `voice-button`). Click it to record via `MediaRecorder`, click again to stop — the
clip is POSTed to the endpoint and the returned transcript is dropped into the textarea. Swap the
transport with a custom `transcribeHandler` — `(audio: Blob) => Promise<string>` — to use a
different STT endpoint or a browser Web Speech adapter without touching the button; when set, the
mic appears even with no `data-transcribe-url`.

```html
<ag-ui-chat endpoint="/agent/" data-transcribe-url="/agent/transcribe/"></ag-ui-chat>
```

### Theme toggle

`theme` is a plain attribute you can set yourself, and a host can always drop its own switch into
`slot="header-actions"`. For convenience, the boolean `data-theme-toggle` attribute adds a built-in
light⇄dark toggle to the header (part `theme-toggle`) that flips `theme` and persists the choice
per tab. Off by default so it never competes with a host-supplied control.

```html
<ag-ui-chat endpoint="/agent/" data-theme-toggle></ag-ui-chat>
```

---

## Internationalization (i18n)

Every user-facing string — labels, placeholders, `aria-label`s, and `title` tooltips — is read
from a flat `UiStrings` table, so a non-English host can translate the widget without forking it.
Override any subset; the rest fall back to the English defaults. Two equivalent seams:

```js
// As a property (merged over the defaults):
chat.strings = { send: "Senden", inputPlaceholder: "Frag mich…", stop: "Stopp" };
```

```html
<!-- Or inline, as JSON (the property wins key-by-key when both are set): -->
<ag-ui-chat endpoint="/agent/" data-strings='{"send": "Senden", "inputPlaceholder": "Frag mich…"}'></ag-ui-chat>
```

Set `strings` / `data-strings` **before** the element connects (they resolve on mount). A few keys
are templates carrying `{token}` placeholders the widget fills in — e.g. `minutesAgo`
(`"{n}m ago"`), `confirmRun` (`"Run “{tool}”?"`), `tooLarge` (`"Too large (max {size})"`). Keep the
token verbatim when translating. The full key list and English defaults live in
[`src/ui/ui_strings.ts`](src/ui/ui_strings.ts) (exported as `DEFAULT_UI_STRINGS`); `mergeUiStrings`
is exported too if you want to compute a complete table yourself.

---

## Building the bundle

The build is driven by [esbuild](esbuild.config.mjs) plus `tsc` for type declarations:

```bash
make build      # node esbuild.config.mjs && tsc -p tsconfig.build.json
```

This produces, into `dist/`:

- `index.js` — the ESM library build; `@ag-ui/*` are left **external** so npm consumers dedupe
  them.
- `ag-ui-web-component.bundle.js` — the **vendored** ESM bundle, every dependency inlined and
  minified, suitable for direct `<script type="module">` embedding.
- `index.d.ts` (+ source maps) — type declarations; emitted `.js` import specifiers are preserved
  so consumers resolve types without extra flags.

There is **no CSS file to load**. The styles are a template literal injected into
the shadow root at construction, so they ship inside the JS and cannot leak into
the host page. Restyle through the [CSS custom properties](#theming-density-and-placement) and the
`part` attributes, not a stylesheet override.

Other workflow targets (all identical in name to the sibling Python packages):

| Target | What it does |
| --- | --- |
| `make test` | Vitest with a 100% line + branch + function + statement coverage gate. |
| `make lint` | `biome check .` + `tsc --noEmit`. |
| `make format` | `biome format --write .`. |
| `make demo` | Build, then serve the live playground (`demo/themes/index.html`) on port 5173 via `demo/mock-server.mjs`. |

---

## Compatibility

| Component | Floor | Tested |
| --- | --- | --- |
| Node (tooling/tests only) | 22 | 22, 24 |
| Browsers (runtime target) | ES2022 / evergreen | Chrome / Firefox / Safari 17+ |
| `@ag-ui/client` | latest 0.x | — |

The shipped artefact targets evergreen browsers (Shadow DOM, Custom Elements v1, ES2022). Node is
only the build/test runtime, not a runtime target.

---

## License

[MIT](LICENSE) © Artur Veres
