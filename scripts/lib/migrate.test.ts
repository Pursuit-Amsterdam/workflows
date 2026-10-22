// Fixtures are the v1 files as the consumer repos have them (template-nextjs-vercel
// before its migration, foodcabinet, gp-groot). Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse } from 'yaml';
import { DEPENDABOT_YAML, migrate, type RepoFacts } from './migrate.ts';

const facts = (over: Partial<RepoFacts> = {}): RepoFacts => ({
    repo: 'example-site',
    hasDevelop: true,
    hasAcceptance: false,
    packageJson: JSON.stringify({ packageManager: 'pnpm@11.28.6', scripts: { lint: 'eslint', typecheck: 'tsc', test: 'jest', build: 'next build' } }),
    hasLockfile: true,
    nvmrc: '24\n',
    codeowners: '* @Pursuit-Amsterdam/senior-developers\n',
    dependabot: DEPENDABOT_YAML,
    ...over,
});

const deployJob = (env: string, extra = '') => `    run-deploy-${env}:
        if: github.ref == 'refs/heads/develop'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
        with:
            node-version: '22.x'
            environment: '${env}'
            build-mode: 'github'
            platform: 'vercel'
            use-custom-token: true
            run-test: true
            run-lint: true
            run-typecheck: true
            onepassword_enabled: true
            onepassword_vault: my-website-${env}
            onepassword_item: my-website-${env}-secrets
${extra}        secrets: inherit
`;
const WEB_CD = (...envs: string[]) => `name: Continuous Deployment
on:
    push:
        branches: [develop]
    release:
        types: [published]
jobs:
${envs.map(e => deployJob(e)).join('\n')}`;
const WEB_CI = (extra = '') => `name: Continuous Integration
on:
    push:
        branches: [main, develop, 'feature/*', 'hotfix/*', 'dependabot/*']
jobs:
    run-ci:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-ci.yml@main
        with:
            node-version: '22.x'
            run-build: false
            run-test: true
            run-lint: true
            run-typecheck: true
            use-custom-token: true
${extra}        secrets: inherit
`;
const CHECK_PR = `name: Check pull request validity
on:
    pull_request:
        branches: [main, develop]
jobs:
    run-check-pr:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@main
        with:
            head-ref: \${{ github.event.pull_request.head.ref }}
            base-ref: \${{ github.event.pull_request.base.ref }}
`;
const STORYBOOK = `name: Storybook Deployment
on:
    push:
        branches: [develop]
permissions:
    contents: read
    pages: write
    id-token: write
jobs:
    run-deploy-staging:
        if: github.ref == 'refs/heads/develop'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/storybook-cd.yml@main
        with:
            node-version: '22.x'
            use-custom-token: true
        secrets: inherit
`;

type Doc = { on: Record<string, { branches?: string[] }>; jobs: Record<string, { uses?: string; with?: Record<string, unknown>; if?: string; needs?: string }> };
const yaml = (m: Map<string, string | null>, path: string): Doc => {
    const text = m.get(path);
    assert.ok(text, `${path} was not written`);
    return parse(text) as Doc;
};

test('Vercel site with staging and production: the migration example', () => {
    const m = migrate(facts(), [
        { file: 'web-ci.yml', text: WEB_CI() },
        { file: 'web-cd.yml', text: WEB_CD('staging', 'production') },
        { file: 'check-pr.yml', text: CHECK_PR },
        { file: 'storybook-cd.yml', text: STORYBOOK },
    ]);
    // CI: one ci.yml, checks from the run-* flags (run-build: false leaves build out)
    const ci = yaml(m.files, '.github/workflows/ci.yml');
    assert.deepEqual(ci.on.push!.branches, ['main', 'develop']);
    assert.equal(ci.jobs['run-ci']!.uses, 'Pursuit-Amsterdam/workflows/.github/workflows/ci.yml@v2');
    assert.deepEqual(ci.jobs['run-ci']!.with, { checks: 'lint typecheck test', 'use-custom-token': true });
    assert.equal(m.files.get('.github/workflows/web-ci.yml'), null);
    // CD: gate + cd-vercel, workflow_run on develop, no quality checks
    const cd = yaml(m.files, '.github/workflows/cd.yml');
    assert.deepEqual(cd.on.workflow_run!.branches, ['develop']);
    assert.ok('release' in cd.on && 'workflow_dispatch' in cd.on && !('push' in cd.on));
    assert.equal(cd.jobs.gate!.uses, 'Pursuit-Amsterdam/workflows/.github/workflows/cd-gate.yml@v2');
    assert.deepEqual(cd.jobs.gate!.with, { 'branch-targets': 'develop=staging' });
    assert.match(cd.jobs.gate!.if!, /workflow_run\.conclusion == 'success'/);
    assert.equal(cd.jobs.deploy!.uses, 'Pursuit-Amsterdam/workflows/.github/workflows/cd-vercel.yml@v2');
    assert.equal(cd.jobs.deploy!.needs, 'gate');
    assert.deepEqual(cd.jobs.deploy!.with, { environment: '${{ needs.gate.outputs.target }}', ref: '${{ needs.gate.outputs.sha }}', 'use-custom-token': true });
    assert.equal(m.files.get('.github/workflows/web-cd.yml'), null);
    // 1Password names move to the environments
    assert.deepEqual(m.envVars, [
        { environment: 'staging', name: 'OP_VAULT', value: 'my-website-staging' },
        { environment: 'staging', name: 'OP_ITEM', value: 'my-website-staging-secrets' },
        { environment: 'production', name: 'OP_VAULT', value: 'my-website-production' },
        { environment: 'production', name: 'OP_ITEM', value: 'my-website-production-secrets' },
    ]);
    // check-pr: no head-ref/base-ref, runs on edited, no branch filter
    const pr = yaml(m.files, '.github/workflows/check-pr.yml');
    assert.equal(pr.jobs['run-check-pr']!.uses, 'Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@v2');
    assert.equal(pr.jobs['run-check-pr']!.with, undefined);
    assert.equal(pr.on.pull_request!.branches, undefined);
    assert.match(m.files.get('.github/workflows/check-pr.yml')!, /edited/);
    // Storybook: cd-pages@v2, same trigger, no node-version
    const sb = yaml(m.files, '.github/workflows/storybook-cd.yml');
    assert.equal(sb.jobs['run-deploy-staging']!.uses, 'Pursuit-Amsterdam/workflows/.github/workflows/cd-pages.yml@v2');
    assert.deepEqual(sb.jobs['run-deploy-staging']!.with, { 'use-custom-token': true });
    assert.deepEqual(sb.on.push!.branches, ['develop']);
    // Nothing left on @main
    for (const [p, t] of m.files) if (t) assert.doesNotMatch(t, /@main/, p);
});

test('a CI flag without a package.json script is left out and noted', () => {
    const m = migrate(facts({ packageJson: JSON.stringify({ packageManager: 'pnpm@11.28.6', scripts: { lint: 'eslint', test: 'jest' } }) }), [{ file: 'ci.yml', text: WEB_CI() }]);
    assert.equal(yaml(m.files, '.github/workflows/ci.yml').jobs['run-ci']!.with!.checks, 'lint test');
    assert.ok(m.checklist.some(l => l.includes('`run-typecheck`') && l.includes('no `typecheck` script')));
    assert.equal(m.files.has('.github/workflows/web-ci.yml'), false, 'a ci.yml stays ci.yml');
});

test('CI that loaded 1Password: dropped, on the checklist', () => {
    const m = migrate(facts(), [{ file: 'web-ci.yml', text: WEB_CI("            onepassword_enabled: true\n            onepassword_vault: v\n            onepassword_item: i\n") }]);
    assert.doesNotMatch(m.files.get('.github/workflows/ci.yml')!, /onepassword/);
    assert.ok(m.checklist.some(l => l.includes('`v/i`')));
});

test('production only: no workflow_run, empty branch-targets', () => {
    const m = migrate(facts(), [{ file: 'cd.yml', text: WEB_CD('production') }]);
    const cd = yaml(m.files, '.github/workflows/cd.yml');
    assert.equal(cd.on.workflow_run, undefined);
    assert.deepEqual(cd.jobs.gate!.with, { 'branch-targets': '' });
    assert.ok(m.checklist.some(l => l.includes('production only')));
});

test('no develop: staging follows main', () => {
    const m = migrate(facts({ hasDevelop: false }), [
        { file: 'web-ci.yml', text: WEB_CI() },
        { file: 'web-cd.yml', text: WEB_CD('staging', 'production') },
    ]);
    assert.deepEqual(yaml(m.files, '.github/workflows/ci.yml').on.push!.branches, ['main']);
    const cd = yaml(m.files, '.github/workflows/cd.yml');
    assert.deepEqual(cd.on.workflow_run!.branches, ['main']);
    assert.deepEqual(cd.jobs.gate!.with, { 'branch-targets': 'main=staging' });
});

test('acceptance: CD left alone, on the checklist', () => {
    const m = migrate(facts({ hasAcceptance: true }), [{ file: 'cd.yml', text: WEB_CD('staging', 'acceptance', 'production') }]);
    assert.equal(m.files.has('.github/workflows/cd.yml'), false);
    assert.ok(m.checklist.some(l => l.includes('acceptance')));
});

test('codegen and prepare-package carry over; codegen_command becomes a script name', () => {
    const extra = "            codegen: true\n            codegen_command: 'pnpm run generate:importmap'\n            prepare-package: true\n";
    const text = `name: CD\non:\n    release:\njobs:\n${deployJob('staging', extra)}\n${deployJob('production', extra)}`;
    const cd = yaml(migrate(facts(), [{ file: 'cd.yml', text }]).files, '.github/workflows/cd.yml');
    assert.equal(cd.jobs.deploy!.with!.codegen, 'generate:importmap');
    assert.equal(cd.jobs.deploy!.with!['prepare-package'], true);
});

test('deploy jobs that differ beyond the 1Password item: left alone', () => {
    const text = `name: CD\non:\n    release:\njobs:\n${deployJob('staging', '            prepare-package: true\n')}\n${deployJob('production')}`;
    const m = migrate(facts(), [{ file: 'cd.yml', text }]);
    assert.equal(m.files.has('.github/workflows/cd.yml'), false);
    assert.ok(m.checklist.some(l => l.includes('differ')));
});

test('backend-ci next to web-ci (gp-groot): CI left alone', () => {
    const backend = `name: Backend CI\non:\n    push:\njobs:\n    run-ci:\n        uses: Pursuit-Amsterdam/workflows/.github/workflows/backend-ci.yml@main\n        with:\n            working-directory: ./backend\n`;
    const m = migrate(facts({ hasDevelop: false }), [
        { file: 'web-ci.yml', text: WEB_CI() },
        { file: 'backend-ci.yml', text: backend },
        { file: 'check-pr.yml', text: CHECK_PR },
    ]);
    assert.equal(m.files.has('.github/workflows/ci.yml'), false);
    assert.equal(m.files.has('.github/workflows/web-ci.yml'), false);
    assert.ok(m.checklist.some(l => l.includes('backend-ci')));
    assert.ok(m.files.has('.github/workflows/check-pr.yml'), 'check-pr is still converted');
});

test('repo files: .nvmrc from node-version, CODEOWNERS, dependabot token', () => {
    const oldDependabot = 'version: 2\nregistries:\n    github:\n        type: npm-registry\n        url: https://npm.pkg.github.com/Pursuit-Amsterdam\n        token: ${{ env.GITHUB_TOKEN }}\n';
    const m = migrate(facts({ nvmrc: null, codeowners: '/docs/ @someone\n', dependabot: oldDependabot }), [{ file: 'web-ci.yml', text: WEB_CI() }]);
    assert.equal(m.files.get('.nvmrc'), '22\n');
    assert.match(m.files.get('.github/CODEOWNERS')!, /^\* @Pursuit-Amsterdam\/senior-developers\n\/docs\/ @someone/);
    assert.match(m.files.get('.github/dependabot.yml')!, /token: \$\{\{ secrets\.CUSTOM_GITHUB_TOKEN \}\}/);
});

test('nothing to change in the repo files: none written', () => {
    const m = migrate(facts(), [{ file: 'check-pr.yml', text: CHECK_PR }]);
    assert.deepEqual([...m.files.keys()], ['.github/workflows/check-pr.yml']);
});

test('package.json lessons from the template', () => {
    const pkg = { scripts: { test: 'jest' }, devDependencies: { '@pursuit-amsterdam/jest-config': '^1.0.0', typescript: '^6.0.2' } };
    const m = migrate(facts({ packageJson: JSON.stringify(pkg), hasLockfile: false }), []);
    for (const s of ['packageManager', 'pnpm-lock.yaml', '1.0.1', 'jest-dom', 'TypeScript 6']) assert.ok(m.checklist.some(l => l.includes(s)), s);
});
