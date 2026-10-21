#!/usr/bin/env bash
# Runs the `run:` scripts of cd-supabase.yml against a fake `supabase` on
# PATH, and checks what the workflow refuses and what it asks of the CLI:
# validation, function secrets (written to a file, never on the command line),
# migrations (link + db push, password from the 1Password variable) and the
# edge function deploys. The scripts read every input from env, so they run
# here as they run on a runner.
#
#   scripts/cd-supabase-cases.sh [cd-supabase.yml]   # default: this repo's
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
workflow=${1:-"$root/.github/workflows/cd-supabase.yml"}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# One file per step id: $tmp/step-<id>.sh
python3 - "$workflow" "$tmp" <<'EOF'
import sys, yaml
workflow, out = sys.argv[1], sys.argv[2]
for step in yaml.safe_load(open(workflow))["jobs"]["deploy"]["steps"]:
    if "id" in step and "run" in step:
        open(f"{out}/step-{step['id']}.sh", "w").write(step["run"])
EOF

# The fake CLI logs every call; `secrets set` also logs the env file it got,
# `secrets list` prints FAKE_LIVE_SECRETS as the JSON the real one prints.
mkdir -p "$tmp/bin"
cat >"$tmp/bin/supabase" <<'EOF'
#!/usr/bin/env bash
echo "supabase $*" >>"$SUPABASE_LOG"
case "$1 $2" in
  "secrets set")
    while [ $# -gt 0 ]; do [ "$1" = --env-file ] && sed 's/^/  file: /' "$2" >>"$SUPABASE_LOG"; shift; done ;;
  "secrets list")
    printf '['; sep=; for n in ${FAKE_LIVE_SECRETS:-}; do printf '%s{"name":"%s","value":"digest"}' "$sep" "$n"; sep=,; done; echo ']' ;;
  "db push")
    echo "password seen: ${SUPABASE_DB_PASSWORD:-none}" >>"$SUPABASE_LOG" ;;
esac
EOF
chmod +x "$tmp/bin/supabase"

fails=0
pass() { echo "ok:   $1"; }
fail() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }
check() { local name=$1; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
refute() { local name=$1; shift; if "$@"; then fail "$name"; else pass "$name"; fi; }

# run_step <id> [VAR=value ...] -> exit code; CLI calls in $tmp/log, output in $tmp/stdout
run_step() {
  local id=$1; shift
  [ -f "$tmp/step-$id.sh" ] || { echo "no step with id '$id' and a run: in $workflow" >&2; exit 2; }
  : >"$tmp/log"
  env PATH="$tmp/bin:$PATH" SUPABASE_LOG="$tmp/log" \
    PROJECT_REF=abcdefghijklmnop SUPABASE_ACCESS_TOKEN=sbp_token "$@" \
    bash -e "$tmp/step-$id.sh" >"$tmp/stdout" 2>&1
}
logged() { grep -qF -- "$1" "$tmp/log"; }
said() { grep -qF -- "$1" "$tmp/stdout"; }

# --- validate
refute "migrations off and functions none: refused" run_step validate MIGRATIONS=false FUNCTIONS=none ENV_KEYS=
check "  says there is nothing to deploy" said "Nothing to deploy"
refute "no project ref: refused" run_step validate MIGRATIONS=true FUNCTIONS= ENV_KEYS= PROJECT_REF= ENVIRONMENT=staging
check "  names the environment" said "vars.SUPABASE_PROJECT_REF is not set on environment 'staging'"
refute "no access token: refused" run_step validate MIGRATIONS=true FUNCTIONS= ENV_KEYS= SUPABASE_ACCESS_TOKEN=
check "  says the token is missing" said "SUPABASE_ACCESS_TOKEN is not available"
refute "SUPABASE_URL as a function secret: refused" run_step validate MIGRATIONS=true FUNCTIONS= ENV_KEYS="RESEND_KEY SUPABASE_URL"
check "  says the platform provides it" said "SUPABASE_URL is provided by the platform"
check "migrations only: accepted" run_step validate MIGRATIONS=true FUNCTIONS=none ENV_KEYS=

# --- function secrets
refute "a key without a value in the 1Password item: refused" run_step secrets ENV_KEYS="RESEND_KEY MAPS_KEY" RESEND_KEY=r1
check "  names the missing key" said "MAPS_KEY"
refute "  and sets nothing" logged "secrets set"
check "all keys present: set" run_step secrets ENV_KEYS="RESEND_KEY MAPS_KEY" RESEND_KEY=r1 MAPS_KEY=m2
check "  through an env file on the project" logged "supabase secrets set --project-ref abcdefghijklmnop --env-file"
check "  with both keys in it" logged "file: MAPS_KEY=m2"
refute "  and no value on the command line" grep -q "secrets set.*r1" "$tmp/log"

# --- migrations
refute "no database password in the 1Password item: refused" run_step migrations DB_PASSWORD_VARIABLE=SUPABASE_DB_PASSWORD
check "  names the variable" said "SUPABASE_DB_PASSWORD is not in the environment's 1Password item"
refute "  and pushes nothing" logged "db push"
check "password present: link and push" run_step migrations DB_PASSWORD_VARIABLE=DB_PASS DB_PASS=s3cret
check "  links the project" logged "supabase link --project-ref abcdefghijklmnop"
check "  pushes" logged "supabase db push"
check "  with the password from the chosen variable" logged "password seen: s3cret"
refute "  never on the command line" grep -q "^supabase .*s3cret" "$tmp/log"

# --- edge functions
check "functions empty: every function in config.toml" run_step functions FUNCTIONS=
check "  in one deploy, bundled by the API" logged "supabase functions deploy --project-ref abcdefghijklmnop --use-api"
check "named functions: one deploy each" run_step functions FUNCTIONS="hello mail"
check "  hello" logged "supabase functions deploy hello --project-ref abcdefghijklmnop --use-api"
check "  mail" logged "supabase functions deploy mail --project-ref abcdefghijklmnop --use-api"

# --- unmanaged secrets
check "report runs" run_step report ENV_KEYS="RESEND_KEY" FAKE_LIVE_SECRETS="RESEND_KEY OLD_KEY SUPABASE_URL"
check "  warns about a live key that is not listed" said "OLD_KEY is live on abcdefghijklmnop but not listed"
refute "  not about a listed one" said "RESEND_KEY is live"
refute "  not about a platform one" said "SUPABASE_URL is live"

if [ "$fails" -gt 0 ]; then echo "$fails cd-supabase case(s) failed" >&2; exit 1; fi
echo "all cd-supabase cases pass"
