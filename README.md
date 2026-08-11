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
- [Markdown rendering](#markdown-rendering)
- [Run notices: compaction and agent skills](#run-notices-compaction-and-agent-skills)
- [Skills: prompt chips and slash palette](#skills-prompt-chips-and-slash-palette)
- [MPA durability: surviving full page reloads](#mpa-durability-surviving-full-page-reloads)
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
| `title-text` | — | Header label; defaults to `"Assistant"`. The only **observed** attribute (live-updates the header). |
| `data-tool-display` | `toolDisplay` | Tool-call card detail: `inline` / `minimal` / `compact` / `full` (default `full`). |
| `data-text-animation` | — | Incoming-text reveal: `none` (default) / `fade` / `word`. |
| `data-prompt-chips` | — | Present (bare, or any value but `"false"`) to surface skills as chips. |
| `data-slash-commands` | — | Present (bare, or any value but `"false"`) to enable the `/`-command palette. |
| `data-skills` | — | Inline JSON skill catalog. |
| `data-skills-url` | — | URL of a JSON skill catalog (fetched with the element's headers and cookie policy). |
| `data-tools-url` | — | URL of a server tool-label catalog (`[{ name, summary, description? }]`), fetched with the element's headers and cookie policy; labels tool-call cards for server-side tools. |
| `data-threads-url` | — | URL of a server thread index (django-ag-ui's `ThreadsView`); enables durable, cross-device chat history. |
| `data-runs-url` | — | URL of a server run index (django-ag-ui's `RunsView`); reveals the header's ⭯ *Continue a run* panel. See [Resuming a run](#resuming-a-run). |
| `data-attachments-url` | — | URL of the file-upload endpoint (django-ag-ui's `AttachmentsView`); reveals the composer's paperclip picker + drag-and-drop. |
| `data-attachment-accept` | — | `<input accept>` list for client-side type filtering (e.g. `image/*,.pdf`). The server stays authoritative. |
| `data-attachment-max-bytes` | — | Client-side upload size cap in bytes (default 10 MiB; `0` disables). The server stays authoritative. |
| `data-transcribe-url` | — | URL of the voice-transcription endpoint (django-ag-ui's `TranscribeView`); reveals the composer's mic button. See [Voice input](#voice-input). |
| `data-theme-toggle` | — | Boolean: show a built-in header light⇄dark toggle (persists per tab). Off by default. See [Theme toggle](#theme-toggle). |
| `data-strings` | `strings` | Partial JSON override of the UI string table (localization). The property wins key-by-key over the attribute; see [Internationalization](#internationalization-i18n). |
| `data-icon-url` | — | Header (and launcher) icon image URL. A slotted `slot="icon"` wins; see [Header & launcher icon](#header-and-launcher-icon). |
| `data-launcher-icon-url` | — | Icon image URL for the collapsed launcher only, when it should differ from the header's. Falls back to `data-icon-url`; a slotted `slot="launcher"` wins over both. |
| `data-unread-badge` | — | **On by default.** `="false"` hides the launcher's unread badge; the count and the `ag-ui-unread` event keep running. See [Collapsing to the launcher](#collapsing-to-the-launcher). |

Each header control also takes its own icon slot — `icon-history`, `icon-checkpoints`,
`icon-new`, `icon-collapse` — with the built-in glyph as the fallback, so a host can project a
brand `<img>` or `<svg>` rather than only restyling the character. The composer's glyphs work the
same way: `icon-send`, `icon-stop`, `icon-attach`, `icon-voice`.

```html
<ag-ui-chat endpoint="/agent/">
  <svg slot="icon-new" width="16" height="16"><!-- ... --></svg>
</ag-ui-chat>
```
| `data-page-actions` | — | Opt-in built-in page-action tools: a comma list of `scroll` / `drag` (e.g. `"scroll,drag"`). See [Page-action tools](#page-action-tools). |
| `data-side` | — | CSS-only, for `placement="sidebar"`: which edge it docks to — `right` (default) / `left`. |
| `data-answer-well` | — | CSS-only boolean: box each assistant turn (its text, tool cards, and thinking) in one bordered "well". Off by default. See [The answer well](#the-answer-well). |
| `collapsed` | `collapsed` | Reflected boolean; collapses the widget to its [launcher](#collapsing-to-the-launcher) (a rail under `placement="sidebar"`, the header bar under `embedded` / `page`). Persisted per-tab in `sessionStorage`. |
| `theme` | — | CSS-only: `light` (default) / `dark` / `auto` / `code`. |
| `density` | — | CSS-only: `comfortable` (default) / `compact`. |
| `placement` | — | CSS-only: `floating` (default) / `bottom-left` / `side` / `sidebar` / `full` / `page` / `embedded`. |

**Properties** (JS only, not attributes): `headers`, `getHeaders`, `allowImages`, `autoConfirm`,
`confirmPredicate`, `askUser`, `agentFactory`, `getTools`, `getContext`, `routeMap`, `navigate`,
`getPageMap`, `autoInjectPageMap`, `conversationStore`, `uploadHandler`, `transcribeHandler`,
`navigationResult`, `skillContext`, `toolSummaries`, `strings`, `resolvePageTarget`, plus the
mirrors `endpoint` / `toolDisplay` / `collapsed` / `credentials`.

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

**Properties** (selected): `sharedState` — AG-UI shared state (documented under Tools & state).

Code blocks in an agent's answer carry a **copy button**, revealed on hover or
keyboard focus and styleable via the `code-copy` part. Override its labels with
the `copyCode` / `copied` / `copyFailed` strings.

**Methods**: `registerTool`, `registerPageState`, `setSkills`, `sendMessage`, `attachFile`,
`appendMessage`, `newChat`, `setCollapsed`, `toggleCollapsed`, `toggleTheme`, `openThreads`,
`openCheckpoints`, `reload`.

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
4. This repeats until the agent stops calling frontend tools, bounded by `MAX_TOOL_ROUNDS`.

Tool calls the client doesn't own (server-side tools the server already executed) are left alone —
the loop doesn't re-run them, but their streamed `TOOL_CALL_RESULT` is rendered into the tool-call
card (honouring `data-tool-display`), so server-side output is visible too. The current tool catalog
and context are read **fresh on every run** (`getTools()` / `getContext()`), so they always reflect
the current page state.

### Stopping a run

While a run is in flight the **Send button becomes Stop** (same button, label/`aria-label` swap,
`data-state="running"` for styling); clicking it — or pressing **Escape** in the composer (when
the skills palette is closed; the palette owns Escape while open) — calls `AgUiClient.cancel()`.
AG-UI has no server-side cancel route: cancelling **aborts the streaming request**
(`abortRun()`), and the server observes the disconnect. On cancel:

- Partial assistant text already streamed **stays in the transcript** and is persisted via
  `onPersist`, so a reload shows the truncated exchange. A muted **"⏹ Stopped"** note is appended
  (`.stopped-note`) — a deliberate stop is not an error, so no ⚠️ bubble.
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

Names must be unique (registering a duplicate throws). Each `<ag-ui-chat>` element owns its own
registry, AG-UI client, and Shadow DOM, so **multiple instances on one page never interfere** —
there is no module-level shared state anywhere in the package.

### Inline confirmation (`x-destructive` / `x-confirm` / `confirmPredicate`)

When a tool call needs confirmation, the element appends an **inline confirmation card** (a
`<div class="confirm">`) to the transcript via
[`requestConfirmation`](src/ui/confirmation_card.ts) — it is not a modal overlay. The card reads
naturally after the assistant's explanation, never steals focus from the page, and stays in the
transcript as a resolved record after the decision:

- **Confirm** → the handler runs and the result is posted back.
- **Cancel** → a `"User declined the action."` result is posted; the agent acknowledges on its
  next turn.

Whether a call is gated is decided in this order:

1. If `chat.autoConfirm === true`, the call **never** prompts (an "autopilot" toggle).
2. Else if `chat.confirmPredicate` is set, its boolean return is authoritative — given the tool
   name + parsed args it decides per-call (so one tool can be instant for some args and confirmed
   for others, which a static flag can't express).
3. Else the element falls back to [`isDestructive(parameters)`](src/tools/is_destructive.ts),
   which reads the `x-destructive` JSON-Schema flag.

AG-UI has no built-in risk flag, so destructiveness is carried as a JSON-Schema extension at the
**schema root**: `parameters["x-destructive"] = true` (use the exported `X_DESTRUCTIVE_KEY`
constant). There is no parallel metadata channel and no name heuristic — destructiveness is exactly
the `x-destructive` flag (or `confirmPredicate`). The registry forwards the flag verbatim to
`RunAgentInput.tools`.

If the schema carries an `x-confirm` string (use `X_CONFIRM_KEY`), the card shows it as the prompt;
otherwise it falls back to a generic `Run "<tool>"?`.

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
instead of executing and the run finishes on an AG-UI *interrupt*. The element then appends an
**inline approval card** (a `<div class="approval">`) via
[`requestApproval`](src/ui/approval_card.ts), next to the pending tool-call card:

- **Approve** → the run resumes and the server runs the tool; its result streams back into the
  same card.
- **Deny** → the run resumes carrying a `cancelled` answer, so the model learns the tool was
  declined; the pending card settles as declined.

This uses the AG-UI protocol's own interrupt/resume mechanism (`RunAgentInput.resume[]`) — the
wire stays vanilla AG-UI. A **Stop** while an approval card is open denies every open card and
cancels the run. No configuration is needed on the client; the gate is enabled server-side.

Like the question card, the approval card is customizable at three levels: **text** (`strings`:
`approveAction` / `approvalPrompt` / `approve` / `deny`), **CSS** (`::part()`: `approval`,
`approval-body`, `approval-actions`, `approval-button`, `approval-approve`, `approval-deny`), and
**full replacement** via `chat.approvalRenderer` — given the request (`message` + `toolName`) and
a Stop `AbortSignal`, render your own UI and resolve `true`/`false`:

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
  / page-map element id. Read-only (no confirmation).
- **`drag_and_drop`** — drag the `from` element onto the `to` element (selectors / page-map ids),
  firing the standard HTML5 drag sequence (`dragstart` → `dragenter`/`dragover`/`drop` → `dragend`)
  so the page's own drop handler reacts. Useful for reordering sortable lists.

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

- `newChat()` — clears the transcript and the persisted history, drops the in-memory run state,
  and mints a new thread id.
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

A gated call carries the decision (`approved by you` / `declined by you`, part
`tool-card-decision`, attribute `data-decision`) — from the client-side confirmation card and
from the server-side approval interrupt alike. The prompt itself disappears once answered: a
prompt and a record are different objects, and the record is the card.

⚠ **The annotation is session-scoped**, like the "run interrupted" notice. AG-UI carries no
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

## Resizing the panel

The panel carries a drag handle on its leading corner (or leading edge, docked),
so a reader can widen it without the host having to re-theme anything.

- `placement="full"` / `placement="page"` get **no handle** — a full-bleed layout
  is `100vw`/`100vh` by definition, so there is nothing to drag.
- `placement="sidebar"` / `placement="side"` get **width only**; the placement
  owns the height.
- Everything else resizes on both axes.

**The grip sits at the corner your layout grows toward, and the component
measures which one that is.** A resize has to be computed from the edge that
stays still, and that belongs to *your* CSS rather than to `placement` — a
floating panel is pinned bottom-right, an embedded one goes wherever the page
puts it. The element probes its own geometry and reflects the result as
`data-resize-anchor` (e.g. `bottom-right` means those two edges are fixed), which
is what positions the grip.

A drag writes `--ag-ui-width` / `--ag-ui-height` on the host as custom
properties.

⚠ **That alone does not leave placement in charge** — an inline custom property
still outranks a `:host([placement=…])` rule setting the same property. So the
component enforces the split directly: **a placement owns the axes it fixes**,
and a dragged or persisted size is only ever applied to the ones it leaves free.
Switching placement hands the owned axes back. Without that, a height dragged
while floating capped a docked sidebar that had asked for `100vh`.

⚠ **A host rule that sizes the element wins over both.** `ag-ui-chat { flex: 1 }`
stretches the panel to its container and the dragged width has no visible
effect — which reads as a broken control rather than as your stylesheet winning.
Give the element `flex: 0 1 auto` (plus `max-width: 100%`) if it lives in a flex
container.

The size persists per tab (`sessionStorage`, namespaced per element like the
collapsed and theme preferences) and is restored before the first paint.
Arrow keys resize from the keyboard (`Shift` for a larger step); style the grip
via the `resize-handle` part.

---

## Markdown rendering

Assistant bubbles render sanitized markdown/HTML via [`marked`](https://www.npmjs.com/package/marked)
(GitHub-flavoured, single-newline line breaks) piped through
[DOMPurify](https://www.npmjs.com/package/dompurify). User messages stay literal text. The
allowlist permits emphasis, code, lists, quotes, headings, links, tables, and images (`img`); links
are hardened with `target="_blank" rel="noopener noreferrer"`; `iframe`/`style`/scripting are
excluded. The exported helper `renderMarkdown(text)` does this standalone. `marked` and `dompurify`
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

## Resuming a run

When the server persists run checkpoints (django-ag-ui's `step_store`), a run
that stopped part-way can be **continued** rather than restarted. Point the
component at the run index and a ⭯ button appears in the header:

```html
<ag-ui-chat endpoint="/agent/" data-runs-url="/agent/runs/"></ag-ui-chat>
```

The panel lists runs the server marked **continuable** — those with a saved
snapshot to seed from. A run that never reached a provider-valid boundary has
none, so it isn't offered: resuming it would start from nothing. Each row shows
when the run started (the id is on hover, for correlating with server logs) and
marks a run that branched from another, so a fork doesn't read as a duplicate
of its parent.

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
to a message. A 📎 button and drag-and-drop appear on the composer; each picked file uploads
out-of-band (multipart, with the element's `headers`) and shows a chip in a pending tray —
`uploading` (with a progress bar) → `ready`, or `error` with a retry. On send, the ready files'
**refs** ride on the user bubble as read-only chips and the agent reads their contents
server-side via the `read_attachment` tool. The wire stays vanilla AG-UI: only lightweight refs
(`{ id, name, mime, size }`) travel, never the bytes.

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
handler is `(file, onProgress) => Promise<AttachmentRef>`; when set, the 📎 affordance appears
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

### AG-UI client & agent

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiClient` | class | Orchestration layer over an AG-UI `AbstractAgent`. |
| `AgUiClientConfig` / `AgUiClientHandlers` / `AgUiRunInputs` | type | Client config, lifecycle handlers, per-run input providers. |
| `AgUiToolCall` / `ToolExecution` / `ExecuteTool` | type | Tool-call shape, execution result, executor signature. |
| `ConnectionLostError` | class | Raised (→ `onError`) when a run's stream closes with no terminal AG-UI event. |
| `createHttpAgent(options)` | function | Default agent factory (wraps `HttpAgent`). |
| `AgentFactory` / `HttpAgentOptions` | type | Factory signature and its options. |

### Tools & flags

| Export | Kind | Summary |
| --- | --- | --- |
| `ClientToolRegistry` | class | Per-element tool registry. |
| `ClientTool` | type | A frontend tool declaration. |
| `isDestructive(parameters)` | function | Read the `x-destructive` flag. |
| `isNavigates(parameters)` | function | Read the `x-navigates` flag. |
| `createPageActionTools(enabled, resolveTarget)` | function | Build the opt-in `scroll_to` / `drag_and_drop` tools. |
| `PAGE_ACTIONS` | const | The page-action opt-in tokens (`scroll` / `drag`). |
| `ResolvePageTarget` | type | `(target) => HTMLElement | null` — the page-target resolver. |
| `X_DESTRUCTIVE_KEY` / `X_NAVIGATES_KEY` | const | The JSON-Schema extension keys. |

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

### Durability

| Export | Kind | Summary |
| --- | --- | --- |
| `SessionStorageStore` | class | Default per-tab conversation store. |
| `RemoteConversationStore` | class | Server-backed store over a `data-threads-url` endpoint. |
| `ClientConversationStore` | type | The persistence seam. |
| `ThreadMeta` | type | A thread-drawer row (`{ threadId, title, updatedAt, preview }`). |
| `NavigationCheckpoint` | type | The pre-reload checkpoint marker. |
| `RunIndex` | class | Reads a `data-runs-url` run index and derives its resume / fork endpoints. |
| `RunRow` | type | One run index row (`{ run_id, thread_id, parent_run_id, started_at, continuable }`). |
| `CheckpointMenu` | class | The *Continue a run* panel. |
| `CheckpointVerb` | type | `"resume" | "fork"`. |

### Attachments

| Export | Kind | Summary |
| --- | --- | --- |
| `uploadAttachment(file, options)` | function | The built-in upload (multipart, progress) → `AttachmentRef`. |
| `UploadOptions` | type | `{ url, headers?, onProgress?, signal? }`. |
| `UploadHandler` | type | `(file, onProgress) => Promise<AttachmentRef>` — the `uploadHandler` swap seam (TUS / S3). |
| `AttachmentRef` | type | The durable upload ref (`{ id, name, mime, size, url? }`). |
| `messageAttachments(message)` | function | Read the refs a restored user message carries. |

### UI & DOM primitives

| Export | Kind | Summary |
| --- | --- | --- |
| `ToolCallCard` | class | A live tool-call card for the transcript. |
| `ToolCallStatus` / `SettledStatus` / `ToolDisplayMode` | type | Card lifecycle states + display mode. |
| `requestConfirmation(host, request, options?)` | function | Append the inline confirmation card to the transcript. |
| `ConfirmationRequest` | type | What the card displays. |
| `ConfirmationOptions` | type | `{ signal?, strings? }` — abort resolves the card as declined; `strings` localizes it. |
| `UiStrings` | type | The flat table of every user-facing string. |
| `DEFAULT_UI_STRINGS` | const | The English defaults (the override floor). |
| `mergeUiStrings(overrides)` | function | Merge a partial override over the defaults. |
| `renderMarkdown(text)` | function | Render sanitized markdown/HTML (marked + DOMPurify). |
| `typeInto` / `highlightThenClick` / `pressThenClick` / `selectOption` / `toggleControl` / `scrollIntoCenterView` / `flash` / `focusWithFlash` / `prefersReducedMotion` | function | Animation primitives. |
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
| `MESSAGE_ROLE` | Message role constants. |
| `TOOL_CALL_STATUS` | Tool-call card status constants. |
| `TOOL_DISPLAY` | Tool-call display-mode constants (`minimal` / `compact` / `full`). |
| `X_CONFIRM_KEY` | JSON-Schema key carrying a confirmation prompt. |
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

  /* Layout */
  --ag-ui-width: 380px;
  --ag-ui-height: 560px;
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
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
- `placement` — `floating` (default) / `bottom-left` / `side` / `sidebar` / `full` / `page` /
  `embedded`. `embedded` drops the fixed positioning and z-index so the widget sits in normal
  document flow; `page` is a full-screen [centred reading column](#page-placement).

```html
<ag-ui-chat endpoint="/agent/" theme="dark" density="compact" placement="side"></ag-ui-chat>
```

See [`src/ui/styles.ts`](src/ui/styles.ts) for the full variable + preset list. The
[`demo/`](demo/) live playground (`node demo/mock-server.mjs`) flips theme, density, placement,
text-animation, tool-display, and the answer well live from a single page, and demos the
streamed thoughts region, the 🎤 mic, and the header theme toggle.

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

Available parts: `panel`, `header`, `title`, `icon`, `header-controls`, `header-button`
(plus `history-button` / `new-button` / `collapse-button` / `theme-toggle`), `messages`,
`answer` (the per-turn group), `thoughts` (plus `thoughts-toggle` / `thoughts-body` /
`thoughts-label`), `message`
(plus `message-user` / `message-assistant`), `empty`, `pending`, `stopped` (the "⏹ Stopped" note),
`tool-card`
(plus `tool-card-head` / `-icon` / `-name` / `-status` / `-args` / `-toggle` / `-result`),
`confirm` (plus `confirm-body` /
`-args` / `-actions` / `-button` / `-cancel` / `-confirm`),
`approval` (plus `approval-body` / `-actions` / `-button` / `-approve` / `-deny`),
`question` (plus `question-body` / `-options` / `-choice` / `-choice-text` / `-radio` / `-input` /
`-actions` / `-button`), `composer` (plus `composer-surface` / `composer-tools`), `input`, `send`,
`attach-button`, `voice-button`,
the attachment chips — `attachment-tray` and `attachment-chips` (the read-only chips on sent
bubbles) with the shared chip parts `attachment-chip` (plus `-icon` / `-name` / `-size` / `-bar` /
`-bar-fill` / `-retry` / `-remove`),
the skills UI (`skill-chips`, `skill-chip`, `skill-palette`, `skill-item`, `skill-item-title`,
`skill-item-desc`, and the missing-placeholder `skill-hint`),
`launcher`, `launcher-icon`, `launcher-badge`, and the drawer parts
(`drawer`, `drawer-backdrop`, `drawer-panel`, `drawer-header`, `drawer-title`, `drawer-new`,
`drawer-list`, `drawer-empty`, `drawer-row`, `drawer-row-select`, `drawer-row-title`,
`drawer-row-time`, `drawer-row-preview`, `drawer-row-actions`, `drawer-row-rename`,
`drawer-row-delete`, `drawer-rename-input`, `drawer-confirm`, `drawer-confirm-label`,
`drawer-confirm-yes`, `drawer-confirm-no`).

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
