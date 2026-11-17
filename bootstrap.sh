#!/bin/sh
set -eu

repo='netcraker01/ClaudIA'
workflow='netcraker01/ClaudIA/.github/workflows/release.yml'

tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/claudia-bootstrap.XXXXXX") || exit 1
cleanup() {
  result=$?
  trap - EXIT HUP INT TERM
  rm -rf "$tmpdir"
  exit "$result"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

for command in gh node tar grep; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'bootstrap: required command not found: %s\n' "$command" >&2
    exit 1
  }
done

tag=$(gh release view --repo "$repo" --json tagName --jq .tagName)
if ! printf '%s\n' "$tag" | grep -Eq '^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$'; then
  printf 'bootstrap: invalid release tag: %s\n' "$tag" >&2
  exit 1
fi

archive="claudia-${tag}.tar.gz"
archive_path="$tmpdir/$archive"

gh release download "$tag" --repo "$repo" --pattern "$archive" --dir "$tmpdir"
[ -f "$archive_path" ] && [ ! -L "$archive_path" ] || {
  printf 'bootstrap: expected regular release asset missing: %s\n' "$archive" >&2
  exit 1
}

gh attestation verify "$archive_path" \
  --repo "$repo" \
  --signer-workflow "$workflow"

tar -xzf "$archive_path" -C "$tmpdir"
[ -f "$tmpdir/claudia/claudia" ] && [ ! -L "$tmpdir/claudia/claudia" ] || {
  printf 'bootstrap: verified package is missing its CLI\n' >&2
  exit 1
}

CLAUDIA_VERIFIED_ARCHIVE="$archive_path" node "$tmpdir/claudia/claudia" install "--version=$tag"
