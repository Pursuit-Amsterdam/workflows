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
// are todos. CODEOWNERS and the workflow files are migrate-consumer's job.
// Needs a token with repo admin: the local `gh` login, or GH_TOKEN.
import { loadConsumer, producedChecks, usesOnePassword, type Consumer } from './lib/consumer.ts';
import { ORG, get, list, octokit } from './lib/github.ts';

const ACTIONS_APP_ID = 15368; // GitHub Actions; required checks are pinned to it
const ADMIN_ROLE = 5; // RepositoryRole admin: the senior-developers team
const TAG_RULESET = 'release tags: seniors only';

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

interface Ruleset {
    id: number;
    name: string;
    target: string;
    enforcement: string;
    bypass_actors?: { actor_id: number | null; actor_type: string; bypass_mode: string }[];
    conditions?: { ref_name?: { include?: string[]; exclude?: string[] } };
    rules?: { type: string; parameters?: Record<string, unknown> }[];
}
type Desired = Omit<Ruleset, 'id'>;

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

function reviewRuleset(branch: string): Desired {
    return {
        name: `protect ${branch} (review, seniors may skip)`,
        target: 'branch',
        enforcement: 'active',
        bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }],
        conditions: { ref_name: { include: [`refs/heads/${branch}`], exclude: [] } },
        rules: [
            { type: 'deletion' },
            { type: 'non_fast_forward' },
            {
                type: 'pull_request',
                parameters: {
                    allowed_merge_methods: ['merge', 'squash'],
                    dismiss_stale_reviews_on_push: true,
                    require_code_owner_review: true,
                    require_last_push_approval: false,
                    required_approving_review_count: 1,
                    required_review_thread_resolution: false,
                },
            },
        ],
    };
}

const tagRuleset: Desired = {
    name: TAG_RULESET,
    target: 'tag',
    enforcement: 'active',
    bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
    conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } },
    rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
};

/** Rules by type and checks by name, so the order GitHub returns them in does not count. */
function normalize(rs: Desired): Desired {
    const rules = [...(rs.rules ?? [])].sort((a, b) => a.type.localeCompare(b.type)).map(r => {
        const checks = r.parameters?.required_status_checks as { context: string }[] | undefined;
        if (!checks) return r;
        return { ...r, parameters: { ...r.parameters, required_status_checks: [...checks].sort((a, b) => a.context.localeCompare(b.context)) } };
    });
    return { ...rs, rules };
}

/** Everything the desired value sets, the actual value has too. GitHub adds defaults of its own. */
function covers(desired: unknown, actual: unknown): boolean {
    if (Array.isArray(desired)) {
        return Array.isArray(actual) && desired.length === actual.length && desired.every((d, i) => covers(d, actual[i]));
    }
    if (typeof desired === 'object' && desired !== null) {
        if (typeof actual !== 'object' || actual === null) return false;
        return Object.entries(desired).every(([k, v]) => covers(v, (actual as Record<string, unknown>)[k]));
    }
    return desired === actual;
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
    // Staging follows develop; a repo without develop deploys production only.
    if (c.deploys && c.hasDevelop) {
        // The default branch: workflow_run and the CMS's repository_dispatch run with that ref.
        envs.set('staging', ['branch develop', `branch ${def}`]);
        if (c.hasAcceptance) envs.set('acceptance', ['branch acceptance', `branch ${def}`]);
    }
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

async function todos(c: Consumer, envs: Map<string, EnvRef>): Promise<void> {
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
    if (c.usesCustomToken && !repoSecrets.includes('CUSTOM_GITHUB_TOKEN')) {
        add({ repo, kind: 'todo', message: 'set repo secret CUSTOM_GITHUB_TOKEN: CI uses use-custom-token' });
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
    const rulesets = await list<Ruleset>('/repos/{owner}/{repo}/rulesets', p);
    const branches = [def, ...(['develop', 'acceptance'] as const).filter(b => b !== def && (b === 'develop' ? c.hasDevelop : c.hasAcceptance))];
    for (const branch of branches) {
        // The checks a PR to this branch gets come from the workflows on this branch:
        // during a migration develop runs v2 while the default branch still runs v1.
        const onBranch = branch === def ? c : await loadConsumer(repo, branch);
        const checks = onBranch ? producedChecks(onBranch) : [];
        if (checks.length === 0) add({ repo, kind: 'todo', message: `${branch}: no check-pr or CI caller in its workflows: no checks ruleset, classic protection stays` });
        // Up to date on develop and acceptance; not on the default branch when develop exists,
        // where develop is behind after every release and "Update branch" would push onto it.
        if (checks.length) await upsertRuleset(repo, rulesets, checksRuleset(branch, checks, !(branch === def && c.hasDevelop)));
        await upsertRuleset(repo, rulesets, reviewRuleset(branch));
        const ours = [checksRuleset(branch, [], false).name, reviewRuleset(branch).name];
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

    // Only seniors create release tags, so only a senior deploys to production.
    if (wanted.has('production')) await upsertRuleset(repo, rulesets, tagRuleset);

    await todos(c, envs);
}

const changes = items.filter(i => i.run);
if (changes.length === 0) {
    console.log('no changes');
} else if (!apply) {
    console.log(`${changes.length} change(s); dry run, run again with --apply to make them`);
} else {
    for (const i of changes) await i.run?.();
    console.log(`${changes.length} change(s) made`);
}
