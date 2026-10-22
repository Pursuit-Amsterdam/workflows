// The rewrite at the heart of migrate-consumer: v1 workflow files in, v2 files,
// a checklist and the environment variables to set out. Pure: no network, no
// git, so it can be tested on fixtures. What it does not recognise it leaves
// alone and puts on the checklist; it never converts half a file.
import { jobs, parseWorkflow, type Workflow } from './workflow.ts';

export const ORG_TEAM = '@Pursuit-Amsterdam/senior-developers';

export interface RepoFacts {
    repo: string;
    hasDevelop: boolean;
    hasAcceptance: boolean;
    /** package.json at the root; null when there is none. */
    packageJson: string | null;
    hasLockfile: boolean;
    nvmrc: string | null;
    codeowners: string | null;
    dependabot: string | null;
    /** turbo.json at the root; null when there is none. */
    turboJson: string | null;
    /** supabase/config.toml; null when there is none. */
    supabaseConfig: string | null;
}

/**
 * An edit to a file that differs per branch (package.json, turbo.json): applied
 * to whatever the branch has, so the hotfix to main never gets develop's copy.
 * `apply` returns the new text, or null when there is nothing to do.
 */
export interface Patch {
    file: string;
    why: string;
    apply: (current: string | null) => string | null;
}

export interface Migration {
    /** Path → new content; null deletes the file. */
    files: Map<string, string | null>;
    /** Edits applied to the branch's own copy of a file, after `files`. */
    patches: Patch[];
    /** What a person still has to do or check, one line each. */
    checklist: string[];
    /** Variables to set on a GitHub environment (by its lowercase name). */
    envVars: { environment: string; name: string; value: string }[];
    /** One line per workflow file: what happened to it. */
    report: string[];
}

type Kind = 'web-ci' | 'backend-ci' | 'web-cd' | 'vm-cd' | 'check-pr' | 'storybook-cd' | 'v2' | 'other';
interface Job {
    id: string;
    kind: Kind;
    with: Record<string, unknown>;
}

const V1_CALL = /\/workflows\/\.github\/workflows\/([a-z-]+)\.yml@main$/;

function classify(wf: Workflow): Job[] {
    return jobs(wf).map(([id, j]) => {
        const uses = typeof j.uses === 'string' ? j.uses : '';
        const w = (j.with ?? {}) as Record<string, unknown>;
        if (uses.endsWith('@v2')) return { id, kind: 'v2', with: w };
        const name = V1_CALL.exec(uses)?.[1];
        const kind: Kind = name && ['web-ci', 'backend-ci', 'web-cd', 'vm-cd', 'check-pr', 'storybook-cd'].includes(name) ? (name as Kind) : 'other';
        return { id, kind, with: w };
    });
}

const truthy = (v: unknown): boolean => v === true || v === 'true';
const str = (v: unknown): string => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v));
/** `pnpm run generate:importmap` → `generate:importmap`; v2 takes a script name. */
function scriptName(command: string): string {
    return command.trim().replace(/^pnpm\s+(run\s+)?/, '');
}
function nodeMajor(version: string): string | null {
    return /^(\d+)/.exec(version.trim())?.[1] ?? null;
}
const EXACT = /^\d+\.\d+\.\d+$/;
/** a < b for exact versions. */
function older(a: string, b: string): boolean {
    const [x, y] = [a, b].map(v => v.split('.').map(Number));
    for (let i = 0; i < 3; i++) if (x![i] !== y![i]) return x![i]! < y![i]!;
    return false;
}
/** The CLI version that first read `[local_smtp]` in config.toml (it was `[inbucket]`). */
const LOCAL_SMTP_SINCE = '2.108.0';

// --- the patches: the dbtest script and the turbo root task ---------------------

export const DBTEST_SCRIPT = 'supabase test db';
/** Adds `"dbtest": "supabase test db"` as the first script, with the file's indentation. */
export const dbtestScriptPatch: Patch = {
    file: 'package.json',
    why: 'the `dbtest` script that CI runs',
    apply: current => {
        if (!current || /"dbtest"\s*:/.test(current)) return null;
        const m = /("scripts"\s*:\s*\{\n)([ \t]*)/.exec(current);
        return m ? current.replace(m[0], `${m[1]}${m[2]}"dbtest": "${DBTEST_SCRIPT}",\n${m[2]}`) : null;
    },
};
/** turbo only runs scripts of workspace packages; a root script is a `//#<task>` in turbo.json. */
export const dbtestTurboPatch: Patch = {
    file: 'turbo.json',
    why: 'the `//#dbtest` root task (turbo runs no root script without it)',
    apply: current => {
        if (!current || current.includes('"//#dbtest"')) return null;
        const m = /("(?:tasks|pipeline)"\s*:\s*\{\n)([ \t]*)/.exec(current);
        if (!m) return null;
        const i = m[2];
        return current.replace(m[0], `${m[1]}${i}// Root task: the pgTAP suite against the local Supabase stack that CI starts.\n${i}"//#dbtest": { "cache": false },\n${i}`);
    },
};

// --- the v2 files -------------------------------------------------------------

function ciYaml(o: { branches: string[]; checks: string[]; useCustomToken: boolean; workingDirectory: string; database?: string; supabaseSeed?: boolean }): string {
    return `name: Continuous Integration

# The repo's package.json scripts are what CI runs; see
# Pursuit-Amsterdam/workflows docs/v2. Push runs on the deploy branches,
# pull_request runs for every PR (no branch filter, so stacked PRs are covered).
on:
    push:
        branches: [${o.branches.join(', ')}]
    pull_request:

permissions:
    contents: read

jobs:
    run-ci:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/ci.yml@v2
        with:
            checks: ${o.checks.join(' ')}
${o.workingDirectory !== '.' ? `            working-directory: ${o.workingDirectory}\n` : ''}${o.database ? `            # Boots the local Supabase stack: every migration must apply, and dbtest runs the pgTAP suite.\n            database: ${o.database}\n` : ''}${o.supabaseSeed ? '            supabase-seed: true\n' : ''}${o.useCustomToken ? '            # The @pursuit-amsterdam packages are private.\n            use-custom-token: true\n' : ''}        secrets: inherit
`;
}

const CHECK_PR_YAML = `name: Check pull request validity

# Head and base come from the pull_request event. \`edited\` re-runs the check
# when the PR's base changes; no branch filter, so every PR gets the check.
on:
    pull_request:
        types: [opened, synchronize, reopened, edited]

permissions:
    contents: read

jobs:
    run-check-pr:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/check-pr.yml@v2
`;

function cdYaml(o: { stagingBranch: string | null; useCustomToken: boolean; buildMode: string; codegen: string; preparePackage: boolean }): string {
    const header = o.stagingBranch
        ? `# CD starts when CI is done, never on push. The gate decides where to:
#   CI green on ${o.stagingBranch.padEnd(14)}-> staging (the Vercel custom environment)
#   a release is published    -> production (only seniors can create v* tags)
#   started by hand           -> from ${o.stagingBranch}: staging; from the latest release tag: production`
        : `# CD starts on a release, never on push. The gate decides:
#   a release is published    -> production (only seniors can create v* tags)
#   started by hand           -> from the latest release tag: production`;
    const trigger = o.stagingBranch
        ? `    workflow_run:
        workflows: [Continuous Integration]
        types: [completed]
        branches: [${o.stagingBranch}]
`
        : '';
    const extra = [
        o.buildMode !== 'github' ? `            build-mode: ${o.buildMode}\n` : '',
        o.codegen ? `            codegen: ${o.codegen}\n` : '',
        o.preparePackage ? '            prepare-package: true\n' : '',
        o.useCustomToken ? '            # The @pursuit-amsterdam packages are private.\n            use-custom-token: true\n' : '',
    ].join('');
    return `name: Continuous Deployment

${header}
# See Pursuit-Amsterdam/workflows docs/v2.
on:
${trigger}    release:
        types: [published]
    workflow_dispatch:

permissions:
    contents: read
    actions: read

jobs:
    gate:
        if: github.event_name != 'workflow_run' || github.event.workflow_run.conclusion == 'success'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/cd-gate.yml@v2
        with:
            # Vercel has no acceptance.
            branch-targets: ${o.stagingBranch ? `${o.stagingBranch}=staging` : '""'}

    deploy:
        needs: gate
        if: needs.gate.outputs.proceed == 'true'
        uses: Pursuit-Amsterdam/workflows/.github/workflows/cd-vercel.yml@v2
        with:
            environment: \${{ needs.gate.outputs.target }}
            ref: \${{ needs.gate.outputs.sha }}
${extra}        secrets: inherit
`;
}

export const DEPENDABOT_YAML = `# Weekly dependency updates. The private @pursuit-amsterdam packages come from
# GitHub Packages; Dependabot reads them with CUSTOM_GITHUB_TOKEN (a token with
# read:packages). A run that Dependabot starts gets only Dependabot secrets, so
# that token must also exist as a Dependabot secret (org level), not only as an
# Actions secret. Public packages come from registry.npmjs.org as usual.
version: 2
registries:
    github-npm:
        type: npm-registry
        url: https://npm.pkg.github.com
        token: \${{ secrets.CUSTOM_GITHUB_TOKEN }}

updates:
    - package-ecosystem: npm
      directory: /
      schedule:
          interval: weekly
      registries:
          - github-npm
`;

// --- the rewrite --------------------------------------------------------------

export function migrate(facts: RepoFacts, sources: { file: string; text: string }[]): Migration {
    const files = new Map<string, string | null>();
    const patches: Patch[] = [];
    const checklist: string[] = [];
    const envVars: Migration['envVars'] = [];
    const report: string[] = [];

    const workflows: { wf: Workflow; jobs: Job[] }[] = [];
    for (const s of sources) {
        try {
            const wf = parseWorkflow(s.file, s.text);
            workflows.push({ wf, jobs: classify(wf) });
        } catch {
            report.push(`${s.file}: not valid YAML, left alone`);
            checklist.push(`\`${s.file}\` is not valid YAML; migrate it by hand.`);
        }
    }
    const pkg = facts.packageJson ? (JSON.parse(facts.packageJson) as { scripts?: Record<string, string>; packageManager?: string; devDependencies?: Record<string, string>; dependencies?: Record<string, string> }) : null;
    const scripts = Object.keys(pkg?.scripts ?? {});
    const deps = { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
    const path = (file: string): string => `.github/workflows/${file}`;
    const all = workflows.flatMap(w => w.jobs);
    // The repo's own GITHUB_TOKEN cannot read @pursuit-amsterdam packages of other
    // repos. v1 CI often did without use-custom-token while v1 CD had it.
    const privatePackages = all.some(j => truthy(j.with['use-custom-token'])) || Object.keys(deps).some(d => d.startsWith('@pursuit-amsterdam/'));
    let nodeVersion = '';
    for (const j of all) nodeVersion ||= str(j.with['node-version']);

    // --- CI: one web-ci call, and nothing else that is CI. A backend-ci next to
    // it that only ran the pgTAP suite (tellr) folds in as `database: supabase`
    // plus a `dbtest` check; one with Python means turbo and a backend/package.json,
    // and that is handwork.
    const ciFiles = workflows.filter(w => w.jobs.some(j => j.kind === 'web-ci' || j.kind === 'backend-ci'));
    const webCi = all.filter(j => j.kind === 'web-ci');
    const backendCi = all.filter(j => j.kind === 'backend-ci');
    const b = backendCi[0]?.with ?? {};
    const supabaseOnly =
        backendCi.length === 1 && !truthy(b['run-python-checks']) && truthy(b['run-supabase-test']) && !truthy(b['postgres-enabled']) && ['', '.', './'].includes(str(b['working-directory']));
    let ciConverted = false;
    if (backendCi.length > 0 && !supabaseOnly) {
        checklist.push('CI calls `backend-ci` (Python): left as it is. v2 runs Python checks through `package.json` scripts and turbo; see the migration examples in docs/v2.');
    } else if (webCi.length === 1 && ciFiles.every(f => f.jobs.every(j => j.kind === 'web-ci' || j.kind === 'backend-ci'))) {
        const w = webCi[0]!.with;
        const wanted: [string, string][] = [];
        if (truthy(w['run-lint'] ?? true)) wanted.push(['run-lint', 'lint']);
        if (truthy(w['run-typecheck'] ?? true)) wanted.push(['run-typecheck', 'typecheck']);
        if (truthy(w['run-test'] ?? true)) wanted.push(['run-test', 'test']);
        if (truthy(w['run-build'] ?? true)) wanted.push(['run-build', 'build']);
        if (truthy(w['run-format'])) wanted.push(['run-format', 'format:check']);
        const checks = wanted.map(([, s]) => s).filter(s => scripts.includes(s));
        for (const [flag, s] of wanted.filter(([, s]) => !scripts.includes(s))) {
            checklist.push(`v1 CI had \`${flag}\`, but \`package.json\` has no \`${s}\` script: left out of \`checks\`. Add the script and the check if it matters.`);
        }
        const testCommand = str(w['test-command']);
        if (testCommand && testCommand !== 'test --passWithNoTests' && testCommand !== 'test') {
            checklist.push(`v1 CI ran tests with \`${testCommand}\`; v2 runs the \`test\` script. Put those flags in the script.`);
        }
        // v1's default was `test --passWithNoTests`: a repo without tests passed. v2 runs the script as it is.
        const testScript = pkg?.scripts?.['test'] ?? '';
        if (checks.includes('test') && !testCommand && /\bjest\b/.test(testScript) && !testScript.includes('--passWithNoTests')) {
            checklist.push('v1 CI ran `test --passWithNoTests`; v2 runs `jest` as the script says, which fails when the repo has no tests. If it has none: drop `test` from `checks` (or add `--passWithNoTests` to the script).');
        }
        if (truthy(w['codegen']) || truthy(w['generate-graphql'])) {
            checklist.push('v1 CI generated code first (`codegen`/`generate-*`). v2 CI only runs scripts: make `typecheck` or `build` run the generator, or add it to `checks`.');
        }
        if (truthy(w['onepassword_enabled']) && checks.includes('build')) {
            checklist.push('v1 CI loaded 1Password, and v2 CI runs `build` without it: a build that checks its environment fails (qpido: `REVALIDATE_SECRET_KEY`). Then drop `build` from `checks`; CD builds with the 1Password values before it deploys.');
        }
        if (truthy(w['onepassword_enabled'])) {
            checklist.push(`v1 CI loaded the 1Password item \`${str(w['onepassword_vault'])}/${str(w['onepassword_item'])}\`; v2 CI runs without it. If lint, typecheck or tests need those values, add \`onepassword-vault\`/\`onepassword-item\` to \`ci.yml\` and \`OP_SERVICE_ACCOUNT_TOKEN\` to the \`integration\` environment. Otherwise remove \`OP_SERVICE_ACCOUNT_TOKEN\` from \`integration\`.`);
        }
        if (supabaseOnly) {
            // The pgTAP suite becomes the `dbtest` script; the patches add it to the
            // branch's own package.json (and turbo.json), so main keeps its own copy.
            checks.push('dbtest');
            if (pkg?.scripts?.['dbtest'] && pkg.scripts['dbtest'] !== DBTEST_SCRIPT) {
                checklist.push(`\`package.json\` already has a \`dbtest\` script (\`${pkg.scripts['dbtest']}\`): CI runs it as the pgTAP check; make sure it is \`${DBTEST_SCRIPT}\`.`);
            } else if (pkg && !/"scripts"\s*:\s*\{\n/.test(facts.packageJson ?? '')) {
                checklist.push(`Add \`"dbtest": "${DBTEST_SCRIPT}"\` to the scripts in \`package.json\`: the file has no scripts block to patch.`);
            } else patches.push(dbtestScriptPatch);
            if (facts.turboJson !== null) {
                if (/"(tasks|pipeline)"\s*:\s*\{\n/.test(facts.turboJson)) patches.push(dbtestTurboPatch);
                else checklist.push('`turbo.json`: add the root task `"//#dbtest": { "cache": false }` to `tasks` by hand (turbo runs no root script without it).');
            }
            const cli = deps['supabase'];
            if (!cli || !EXACT.test(cli)) {
                checklist.push(`CI installs the Supabase CLI pinned in \`package.json\` and needs an exact version (got ${cli ? `\`${cli}\`` : 'none'}): \`pnpm add -D -E supabase@latest\`. v1 installed \`latest\` on every run.`);
            } else if (facts.supabaseConfig?.includes('[local_smtp]') && older(cli, LOCAL_SMTP_SINCE)) {
                checklist.push(`\`supabase/config.toml\` has \`[local_smtp]\`, which the CLI reads since ${LOCAL_SMTP_SINCE}, but \`package.json\` pins \`supabase\` ${cli}: \`supabase start\` fails in CI (v1 installed \`latest\`, which hid this). Bump it: \`pnpm add -D -E supabase@latest\`.`);
            }
            if (truthy(b['seed'])) checklist.push('v1 `backend-ci` seeded the local stack (`seed: true`); v2 passes `supabase-seed: true`, which keeps `supabase/seed.sql`.');
        }
        if (checks.length === 0) {
            checklist.push('No CI check has a matching `package.json` script: `ci.yml` was not written. Add the scripts first.');
        } else {
            const olds = ciFiles.map(f => f.wf.file);
            for (const old of olds) if (old !== 'ci.yml') files.set(path(old), null);
            files.set(
                path('ci.yml'),
                ciYaml({
                    branches: ['main', ...(facts.hasDevelop ? ['develop'] : []), ...(facts.hasAcceptance ? ['acceptance'] : [])],
                    checks,
                    useCustomToken: privatePackages,
                    workingDirectory: str(w['working-directory']).replace(/^\.\/(.+)$/, '$1') || '.',
                    ...(supabaseOnly ? { database: 'supabase', supabaseSeed: truthy(b['seed']) } : {}),
                }),
            );
            report.push(`${olds.join(' + ')} → ci.yml (checks: ${checks.join(' ')}${supabaseOnly ? '; database: supabase, the pgTAP suite as dbtest' : ''})`);
            ciConverted = true;
        }
    } else if (webCi.length > 0) {
        checklist.push(`CI calls \`web-ci\` ${webCi.length}× or next to other jobs: left as it is; migrate by hand to one \`ci.yml\`.`);
    }
    if (!ciConverted) for (const w of ciFiles) report.push(`${w.wf.file}: left alone (see checklist)`);

    // --- CD: web-cd jobs for staging and production, nothing else in the file.
    const cdFiles = workflows.filter(w => w.jobs.some(j => j.kind === 'web-cd'));
    if (cdFiles.length === 1) {
        const cd = cdFiles[0]!;
        const deploys = cd.jobs.filter(j => j.kind === 'web-cd');
        const envs = deploys.map(j => str(j.with['environment']).toLowerCase());
        const same = (k: string): boolean => new Set(deploys.map(j => JSON.stringify(j.with[k] ?? null))).size === 1;
        const problems = [
            cd.jobs.some(j => j.kind !== 'web-cd') ? 'the file has other jobs too' : '',
            envs.some(e => e !== 'staging' && e !== 'production') ? `it deploys to ${envs.filter(e => e !== 'staging' && e !== 'production').join(', ')} (cd-vercel knows staging and production only)` : '',
            deploys.some(j => str(j.with['platform'] ?? 'vercel') !== 'vercel') ? 'a platform other than vercel' : '',
            !['use-custom-token', 'build-mode', 'codegen', 'codegen_command', 'prepare-package'].every(same) ? 'the deploy jobs differ in more than the 1Password item' : '',
        ].filter(Boolean);
        if (problems.length) {
            report.push(`${cd.wf.file}: left alone (${problems.join('; ')})`);
            checklist.push(`CD (\`${cd.wf.file}\`) was not converted: ${problems.join('; ')}. Migrate it by hand to gate + cd-vercel.`);
        } else {
            const w = deploys[0]!.with;
            // Without develop, staging never ran in practice (it listened on develop,
            // or waited for a manual start): those repos deploy production on a
            // release, and have no staging environment in GitHub or Vercel.
            const staging = envs.includes('staging') && facts.hasDevelop;
            const stagingBranch = staging ? 'develop' : null;
            const codegen = truthy(w['codegen']) ? scriptName(str(w['codegen_command']) || 'codegen') : '';
            if (cd.wf.file !== 'cd.yml') files.set(path(cd.wf.file), null);
            files.set(path('cd.yml'), cdYaml({ stagingBranch, useCustomToken: truthy(w['use-custom-token']), buildMode: str(w['build-mode']) || 'github', codegen, preparePackage: truthy(w['prepare-package']) }));
            report.push(`${cd.wf.file} → cd.yml (gate + cd-vercel; ${staging ? 'staging and production' : 'production'})`);
            for (const j of deploys) {
                const env = str(j.with['environment']).toLowerCase();
                if (env === 'staging' && !staging) continue;
                if (truthy(j.with['onepassword_enabled']) && str(j.with['onepassword_vault']) && str(j.with['onepassword_item'])) {
                    envVars.push({ environment: env, name: 'OP_VAULT', value: str(j.with['onepassword_vault']) });
                    envVars.push({ environment: env, name: 'OP_ITEM', value: str(j.with['onepassword_item']) });
                }
            }
            if (envs.includes('staging') && !facts.hasDevelop) {
                checklist.push('No `develop` branch: v2 CD deploys production only, on a release, as this repo did in practice (v1 staging listened on `develop`). For staging: create `develop` and a custom environment `staging` in Vercel, then set `branch-targets: develop=staging` and the `workflow_run` trigger on `develop`.');
            } else if (!staging) checklist.push('v1 CD deployed production only: so does v2 (a release; no staging).');
            if (codegen) checklist.push(`Codegen before the build: the \`${codegen}\` script (from v1 \`codegen_command\`). Check that it exists in \`package.json\`.`);
            checklist.push('Optional: add `health-path` to the deploy job (a path that answers 2xx without a redirect, e.g. `/` or `/api/health`), so CD checks the app after a deploy.');
        }
    } else if (cdFiles.length > 1) {
        checklist.push(`\`web-cd\` is called from ${cdFiles.length} files (${cdFiles.map(w => w.wf.file).join(', ')}): left as they are; migrate by hand to one \`cd.yml\`.`);
    }

    // --- check-pr: the standard caller
    for (const w of workflows.filter(w => w.jobs.some(j => j.kind === 'check-pr'))) {
        if (w.jobs.every(j => j.kind === 'check-pr')) {
            if (w.wf.file !== 'check-pr.yml') files.set(path(w.wf.file), null);
            files.set(path('check-pr.yml'), CHECK_PR_YAML);
            report.push(`${w.wf.file} → check-pr.yml (job run-check-pr, on edited, no branch filter)`);
        } else {
            report.push(`${w.wf.file}: left alone (check-pr next to other jobs)`);
            checklist.push(`\`${w.wf.file}\` calls check-pr next to other jobs: move check-pr into its own \`check-pr.yml\`.`);
        }
    }

    // --- Storybook: storybook-cd → cd-pages, same triggers
    for (const w of workflows.filter(w => w.jobs.some(j => j.kind === 'storybook-cd'))) {
        if (!w.jobs.every(j => j.kind === 'storybook-cd')) {
            report.push(`${w.wf.file}: left alone (storybook-cd next to other jobs)`);
            continue;
        }
        let text = w.wf.text.replace(/Pursuit-Amsterdam\/workflows\/\.github\/workflows\/storybook-cd\.yml@main/g, 'Pursuit-Amsterdam/workflows/.github/workflows/cd-pages.yml@v2');
        // node-version comes from .nvmrc in v2
        text = text.replace(/^\s*node-version:.*\n/gm, '');
        files.set(path(w.wf.file), text);
        report.push(`${w.wf.file}: storybook-cd → cd-pages@v2 (same triggers)`);
        if (!/pages:\s*write/.test(text) || !/id-token:\s*write/.test(text)) checklist.push(`\`${w.wf.file}\`: cd-pages needs \`pages: write\` and \`id-token: write\` in \`permissions\`.`);
    }

    // --- the rest: report what stays
    for (const w of workflows) {
        if (w.jobs.every(j => j.kind === 'other' || j.kind === 'v2') && !files.has(path(w.wf.file))) {
            const v1Action = /Pursuit-Amsterdam\/workflows\/\.github\/actions\/[a-z-]+@main/.test(w.wf.text);
            report.push(`${w.wf.file}: not a v1 caller, left alone${v1Action ? ' (uses a v1 action @main)' : ''}`);
            if (v1Action) checklist.push(`\`${w.wf.file}\` uses an action from Pursuit-Amsterdam/workflows \`@main\`: move it to \`@v2\` or replace it.`);
        }
        if (w.jobs.some(j => j.kind === 'vm-cd')) checklist.push(`\`${w.wf.file}\` calls \`vm-cd\` (Swarm): migrate by hand to gate + cd-swarm; see the Swarm migration example.`);
    }

    // --- repo files
    if (!facts.nvmrc) {
        const major = nodeMajor(nodeVersion);
        if (major) {
            files.set('.nvmrc', `${major}\n`);
            checklist.push(`Added \`.nvmrc\` with \`${major}\` (from v1 \`node-version\`); v2 reads the Node version from it.`);
        } else checklist.push('No `.nvmrc`: v2 falls back to Node 22.x. Add one.');
    }
    if (!facts.codeowners) {
        files.set('.github/CODEOWNERS', `# The senior developers own the whole repo. With code-owner review required,\n# a junior's PR needs a senior's review; a senior may merge their own PR.\n* ${ORG_TEAM}\n`);
    } else if (!new RegExp(`^\\*\\s.*${ORG_TEAM}`, 'm').test(facts.codeowners)) {
        files.set('.github/CODEOWNERS', `* ${ORG_TEAM}\n${facts.codeowners}`);
        checklist.push('`CODEOWNERS` had other rules: `*` for the senior developers is added on top. A later line overrides it for its paths; check those.');
    }
    if (!facts.dependabot) {
        files.set('.github/dependabot.yml', DEPENDABOT_YAML);
    } else {
        const fixed = facts.dependabot.replace(/(url:\s*https:\/\/npm\.pkg\.github\.com\S*\s*\n(\s*)token:\s*)\$\{\{\s*env\.GITHUB_TOKEN\s*\}\}/, '$1${{ secrets.CUSTOM_GITHUB_TOKEN }}');
        if (fixed !== facts.dependabot) {
            files.set('.github/dependabot.yml', fixed);
            checklist.push('`dependabot.yml`: the GitHub Packages registry now reads with `secrets.CUSTOM_GITHUB_TOKEN` (was `env.GITHUB_TOKEN`, which Dependabot does not have).');
        }
    }

    // --- package.json: what v2 CI needs, and the lessons from the template
    if (!pkg) checklist.push('No `package.json`: v2 CI runs its scripts. Add one, with `packageManager`.');
    else {
        if (!pkg.packageManager) checklist.push('`package.json` has no `packageManager`: pnpm/action-setup cannot pick a version. Add it.');
        if (!facts.hasLockfile) checklist.push('No `pnpm-lock.yaml`: `--frozen-lockfile` fails. Commit one.');
        const jest = deps['@pursuit-amsterdam/jest-config'];
        if (jest && /^[~^]?(0\.|1\.0\.0$)/.test(jest)) checklist.push(`\`@pursuit-amsterdam/jest-config\` is \`${jest}\`: the react/next presets need 1.0.1 or later.`);
        if (jest && !deps['@testing-library/jest-dom']) checklist.push('`@pursuit-amsterdam/jest-config` without `@testing-library/jest-dom`: the react/next presets need it.');
        if (/^[~^]?6\./.test(deps['typescript'] ?? '')) checklist.push('TypeScript 6: the test types (`jest`, `@testing-library/jest-dom`) belong in `types` in `tsconfig.json`.');
    }
    return { files, patches, checklist, envVars, report };
}
