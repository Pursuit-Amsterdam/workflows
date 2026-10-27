// The pre-deploy step of the deploy-swarm action against a fake `ssh` that
// runs the script the way the manager would: `bash -s` on stdin, in a clean
// environment. The contract: a non-zero exit stops the step with that code, the
// script gets ENVIRONMENT, STACK_NAME and VERSION and nothing else from the
// job, a value is data and never code, and the step runs before the migrations
// and the stack deploy.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const action = steps('.github/actions/deploy-swarm/action.yml');
const bin = fakes('deploy-swarm');
const home = tempDir();

function preDeploy(remote: string, env: Record<string, string> = {}) {
    const ssh = join(tempDir(), 'ssh.log');
    const r = bash(script(action, 'pre-deploy'), {
        bin,
        env: {
            SSH_LOG: ssh,
            FAKE_HOME: home,
            SSH_USER: 'deploy',
            ENVIRONMENT: 'staging',
            STACK_NAME: 'gp-map-staging',
            VERSION: 'v1.2.3',
            PRE_DEPLOY: remote,
            OP_SERVICE_ACCOUNT_TOKEN: 'secret-token',
            ...env,
        },
    });
    return { ...r, ssh: lines(ssh).join('\n') };
}

test('a failing check stops the step with its own exit code', () => {
    const r = preDeploy('echo checking; exit 3');
    assert.equal(r.code, 3);
    assert.match(r.output, /checking/, "the script's output is shown");
});

test('a passing script passes', () => {
    assert.equal(preDeploy('test -n "$ENVIRONMENT"').code, 0);
});

test('ENVIRONMENT, STACK_NAME and VERSION arrive; secrets do not', () => {
    const r = preDeploy(
        'echo "env=$ENVIRONMENT stack=$STACK_NAME version=$VERSION token=${OP_SERVICE_ACCOUNT_TOKEN:-none}"',
    );
    assert.ok(r.output.split('\n').includes('env=staging stack=gp-map-staging version=v1.2.3 token=none'), r.output);
});

test('an unset variable fails the script (set -u)', () => {
    assert.notEqual(preDeploy('echo "$UNSET_VARIABLE"').code, 0);
});

test('a value is data, never code', () => {
    const pwned = join(tempDir(), 'pwned');
    const r = preDeploy('echo "version=$VERSION"', { VERSION: `v1; touch ${pwned}` });
    assert.ok(!existsSync(pwned), 'a hostile VERSION executes nothing');
    assert.ok(r.output.includes(`version=v1; touch ${pwned}`), 'the value arrives literally');
});

test('ssh runs in batch mode, as deploy@swarm-manager', () => {
    const r = preDeploy('true');
    assert.match(r.ssh, /BatchMode=yes/);
    assert.match(r.ssh, /deploy@swarm-manager/);
});

test('pre-deploy runs after the GHCR login, before the migrations and the deploy', () => {
    const order = action.map((s) => s.id || s.name || '');
    const at = (name: string) => order.indexOf(name);
    assert.ok(at('pre-deploy') >= 0, 'pre-deploy exists');
    assert.ok(at('Log in to GHCR') < at('pre-deploy'), 'after the GHCR login');
    assert.ok(at('pre-deploy') < at('Run migrations'), 'before the migrations');
    assert.ok(at('pre-deploy') < at('Deploy stack'), 'before the deploy');
});
