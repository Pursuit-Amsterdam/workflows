#!/usr/bin/env bash
# The pre-deploy scripts in this file are for the remote shell: single quotes on purpose.
# shellcheck disable=SC2016
# Runs the pre-deploy step of the deploy-swarm action against a fake `ssh`
# that executes the script the way the manager would: `bash -s` on stdin, in a
# clean environment. Checks the contract: a non-zero exit stops the step with
# that code, the script gets ENVIRONMENT, STACK_NAME and VERSION and nothing
# else from the job, a value is data and never code, and the step runs before
# the migrations and the stack deploy.
#
#   scripts/deploy-swarm-cases.sh [action.yml]   # default: this repo's deploy-swarm
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
action=${1:-"$root/.github/actions/deploy-swarm/action.yml"}
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# The step's run: script, and the order of the steps.
NODE_PATH="$root/node_modules" node - "$action" "$tmp" <<'EOF'
const fs = require('fs');
const { parse } = require('yaml');
const [file, out] = process.argv.slice(2);
const steps = parse(fs.readFileSync(file, 'utf8')).runs.steps;
fs.writeFileSync(`${out}/order`, steps.map((s) => `${s.id || s.name || ''}\n`).join(''));
const pre = steps.find((s) => s.id === 'pre-deploy');
if (pre) fs.writeFileSync(`${out}/step-pre-deploy.sh`, pre.run);
EOF

# The fake ssh logs its arguments and runs the last one (the remote command)
# with the script on stdin, without the runner's environment.
mkdir -p "$tmp/bin"
cat >"$tmp/bin/ssh" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' "$*" >"$SSH_LOG"
remote=${*: -1}
exec env -i PATH=/usr/bin:/bin HOME="$FAKE_HOME" bash -c "$remote"
EOF
chmod +x "$tmp/bin/ssh"
mkdir -p "$tmp/home"

fails=0
pass() { echo "ok:   $1"; }
fail() { echo "FAIL: $1" >&2; fails=$((fails + 1)); }
# check <name> <command...>: pass when the command succeeds
check() { local name=$1; shift; if "$@"; then pass "$name"; else fail "$name"; fi; }
# refute <name> <command...>: pass when the command fails
refute() { local name=$1; shift; if "$@"; then fail "$name"; else pass "$name"; fi; }

[ -f "$tmp/step-pre-deploy.sh" ] || { echo "no step with id 'pre-deploy' and a run: in $action" >&2; exit 2; }

# run_pre_deploy <script> [VAR=value ...] -> exit code; output in $tmp/out
run_pre_deploy() {
  local script=$1; shift
  (env PATH="$tmp/bin:$PATH" SSH_LOG="$tmp/ssh.log" FAKE_HOME="$tmp/home" \
    SSH_USER=deploy ENVIRONMENT=staging STACK_NAME=gp-map-staging VERSION=v1.2.3 \
    PRE_DEPLOY="$script" OP_SERVICE_ACCOUNT_TOKEN=secret-token "$@" \
    bash -e "$tmp/step-pre-deploy.sh") >"$tmp/out" 2>&1
}
exit_code() { local c=0; run_pre_deploy "$@" || c=$?; echo "$c"; }

# 1. A failing check stops the step with its own exit code.
check "exit 3 stops the step with exit code 3" test "$(exit_code 'echo checking; exit 3')" -eq 3
check "the script's output is shown" grep -q checking "$tmp/out"

# 2. A passing script passes.
check "a passing script passes" run_pre_deploy 'test -n "$ENVIRONMENT"'

# 3. The three variables arrive, nothing else from the job.
run_pre_deploy 'echo "env=$ENVIRONMENT stack=$STACK_NAME version=$VERSION token=${OP_SERVICE_ACCOUNT_TOKEN:-none}"' || true
check "ENVIRONMENT, STACK_NAME and VERSION arrive; secrets do not" \
  grep -qx 'env=staging stack=gp-map-staging version=v1.2.3 token=none' "$tmp/out"

# 4. set -euo pipefail is on: an unset variable fails the check instead of passing it.
refute "an unset variable fails the script (set -u)" test "$(exit_code 'echo "$UNSET_VARIABLE"')" -eq 0

# 5. A value is data, never code.
run_pre_deploy 'echo "version=$VERSION"' VERSION="v1; touch $tmp/pwned" || true
refute "a hostile VERSION executes nothing" test -e "$tmp/pwned"
check "the value arrives literally" grep -qF "version=v1; touch $tmp/pwned" "$tmp/out"

# 6. The ssh call: batch mode, the right user and host alias.
run_pre_deploy 'true' || true
check "ssh runs in batch mode" grep -q 'BatchMode=yes' "$tmp/ssh.log"
check "ssh goes to deploy@swarm-manager" grep -q 'deploy@swarm-manager' "$tmp/ssh.log"

# 7. Order: after the GHCR login, before the migrations and the deploy.
order=$(cat "$tmp/order")
pos() { grep -n -x "$1" <<<"$order" | cut -d: -f1; }
login=$(pos "Log in to GHCR"); pre=$(pos pre-deploy); migrate=$(pos "Run migrations"); deploy=$(pos "Deploy stack")
check "pre-deploy runs after the GHCR login, before migrations and deploy" \
  test -n "$pre" -a "$login" -lt "${pre:-0}" -a "${pre:-0}" -lt "$migrate" -a "${pre:-0}" -lt "$deploy"

[ "$fails" -eq 0 ] || { echo "$fails case(s) failed" >&2; exit 1; }
echo "all deploy-swarm cases pass"
