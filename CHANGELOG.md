# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/Artui/ag-ui-web-component/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/Artui/ag-ui-web-component/releases/tag/v0.1.0
