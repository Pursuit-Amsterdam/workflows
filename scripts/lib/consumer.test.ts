// The pure part of the consumer model: which environments cd-gate deploys a
// branch to. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateBranchTargets } from './consumer.ts';
import { parseWorkflow } from './workflow.ts';

const W = 'Pursuit-Amsterdam/workflows/.github/workflows';

const cd = (withBlock: string) =>
    parseWorkflow(
        'cd.yml',
        `on: release
jobs:
    gate:
        uses: ${W}/cd-gate.yml@v2
${withBlock}
    deploy:
        needs: gate
        uses: ${W}/cd-vercel.yml@v2
        with:
            environment: \${{ needs.gate.outputs.target }}
`,
    );

test('gateBranchTargets: no cd-gate call is null (v1, or no deploys)', () => {
    const ci = parseWorkflow('ci.yml', `on: push\njobs:\n    run-ci:\n        uses: ${W}/ci.yml@v2\n`);
    assert.equal(gateBranchTargets([ci]), null);
});

test("gateBranchTargets: no branch-targets is cd-gate's default, staging and acceptance", () => {
    assert.deepEqual(gateBranchTargets([cd('')]), ['acceptance', 'staging']);
    assert.deepEqual(gateBranchTargets([cd('        with:\n            allow-prerelease: true')]), ['acceptance', 'staging']);
});

test('gateBranchTargets: an empty branch-targets is production only', () => {
    assert.deepEqual(gateBranchTargets([cd('        with:\n            branch-targets: ""')]), []);
});

test('gateBranchTargets: the pairs that are given, nothing else', () => {
    assert.deepEqual(gateBranchTargets([cd('        with:\n            branch-targets: develop=staging')]), ['staging']);
    assert.deepEqual(gateBranchTargets([cd('        with:\n            branch-targets: "develop=staging  acceptance=acceptance"')]), ['acceptance', 'staging']);
});

test('gateBranchTargets: an expression cannot be read, so it counts as the default', () => {
    assert.deepEqual(gateBranchTargets([cd('        with:\n            branch-targets: ${{ vars.TARGETS }}')]), ['acceptance', 'staging']);
});

test('gateBranchTargets: two gates add up', () => {
    const a = cd('        with:\n            branch-targets: ""');
    const b = parseWorkflow('cd-docs.yml', `on: release\njobs:\n    gate:\n        uses: ${W}/cd-gate.yml@v2\n        with:\n            branch-targets: develop=staging\n`);
    assert.deepEqual(gateBranchTargets([a, b]), ['staging']);
});
