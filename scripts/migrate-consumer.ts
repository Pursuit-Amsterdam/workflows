// Move a consumer repo's workflows from v1 to v2: the rewrite in lib/migrate.ts
// applied to a fresh clone, then (with --apply) draft PRs and the environment
// variables. Dry run by default: it prints what it would change and the diff.
//
//   pnpm migrate-consumer -- qpido-website            # dry run
//   pnpm migrate-consumer -- qpido-website --apply    # push, open draft PRs, set variables
//
// With a develop branch: feature/workflows-v2 -> develop, and hotfix/workflows-v2
// -> main with the same files, because workflow_run and release read the CD file
// from the default branch. Without develop: one PR to main.
// It does not touch branch protection: rulesets with the new check names would
// block open PRs until the merge. That is `setup-consumer --apply`, after it, on
// the checklist. Needs the local `gh` login with admin on the repo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { branchExists } from './lib/consumer.ts';
import { ORG, get, octokit } from './lib/github.ts';
import { migrate, type Migration } from './lib/migrate.ts';

const FEATURE = 'feature/workflows-v2';
const HOTFIX = 'hotfix/workflows-v2';

const args = process.argv.slice(2).filter(a => a !== '--');
const apply = args.includes('--apply');
const [repo] = args.filter(a => !a.startsWith('--'));
if (!repo) {
    console.error('usage: pnpm migrate-consumer -- <repo> [--apply]');
    process.exit(2);
}
const p = { owner: ORG, repo };

function run(cwd: string, cmd: string, cmdArgs: string[]): string {
    return execFileSync(cmd, cmdArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
// The repo's own hooks need its node_modules; these commits only touch workflow files.
const git = (cwd: string, ...a: string[]): string => run(cwd, 'git', ['-c', 'core.hooksPath=/dev/null', ...a]);
const read = (dir: string, file: string): string | null => (existsSync(join(dir, file)) ? readFileSync(join(dir, file), 'utf8') : null);

function writeFiles(dir: string, files: Migration['files']): void {
    for (const [file, content] of files) {
        const path = join(dir, file);
        if (content === null) rmSync(path, { force: true });
        else {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, content);
        }
    }
}

const meta = await get<{ default_branch: string }>('/repos/{owner}/{repo}', p);
if (!meta) throw new Error(`cannot read ${ORG}/${repo}`);
const main = meta.default_branch;
const hasDevelop = await branchExists(repo, 'develop');
const hasAcceptance = await branchExists(repo, 'acceptance');
const source = hasDevelop ? 'develop' : main;

const dir = mkdtempSync(join(tmpdir(), `migrate-${repo}-`));
try {
    run(tmpdir(), 'gh', ['repo', 'clone', `${ORG}/${repo}`, dir, '--', '--quiet', '--filter=blob:none']);
    git(dir, 'checkout', '--quiet', source);

    // --- the rewrite, from the branch the work happens on
    const wfDir = join(dir, '.github/workflows');
    const sources = (existsSync(wfDir) ? readdirSync(wfDir) : []).filter(f => /\.ya?ml$/.test(f)).map(file => ({ file, text: readFileSync(join(wfDir, file), 'utf8') }));
    const m = migrate(
        {
            repo,
            hasDevelop,
            hasAcceptance,
            packageJson: read(dir, 'package.json'),
            hasLockfile: existsSync(join(dir, 'pnpm-lock.yaml')),
            nvmrc: read(dir, '.nvmrc'),
            codeowners: read(dir, '.github/CODEOWNERS') ?? read(dir, 'CODEOWNERS') ?? read(dir, 'docs/CODEOWNERS'),
            dependabot: read(dir, '.github/dependabot.yml'),
        },
        sources,
    );

    // --- what the rewrite cannot see: secrets and environments
    const written = [...m.files.values()].filter((t): t is string => t !== null).join('\n');
    const repoSecrets = ((await get<{ secrets: { name: string }[] }>('/repos/{owner}/{repo}/actions/secrets', p))?.secrets ?? []).map(s => s.name);
    if (written.includes('use-custom-token: true') && !repoSecrets.includes('CUSTOM_GITHUB_TOKEN')) {
        m.checklist.push('`use-custom-token` without a repo secret `CUSTOM_GITHUB_TOKEN`: CI fails with a 401/403 on the private packages unless it exists at org level for this repo.');
    }
    const envs = ((await get<{ environments: { name: string }[] }>('/repos/{owner}/{repo}/environments', p))?.environments ?? []).map(e => e.name);

    // --- show it
    console.log(`${ORG}/${repo}: ${hasDevelop ? `develop -> ${FEATURE}, ${main} -> ${HOTFIX}` : `${main} -> ${FEATURE}`}\n`);
    for (const l of m.report) console.log(`  ${l}`);
    git(dir, 'checkout', '--quiet', '-b', FEATURE);
    writeFiles(dir, m.files);
    git(dir, 'add', '-A');
    const changed = git(dir, 'diff', '--cached', '--stat');
    if (!changed) {
        console.log('\nNothing to change.');
        process.exit(0);
    }
    console.log(`\n${changed}\n`);
    if (!apply) console.log(git(dir, 'diff', '--cached'));
    console.log('\nChecklist:');
    for (const l of m.checklist) console.log(`  - ${l}`);
    console.log('\nEnvironment variables:');
    for (const v of m.envVars) {
        const env = envs.find(e => e.toLowerCase() === v.environment);
        console.log(`  ${env ?? `${v.environment} (missing: set after setup-consumer creates it)`}: ${v.name}=${v.value}`);
    }
    if (!apply) {
        console.log('\nDry run; run again with --apply to push, open draft PRs and set the variables.');
        process.exit(0);
    }

    // --- apply: refuse to overwrite an earlier run
    for (const b of [FEATURE, ...(hasDevelop ? [HOTFIX] : [])]) {
        if (await branchExists(repo, b)) throw new Error(`${b} already exists in ${repo}: an earlier run? Delete it or finish that PR first.`);
    }
    const summary = m.report.map(l => `- ${l}`).join('\n');
    const after = [
        ...(hasDevelop ? [`Merge the PR to \`${main}\` first, then the one to \`develop\`, shortly after each other: in between, a merge to \`develop\` deploys nothing (or twice).`] : []),
        `After the merge: \`pnpm setup-consumer -- ${repo} --apply\` in Pursuit-Amsterdam/workflows (rulesets with the new check names, branch rules on the environments, tag ruleset), then \`pnpm audit:consumers -- ${repo}\`.`,
        'Deploy secrets on the environments (`VERCEL_TOKEN`, `OP_SERVICE_ACCOUNT_TOKEN`): see the `todo` lines of setup-consumer.',
        'A CI that was red for a while shows hidden lint or test errors once the install works: expect a fix in this PR.',
        'After the merge to the deploy branch: check the first CD run (Actions → Continuous Deployment).',
    ];
    const checklist = [...m.checklist, ...after].map(l => `- [ ] ${l}`).join('\n');

    git(dir, 'commit', '--quiet', '-m', 'ci: move workflows to Pursuit-Amsterdam/workflows v2');
    git(dir, 'push', '--quiet', '-u', 'origin', FEATURE);
    const feature = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
        ...p,
        head: FEATURE,
        base: source,
        draft: true,
        title: 'ci: move workflows to Pursuit-Amsterdam/workflows v2',
        body: `Generated by \`migrate-consumer\` in Pursuit-Amsterdam/workflows.\n\n## Summary\n\n${summary}\n\n## Checklist\n\n${checklist}\n`,
    });
    console.log(`\nPR: ${feature.data.html_url}`);

    if (hasDevelop) {
        git(dir, 'checkout', '--quiet', '-b', HOTFIX, `origin/${main}`);
        writeFiles(dir, m.files);
        git(dir, 'add', '-A');
        if (git(dir, 'diff', '--cached', '--stat')) {
            git(dir, 'commit', '--quiet', '-m', 'ci: move workflows to Pursuit-Amsterdam/workflows v2');
            git(dir, 'push', '--quiet', '-u', 'origin', HOTFIX);
            const hotfix = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
                ...p,
                head: HOTFIX,
                base: main,
                draft: true,
                title: `ci: move workflows to Pursuit-Amsterdam/workflows v2 (${main})`,
                body: `The workflow files of ${feature.data.html_url}, so \`${main}\` gets the v2 \`cd.yml\`: \`workflow_run\` and \`release\` read the CD file from \`${main}\`. No app changes. Merge this one first, then the PR to \`develop\` shortly after.\n\n## Summary\n\n${summary}\n`,
            });
            console.log(`PR: ${hotfix.data.html_url}`);
        }
    }

    // --- the 1Password names on the environments; never overwrite a value
    for (const v of m.envVars) {
        const env = envs.find(e => e.toLowerCase() === v.environment);
        if (!env) {
            console.log(`  ${v.environment}: missing; set ${v.name}=${v.value} after setup-consumer creates it`);
            continue;
        }
        const q = { ...p, environment_name: env, name: v.name };
        const existing = await get<{ value: string }>('/repos/{owner}/{repo}/environments/{environment_name}/variables/{name}', q);
        if (existing?.value === v.value) continue;
        if (existing) {
            console.log(`  ${env}: ${v.name} is '${existing.value}', not '${v.value}': left as it is`);
            continue;
        }
        await octokit.request('POST /repos/{owner}/{repo}/environments/{environment_name}/variables', { ...q, value: v.value });
        console.log(`  ${env}: ${v.name}=${v.value}`);
    }
} finally {
    rmSync(dir, { recursive: true, force: true });
}
