#!/usr/bin/env bash
#
# release-publish.sh — single source of truth for the release flow (npm variant).
#
# Mirror of the Python packages' scripts/release-publish.sh, adapted for an
# npm/pnpm package. Phases:
#   prepare   Extract version, no-op if already released, run tests, build dist,
#             extract CHANGELOG section, write release metadata under
#             .release-metadata/. Emits `released=true|false` and `version=…`
#             to $GITHUB_OUTPUT when running under GitHub Actions.
#   finalize  Tag, push the tag (retried), and create a GitHub Release. Skipped
#             automatically if prepare decided no release.
#   all       prepare → pnpm publish → finalize. Used for manual workstation
#             releases (CI does the npm publish via the workflow between prepare
#             and finalize so OIDC provenance is attached).
#
# Re-running a failed release job is the intended recovery, so no phase repeats an
# effect that already landed: `prepare` no-ops once the tag exists, and `finalize`
# skips a tag or a Release that is already there. The publish between them belongs
# to the workflow, and skips a version the registry already has for the same
# reason — without that, a failure in any step after the publish can only be
# repaired by hand, and the obvious shortcut (pushing the tag manually) makes
# `prepare` short-circuit, which skips everything after it.
#
# Required env:
#   PACKAGE_NAME    Display name (npm name). Used in logs only.
#   VERSION_FILES   Newline-separated `path|grep-extractor` pairs. The extractor
#                   pattern selects a line of the form `… = "X.Y.Z"`. All entries
#                   must agree; the first wins.
#
# Optional env:
#   DRY_RUN=1       Skip side-effecting steps (pnpm publish, git push, gh release).
#   GH_TOKEN        Required for `finalize` outside DRY_RUN (gh CLI auth).

set -euo pipefail

phase="${1:-}"
if [[ -z "$phase" ]]; then
    echo "usage: $0 <prepare|finalize|all>" >&2
    exit 2
fi

: "${PACKAGE_NAME:?PACKAGE_NAME must be set}"
: "${VERSION_FILES:?VERSION_FILES must be set}"

log() { echo "[release-publish:${phase}] $*"; }

extract_versions() {
    local first_version="" current_version=""
    local entry path pattern
    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        path="${entry%%|*}"
        pattern="${entry#*|}"
        if [[ ! -f "$path" ]]; then
            echo "version source not found: $path" >&2
            exit 1
        fi
        current_version="$(awk -F '"' "/${pattern}/ { print \$2; exit }" "$path")"
        if [[ -z "$current_version" ]]; then
            echo "could not extract version from $path with pattern '$pattern'" >&2
            exit 1
        fi
        if [[ -z "$first_version" ]]; then
            first_version="$current_version"
        elif [[ "$current_version" != "$first_version" ]]; then
            echo "version drift: $path reports $current_version, expected $first_version" >&2
            exit 1
        fi
    done <<<"$VERSION_FILES"
    if [[ -z "$first_version" ]]; then
        echo "VERSION_FILES yielded no versions" >&2
        exit 1
    fi
    printf '%s' "$first_version"
}

assert_package_json_matches() {
    local version="$1" pkg_version
    pkg_version="$(node -p "require('./package.json').version")"
    if [[ "$pkg_version" != "$version" ]]; then
        echo "version drift: package.json reports $pkg_version, expected $version" >&2
        exit 1
    fi
}

emit_output() {
    local key="$1" value="$2"
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
        printf '%s=%s\n' "$key" "$value" >>"$GITHUB_OUTPUT"
    fi
}

tag_exists() {
    local tag="$1"
    if git rev-parse "$tag" >/dev/null 2>&1; then
        return 0
    fi
    if [[ -n "$(git ls-remote --tags origin "$tag" 2>/dev/null)" ]]; then
        return 0
    fi
    return 1
}

push_tag() {
    # Retried, because the failure it protects against is transport rather than
    # state. GitHub rejects a healthy tag push with a server-side
    # `remote: fatal error in commit_refs` often enough to have cost a release:
    # the package was already on the registry, so the tag, the GitHub Release and
    # the docs deploy were all lost to one flake in the one step that cannot be
    # re-run cheaply. Seconds of retry buys back a manual recovery.
    local tag="$1" attempt=1 delay=5
    until git push origin "$tag"; do
        # A push can land and still report failure. Ask the remote rather than
        # retrying into a "tag already exists" error and reporting that instead.
        if [[ -n "$(git ls-remote --tags origin "$tag" 2>/dev/null)" ]]; then
            log "$tag reached the remote despite the error, continuing"
            return 0
        fi
        if ((attempt >= 3)); then
            echo "tag push of $tag failed after $attempt attempts" >&2
            return 1
        fi
        log "tag push failed (attempt $attempt of 3), retrying in ${delay}s"
        sleep "$delay"
        attempt=$((attempt + 1))
        delay=$((delay * 2))
    done
}

extract_changelog_section() {
    local version="$1" out_file="$2"
    awk -v ver="$version" '
        BEGIN { capture = 0 }
        /^## \[/ {
            if (capture) { exit }
            if (index($0, "[" ver "]") == 4) { capture = 1; next }
        }
        capture { print }
    ' CHANGELOG.md \
        | awk 'NF { found = 1 } found { lines[++n] = $0 }
               END { last = n; while (last > 0 && lines[last] ~ /^[[:space:]]*$/) last--;
                     for (i = 1; i <= last; i++) print lines[i] }' \
        >"$out_file"
    if [[ ! -s "$out_file" ]]; then
        echo "CHANGELOG.md has no [$version] section" >&2
        exit 1
    fi
}

do_prepare() {
    local version
    version="$(extract_versions)"
    assert_package_json_matches "$version"
    log "package=$PACKAGE_NAME version=$version"

    if [[ -z "${GITHUB_ACTIONS:-}" ]]; then
        rm -rf dist .release-metadata
    fi

    git fetch --tags --quiet origin || true
    if tag_exists "v$version"; then
        log "v$version already released, nothing to publish"
        emit_output released false
        emit_output version "$version"
        return 0
    fi

    log "running final test gate"
    pnpm test

    log "building distributions"
    pnpm build

    mkdir -p .release-metadata
    extract_changelog_section "$version" .release-metadata/release-notes.md
    printf '%s\n' "$version" >.release-metadata/RELEASE_VERSION

    emit_output released true
    emit_output version "$version"
    log "prepared release v$version"
}

do_finalize() {
    if [[ ! -f .release-metadata/RELEASE_VERSION ]]; then
        log "no .release-metadata/RELEASE_VERSION — prepare did not run or short-circuited; nothing to finalize"
        return 0
    fi
    local version
    version="$(cat .release-metadata/RELEASE_VERSION)"
    log "finalizing v$version"

    if [[ "${DRY_RUN:-}" == "1" ]]; then
        log "DRY_RUN=1, skipping tag push and gh release create"
        return 0
    fi

    if tag_exists "v$version"; then
        log "tag v$version already exists, skipping push"
    else
        git config user.name 'github-actions[bot]'
        git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
        git tag -a "v$version" -m "$version"
        push_tag "v$version"
    fi

    if gh release view "v$version" >/dev/null 2>&1; then
        log "GitHub Release v$version already exists, skipping create"
    else
        gh release create "v$version" \
            --title "v$version" \
            --notes-file .release-metadata/release-notes.md
    fi
}

do_publish_npm() {
    if [[ "${DRY_RUN:-}" == "1" ]]; then
        log "DRY_RUN=1, skipping pnpm publish"
        return 0
    fi
    log "publishing to npm"
    pnpm publish --no-git-checks --access public
}

case "$phase" in
    prepare)
        do_prepare
        ;;
    finalize)
        do_finalize
        ;;
    all)
        do_prepare
        if [[ -f .release-metadata/RELEASE_VERSION ]]; then
            do_publish_npm
            do_finalize
        fi
        ;;
    *)
        echo "unknown phase: $phase (expected prepare|finalize|all)" >&2
        exit 2
        ;;
esac
