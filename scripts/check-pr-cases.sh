#!/usr/bin/env bash
# Runs check-pr.sh for a table of "HEAD BASE expected-exit" cases and fails on
# the first mismatch. check-pr.sh keeps HEAD and BASE on its first two lines so
# it can be run by hand; this script swaps those two lines per case.
#
#   scripts/check-pr-cases.sh        # from the repo root, or anywhere
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT

# HEAD BASE expected-exit. 0 = merge allowed, 1 = refused.
cases=(
  # existing rules
  "feature/x develop 0"
  "dependabot/npm_and_yarn/x develop 0"
  "main develop 0"
  "hotfix/x main 0"
  "release/1.2 main 0"
  "develop main 0"
  "feature/x main 1"
  "develop acceptance 0"
  "module-feature/x module-develop/x 0"
  "feature/a feature/b 0"
  "not-a-valid-name develop 1"
  # version branches (v2, v3, ...)
  "feature/x v2 0"
  "hotfix/x v2 0"
  "revert-12-feature/x v2 0"
  "feature/x v10 0"
  "develop v2 1"
  "main v2 1"
  "v2 main 1"
  "v2 develop 1"
  "v2 v3 1"
  "vx main 1"
  # repos without develop (config packages): feature and dependabot go to main
  "feature/x main 0 false"
  "dependabot/npm_and_yarn/x main 0 false"
  "revert-3-feature/x main 0 false"
  "hotfix/x main 0 false"
  "module-develop/x main 1 false"
  "feature/x main 1 true"
)

n=0
failures=0
for c in "${cases[@]}"; do
  read -r head base want has_develop <<<"$c"
  n=$((n + 1))
  {
    printf 'HEAD=%q\nBASE=%q\nHAS_DEVELOP=%q\n' "$head" "$base" "${has_develop:-true}"
    tail -n +4 "$root/check-pr.sh"
  } >"$tmp"
  got=0
  bash "$tmp" >/dev/null 2>&1 || got=$?
  if [ "$got" != "$want" ]; then
    echo "FAIL: $head → $base: expected exit $want, got $got"
    failures=$((failures + 1))
  fi
done

echo "$n cases, $failures failures"
[ "$failures" -eq 0 ]
