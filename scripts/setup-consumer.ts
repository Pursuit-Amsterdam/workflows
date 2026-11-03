// Apply the v2 standard (docs/v2/naslag/standaardinrichting.md) to consumer
// repos: environments with their branch rules, two rulesets per protected
// branch, the release-tag ruleset, and then the classic branch protection goes.
// What a repo gets depends on what its workflows call, as in the audit.
//
//   pnpm setup-consumer -- tellr-website            # dry run: what would change
//   pnpm setup-consumer -- tellr-website --apply    # make those changes
//
// One line per item: <repo>  <kind>  <what>. Kinds: create, update, remove
// (changes), todo (for an admin: values this script cannot know) and note
// (left alone, have a look). A second run makes no changes. It sets no
// values: GitHub refuses an empty variable, so missing variables and secrets
// are todos. It does remove an old repo-level CUSTOM_GITHUB_TOKEN, once every
// environment that needs the token has it. The * line of CODEOWNERS sets the
// profile (lib/protection.ts): a light repo gets a review ruleset without a
// review and a tag ruleset anyone with write may create a tag under. Making a
// repo light asks first, so only with --apply in a terminal. Writing CODEOWNERS
// and the workflow files is migrate-consumer's job.
// Needs a token with repo admin: the local `gh` login, or GH_TOKEN.
import { createInterface } from 'node:readline/promises';
import { loadConsumer, producedChecks, usesOnePassword, type Consumer } from './lib/consumer.ts';
import { ORG, get, list, octokit, readFile } from './lib/github.ts';
import { covers, normalize, pickCodeowners, profileFrom, reviewRuleset, rulesetAction, tagRuleset, type BranchOwners, type Desired, type Profile, type Ruleset } from './lib/protection.ts';
import { dependabotNeedsToken, readsTokenDirectly, tokenEnvironments } from './lib/token.ts';

const ACTIONS_APP_ID = 15368; // GitHub Actions; required checks are pinned to it

const args = process.argv.slice(2).filter(a => a !== '--');
const apply = args.includes('--apply');
const repos = args.filter(a => !a.startsWith('--'));
if (repos.length === 0) {
    console.error('usage: pnpm setup-consumer -- <repo>... [--apply]');
    process.exit(2);
}

interface Item {
    repo: string;
    kind: 'create' | 'update' | 'remove' | 'todo' | 'note';
    message: string;
    run?: () => Promise<void>;
}
const items: Item[] = [];
function add(item: Item): void {
    items.push(item);
    console.log(`${item.repo.padEnd(34)} ${item.kind.padEnd(7)} ${item.message}`);
}

async function send(method: string, route: string, params: Record<string, unknown>): Promise<void> {
    await octokit.request(`${method} ${route}`, params);
}

// --- rulesets ---------------------------------------------------------------

function checksRuleset(branch: string, checks: string[], strict: boolean): Desired {
    return {
        name: `protect ${branch} (checks, no bypass)`,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [],
        conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
        rules: [
            {
                type: 'required_status_checks',
                parameters: {
                    do_not_enforce_on_create: false,
                    strict_required_status_checks_policy: strict,
                    required_status_checks: checks.map(context => ({ context, integration_id: ACTIONS_APP_ID })),
                },
            },
        ],
    };
}

function describe(rs: Desired): string {
    const checks = rs.rules?.flatMap(r => (r.parameters?.required_status_checks as { context: string }[] | undefined)?.map(c => c.context) ?? []) ?? [];
    const strict = rs.rules?.some(r => r.parameters?.strict_required_status_checks_policy === true);
    return checks.length ? `${checks.join(', ')}${strict ? '; up to date' : ''}` : (rs.rules ?? []).map(r => r.type).join(', ');
}

async function upsertRuleset(repo: string, existing: Ruleset[], want: Desired): Promise<void> {
    const p = { owner: ORG, repo };
    const found = existing.find(r => r.name === want.name);
    if (!found) {
        add({ repo, kind: 'create', message: `ruleset '${want.name}': ${describe(want)}`, run: () => send('POST', '/repos/{owner}/{repo}/rulesets', { ...p, ...want }) });
        return;
    }
    const actual = await get<Ruleset>(`/repos/{owner}/{repo}/rulesets/{ruleset_id}`, { ...p, ruleset_id: found.id });
    if (actual && covers(normalize(want), normalize(actual))) return;
    add({
        repo,
        kind: 'update',
        message: `ruleset '${want.name}': ${describe(want)}${actual ? ` (was: ${describe(actual)})` : ''}`,
        run: () => send('PUT', '/repos/{owner}/{repo}/rulesets/{ruleset_id}', { ...p, ruleset_id: found.id, ...want }),
    });
}

// --- the profile -------------------------------------------------------------

const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'] as const;

/** CODEOWNERS and GitHub's errors for it, on the default branch and develop: the profile and its findings. */
async function readProfile(repo: string, c: Consumer): Promise<{ profile: Profile; findings: string[] }> {
    const branches: BranchOwners[] = [];
    for (const branch of [c.defaultBranch, ...(c.hasDevelop && c.defaultBranch !== 'develop' ? ['develop'] : [])]) {
        const files = Object.fromEntries(await Promise.all(CODEOWNERS_PATHS.map(async f => [f, await readFile(repo, f, branch)] as const)));
        const errors = await get<{ errors: BranchOwners['errors'] }>('/repos/{owner}/{repo}/codeowners/errors', { owner: ORG, repo, ref: branch });
        branches.push({ branch, codeowners: pickCodeowners(files as Record<(typeof CODEOWNERS_PATHS)[number], string | null>), errors: errors?.errors ?? null });
    }
    return profileFrom(branches);
}

// Questions only with --apply in a terminal; otherwise making a repo light is a todo.
const tty = Boolean(process.stdin.isTTY);
const rl = apply && tty ? createInterface({ input: process.stdin, output: process.stdout }) : null;

/** A ruleset that depends on the profile: light only after a yes; tightening needs no question. */
async function upsertForProfile(repo: string, existing: Ruleset[], profile: Profile, pair: { standard: Desired; light: Desired }): Promise<void> {
    const found = existing.find(r => r.name === pair.standard.name);
    const actual = found ? await get<Ruleset>('/repos/{owner}/{repo}/rulesets/{ruleset_id}', { owner: ORG, repo, ruleset_id: found.id }) : null;
    const { action, want } = rulesetAction(profile, pair, actual, { apply, tty });
    if (action === 'todo') add({ repo, kind: 'todo', message: `ruleset '${pair.light.name}': CODEOWNERS says light; run with --apply in a terminal to confirm` });
    if (action === 'ask' && rl && profile.kind === 'light') {
        const answer = (await rl.question(`${repo}: CODEOWNERS names ${profile.owners.join(' ')} → make '${pair.light.name}' light (${describe(pair.light)})? [y/N] `)).trim().toLowerCase();
        await upsertRuleset(repo, existing, answer === 'y' ? pair.light : pair.standard);
        return;
    }
    await upsertRuleset(repo, existing, want);
}

// --- environments -----------------------------------------------------------

interface Environment {
    name: string;
    deployment_branch_policy: { protected_branches: boolean; custom_branch_policies: boolean } | null;
    protection_rules?: { type: string; wait_timer?: number; prevent_self_review?: boolean; reviewers?: { type: string; reviewer: { id: number } }[] }[];
}

/** The environments a repo needs, with the branches and tags that may deploy to each; null: no rule. */
function wantedEnvironments(c: Consumer): Map<string, string[] | null> {
    const def = c.defaultBranch;
    const envs = new Map<string, string[] | null>();
    if (c.hasCi) envs.set('integration', null); // CI runs on every branch
    // Staging follows develop, when cd-gate sends it there; a repo without
    // develop, or with `branch-targets: ""`, deploys production only.
    // The default branch: workflow_run and the CMS's repository_dispatch run with that ref.
    if (c.staging) envs.set('staging', ['branch develop', `branch ${def}`]);
    if (c.acceptance) envs.set('acceptance', ['branch acceptance', `branch ${def}`]);
    if (c.deploys || c.publishes) envs.set('production', ['tag v*']);
    return envs;
}

/** The environment's name as it exists (or will), and whether this run creates it. */
interface EnvRef {
    name: string;
    created: boolean;
}

async function setupEnvironment(repo: string, existing: Environment[], name: string, allowed: string[] | null): Promise<EnvRef> {
    const p = { owner: ORG, repo };
    const policies = (allowed ?? []).map(a => {
        const [type, ...rest] = a.split(' ');
        return { type, name: rest.join(' ') };
    });
    const addPolicies = (env: string, missing: typeof policies) => async () => {
        for (const b of missing) await send('POST', '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies', { ...p, environment_name: env, ...b });
    };
    const custom = { protected_branches: false, custom_branch_policies: true };

    const found = existing.find(e => e.name.toLowerCase() === name);
    if (!found) {
        add({
            repo,
            kind: 'create',
            message: `environment '${name}'${allowed ? `: ${allowed.join(', ')}` : ', no branch rule'}`,
            run: async () => {
                await send('PUT', '/repos/{owner}/{repo}/environments/{environment_name}', { ...p, environment_name: name, ...(allowed ? { deployment_branch_policy: custom } : {}) });
                await addPolicies(name, policies)();
            },
        });
        return { name, created: true };
    }
    const env = found.name; // GitHub ignores case; renaming would drop its secrets
    if (env !== name) add({ repo, kind: 'note', message: `environment '${env}' is not lowercase; renaming drops its secrets, so it stays` });
    if (allowed === null) {
        if (found.deployment_branch_policy !== null) add({ repo, kind: 'note', message: `environment '${env}' has a branch rule; CI runs on every branch` });
        return { name: env, created: false };
    }
    const policy = found.deployment_branch_policy;
    const current =
        policy?.custom_branch_policies === true
            ? ((await get<{ branch_policies: { name: string; type?: string }[] }>(`/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies`, { ...p, environment_name: env }))?.branch_policies ?? []).map(
                  b => `${b.type ?? 'branch'} ${b.name}`,
              )
            : [];
    const missing = policies.filter(b => !current.includes(`${b.type} ${b.name}`));
    if (policy?.custom_branch_policies !== true) {
        // Keep the environment's wait timer and reviewers: this PUT replaces its protection.
        const rules = found.protection_rules ?? [];
        const wait = rules.find(r => r.type === 'wait_timer')?.wait_timer;
        const reviewers = rules.find(r => r.type === 'required_reviewers');
        const was = policy === null ? 'any branch' : 'protected branches';
        add({
            repo,
            kind: 'update',
            message: `environment '${env}': ${allowed.join(', ')} (was: ${was})`,
            run: async () => {
                await send('PUT', '/repos/{owner}/{repo}/environments/{environment_name}', {
                    ...p,
                    environment_name: env,
                    deployment_branch_policy: custom,
                    ...(wait !== undefined ? { wait_timer: wait } : {}),
                    ...(reviewers
                        ? { prevent_self_review: reviewers.prevent_self_review ?? false, reviewers: (reviewers.reviewers ?? []).map(r => ({ type: r.type, id: r.reviewer.id })) }
                        : {}),
                });
                await addPolicies(env, missing)();
            },
        });
        return { name: env, created: false };
    }
    if (missing.length) {
        add({ repo, kind: 'update', message: `environment '${env}': allow ${missing.map(b => `${b.type} ${b.name}`).join(', ')}`, run: addPolicies(env, missing) });
    }
    for (const extra of current.filter(a => !allowed.includes(a))) add({ repo, kind: 'note', message: `environment '${env}' also allows ${extra}` });
    return { name: env, created: false };
}

// --- variables and secrets: names only; values are an admin's job ----------

async function names(route: string, params: Record<string, unknown>, key: 'variables' | 'secrets'): Promise<string[]> {
    return ((await get<Record<string, { name: string }[]>>(route, { ...params, per_page: 100 }))?.[key] ?? []).map(x => x.name);
}

async function todos(c: Consumer, envs: Map<string, EnvRef>, existingEnvs: Environment[]): Promise<void> {
    const { repo } = c;
    const p = { owner: ORG, repo };
    const repoSecrets = await names('/repos/{owner}/{repo}/actions/secrets', p, 'secrets');
    if (c.deploys) {
        const onePassword = await usesOnePassword(c, [...envs.values()].filter(e => !e.created).map(e => e.name));
        const vars = [...(onePassword ? ['OP_VAULT', 'OP_ITEM'] : []), ...(c.swarm ? ['VM_SSH_HOST', 'VM_SSH_USER'] : []), ...(c.supabase ? ['SUPABASE_PROJECT_REF'] : [])];
        const secrets = [...(onePassword ? ['OP_SERVICE_ACCOUNT_TOKEN'] : []), ...(c.vercel ? ['VERCEL_TOKEN'] : []), ...(c.swarm ? ['VM_SSH_PRIVATE_KEY'] : []), ...(c.supabase ? ['SUPABASE_ACCESS_TOKEN'] : [])];
        const knownHostsOnRepo = repoSecrets.includes('VM_SSH_KNOWN_HOSTS');
        for (const e of ['staging', 'acceptance', 'production']) {
            const ref = envs.get(e);
            if (ref === undefined) continue;
            const env = ref.name;
            const q = { ...p, environment_name: env };
            const haveVars = ref.created ? [] : await names('/repos/{owner}/{repo}/environments/{environment_name}/variables', q, 'variables');
            const haveSecrets = ref.created ? [] : await names('/repos/{owner}/{repo}/environments/{environment_name}/secrets', q, 'secrets');
            const missingVars = vars.filter(v => !haveVars.includes(v));
            // A deploy secret at repo level is reported once below, as one to move.
            const missingSecrets = [...secrets.filter(s => !haveSecrets.includes(s) && !repoSecrets.includes(s)), ...(c.swarm && !knownHostsOnRepo && !haveSecrets.includes('VM_SSH_KNOWN_HOSTS') ? ['VM_SSH_KNOWN_HOSTS'] : [])];
            if (missingVars.length) add({ repo, kind: 'todo', message: `${env}: set variables ${missingVars.join(', ')}` });
            if (missingSecrets.length) add({ repo, kind: 'todo', message: `${env}: set secrets ${missingSecrets.join(', ')} (or at org level, invisible here)` });
        }
        for (const s of secrets.filter(s => repoSecrets.includes(s))) add({ repo, kind: 'todo', message: `${s} is a repo secret: move it to the environments` });
    }
    if (c.vercel) {
        const missing = ['VERCEL_ORG_ID', 'VERCEL_PROJECT_ID'].filter(s => !repoSecrets.includes(s));
        if (missing.length) add({ repo, kind: 'todo', message: `set repo secrets ${missing.join(', ')} (or at org level, invisible here)` });
    }
    await packageToken(c, envs, existingEnvs, repoSecrets);
}

// The shared package PAT: on each environment whose jobs read it (lib/token.ts),
// and as a Dependabot secret. The value is in 1Password; see the standard.
async function packageToken(c: Consumer, envs: Map<string, EnvRef>, existingEnvs: Environment[], repoSecrets: string[]): Promise<void> {
    const { repo } = c;
    const p = { owner: ORG, repo };
    let missing = 0;
    for (const e of tokenEnvironments(c.workflows)) {
        // github-pages is GitHub's own; the Pages todo above covers a repo without it.
        const gh = existingEnvs.find(x => x.name.toLowerCase() === e);
        const ref = envs.get(e) ?? (gh ? { name: gh.name, created: false } : undefined);
        if (ref === undefined) continue;
        const have = ref.created ? [] : await names('/repos/{owner}/{repo}/environments/{environment_name}/secrets', { ...p, environment_name: ref.name }, 'secrets');
        if (have.includes('CUSTOM_GITHUB_TOKEN')) continue;
        missing++;
        add({ repo, kind: 'todo', message: `${ref.name}: set secret CUSTOM_GITHUB_TOKEN (use-custom-token)` });
    }
    if (repoSecrets.includes('CUSTOM_GITHUB_TOKEN')) {
        // A repo secret is the fallback for every job: remove it only once nothing leans on it.
        if (readsTokenDirectly(c.workflows)) add({ repo, kind: 'note', message: 'a workflow reads secrets.CUSTOM_GITHUB_TOKEN itself: the repo secret stays' });
        else if (missing > 0) add({ repo, kind: 'note', message: 'repo secret CUSTOM_GITHUB_TOKEN goes once the environments above have it' });
        else add({ repo, kind: 'remove', message: 'repo secret CUSTOM_GITHUB_TOKEN (the environments have it)', run: () => send('DELETE', '/repos/{owner}/{repo}/actions/secrets/{secret_name}', { ...p, secret_name: 'CUSTOM_GITHUB_TOKEN' }) });
    }
    // A run that Dependabot starts gets only Dependabot secrets, and those have no environments.
    if (dependabotNeedsToken(await readFile(repo, '.github/dependabot.yml'))) {
        const dep = await names('/repos/{owner}/{repo}/dependabot/secrets', p, 'secrets');
        if (!dep.includes('CUSTOM_GITHUB_TOKEN')) add({ repo, kind: 'todo', message: 'set Dependabot secret CUSTOM_GITHUB_TOKEN: dependabot.yml reads GitHub Packages with it' });
    }
}

// --- per repo ---------------------------------------------------------------

for (const repo of repos) {
    const p = { owner: ORG, repo };
    const c = await loadConsumer(repo);
    if (!c) {
        add({ repo, kind: 'note', message: 'cannot read repo' });
        continue;
    }
    for (const u of c.unreadable) add({ repo, kind: 'note', message: `${u.file}: ${u.reason}; the workflows decide what is set up` });
    if (!c.calls) {
        add({ repo, kind: 'note', message: `calls nothing from ${ORG}/workflows: nothing to set up` });
        continue;
    }
    const def = c.defaultBranch;

    // Environments first: the deploy branches' rules hold even while the rest is set up.
    const existingEnvs = (await get<{ environments: Environment[] }>('/repos/{owner}/{repo}/environments', p))?.environments ?? [];
    const envs = new Map<string, EnvRef>();
    const wanted = wantedEnvironments(c);
    for (const [name, allowed] of wanted) envs.set(name, await setupEnvironment(repo, existingEnvs, name, allowed));
    // github-pages and copilot are GitHub's own (cd-pages, the Copilot coding agent).
    const standard = ['integration', 'staging', 'acceptance', 'production', 'github-pages', 'copilot'];
    for (const e of existingEnvs.filter(e => !standard.includes(e.name.toLowerCase()))) {
        add({ repo, kind: 'note', message: `environment '${e.name}' is not part of the standard` });
    }

    // Two rulesets per protected branch; the classic protection goes once both stand.
    // The review ruleset and the tag ruleset follow the profile from CODEOWNERS.
    const { profile, findings } = await readProfile(repo, c);
    for (const f of findings) add({ repo, kind: 'todo', message: `${f}; protection stays standard` });
    if (profile.kind === 'light') add({ repo, kind: 'note', message: `light protection: CODEOWNERS names ${profile.owners.join(' ')}` });
    const rulesets = await list<Ruleset>('/repos/{owner}/{repo}/rulesets', p);
    const branches = [def, ...(['develop', 'acceptance'] as const).filter(b => b !== def && (b === 'develop' ? c.hasDevelop : c.hasAcceptance))];
    for (const branch of branches) {
        // The checks a PR to this branch gets come from the workflows on this branch:
        // during a migration develop runs v2 while the default branch still runs v1.
        const onBranch = branch === def ? c : await loadConsumer(repo, branch);
        const checks = onBranch ? producedChecks(onBranch) : [];
        if (checks.length === 0) add({ repo, kind: 'todo', message: `${branch}: no check-pr or CI caller in its workflows: no checks ruleset, classic protection stays` });
        // Up to date only on the default branch of a repo without develop. Elsewhere a PR's head
        // is protected too (develop -> main, main -> develop, develop -> acceptance), so
        // "Update branch" would push onto it, which the rulesets refuse.
        if (checks.length) await upsertRuleset(repo, rulesets, checksRuleset(branch, checks, branch === def && !c.hasDevelop));
        await upsertForProfile(repo, rulesets, profile, { standard: reviewRuleset(branch, { kind: 'standard' }), light: reviewRuleset(branch, profile) });
        const ours = [checksRuleset(branch, [], false).name, reviewRuleset(branch, profile).name];
        for (const r of rulesets.filter(r => r.target === 'branch' && !ours.includes(r.name) && !r.name.startsWith('protect '))) {
            const rs = await get<Ruleset>('/repos/{owner}/{repo}/rulesets/{ruleset_id}', { ...p, ruleset_id: r.id });
            const include = rs?.conditions?.ref_name?.include ?? [];
            if (include.includes(`refs/heads/${branch}`) || include.includes('~ALL') || (branch === def && include.includes('~DEFAULT_BRANCH'))) {
                add({ repo, kind: 'note', message: `ruleset '${r.name}' also applies to ${branch}; left alone` });
            }
        }
        const classic = await get<{ required_status_checks?: { checks?: { context: string }[] } }>('/repos/{owner}/{repo}/branches/{branch}/protection', { ...p, branch });
        if (classic && checks.length) {
            const dropped = (classic.required_status_checks?.checks ?? []).map(x => x.context).filter(x => !checks.includes(x));
            add({
                repo,
                kind: 'remove',
                message: `classic branch protection on ${branch}${dropped.length ? ` (its checks ${dropped.join(', ')} are not required any more)` : ''}`,
                run: () => send('DELETE', '/repos/{owner}/{repo}/branches/{branch}/protection', { ...p, branch }),
            });
        }
    }

    // Only seniors create release tags, so only a senior deploys to production;
    // in a light repo anyone with write creates one. Also for a repo whose release
    // publishes Pages: the tag is how it goes live.
    if (wanted.has('production') || c.releases) await upsertForProfile(repo, rulesets, profile, { standard: tagRuleset({ kind: 'standard' }), light: tagRuleset(profile) });

    // Pages published from a release: the github-pages environment (GitHub makes it)
    // must allow the release tags. Other rules on it (develop, for a Storybook on
    // every push) stay.
    if (c.pagesOnRelease) {
        const gh = existingEnvs.find(e => e.name === 'github-pages');
        if (!gh) add({ repo, kind: 'todo', message: "github-pages: enable Pages (source: GitHub Actions) first; then run again to allow tags v*" });
        else {
            const q = { ...p, environment_name: 'github-pages' };
            const current = ((await get<{ branch_policies: { name: string; type?: string }[] }>('/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies', q))?.branch_policies ?? []).map(b => `${b.type ?? 'branch'} ${b.name}`);
            if (gh.deployment_branch_policy?.custom_branch_policies !== true) {
                add({ repo, kind: 'update', message: "environment 'github-pages': tag v* (was: any branch)", run: async () => {
                    await send('PUT', '/repos/{owner}/{repo}/environments/{environment_name}', { ...q, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true } });
                    await send('POST', '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies', { ...q, name: 'v*', type: 'tag' });
                } });
            } else if (!current.includes('tag v*')) {
                add({ repo, kind: 'update', message: "environment 'github-pages': allow tag v*", run: () => send('POST', '/repos/{owner}/{repo}/environments/{environment_name}/deployment-branch-policies', { ...q, name: 'v*', type: 'tag' }) });
            }
        }
    }

    await todos(c, envs, existingEnvs);
}

rl?.close();
const changes = items.filter(i => i.run);
if (changes.length === 0) {
    console.log('no changes');
} else if (!apply) {
    console.log(`${changes.length} change(s); dry run, run again with --apply to make them`);
} else {
    for (const i of changes) await i.run?.();
    console.log(`${changes.length} change(s) made`);
}
