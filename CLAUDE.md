# Repo conventions for `@artooi/ag-ui-web-component`

This file is the single source of truth for how to write code in this package.
Rules are non-negotiable unless flagged as a heuristic.

This is the **TypeScript sibling** of the `django-*` Python packages and follows the same
shared standard, with the toolchain swapped for the JS/TS ecosystem:

| Concern | Python packages | This package |
| --- | --- | --- |
| Package manager / build | uv + hatchling | pnpm + esbuild |
| Lint + format | ruff | Biome |
| Type check | ty | `tsc --noEmit` |
| Test + coverage | pytest + pytest-cov | Vitest + `@vitest/coverage-v8` |
| Version bump | bump-my-version | `scripts/release-bump.mjs` |
| Publish | PyPI OIDC | npm OIDC (provenance) |

The Makefile target names are identical across all packages (`init`/`test`/`lint`/`lint-fix`/
`format`/`format-check`/`type-check`/`build`/`release-bump`/`release-publish`).

## What this package is

A framework-free `<ag-ui-chat>` Web Component over the [AG-UI](https://docs.ag-ui.com)
protocol. Wraps `@ag-ui/client`'s `HttpAgent`. Ships:
- The Custom Element with a Shadow DOM chat UI.
- A pluggable client-side tool registry (`registerTool({ name, description, parameters,
  handler })`); registered tools are added to every `RunAgentInput.tools`.
- Generic DOM driver primitives (`fillField`, `clickElement`, `typeInto`, …) and animations.
- An inline confirmation card that intercepts tool calls needing confirmation — driven by the
  `x-destructive: true` JSON-Schema flag (or per-call `confirmPredicate`), with prompt text from
  `x-confirm`.

Downstream consumers (e.g. `django-admin-agent`) register their own admin-aware tool handlers
on top via the pluggable registry. **No Django/admin specifics live here.**

The AG-UI stack design doc (`django-ag-ui-plan.md`) lives in the private ecosystem planning workspace, outside this repo.

## Commands

| Target | What it does |
| --- | --- |
| `make init` | `pnpm install` + install pre-commit hooks |
| `make test` | Vitest with 100% line+branch+function+statement coverage gate |
| `make lint` | `biome check .` + `tsc --noEmit` |
| `make format` | `biome format --write .` |
| `make build` | esbuild bundle + `tsc` declarations into `dist/` |
| `make release-bump VERSION=X.Y.Z` | rewrite `src/version.ts` + `package.json` + CHANGELOG |
| `make release-publish` | end-to-end workstation release |

## Structural rules

1. **One exported class or function per file.** File name = `snake_case` or `kebab-case` of
   the symbol's concept. `AgUiChat` Custom Element → `ag_ui_chat.ts`; `fillField` →
   `fill_field.ts`. Keep the file-per-symbol discipline from the Python packages.
   **Exception:** `src/constants.ts` is the single home for enums and constant-like values,
   and is the only file allowed to export multiple symbols.
2. **Private helpers used in only one file** stay there, not exported.
3. **Non-exported helpers shared across files** go into a sibling `utils.ts`.
4. **Top-level imports only.** No dynamic `import()` unless genuinely needed for code-splitting
   a heavy optional dependency, documented inline.
5. **Full type annotations on every exported function and method signature.** `any` is
   forbidden except at genuine external-boundary points, and even there prefer `unknown`.
   `tsconfig` runs in full `strict` mode plus `noUncheckedIndexedAccess`,
   `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`.
6. **`src/index.ts` is the only re-export point.** It lists the public surface. Internal
   modules import from leaf paths (`./fill_field.ts`), never from `./index.ts`.
7. **Use `.js` extensions in import specifiers** (`import { x } from "./x.js"`) even though the
   source file is `x.ts` — NodeNext convention. tsc, esbuild, and Vitest all resolve `.js` →
   `.ts`/`.d.ts` correctly, and the emitted `.d.ts` keeps `./x.js`, so consumers resolve
   types without needing `allowImportingTsExtensions`. Never use bare extensionless imports or
   `.ts` extensions (the latter forces the flag onto every downstream consumer).
8. **`import type` for type-only imports** (Biome enforces `useImportType`).
9. **`src/` is grouped one level deep by concern** — `core/` (the element, AG-UI client,
   conversation store), `ui/` (rendered widgets + styles + markdown/word rendering), `dom/`
   (host-page driving: animations, dom driver, native setter), `tools/` (client tool registry,
   route/page maps, state hook, schema predicates), and `skills/` (skill type, templating,
   parsing). `index.ts`, `constants.ts`, and `version.ts` stay at the `src/` root. One level
   only — no deeper nesting. Cross-group imports use relative `../<group>/x.js` paths; same-group
   imports use `./x.js`. Tests stay flat under `tests/` (named after the source symbol).

## API style rules

10. **Frozen, explicitly-typed data shapes.** Wire payloads and config records are `readonly`
    interfaces or `as const` objects with explicit field types — never untyped object
    literals passed across module boundaries.
11. **Tool schemas are JSON Schema.** The `x-destructive` flag lives at the schema root. The
    inline confirmation card reads it; the registry forwards it verbatim to `RunAgentInput.tools`.
    Don't invent a parallel metadata channel.

## No module-level mutable state

State lives on Custom Element instances (private class fields) — never at module scope. No
module-level mutable singletons, caches, or "warned-once" flags. Each `<ag-ui-chat>` element
owns its own tool registry, AG-UI client, and Shadow DOM. Multiple instances on one page must
not interfere.

## Tests

- `make test` runs Vitest with 100% line + branch + function + statement coverage (thresholds
  in `vitest.config.ts`). Restructure rather than carve out coverage exclusions.
- Test layout mirrors `src/` under `tests/`. `src/fill_field.ts` → `tests/fill_field.test.ts`.
- DOM tests run under `happy-dom` (configured as the Vitest environment). Custom Element
  registration, Shadow DOM queries, and event dispatch all work there.
- For AG-UI protocol behaviour, mock `@ag-ui/client`'s `HttpAgent` rather than hitting a real
  server; assert on the `RunAgentInput` shape produced and the handling of synthetic events.

## Lint and types

- `make lint` runs `biome check .` + `tsc --noEmit`. CI fails on either.
- Biome is the source of truth for both lint and format.
- Pre-commit runs `make lint-fix`, `make format`, `make type-check`. Commits must be clean
  before push — never `--no-verify`.

## Compatibility floor

| Component | Floor | Tested |
| --- | --- | --- |
| Node (tooling/tests) | 22 | 22, 24 |
| Browsers (runtime target) | ES2022 / evergreen | Chrome/Firefox/Safari 17+ |
| `@ag-ui/client` | latest 0.x | — |

The shipped artefact targets evergreen browsers (Shadow DOM, Custom Elements v1, ES2022). Node
is only the build/test runtime, not a runtime target.

## Branching

When working on a new feature or version bump, **ALWAYS** branch first (`git checkout -b
feat/...` or `release/vX.Y.Z`) and push there. Never commit feature work or version bumps
directly to `main`; `main` only advances via merged PRs (or, for releases, the tagged commit
on the release branch).

## Releases

Merge-to-main triggered. `.github/workflows/release.yml` runs on every push to `main` and
calls `make release-publish-prepare`. The script in `scripts/release-publish.sh` is the single
source of truth (a near-byte-identical port of the Python packages' script):

1. Extract version from `src/version.ts`; assert `package.json` agrees.
2. Short-circuit if `vX.Y.Z` already exists locally or on origin.
3. `pnpm test` as a final gate.
4. `pnpm build` into `dist/`.
5. Extract the `## [X.Y.Z]` CHANGELOG section into release notes.
6. Emit `released=true`.

If released:
- Publish to npm via OIDC trusted publishing with provenance (`pnpm publish`).
- Tag, push, create GitHub Release.

### Cutting a release

```bash
make release-bump VERSION=0.2.0   # rewrites src/version.ts + package.json + CHANGELOG
git diff
git commit -am "Release 0.2.0"
git push -u origin release/0.2.0
gh pr create
# Merge to main; release.yml fires on the merge commit.
```

`release-bump.mjs` refuses to run on a dirty tree.

### One-time setup (manual)

1. **npm Trusted Publisher** — configure OIDC trusted publishing for
   `@artooi/ag-ui-web-component` pointing at `Artui/ag-ui-web-component`, workflow
   `release.yml`, environment `npm`.
2. **`@artooi` npm org** — must exist and the publishing identity must be a member.
3. **GitHub Environment** — create an `npm` environment under `Settings → Environments` (no
   secrets needed; OIDC handles auth).
