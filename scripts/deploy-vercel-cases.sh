#!/usr/bin/env bash
# Runs the `run:` scripts of the deploy-vercel action against a fake `vercel`
# on PATH, and checks what the action asks of the CLI: which environment it
# pulls, which flags it builds and deploys with, where the 1Password env file
# goes, and the `url` output. The scripts read every input from env, so they
# run here as they run on a runner.
#
#   scripts/deploy-vercel-cases.sh [action.yml]   # default: this repo's deploy-vercel
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
action=${1:-"$root/.github/actions/deploy-vercel/action.yml"}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# One file per step id: $tmp/step-<id>.sh
NODE_PATH="$root/node_modules" node - "$action" "$tmp" <<'EOF'
const fs = require('fs');
const { parse } = require('yaml');
const [file, out] = process.argv.slice(2);
for (const step of parse(fs.readFileSync(file, 'utf8')).runs.steps) {
    if (step.id && step.run) fs.writeFileSync(`${out}/step-${step.id}.sh`, step.run);
}
EOF

# The fake CLI logs every call, and behaves just enough: pull writes the env
# file vercel build reads, deploy prints progress on stderr and the URL on
# stdout (or no URL, with FAKE_NO_URL).
mkdir -p "$tmp/bin"
cat >"$tmp/bin/vercel" <<'EOF'
#!/usr/bin/env bash
echo "vercel $*" >>"$VERCEL_LOG"
case "$1" in
  pull)
    for a in "$@"; do case "$a" in --environment=*) mkdir -p .vercel; : >".vercel/.env.${a#--environment=}.local" ;; esac; done ;;
  deploy)
    echo "Uploading..." >&2
    [ -n "${FAKE_NO_URL:-}" ] || echo "https://app-abc123.vercel.app" ;;
esac
EOF
chmod +x "$tmp/bin/vercel"

fails=0
pass() { echo "ok:   $1"; }
fail() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }
# check <name> <command...>: pass when the command succeeds
check() { local name=$1; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
# refute <name> <command...>: pass when the command fails
refute() { local name=$1; shift; if "$@"; then fail "$name"; else pass "$name"; fi; }

# run_step <id> [VAR=value ...] -> exit code; log in $tmp/log, outputs in $tmp/out
run_step() {
  local id=$1; shift
  [ -f "$tmp/step-$id.sh" ] || { echo "no step with id '$id' and a run: in $action" >&2; exit 2; }
  rm -rf "$tmp/work"; mkdir -p "$tmp/work"; : >"$tmp/log"; : >"$tmp/out"
  (cd "$tmp/work" && env PATH="$tmp/bin:$PATH" VERCEL_LOG="$tmp/log" GITHUB_OUTPUT="$tmp/out" \
    VERCEL_TOKEN=tok VERCEL_ORG_ID=team_x VERCEL_PROJECT_ID=prj_x "$@" \
    bash -e "$tmp/step-$id.sh") >"$tmp/stdout" 2>&1
}

# A 1Password export as setup-onepassword writes it: NUL-delimited --env args.
printf -- '--env\0API_KEY=secret\0' >"$tmp/env-args"

# 1. build-mode and environment are validated before anything runs. Vercel
#    knows staging (the custom environment of develop) and production; nothing
#    else was decided, and a typo must not deploy anywhere.
for m in github vercel; do check "build-mode $m accepted" run_step validate BUILD_MODE=$m ENVIRONMENT=staging; done
for m in azure ""; do refute "build-mode '$m' refused" run_step validate BUILD_MODE=$m ENVIRONMENT=staging; done
for e in staging production; do check "environment $e accepted" run_step validate BUILD_MODE=github ENVIRONMENT=$e; done
for e in acceptance prod ""; do refute "environment '$e' refused" run_step validate BUILD_MODE=github ENVIRONMENT=$e; done

# 2. The CLI is pinned.
check "CLI pinned to an exact version" grep -Eq 'vercel@[0-9]+\.[0-9]+\.[0-9]+' "$tmp/step-install.sh"

# 3. staging is the Vercel custom environment `staging` (the develop branch,
#    with its own URL): pulled, built and deployed with --target=staging.
#    production is --prod and never has a --target.
for mode in github vercel; do
  for env in staging production; do
    name="$mode/$env"
    if ! run_step "deploy-$mode" ENVIRONMENT=$env VERCEL_ENV_ARGS_BIN="$tmp/env-args"; then
      fail "$name: step failed: $(tail -3 "$tmp/stdout")"; continue
    fi
    if [ "$env" = production ]; then
      check "$name: deploy --prod" grep -q '^vercel deploy .*--prod' "$tmp/log"
      refute "$name: no --target" grep -q -- '--target' "$tmp/log"
    else
      check "$name: deploy --target=staging" grep -q '^vercel deploy .*--target=staging' "$tmp/log"
      refute "$name: no --prod" grep -q -- '--prod' "$tmp/log"
    fi
    check "$name: url output" grep -qx 'url=https://app-abc123.vercel.app' "$tmp/out"
    if [ "$mode" = github ]; then
      check "$name: pulls $env" grep -q -- "^vercel pull .*--environment=$env" "$tmp/log"
      check "$name: secrets in .vercel/.env.$env.local" grep -qsx 'API_KEY="secret"' "$tmp/work/.vercel/.env.$env.local"
      if [ "$env" = production ]; then
        check "$name: build --prod" grep -q '^vercel build .*--prod' "$tmp/log"
      else
        check "$name: build --target=staging" grep -q '^vercel build .*--target=staging' "$tmp/log"
      fi
    fi
  done
done

# 4. A deploy that prints no URL fails: the health check after it needs one.
for mode in github vercel; do
  refute "$mode: no URL refused" run_step "deploy-$mode" ENVIRONMENT=staging FAKE_NO_URL=1
done

[ "$fails" -eq 0 ] || { echo "$fails case(s) failed" >&2; exit 1; }
echo "all deploy-vercel cases pass"
