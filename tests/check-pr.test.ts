// The merge rules: one table of head → base cases, run through the script in
// check-pr.yml (with a fake gh that says whether develop exists) and through its
// local mirror check-pr.sh, so the two cannot drift apart.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, root, steps } from './steps.ts';

const bin = fakes('check-pr');
const workflow = steps('.github/workflows/check-pr.yml', 'pipeline').find((s) => s.run)?.run ?? '';
// check-pr.sh keeps HEAD, BASE and HAS_DEVELOP on its first three lines; here they come from env.
const mirror = readFileSync(join(root, 'check-pr.sh'), 'utf8').split('\n').slice(3).join('\n');

// head, base, allowed, has develop (default true)
const cases: [string, string, boolean, boolean?][] = [
    // the branch model
    ['feature/x', 'develop', true],
    ['dependabot/npm_and_yarn/x', 'develop', true],
    ['main', 'develop', true],
    ['hotfix/x', 'main', true],
    ['release/1.2', 'main', true],
    ['develop', 'main', true],
    ['feature/x', 'main', false],
    ['develop', 'acceptance', true],
    ['module-feature/x', 'module-develop/x', true],
    ['feature/a', 'feature/b', true],
    ['not-a-valid-name', 'develop', false],
    // version branches (v2, v3, ...)
    ['feature/x', 'v2', true],
    ['hotfix/x', 'v2', true],
    ['revert-12-feature/x', 'v2', true],
    ['feature/x', 'v10', true],
    ['develop', 'v2', false],
    ['main', 'v2', false],
    ['v2', 'main', false],
    ['v2', 'develop', false],
    ['v2', 'v3', false],
    ['vx', 'main', false],
    // repos without develop (config packages): feature and dependabot go to main
    ['feature/x', 'main', true, false],
    ['dependabot/npm_and_yarn/x', 'main', true, false],
    ['revert-3-feature/x', 'main', true, false],
    ['hotfix/x', 'main', true, false],
    ['module-develop/x', 'main', false, false],
    ['feature/x', 'main', false, true],
];

for (const [head, base, allowed, hasDevelop = true] of cases) {
    const name = `${head} → ${base}${hasDevelop ? '' : ' (no develop)'}: ${allowed ? 'allowed' : 'refused'}`;
    test(name, () => {
        const want = allowed ? 0 : 1;
        const viaWorkflow = bash(workflow, {
            bin,
            env: { HEAD: head, BASE: base, REPO: 'o/r', GH_TOKEN: 'x', FAKE_DEVELOP: String(hasDevelop) },
        });
        assert.equal(viaWorkflow.code, want, `check-pr.yml:\n${viaWorkflow.output}`);
        const viaMirror = bash(mirror, { bin, env: { HEAD: head, BASE: base, HAS_DEVELOP: String(hasDevelop) } });
        assert.equal(viaMirror.code, want, `check-pr.sh:\n${viaMirror.output}`);
    });
}

test('check-pr.yml outside a pull_request: refused', () => {
    const r = bash(workflow, { bin, env: { HEAD: '', BASE: '', REPO: 'o/r', GH_TOKEN: 'x' } });
    assert.equal(r.code, 1);
    assert.match(r.output, /No pull_request in the event/);
});

test('check-pr.yml when GitHub cannot say whether develop exists: refused', () => {
    const r = bash(workflow, {
        bin,
        env: { HEAD: 'feature/x', BASE: 'develop', REPO: 'o/r', GH_TOKEN: 'x', FAKE_DEVELOP: 'error' },
    });
    assert.equal(r.code, 1);
    assert.match(r.output, /Cannot tell whether o\/r has a develop branch/);
});
