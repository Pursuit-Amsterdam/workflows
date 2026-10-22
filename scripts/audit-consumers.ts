// Audit every repo that consumes Pursuit-Amsterdam/workflows against the v2
// standard (docs/v2/naslag/standaardinrichting.md). Read-only. Needs a token
// with repo admin on the org's repos: the local `gh` login, or GH_TOKEN.
//
//   pnpm audit:consumers                         # every non-archived repo that uses this repo
//   pnpm audit:consumers -- gp-map-webapp tms-test
//
// One line per finding: <repo>  <area>  <finding>. Exit 1 when anything is off.
// What the audit expects of a repo depends on what the repo calls: a repo that
// deploys (cd-vercel, cd-swarm, cd-supabase, or their v1 forms) or publishes
// (cd-packages) gets the full audit; one that only calls loose actions or
// cd-pages gets the check-pr, protection, CODEOWNERS and Dependabot checks.
// Secret names are visible, values and org-level secrets are not: a deploy
// secret that is missing on an environment may still exist at org level.
import { parse as parseYaml } from 'yaml';
import { CHECK_CALL, CI_CALL, loadConsumer, usesOnePassword } from './lib/consumer.ts';
import { ORG, exists, get, list, orgRepos, readFile } from './lib/github.ts';
import { dispatchInputs, jobs, stringList, trigger, triggers } from './lib/workflow.ts';

const ACTIONS_APP_ID = 15368; // GitHub Actions; required checks are pinned to it
const REQUIRED_CI_CALL = new RegExp(`${ORG}/workflows/\\.github/workflows/(ci|ci-images|web-ci|backend-ci)\\.yml@`);

interface Finding {
    repo: string;
    area: string;
    message: string;
}
const findings: Finding[] = [];
function say(repo: string, area: string, message: string): void {
    findings.push({ repo, area, message });
    console.log(`${repo.padEnd(34)} ${area.padEnd(12)} ${message}`);
}

interface RuleParams {
    required_status_checks?: { context: string; integration_id?: number }[];
    strict_required_status_checks_policy?: boolean;
    required_approving_review_count?: number;
    require_code_owner_review?: boolean;
}
interface Rule {
    type: string;
    parameters?: RuleParams;
}
interface ClassicProtection {
    required_status_checks?: { strict?: boolean; checks?: { context: string; app_id: number | null }[] };
    allow_force_pushes?: { enabled?: boolean };
    required_pull_request_reviews?: { required_approving_review_count?: number; require_code_owner_reviews?: boolean };
}
interface Ruleset {
    id: number;
    name: string;
    target: string;
    enforcement: string;
    bypass_actors?: unknown[];
    rules?: Rule[];
    conditions?: { ref_name?: { include?: string[] } };
}

// Org-level Dependabot secrets: empty when this token is not an org admin.
const orgDepSecrets = (await list<{ name: string }>(`/orgs/{org}/dependabot/secrets`, { org: ORG })).map(s => s.name);
// The people who may review a junior's PR.
const seniors = (await list<{ login: string }>(`/orgs/{org}/teams/{team}/members`, { org: ORG, team: 'senior-developers' })).map(
    m => m.login,
);

const names = async <T extends { name: string }>(route: string, params: Record<string, unknown>, key: string): Promise<string[]> =>
    ((await get<Record<string, T[]>>(route, params))?.[key] ?? []).map(x => x.name);

const args = process.argv.slice(2).filter(a => a !== '--');
const repos = args.length > 0 ? args : (await orgRepos()).filter(r => r !== 'workflows');

let audited = 0;
for (const repo of repos) {
    const p = { owner: ORG, repo };
    // --- workflow files; repos that never reference this repo are not consumers
    const c = await loadConsumer(repo);
    if (!c) {
        say(repo, 'access', 'cannot read repo');
        continue;
    }
    for (const u of c.unreadable) say(repo, u.reason === 'cannot read' ? 'access' : 'workflows', u.reason === 'cannot read' ? `cannot read ${u.file}` : `${u.file}: not valid YAML`);
    if (!c.calls) continue;
    audited++;

    // What the repo calls decides what the standard expects of it.
    const { defaultBranch: def, workflows: wfs, all, hasCi, deploys, publishes, vercel, swarm, supabase, hasDevelop, hasAcceptance } = c;
    const fullAudit = deploys || publishes;

    if (!wfs.some(w => w.file === 'check-pr.yml')) say(repo, 'workflows', 'no check-pr.yml caller');
    for (const wf of wfs) {
        const { file: f, text: b } = wf;
        // Workflows and composite actions alike.
        if (new RegExp(`${ORG}/workflows/\\.github/(workflows|actions)/[^@\\s]*@main`).test(b)) say(repo, 'version', `${f} still on @main`);
        if (/run-(test|lint|typecheck|format):/.test(b) && /cd[^/]*\.yml@|web-cd/.test(b)) say(repo, 'cd', `${f} repeats source checks at deploy time`);
        if (b.includes('cd-gate.yml@')) {
            if (!b.includes('actions: read')) say(repo, 'permissions', `${f} calls cd-gate without actions: read`);
            // CD starts on workflow_run, never on push; and a failed CI run must skip the whole run.
            if (trigger(wf, 'push') !== undefined) say(repo, 'cd', `${f} starts CD on push; use workflow_run of Continuous Integration`);
            if (b.includes('workflow_run') && !b.includes("workflow_run.conclusion == 'success'")) {
                say(repo, 'cd', `${f}: gate job has no if: on workflow_run.conclusion; a failed CI run would start a red gate instead of a skipped run`);
            }
            // Vercel has no acceptance: the gate must not route that branch anywhere.
            if (b.includes('cd-vercel.yml@') && hasAcceptance && !b.includes('branch-targets:')) {
                say(repo, 'cd', `${f}: an acceptance branch exists but the gate keeps its default branch-targets; cd-vercel refuses acceptance, pass branch-targets: develop=staging`);
            }
        }
        // The translations CMS dispatches with these two inputs; GitHub refuses a dispatch with an unknown input.
        if (/^\s*tms:\s*true/m.test(b)) {
            const inputs = dispatchInputs(wf);
            if (!inputs.includes('environment') || !inputs.includes('release_id')) {
                say(repo, 'cd', `${f}: tms is on but workflow_dispatch does not declare the inputs environment and release_id the CMS sends`);
            }
        }
        // check-pr must also run when the PR's base changes, and on every base.
        if (b.includes('check-pr.yml@')) {
            if (!/\bedited\b/.test(b)) say(repo, 'checks', `${f}: check-pr does not run on 'edited': changing the PR's base skips it`);
            const pr = trigger(wf, 'pull_request');
            if (pr && ('branches' in pr || 'branches-ignore' in pr)) say(repo, 'checks', `${f}: check-pr filtered by branches: stacked PRs get no check`);
        }
        // A required workflow that does not start leaves its check 'Expected' forever.
        if (REQUIRED_CI_CALL.test(b)) {
            const filtered = Object.values(triggers(wf)).some(t => typeof t === 'object' && t !== null && ('paths' in t || 'paths-ignore' in t));
            if (filtered) say(repo, 'checks', `${f}: paths filter on a required CI workflow; detect changes inside it instead`);
        }
        // A called workflow never gets more than its caller grants.
        if (/(cd-pages|storybook-cd)\.yml@/.test(b) && !(b.includes('pages: write') && b.includes('id-token: write'))) {
            say(repo, 'permissions', `${f} calls cd-pages without pages: write and id-token: write`);
        }
        if (/(cd-swarm|cd-packages)\.yml@/.test(b) && !b.includes('packages: write')) {
            say(repo, 'permissions', `${f} calls cd-swarm/cd-packages without packages: write`);
        }
    }

    // Two files calling CI with the same job id give two checks with one name;
    // branch protection cannot tell them apart.
    const callers = wfs.flatMap(wf => jobs(wf).filter(([, j]) => typeof j.uses === 'string' && CHECK_CALL.test(j.uses)).map(([id]) => id));
    for (const d of [...new Set(callers.filter((id, i) => callers.indexOf(id) !== i))]) {
        say(repo, 'checks', `job id '${d}' calls CI in two files: two checks named '${d} / pipeline'`);
    }
    // One CI workflow file per repo, named "Continuous Integration": one workflow_run event per commit.
    const ciFiles = wfs.filter(w => CI_CALL.test(w.text));
    if (ciFiles.length > 1) {
        say(repo, 'ci', `${ciFiles.length} CI workflow files (${ciFiles.map(w => w.file).join(' ')}): put the jobs in one file, or the gate sees two workflow_run events per commit`);
    }
    for (const wf of ciFiles) {
        if (wf.doc.name !== 'Continuous Integration') {
            say(repo, 'ci', `${wf.file}: name is not 'Continuous Integration'; cd-gate and the workflow_run trigger look for that name`);
        }
        // CI on push to main and develop: a merge commit on a deploy branch needs its own run, or nothing starts CD.
        const pushBranches = stringList(trigger(wf, 'push')?.branches);
        for (const br of [def, ...(hasDevelop ? ['develop'] : []), ...(hasAcceptance ? ['acceptance'] : [])]) {
            if (!pushBranches.includes(br)) say(repo, 'ci', `${wf.file}: no push trigger on ${br}; a merge there gets no CI run and nothing starts CD`);
        }
    }

    // --- Dockerfiles: base images pinned by digest, so CD builds on what CI tested
    const tree = await get<{ tree: { path: string }[] }>(`/repos/{owner}/{repo}/git/trees/{tree_sha}`, { ...p, tree_sha: def, recursive: '1' });
    for (const df of (tree?.tree ?? []).map(t => t.path).filter(path => /(^|\/)Dockerfile[^/]*$/.test(path))) {
        const content = await readFile(repo, df);
        if (content === null) continue;
        const froms = content.split('\n').map(l => l.trim().split(/\s+/)).filter(w => w[0]?.toUpperCase() === 'FROM');
        // FROM <stage> refers to an earlier build stage, not to an image.
        const stages = froms.flatMap(w => w.flatMap((x, i) => (i > 1 && w[i - 1]?.toUpperCase() === 'AS' ? [x.toLowerCase()] : [])));
        for (const w of froms) {
            const img = w[1]?.startsWith('--platform=') ? w[2] : w[1];
            if (!img || img === 'scratch' || stages.includes(img.toLowerCase())) continue;
            if (!img.includes('@sha256:')) {
                say(repo, 'docker', `${df}: FROM ${img} without @sha256 digest`);
                break;
            }
        }
    }

    // --- branch protection: classic protection and rulesets together; the default
    // branch, and develop when it exists
    const rulesets = (await get<Ruleset[]>(`/repos/{owner}/{repo}/rulesets`, p)) ?? [];
    for (const branch of [def, ...(hasDevelop && def !== 'develop' ? ['develop'] : [])]) {
        const classic = await get<ClassicProtection>(`/repos/{owner}/{repo}/branches/{branch}/protection`, { ...p, branch });
        const rules = (await get<Rule[]>(`/repos/{owner}/{repo}/rules/branches/{branch}`, { ...p, branch })) ?? [];
        // One view of both sources: required checks with their app, strict, force push, reviews.
        const checks = [
            ...(classic?.required_status_checks?.checks ?? []).map(c => ({ context: c.context, app: c.app_id })),
            ...rules.filter(r => r.type === 'required_status_checks').flatMap(r => (r.parameters?.required_status_checks ?? []).map(c => ({ context: c.context, app: c.integration_id ?? null }))),
        ];
        const strict = Boolean(classic?.required_status_checks?.strict) || rules.some(r => r.type === 'required_status_checks' && r.parameters?.strict_required_status_checks_policy);
        const forcePush = !((classic !== null && !classic.allow_force_pushes?.enabled) || rules.some(r => r.type === 'non_fast_forward'));
        const reviews = Math.max(classic?.required_pull_request_reviews?.required_approving_review_count ?? 0, ...rules.filter(r => r.type === 'pull_request').map(r => r.parameters?.required_approving_review_count ?? 0));
        const codeOwners = Boolean(classic?.required_pull_request_reviews?.require_code_owner_reviews) || rules.some(r => r.type === 'pull_request' && r.parameters?.require_code_owner_review);

        if (classic === null && rules.length === 0) {
            say(repo, 'protection', `${branch} is not protected (no branch protection, no ruleset)`);
            continue;
        }
        // Classic protection cannot separate "skip the review" from "skip the checks".
        if (classic !== null) say(repo, 'protection', `${branch}: classic branch protection; the standard is two rulesets (checks without bypass, review with an admin bypass)`);
        if (!checks.some(c => c.context === 'run-check-pr / pipeline')) say(repo, 'protection', `${branch}: required check 'run-check-pr / pipeline' missing`);
        // run-ci / pipeline, plus run-ci-images / pipeline in a Swarm project
        if (!checks.some(c => /^run-ci(-[a-z]+)? \/ pipeline$/.test(c.context))) say(repo, 'protection', `${branch}: no required run-ci* / pipeline check`);
        // Source pinned to GitHub Actions: with "any source" a status from any token counts.
        for (const c of checks.filter(c => c.app !== ACTIONS_APP_ID)) say(repo, 'protection', `${branch}: required check '${c.context}' not pinned to GitHub Actions`);
        // Up-to-date on develop, not on the default branch when develop exists:
        // develop is always behind main after a release (merge commits), and
        // "Update branch" would push straight onto the protected develop.
        if (branch === def && hasDevelop) {
            if (strict) say(repo, 'protection', `${branch}: requires up-to-date branches, which blocks every develop -> ${branch} PR`);
        } else if (!strict) {
            say(repo, 'protection', `${branch}: not requiring up-to-date branches`);
        }
        if (forcePush) say(repo, 'protection', `${branch}: force push allowed`);
        if (reviews < 1) say(repo, 'protection', `${branch}: no review required`);
        if (!codeOwners) say(repo, 'protection', `${branch}: review from code owners not required`);
    }
    // A bypass on a ruleset skips every rule in it: the checks must sit in a ruleset of their own, without one.
    for (const r of rulesets.filter(r => r.target === 'branch')) {
        const rs = await get<Ruleset>(`/repos/{owner}/{repo}/rulesets/{ruleset_id}`, { ...p, ruleset_id: r.id });
        if (rs && rs.enforcement === 'active' && (rs.rules ?? []).some(x => x.type === 'required_status_checks') && (rs.bypass_actors ?? []).length > 0) {
            say(repo, 'protection', `ruleset '${rs.name}' requires checks but has a bypass: a senior can merge past a red check`);
        }
    }

    // --- environments (names are case-insensitive to GitHub, but keep them lowercase)
    const envs = (await get<{ environments: { name: string }[] }>(`/repos/{owner}/{repo}/environments`, p))?.environments.map(e => e.name) ?? [];
    const envName = (e: string): string | undefined => envs.find(n => n.toLowerCase() === e);
    const expected = [
        ...(hasCi ? ['integration'] : []),
        // Staging follows develop; a repo without develop deploys production only.
        ...(deploys ? [...(hasDevelop ? ['staging'] : []), 'production', ...(hasAcceptance ? ['acceptance'] : [])] : []),
        ...(publishes && !deploys ? ['production'] : []),
    ];
    for (const e of expected) {
        const n = envName(e);
        if (n === undefined) say(repo, 'environments', `missing environment '${e}'`);
        else if (n !== e) say(repo, 'environments', `environment '${e}' is not lowercase`);
    }
    // Branch rules per environment: this is what keeps a deploy from any other branch out.
    for (const e of envs) {
        const lc = e.toLowerCase();
        if (lc === 'integration') continue; // CI runs on every branch
        if (lc === 'copilot') continue; // GitHub's own, for the Copilot coding agent
        if (!['staging', 'acceptance', 'production', 'github-pages'].includes(lc)) {
            say(repo, 'environments', `unexpected environment '${e}'`);
            continue;
        }
        const env = await get<{ deployment_branch_policy: { protected_branches: boolean } | null }>(`/repos/{owner}/{repo}/environments/{environment_name}`, { ...p, environment_name: e });
        const policy = env?.deployment_branch_policy ?? null;
        if (policy === null) {
            say(repo, 'environments', `environment '${e}' has no deployment branch policy: any branch may deploy to it`);
            continue;
        }
        if (policy.protected_branches) {
            say(repo, 'environments', `environment '${e}' allows 'protected branches'; name the branches and tags instead`);
            continue;
        }
        const allowed = ((await get<{ branch_policies: { name: string; type?: string }[] }>(`/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies`, { ...p, environment_name: e }))?.branch_policies ?? []).map(
            b => `${b.type ?? 'branch'} ${b.name}`,
        );
        if (lc === 'staging') {
            if (hasDevelop && !allowed.includes('branch develop')) say(repo, 'environments', 'staging does not allow develop');
            if (!allowed.includes(`branch ${def}`)) say(repo, 'environments', `staging does not allow ${def}: workflow_run and the CMS run with that ref`);
        } else if (lc === 'acceptance') {
            if (!allowed.includes('branch acceptance')) say(repo, 'environments', 'acceptance does not allow acceptance');
            if (!allowed.includes(`branch ${def}`)) say(repo, 'environments', `acceptance does not allow ${def}: workflow_run runs with that ref`);
        } else if (lc === 'github-pages') {
            if (c.pagesOnRelease && !allowed.includes('tag v*')) say(repo, 'environments', 'github-pages does not allow tags v*: Pages is published from a release');
        } else if (lc === 'production') {
            if (!allowed.includes('tag v*')) say(repo, 'environments', 'production does not allow tags v*: a release cannot deploy');
            for (const a of allowed.filter(a => a.startsWith('branch ') && a !== `branch ${def}`)) say(repo, 'environments', `production allows ${a}`);
        }
    }
    // Only seniors create release tags: a tag ruleset on v*, whenever production exists.
    // ...and whenever a release is how the repo goes live (Pages published from the release tag).
    if (envName('production') !== undefined || c.releases) {
        let tagRuleset = false;
        for (const r of rulesets.filter(r => r.target === 'tag' && r.enforcement === 'active')) {
            const rs = await get<Ruleset>(`/repos/{owner}/{repo}/rulesets/{ruleset_id}`, { ...p, ruleset_id: r.id });
            if (rs?.conditions?.ref_name?.include?.includes('refs/tags/v*') && (rs.rules ?? []).some(x => x.type === 'creation')) tagRuleset = true;
        }
        if (!tagRuleset) say(repo, 'protection', 'no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release');
    }

    if (fullAudit) {
        const onePassword = deploys && (await usesOnePassword(c, ['staging', 'acceptance', 'production'].map(envName).filter((n): n is string => n !== undefined)));
        // --- per-environment variables the v2 CD workflows fall back to
        for (const e of ['staging', 'production']) {
            const n = envName(e);
            if (n === undefined) continue;
            const vars = await names(`/repos/{owner}/{repo}/environments/{environment_name}/variables`, { ...p, environment_name: n }, 'variables');
            if (onePassword) for (const v of ['OP_VAULT', 'OP_ITEM']) if (!vars.includes(v)) say(repo, 'vars', `${e}: ${v} not set (cd-* will need it passed explicitly)`);
            if (swarm) for (const v of ['VM_SSH_HOST', 'VM_SSH_USER']) if (!vars.includes(v)) say(repo, 'vars', `${e}: ${v} not set`);
            if (supabase && !vars.includes('SUPABASE_PROJECT_REF')) say(repo, 'vars', `${e}: SUPABASE_PROJECT_REF not set`);
        }
        const repoVars = await names(`/repos/{owner}/{repo}/actions/variables`, p, 'variables');
        if (repoVars.some(v => ['OP_VAULT', 'OP_ITEM', 'VM_SSH_HOST', 'VM_SSH_USER', 'SUPABASE_PROJECT_REF'].includes(v))) {
            say(repo, 'vars', 'OP_*/VM_SSH_*/SUPABASE_PROJECT_REF set at repo level; a repo value applies to every environment');
        }

        // --- secrets (names only): deploy credentials on the environments, nowhere else
        const secrets = await names(`/repos/{owner}/{repo}/actions/secrets`, p, 'secrets');
        const deploySecrets = [
            ...(onePassword ? ['OP_SERVICE_ACCOUNT_TOKEN'] : []),
            ...(vercel ? ['VERCEL_TOKEN'] : []),
            ...(swarm ? ['VM_SSH_PRIVATE_KEY'] : []),
            ...(supabase ? ['SUPABASE_ACCESS_TOKEN'] : []),
        ];
        for (const e of ['staging', 'production']) {
            const n = envName(e);
            if (n === undefined) continue;
            const envSecrets = await names(`/repos/{owner}/{repo}/environments/{environment_name}/secrets`, { ...p, environment_name: n }, 'secrets');
            for (const s of deploySecrets) {
                if (secrets.includes(s)) continue; // reported once below, as a repo secret
                if (!envSecrets.includes(s)) say(repo, 'secrets', `${e}: ${s} not on the environment (or at org level, invisible here)`);
            }
        }
        for (const s of ['OP_SERVICE_ACCOUNT_TOKEN', 'VERCEL_TOKEN', 'VM_SSH_PRIVATE_KEY', 'SUPABASE_ACCESS_TOKEN']) {
            if (secrets.includes(s)) say(repo, 'secrets', `${s} is a repo secret: every branch's CI can read it; move it to staging and production`);
        }
        const integration = envName('integration');
        if (integration !== undefined) {
            for (const s of await names(`/repos/{owner}/{repo}/environments/{environment_name}/secrets`, { ...p, environment_name: integration }, 'secrets')) {
                if (s !== 'OP_SERVICE_ACCOUNT_TOKEN') say(repo, 'secrets', `integration has secret ${s}: a PR run must not see deploy credentials`);
                else if (!/onepassword[-_]item/.test(all)) say(repo, 'secrets', 'integration has OP_SERVICE_ACCOUNT_TOKEN but CI loads no 1Password item: every PR run can read it');
            }
        }
        if (vercel) for (const s of ['VERCEL_ORG_ID', 'VERCEL_PROJECT_ID']) if (!secrets.includes(s)) say(repo, 'secrets', `${s} missing (repo level; or org level, invisible here)`);
        // Per environment is better than per repo (each environment has its own host); either will do.
        if (swarm && !secrets.includes('VM_SSH_KNOWN_HOSTS')) {
            for (const e of ['staging', 'production']) {
                const n = envName(e);
                if (n === undefined) continue;
                const envSecrets = await names(`/repos/{owner}/{repo}/environments/{environment_name}/secrets`, { ...p, environment_name: n }, 'secrets');
                if (!envSecrets.includes('VM_SSH_KNOWN_HOSTS')) say(repo, 'secrets', `${e}: VM_SSH_KNOWN_HOSTS missing (on the environment or the repo)`);
            }
        }
        if (all.includes('use-custom-token: true') && !secrets.includes('CUSTOM_GITHUB_TOKEN')) say(repo, 'secrets', 'use-custom-token without CUSTOM_GITHUB_TOKEN');

        // --- Supabase: edge functions must ship from CI, not from a laptop
        if (!supabase && (await exists(repo, 'supabase/functions'))) say(repo, 'supabase', 'has supabase/functions but no cd-supabase caller (deployed by hand)');

        // --- scripts and versions are the CI contract; --frozen-lockfile needs packageManager and a lockfile
        const pkg = await readFile(repo, 'package.json');
        if (pkg === null) {
            say(repo, 'scripts', "no package.json: CI runs the repo's scripts");
        } else {
            if (!pkg.includes('"packageManager"')) say(repo, 'scripts', 'package.json has no packageManager: pnpm/action-setup cannot pick a version');
            if (!(await exists(repo, 'pnpm-lock.yaml'))) say(repo, 'scripts', 'no pnpm-lock.yaml: --frozen-lockfile fails');
        }
        if (!(await exists(repo, '.nvmrc'))) say(repo, 'scripts', 'no .nvmrc: CI and CD fall back to Node 22.x');
    }

    // --- CODEOWNERS: the senior developers own the whole repo, so a junior's PR
    // needs a senior's review (with code-owner review required), never a junior's
    const co = (await readFile(repo, '.github/CODEOWNERS')) ?? (await readFile(repo, 'CODEOWNERS')) ?? (await readFile(repo, 'docs/CODEOWNERS')) ?? '';
    if (!new RegExp(`^\\*\\s.*@${ORG}/senior-developers`, 'm').test(co)) {
        say(repo, 'codeowners', `no '* @${ORG}/senior-developers' line in CODEOWNERS: any reviewer would do`);
    }
    // Direct admins outside the senior team can merge their own PRs without review.
    for (const u of await list<{ login: string }>(`/repos/{owner}/{repo}/collaborators`, { ...p, affiliation: 'direct', permission: 'admin' })) {
        if (!seniors.includes(u.login)) say(repo, 'access', `${u.login} is a direct admin but not in senior-developers`);
    }

    // --- Dependabot: runs it starts get only Dependabot secrets (pull_request and push
    // alike), and it needs a registry entry to update private @pursuit-amsterdam packages
    const dep = await readFile(repo, '.github/dependabot.yml');
    if (dep === null) {
        say(repo, 'dependabot', 'no dependabot.yml');
    } else {
        // Dependabot only knows its own secrets: ${{ env.GITHUB_TOKEN }} and the like are empty.
        let registries: Record<string, { url?: string; token?: string }> = {};
        try {
            registries = (parseYaml(dep) as { registries?: typeof registries } | null)?.registries ?? {};
        } catch {
            say(repo, 'dependabot', 'dependabot.yml: not valid YAML');
        }
        for (const [name, r] of Object.entries(registries)) {
            if (r?.url?.includes('npm.pkg.github.com') && !/^\$\{\{\s*secrets\.CUSTOM_GITHUB_TOKEN\s*\}\}$/.test(r.token ?? '')) {
                say(repo, 'dependabot', `registry '${name}' reads GitHub Packages with ${r.token ?? 'no token'}, not \${{ secrets.CUSTOM_GITHUB_TOKEN }}: private packages are not updated`);
            }
        }
    }
    if (dep !== null && all.includes('use-custom-token: true')) {
        if (!dep.includes('npm.pkg.github.com')) say(repo, 'dependabot', 'no npm-registry for npm.pkg.github.com: private packages are not updated');
        if (!orgDepSecrets.includes('CUSTOM_GITHUB_TOKEN')) {
            const repoDep = await names(`/repos/{owner}/{repo}/dependabot/secrets`, p, 'secrets');
            if (!repoDep.includes('CUSTOM_GITHUB_TOKEN')) say(repo, 'dependabot', 'Dependabot secret CUSTOM_GITHUB_TOKEN not found (repo level; org level not set or not visible)');
        }
    }
    if (all.includes('dependabot/*')) say(repo, 'dependabot', 'CI triggers on push to dependabot/*: same secrets as the PR run, only a duplicate run');
}

console.log(`\n${findings.length} finding(s) across ${audited} consumer repo(s).`);
process.exitCode = findings.length === 0 ? 0 : 1;
