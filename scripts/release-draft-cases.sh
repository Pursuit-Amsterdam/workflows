#!/usr/bin/env bash
# Runs the `run:` step of release-draft.yml against a fake `gh` on PATH, and
# checks the decision it takes: refuse off the default branch or without a
# semver version, nothing when the tag exists, a new draft with the tag from
# package.json, an existing draft moved to the new commit, stale drafts for
# other versions removed, published releases never touched. The script reads
# every input from env, so it runs here as it runs on a runner.
#
#   scripts/release-draft-cases.sh [release-draft.yml]   # default: this repo's
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
workflow=${1:-"$root/.github/workflows/release-draft.yml"}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# One file per step id: $tmp/step-<id>.sh
python3 - "$workflow" "$tmp" <<'EOF'
import sys, yaml
workflow, out = sys.argv[1], sys.argv[2]
for step in yaml.safe_load(open(workflow))["jobs"]["draft"]["steps"]:
    if "id" in step and "run" in step:
        open(f"{out}/step-{step['id']}.sh", "w").write(step["run"])
EOF

# The fake gh answers `gh api` from env (FAKE_TAGS: tags that exist,
# FAKE_RELEASES: the releases JSON) and logs every call. A `body=@file` field
# is logged with the file's content, so the notes can be checked.
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<'EOF'
#!/usr/bin/env bash
[ "$1" = api ] || { echo "fake gh: only api is supported" >&2; exit 2; }
shift
method=GET; path=; jq_expr=; fields=()
while [ $# -gt 0 ]; do
  case "$1" in
    -X) method=$2; shift ;;
    --jq) jq_expr=$2; shift ;;
    --paginate) ;;
    -f|-F) case "$2" in body=@*) fields+=("body=$(cat "${2#body=@}")") ;; *) fields+=("$2") ;; esac; shift ;;
    *) path=$1 ;;
  esac
  shift
done
echo "gh api $method $path ${fields[*]:-}" >>"$GH_LOG"
out=
case "$method $path" in
  "GET repos/{owner}/{repo}") out='{"default_branch":"main"}' ;;
  "GET repos/{owner}/{repo}/git/matching-refs/tags/"*)
    prefix=${path##*/}; out='['; sep=
    for t in ${FAKE_TAGS:-}; do case "$t" in "$prefix"*) out+="$sep{\"ref\":\"refs/tags/$t\"}"; sep=, ;; esac; done
    out+=']' ;;
  "GET repos/{owner}/{repo}/releases") out=${FAKE_RELEASES:-[]} ;;
  "POST repos/{owner}/{repo}/releases/generate-notes") out='{"body":"generated notes"}' ;;
  "POST repos/{owner}/{repo}/releases") out='{"id":99,"html_url":"https://github.com/o/r/releases/tag/new"}' ;;
  "PATCH repos/{owner}/{repo}/releases/"*) out='{"html_url":"https://github.com/o/r/releases/tag/updated"}' ;;
  "DELETE repos/{owner}/{repo}/releases/"*) exit 0 ;;
  *) echo "fake gh: unexpected $method $path" >&2; exit 2 ;;
esac
if [ -n "$jq_expr" ]; then printf '%s' "$out" | jq -r "$jq_expr"; else printf '%s\n' "$out"; fi
EOF
chmod +x "$tmp/bin/gh"

fails=0
pass() { echo "ok:   $1"; }
fail() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }
check() { local name=$1; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
refute() { local name=$1; shift; if "$@"; then fail "$name"; else pass "$name"; fi; }

# run_step <id> <version> [VAR=value ...] -> exit code; calls in $tmp/log, outputs in $tmp/out
run_step() {
  local id=$1 version=$2; shift 2
  [ -f "$tmp/step-$id.sh" ] || { echo "no step with id '$id' and a run: in $workflow" >&2; exit 2; }
  rm -rf "$tmp/work"; mkdir -p "$tmp/work/pkg"; : >"$tmp/log"; : >"$tmp/out"; : >"$tmp/summary"
  printf '{"name":"@pursuit-amsterdam/x","version":%s}\n' "$version" >"$tmp/work/pkg/package.json"
  (cd "$tmp/work" && env PATH="$tmp/bin:$PATH" GH_LOG="$tmp/log" GITHUB_OUTPUT="$tmp/out" GITHUB_STEP_SUMMARY="$tmp/summary" \
    PACKAGE_DIR=pkg NOTES_COMMAND= SHA=abc1234 REF=refs/heads/main "$@" \
    bash -e "$tmp/step-draft.sh") >"$tmp/stdout" 2>&1
}
logged() { grep -qF -- "$1" "$tmp/log"; }
said() { grep -qF -- "$1" "$tmp/stdout"; }
output() { grep -qx -- "$1" "$tmp/out"; }

# --- refusals
refute "not the default branch: refused" run_step draft '"1.2.3"' REF=refs/heads/develop
check "  names both branches" said "main only"
refute "  and calls nothing else" logged "releases"
refute "no semver version: refused" run_step draft '"next"'
check "  names the file" said "pkg/package.json"
refute "missing version: refused" run_step draft 'null'

# --- tag exists: released, or being released
check "tag exists: nothing to do" run_step draft '"1.2.3"' FAKE_TAGS="v1.0.0 v1.2.3"
check "  says so" said "v1.2.3 exists"
check "  action=none" output "action=none"
refute "  no draft created" logged "POST repos/{owner}/{repo}/releases "
# cd-packages reads v1.2.3+2 as 1.2.3 (build metadata): that version is released too
check "a +N tag for this version: nothing to do" run_step draft '"1.2.3"' FAKE_TAGS="v1.2.3+2"
check "  says so" said "v1.2.3+2 exists"
refute "  no draft created" logged "POST repos/{owner}/{repo}/releases "
# Older repos tagged without the v (nextjs-feature-flags: 0.6.0-beta.1): that version is out too
check "a tag without the v for this version: nothing to do" run_step draft '"0.6.0-beta.1"' FAKE_TAGS="0.5.0-beta.3 0.6.0-beta.1"
check "  says so" said "0.6.0-beta.1 exists"
refute "  no draft created" logged "POST repos/{owner}/{repo}/releases "
check "an unprefixed tag with build metadata: nothing to do" run_step draft '"1.2.3"' FAKE_TAGS="1.2.3+1"
check "a tag that only starts the same: not this version" run_step draft '"1.2.3"' FAKE_TAGS="v1.2.30 v1.2.3-rc.1 1.2.30"
check "  draft created" logged "tag_name=v1.2.3"

# --- a new draft
check "no draft yet: created" run_step draft '"1.2.3"'
check "  with the tag from package.json" logged "tag_name=v1.2.3"
check "  at the pushed commit" logged "target_commitish=abc1234"
check "  as a draft" logged "draft=true"
check "  not a prerelease" logged "prerelease=false"
check "  with GitHub's generated notes" logged "body=generated notes"
check "  action=created" output "action=created"
check "  tag output" output "tag=v1.2.3"
check "  url output" output "url=https://github.com/o/r/releases/tag/new"

# --- notes from the repo
# shellcheck disable=SC2016  # the command must receive $VERSION literally; the step expands it
check "notes-command: its output is the body" run_step draft '"1.2.3"' NOTES_COMMAND='echo "notes for $VERSION"'
check "  with the version in VERSION" logged "body=notes for 1.2.3"
refute "  no generated notes" logged "generate-notes"
refute "notes-command that prints nothing: refused" run_step draft '"1.2.3"' NOTES_COMMAND='true'
check "  says so" said "printed nothing"
refute "  no draft created" logged "POST repos/{owner}/{repo}/releases "

# --- prerelease
check "a prerelease version: draft marked prerelease" run_step draft '"1.3.0-rc.1"'
check "  prerelease=true" logged "prerelease=true"
check "  tag v1.3.0-rc.1" logged "tag_name=v1.3.0-rc.1"

# --- an existing draft for this version
same='[{"id":7,"tag_name":"v1.2.3","draft":true,"target_commitish":"abc1234"}]'
check "draft already at this commit: nothing" run_step draft '"1.2.3"' FAKE_RELEASES="$same"
check "  action=none" output "action=none"
refute "  nothing patched" logged "PATCH"
refute "  nothing created" logged "POST repos/{owner}/{repo}/releases "
moved='[{"id":7,"tag_name":"v1.2.3","draft":true,"target_commitish":"old0000"}]'
check "draft at an older commit: moved" run_step draft '"1.2.3"' FAKE_RELEASES="$moved"
check "  patched to the pushed commit" logged "PATCH repos/{owner}/{repo}/releases/7 target_commitish=abc1234"
check "  with fresh notes" logged "body=generated notes"
check "  action=updated" output "action=updated"
refute "  nothing created" logged "POST repos/{owner}/{repo}/releases "

# --- stale drafts and published releases
mixed='[{"id":3,"tag_name":"v1.2.2","draft":true,"target_commitish":"x"},{"id":4,"tag_name":"v1.2.1","draft":false,"target_commitish":"y"},{"id":5,"tag_name":"v1.1.0","draft":true,"target_commitish":"z"}]'
check "drafts for other versions: removed, then a new draft" run_step draft '"1.2.3"' FAKE_RELEASES="$mixed"
check "  v1.2.2 draft deleted" logged "DELETE repos/{owner}/{repo}/releases/3"
check "  v1.1.0 draft deleted" logged "DELETE repos/{owner}/{repo}/releases/5"
refute "  the published v1.2.1 untouched" logged "releases/4"
check "  new draft created" logged "tag_name=v1.2.3"
check "  says which were removed" said "v1.2.2"

if [ "$fails" -gt 0 ]; then echo "$fails release-draft case(s) failed" >&2; exit 1; fi
echo "all release-draft cases pass"
