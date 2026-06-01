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
- A **confirmation modal** that intercepts destructive tool calls (those whose JSON Schema
  carries `x-destructive: true`) before the handler runs.
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
  - [The confirmation modal (`x-destructive`)](#the-confirmation-modal-x-destructive)
  - [DOM-driver and animation primitives](#dom-driver-and-animation-primitives)
- [MPA durability: surviving full page reloads](#mpa-durability-surviving-full-page-reloads)
- [Host seams: the SPA story](#host-seams-the-spa-story)
- [Public API surface](#public-api-surface)
- [Theming](#theming)
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
  // the confirmation modal before the handler runs.
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

| Attribute | Property | Notes |
| --- | --- | --- |
| `endpoint` | `endpoint` (getter) | The AG-UI endpoint URL. Required to send. |
| `title-text` | — | Header label; defaults to `"Assistant"`. |
| — | `headers` | `Record<string, string>` of extra HTTP headers. |
| — | `autoConfirm` | When `true`, destructive tools run without the modal. |

A self-contained working example lives in [`demo/`](demo/) — run `make demo` to serve it against a
mock AG-UI server.

---

## Core concepts

### The run loop and the AG-UI client

`<ag-ui-chat>` is the view; [`AgUiClient`](src/agui_client.ts) is the orchestration layer over an
AG-UI `AbstractAgent`. On the first send the element builds a client (via the overridable
`agentFactory`, which defaults to [`createHttpAgent`](src/create_http_agent.ts)). Each turn:

1. The user message is appended and the agent runs once.
2. AG-UI subscriber events are translated into the element's handlers — streaming text deltas
   render into a bubble; each `TOOL_CALL_END` becomes a tool-call card.
3. Any **frontend** tool calls collected during the run are executed locally, their results are
   appended as `tool` messages, and the agent is re-run with the results.
4. This repeats until the agent stops calling frontend tools, bounded by `MAX_TOOL_ROUNDS`.

Tool calls the client doesn't own (server-side tools the server already executed) are left alone —
the loop doesn't re-run them. The current tool catalog and context are read **fresh on every run**
(`getTools()` / `getContext()`), so they always reflect the current page state.

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

### The confirmation modal (`x-destructive`)

AG-UI has no built-in risk flag, so destructiveness is carried as a JSON-Schema extension at the
**schema root**: `parameters["x-destructive"] = true` (use the exported `X_DESTRUCTIVE_KEY`
constant). There is no parallel metadata channel — the flag lives on the schema, the registry
forwards it verbatim to `RunAgentInput.tools`, and [`isDestructive`](src/is_destructive.ts) reads
it back.

When the agent calls a destructive tool, the element shows the
[confirmation modal](src/confirmation_modal.ts) (rendered inside its own Shadow DOM) **before**
dispatching to the handler:

- **Confirm** → the handler runs and the result is posted back.
- **Cancel / dismiss** → a `"User declined the action."` result is posted; the agent acknowledges
  on its next turn.

Set `chat.autoConfirm = true` to bypass the modal (an "autopilot" toggle).

### DOM-driver and animation primitives

So the agent can visibly drive the host page, the package ships generic, framework-free
primitives. The **animation** primitives ([`animations.ts`](src/animations.ts)) operate at
human-readable speed (configurable; pass small/zero durations in tests):

- `typeInto(el, value, { charDelayMs })` — clears and types a value character by character,
  firing `input`/`change` events as a real user would.
- `highlightThenClick(el, { highlightMs })` — outlines an element, pauses, then clicks.
- `scrollIntoCenterView(el)` / `focusWithFlash(el, { flashMs })`.

The **DOM-driver** primitives ([`dom_driver.ts`](src/dom_driver.ts)) compose those into the
operations a tool handler typically wants:

- `fillField(el, value, options)` — scroll to, focus-flash, and type into a text field.
- `clickElement(el, options)` — scroll to, highlight, and click.
- `setControlValue(el, value)` — set a `<select>` or checkbox without animation, dispatching
  `input`/`change`.

Each takes an element the caller has already located; host packages wrap them with
environment-aware lookups (e.g. "find `#id_<name>`, then `fillField`").

---

## MPA durability: surviving full page reloads

In a multi-page app, a tool that navigates reloads the whole page and destroys the in-memory run
loop. The package keeps the conversation continuous across that boundary with three generic
mechanisms.

**1. Thread identity.** AG-UI's `thread_id` is the conversation key. It is generated once and
persisted (so the element reattaches after a reload) by the
[`ClientConversationStore`](src/conversation_store.ts).

**2. Durable conversation.** A pluggable `ClientConversationStore` holds the message list. The
default [`SessionStorageStore`](src/conversation_store.ts) keeps everything per-tab in
`sessionStorage`, so the chat survives full page reloads and clears on tab close. `loadMessages`
is async-friendly, so a host can inject a server-backed store (e.g. one that rehydrates from a
history endpoint) for cross-tab/device durability:

```js
chat.conversationStore = new MyServerBackedStore();
```

On mount the element rehydrates the transcript from the store, so the chat looks continuous.

**3. Resumable loop (`x-navigates` + `navigationResult`).** A tool whose schema carries
`x-navigates: true` (use `X_NAVIGATES_KEY`; read back by [`isNavigates`](src/is_navigates.ts))
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

```js
chat.routeMap = [
  { id: "users", path: "/users", title: "Users", description: "Manage user accounts" },
  { id: "billing", path: "/billing", title: "Billing" },
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
| `createPageMapContext(...)` | function | Build the per-run `page_map` context entry. |
| `PageMap` | type | The compact page-surface shape. |
| `createStateHookTools(hook)` | function | Build `read_<name>` / `set_<name>` tools. |
| `StateHook` | type | A state-binding declaration. |

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
| `ToolCallStatus` / `SettledStatus` | type | Card lifecycle states. |
| `requestConfirmation(host, request)` | function | Render the confirmation modal. |
| `ConfirmationRequest` | type | What the modal displays. |
| `typeInto` / `highlightThenClick` / `scrollIntoCenterView` / `focusWithFlash` | function | Animation primitives. |
| `fillField` / `clickElement` / `setControlValue` | function | DOM-driver primitives. |
| `TypeOptions` / `HighlightClickOptions` / `FlashOptions` / `FillFieldOptions` / `TextLikeElement` | type | Primitive option shapes. |

### Constants

| Export | Summary |
| --- | --- |
| `ELEMENT_TAG` | The registered tag name (`ag-ui-chat`). |
| `SUBMIT_EVENT` | The submit CustomEvent name. |
| `MESSAGE_ROLE` | Message role constants. |
| `TOOL_CALL_STATUS` | Tool-call card status constants. |
| `MAX_TOOL_ROUNDS` | Upper bound on tool-call → re-run rounds per send. |
| `VERSION` | The package version string. |

---

## Theming

The chat shell is styled inside its Shadow DOM and exposes CSS custom properties on `:host`, so you
theme it from outside without piercing the shadow boundary. A few of the knobs:

```css
ag-ui-chat {
  --ag-ui-accent: #4f46e5;
  --ag-ui-bg: #ffffff;
  --ag-ui-fg: #1a1a2e;
  --ag-ui-radius: 12px;

  /* Layout — float (default) or embed in your own flow with --ag-ui-position: static */
  --ag-ui-position: fixed;
  --ag-ui-width: 380px;
  --ag-ui-height: 560px;
  --ag-ui-inset: auto 24px 24px auto;
  --ag-ui-shadow: 0 12px 32px rgba(20, 20, 50, 0.18);
}
```

See [`src/styles.ts`](src/styles.ts) for the full list, and [`demo/themes/`](demo/themes/) for
worked examples (default, dark, embedded, and a "claude" theme).

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
| `make demo` | Build, then serve `demo/` against a mock AG-UI server. |

---

## Compatibility

| Component | Floor | Tested |
| --- | --- | --- |
| Node (tooling/tests only) | 20 | 20, 22, 24 |
| Browsers (runtime target) | ES2022 / evergreen | Chrome / Firefox / Safari 17+ |
| `@ag-ui/client` | latest 0.x | — |

The shipped artefact targets evergreen browsers (Shadow DOM, Custom Elements v1, ES2022). Node is
only the build/test runtime, not a runtime target.

---

## License

[MIT](LICENSE) © Artur Veres
