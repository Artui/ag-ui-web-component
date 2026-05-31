.PHONY: help init test lint lint-fix format format-check type-check deps-bump build release-bump release-publish release-publish-prepare release-publish-finalize

help:
	@echo "Available targets:"
	@echo "  init             Install deps (pnpm) and install pre-commit hooks"
	@echo "  test             Run vitest with coverage (100% required)"
	@echo "  lint             Run biome check + tsc --noEmit"
	@echo "  lint-fix         Auto-fix lint issues with biome"
	@echo "  format           Format with biome"
	@echo "  format-check     Verify formatting"
	@echo "  type-check       Run tsc --noEmit"
	@echo "  deps-bump        Upgrade pinned dependencies (pnpm update --latest)"
	@echo "  build            Bundle to dist/ (esbuild + tsc declarations)"
	@echo "  release-bump     Bump version files + CHANGELOG. Usage: make release-bump VERSION=X.Y.Z"
	@echo "  release-publish  prepare → npm publish → finalize (workstation release)"
	@echo "  release-publish-prepare   Run by release.yml on push to main (no-op unless bumped)"
	@echo "  release-publish-finalize  Tag vX.Y.Z + create GitHub Release after npm publish"

init:
	pnpm install
	pnpm exec pre-commit install || pre-commit install

test:
	pnpm test

lint:
	pnpm lint
	pnpm type-check

lint-fix:
	pnpm lint:fix

format:
	pnpm format

format-check:
	pnpm format:check

type-check:
	pnpm type-check

deps-bump:
	pnpm update --latest

build:
	pnpm build

# Release pipeline. Version lives in src/version.ts; package.json mirrors via
# scripts/release-bump.mjs (driven by `make release-bump VERSION=X.Y.Z`).
RELEASE_PACKAGE_NAME := @artooi/ag-ui-web-component
RELEASE_VERSION_FILES := src/version.ts|^export const VERSION[^=]*= *

release-bump:
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release-bump VERSION=X.Y.Z"; exit 1; \
	fi
	node scripts/release-bump.mjs "$(VERSION)"
	@echo ""
	@echo "Bumped to $(VERSION). Edit CHANGELOG.md to fill the new section,"
	@echo "review with 'git diff', then run 'make release-publish'."

release-publish:
	@PACKAGE_NAME='$(RELEASE_PACKAGE_NAME)' \
	VERSION_FILES="$$(printf '$(RELEASE_VERSION_FILES)')" \
		bash scripts/release-publish.sh all

release-publish-prepare:
	@PACKAGE_NAME='$(RELEASE_PACKAGE_NAME)' \
	VERSION_FILES="$$(printf '$(RELEASE_VERSION_FILES)')" \
		bash scripts/release-publish.sh prepare

release-publish-finalize:
	@PACKAGE_NAME='$(RELEASE_PACKAGE_NAME)' \
	VERSION_FILES="$$(printf '$(RELEASE_VERSION_FILES)')" \
		bash scripts/release-publish.sh finalize
