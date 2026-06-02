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
- [Core concepts](#core-concepts)
  - [The run loop and the AG-UI client](#the-run-loop-and-the-ag-ui-client)
  - [Registering tools](#registering-tools)
  - [Inline confirmation (`x-destructive` / `x-confirm` / `confirmPredicate`)](#inline-confirmation-x-destructive--x-confirm--confirmpredicate)
  - [DOM-driver and animation primitives](#dom-driver-and-animation-primitives)
- [New chat and collapse](#new-chat-and-collapse)
- [Tool-call display modes](#tool-call-display-modes)
- [Markdown rendering](#markdown-rendering)
- [Skills: prompt chips and slash palette](#skills-prompt-chips-and-slash-palette)
- [MPA durability: surviving full page reloads](#mpa-durability-surviving-full-page-reloads)
- [Host seams: the SPA story](#host-seams-the-spa-story)
- [Public API surface](#public-api-surface)
- [Theming, density, and placement](#theming-density-and-placement)
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
| `@artooi/ag-ui-web-component/style.css` | Extracted CSS sidecar | Rarely needed — styles are injected into the Shadow DOM at runtime. |

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

  // Extra request headers (e.g. CSRF) sent to the AG-UI endpoint.
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
`headers`, and the tools you want the agent to be able to invoke in the browser.

### Attributes and properties

**Attributes** (set in HTML; the CSS-only ones are styling presets with no JS API):

| Attribute | Property | Notes |
| --- | --- | --- |
| `endpoint` | `endpoint` | The AG-UI endpoint URL. Required to send. Reflecting getter + setter. |
| `title-text` | — | Header label; defaults to `"Assistant"`. The only **observed** attribute (live-updates the header). |
| `data-tool-display` | `toolDisplay` | Tool-call card detail: `minimal` / `compact` / `full` (default `full`). |
| `data-text-animation` | — | Incoming-text reveal: `none` (default) / `fade` / `word`. |
| `data-prompt-chips` | — | `"true"` to surface skills as chips. |
| `data-slash-commands` | — | `"true"` to enable the `/`-command palette. |
| `data-skills` | — | Inline JSON skill catalog. |
| `data-skills-url` | — | URL of a JSON skill catalog (fetched with `headers`). |
| `collapsed` | `collapsed` | Reflected boolean; collapses the widget. Persisted per-tab in `sessionStorage`. |
| `theme` | — | CSS-only: `light` (default) / `dark` / `auto` / `code`. |
| `density` | — | CSS-only: `comfortable` (default) / `compact`. |
| `placement` | — | CSS-only: `floating` (default) / `bottom-left` / `side` / `full` / `embedded`. |

**Properties** (JS only, not attributes): `headers`, `autoConfirm`, `confirmPredicate`,
`agentFactory`, `getTools`, `getContext`, `routeMap`, `navigate`, `getPageMap`,
`autoInjectPageMap`, `conversationStore`, `navigationResult`, `skillContext`, `toolSummaries`,
plus the mirrors `endpoint` / `toolDisplay` / `collapsed`.

`toolSummaries` is a `Record<string, string>` mapping tool name → a friendly card
label, used when a tool has no `x-summary` in its own schema. Built-in and client tools
should carry `x-summary` directly; this map is the seam for **server-side tools** (drf-mcp,
the django-ag-ui `@tool` registry), whose schema never reaches the browser — e.g.
`chat.toolSummaries = { list_projects: "Search projects" }`.

**Methods**: `registerTool`, `registerStateHook`, `setSkills`, `appendMessage`, `newChat`,
`setCollapsed`, `toggleCollapsed`.

A self-contained live playground lives in [`demo/`](demo/) — run `make demo` to serve it against a
mock AG-UI server.

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

### DOM-driver and animation primitives

So the agent can visibly drive the host page, the package ships generic, framework-free
primitives. The **animation** primitives ([`animations.ts`](src/dom/animations.ts)) operate at
human-readable speed (configurable; pass small/zero durations in tests):

- `typeInto(el, value, { charDelayMs })` — clears and types a value character by character,
  firing `input`/`change` events as a real user would.
- `highlightThenClick(el, { highlightMs })` / `pressThenClick(el, options)` — outline/press an
  element, pause, then click.
- `selectOption(el, value)` / `toggleControl(el, checked)` — animate a `<select>` / checkbox.
- `scrollIntoCenterView(el)` / `focusWithFlash(el, { flashMs })`.
- `prefersReducedMotion()` — honoured throughout so animations collapse to instant when the user
  asks for reduced motion.

The **DOM-driver** primitives ([`dom_driver.ts`](src/dom/dom_driver.ts)) compose those into the
operations a tool handler typically wants:

- `fillField(el, value, options)` — scroll to, focus-flash, and type into a text field.
- `clickElement(el, options)` / `pressButton(el, options)` — scroll to, highlight/press, and click.
- `selectControl(el, value)` / `toggleCheckbox(el, checked)` — animate a `<select>` / checkbox.
- `setControlValue(el, value)` — set a `<select>` or checkbox without animation, dispatching
  `input`/`change`.

The native-setter helpers ([`native_setter.ts`](src/dom/native_setter.ts)) — `setNativeValue` /
`setNativeChecked` — set a control through its native prototype setter so React-controlled inputs
register the change.

Each takes an element the caller has already located; host packages wrap them with
environment-aware lookups (e.g. "find `#id_<name>`, then `fillField`").

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

---

## Tool-call display modes

How much a tool-call card shows is set via the `data-tool-display` attribute (or `toolDisplay`
property), one of `minimal` / `compact` / `full` (default `full`):

- `minimal` — tool name + status pill only.
- `compact` — name + status, with args *and* result behind a single collapsed "Details" toggle.
- `full` — args inline, result behind its own toggle (the original behaviour).

If a tool's schema carries an `x-summary` string (use `X_SUMMARY_KEY`), the card shows it on the
label instead of the raw tool name.

```html
<ag-ui-chat endpoint="/agent/" data-tool-display="compact"></ag-ui-chat>
```

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

## Skills: prompt chips and slash palette

Skills are pre-defined prompts the user can launch from a chip or the `/`-command palette. They are
opt-in via two attributes:

```html
<ag-ui-chat endpoint="/agent/" data-prompt-chips="true" data-slash-commands="true"></ag-ui-chat>
```

A `Skill` is `{ name, title, description?, prompt, sendImmediately?, chip? }`. Skills are merged
from three sources — **backend → embed → client** (later wins by `name`):

- `data-skills-url` — a JSON endpoint, fetched with the element's `headers`.
- `data-skills` — an inline JSON catalog.
- `setSkills(skills)` — set the client catalog from JS.

```js
chat.setSkills([
  { name: "summarize", title: "Summarize page", prompt: "Summarize {title}.", chip: true },
]);
```

A skill `prompt` may contain `{placeholder}` tokens; the `skillContext` property
(`() => Record<string, unknown>`) supplies the values, filled in before send. A missing placeholder
blocks the send and shows a hint instead.

```js
chat.skillContext = () => ({ title: document.title });
```

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
each run's `context` as a `page_map` entry (toggle with `autoInjectPageMap`). Recomputed every run
so it reflects the page the agent is currently looking at:

```js
chat.getPageMap = () => ({ fields: introspectForm(), buttons: visibleButtons() });
```

**`registerStateHook({ name, read, write?, schema? })`** — ergonomic sugar over `registerTool` for
SPA app state (Redux/Zustand/signals). It auto-generates a `read_<name>` (read-only) tool and, when
`write` is supplied, a `set_<name>` tool stamped `x-destructive`:

```js
chat.registerStateHook({
  name: "cart",
  read: () => store.getState().cart,
  write: ({ items }) => store.dispatch(setCart(items)),
  schema: { type: "object", properties: { items: { type: "array" } } },
});
```

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

### AG-UI client & agent

| Export | Kind | Summary |
| --- | --- | --- |
| `AgUiClient` | class | Orchestration layer over an AG-UI `AbstractAgent`. |
| `AgUiClientConfig` / `AgUiClientHandlers` / `AgUiRunInputs` | type | Client config, lifecycle handlers, per-run input providers. |
| `AgUiToolCall` / `ToolExecution` / `ExecuteTool` | type | Tool-call shape, execution result, executor signature. |
| `createHttpAgent(options)` | function | Default agent factory (wraps `HttpAgent`). |
| `AgentFactory` / `HttpAgentOptions` | type | Factory signature and its options. |

### Tools & flags

| Export | Kind | Summary |
| --- | --- | --- |
| `ClientToolRegistry` | class | Per-element tool registry. |
| `ClientTool` | type | A frontend tool declaration. |
| `isDestructive(parameters)` | function | Read the `x-destructive` flag. |
| `isNavigates(parameters)` | function | Read the `x-navigates` flag. |
| `X_DESTRUCTIVE_KEY` / `X_NAVIGATES_KEY` | const | The JSON-Schema extension keys. |

### Host seams

| Export | Kind | Summary |
| --- | --- | --- |
| `createRouteTools(...)` | function | Build the built-in `route.*` tools. |
| `Route` / `RouteMap` | type | Navigable-route shapes. |
| `RouteWithParams` | type | A route resolved with `:param` path segments + leftover query params. |
| `createPageMapContext(...)` | function | Build the per-run `page_map` context entry. |
| `PageMap` | type | The compact page-surface shape. |
| `createStateHookTools(hook)` | function | Build `read_<name>` / `set_<name>` tools. |
| `StateHook` | type | A state-binding declaration. |
| `Skill` | type | A launchable prompt (chip / `/`-command). |

### Durability

| Export | Kind | Summary |
| --- | --- | --- |
| `SessionStorageStore` | class | Default per-tab conversation store. |
| `ClientConversationStore` | type | The persistence seam. |
| `NavigationCheckpoint` | type | The pre-reload checkpoint marker. |

### UI & DOM primitives

| Export | Kind | Summary |
| --- | --- | --- |
| `ToolCallCard` | class | A live tool-call card for the transcript. |
| `ToolCallStatus` / `SettledStatus` / `ToolDisplayMode` | type | Card lifecycle states + display mode. |
| `requestConfirmation(host, request)` | function | Append the inline confirmation card to the transcript. |
| `ConfirmationRequest` | type | What the card displays. |
| `renderMarkdown(text)` | function | Render sanitized markdown/HTML (marked + DOMPurify). |
| `typeInto` / `highlightThenClick` / `pressThenClick` / `selectOption` / `toggleControl` / `scrollIntoCenterView` / `focusWithFlash` / `prefersReducedMotion` | function | Animation primitives. |
| `fillField` / `clickElement` / `pressButton` / `selectControl` / `setControlValue` / `toggleCheckbox` | function | DOM-driver primitives. |
| `setNativeValue` / `setNativeChecked` | function | Set a control via its native prototype setter (React-controlled inputs). |
| `TypeOptions` / `HighlightClickOptions` / `PressOptions` / `SelectOptions` / `ToggleOptions` / `FlashOptions` / `FillFieldOptions` / `TextLikeElement` | type | Primitive option shapes. |

### Constants

| Export | Summary |
| --- | --- |
| `ELEMENT_TAG` | The registered tag name (`ag-ui-chat`). |
| `SUBMIT_EVENT` | The submit CustomEvent name. |
| `TOGGLE_EVENT` | The collapse-toggle CustomEvent name (`ag-ui-toggle`). |
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
properties on `:host` (colors, status, surface, spacing, layout), so you theme it from outside
without piercing the shadow boundary. A few of the knobs:

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

For the common cases there are three CSS-reactive **preset attributes** (no JS API), so you don't
have to hand-tune the variables:

- `theme` — `light` (default) / `dark` / `auto` (follow the OS) / `code`.
- `density` — `comfortable` (default) / `compact`.
- `placement` — `floating` (default) / `bottom-left` / `side` / `full` / `embedded`. `embedded`
  drops the fixed positioning and z-index so the widget sits in normal document flow.

```html
<ag-ui-chat endpoint="/agent/" theme="dark" density="compact" placement="side"></ag-ui-chat>
```

See [`src/ui/styles.ts`](src/ui/styles.ts) for the full variable + preset list. The
[`demo/`](demo/) live playground (`node demo/mock-server.mjs`) flips theme, density, placement,
text-animation, and tool-display live from a single page.

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
- `ag-ui-web-component.bundle.css` — the extracted CSS sidecar.
- `index.d.ts` (+ source maps) — type declarations; emitted `.js` import specifiers are preserved
  so consumers resolve types without extra flags.

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
