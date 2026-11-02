// The pure part of the token checks in audit-consumers and setup-consumer:
// which environments need CUSTOM_GITHUB_TOKEN. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dependabotNeedsToken, readsTokenDirectly, tokenEnvironments } from './token.ts';
import { parseWorkflow } from './workflow.ts';

const W = 'Pursuit-Amsterdam/workflows/.github/workflows';

test('tokenEnvironments: CI and ci-images run in integration', () => {
    const ci = parseWorkflow('ci.yml', `on: pull_request
jobs:
    run-ci:
        uses: ${W}/ci.yml@v2
        with:
            use-custom-token: true
        secrets: inherit
    run-ci-images:
        uses: ${W}/ci-images.yml@v2
        with:
            use-custom-token: true
        secrets: inherit
`);
    assert.deepEqual(tokenEnvironments([ci]), ['integration']);
});

test('tokenEnvironments: a gate target means every deploy environment, a literal only that one', () => {
    const cd = parseWorkflow('cd.yml', `on: release
jobs:
    deploy:
        uses: ${W}/cd-vercel.yml@v2
        with:
            environment: \${{ needs.gate.outputs.target }}
            use-custom-token: true
        secrets: inherit
    publish:
        uses: ${W}/cd-packages.yml@v2
        with:
            environment: Production
            use-custom-token: 'true'
        secrets: inherit
`);
    assert.deepEqual(tokenEnvironments([cd]), ['acceptance', 'production', 'staging']);
    const packages = parseWorkflow('cd.yml', `on: release
jobs:
    publish:
        uses: ${W}/cd-packages.yml@v2
        with:
            environment: Production
            use-custom-token: true
`);
    assert.deepEqual(tokenEnvironments([packages]), ['production']);
});

test('tokenEnvironments: cd-pages deploys in github-pages, tms-sync in staging', () => {
    const wf = parseWorkflow('ci.yml', `on: push
jobs:
    run-ci:
        uses: ${W}/ci.yml@v2
        with:
            tms-sync-branch: develop
            use-custom-token: true
    storybook:
        uses: ${W}/cd-pages.yml@v2
        with:
            use-custom-token: true
`);
    assert.deepEqual(tokenEnvironments([wf]), ['github-pages', 'integration', 'staging']);
});

test('tokenEnvironments: nothing without use-custom-token, and not for other callers', () => {
    const wf = parseWorkflow('ci.yml', `on: push
jobs:
    run-ci:
        uses: ${W}/ci.yml@v2
        with:
            use-custom-token: false
    run-check-pr:
        uses: ${W}/check-pr.yml@v2
    build:
        runs-on: ubuntu-latest
        steps: []
`);
    assert.deepEqual(tokenEnvironments([wf]), []);
});

test('readsTokenDirectly: a job of its own that names the secret, not a caller that passes it on', () => {
    const inherit = parseWorkflow('ci.yml', `on: push
jobs:
    run-ci:
        uses: ${W}/ci.yml@v2
        secrets: inherit
    run-ci-images:
        uses: ${W}/ci-images.yml@v2
        secrets:
            CUSTOM_GITHUB_TOKEN: \${{ secrets.CUSTOM_GITHUB_TOKEN }}
`);
    const own = parseWorkflow('release.yml', `on: release
jobs:
    build:
        runs-on: ubuntu-latest
        steps:
            - run: echo
              env:
                  TOKEN: \${{ secrets.CUSTOM_GITHUB_TOKEN }}
`);
    assert.equal(readsTokenDirectly([inherit]), false);
    assert.equal(readsTokenDirectly([inherit, own]), true);
});

test('dependabotNeedsToken: only a registry that reads with the secret', () => {
    assert.equal(dependabotNeedsToken(null), false);
    assert.equal(dependabotNeedsToken('version: 2\nupdates: []\n'), false);
    assert.equal(dependabotNeedsToken('registries:\n    github-npm:\n        token: ${{ secrets.CUSTOM_GITHUB_TOKEN }}\n'), true);
});
