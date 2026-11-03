// The protection profile of a repo (use case 30, docs/v2/use-cases.md#light).
// Standard: the senior developers own the whole repo, a junior's PR needs a
// senior's review, and only seniors create release tags. Light: the own project
// of a developer, with only users on the * line of CODEOWNERS; anyone with write
// access merges without a review and may create a release tag. Every doubt is
// standard: a profile can only get lighter on purpose.

export const SENIOR_TEAM = '@Pursuit-Amsterdam/senior-developers';

export type Profile = { kind: 'standard' } | { kind: 'light'; owners: string[] };

/** CODEOWNERS on one protected branch, and what GitHub's codeowners/errors said about it (null: no answer). */
export interface BranchOwners {
    branch: string;
    codeowners: string | null;
    errors: { line: number; kind: string; message?: string }[] | null;
}

const STANDARD: Profile = { kind: 'standard' };

/** The file GitHub uses: the first of .github/, the root and docs/ that exists. */
export function pickCodeowners(files: Record<'.github/CODEOWNERS' | 'CODEOWNERS' | 'docs/CODEOWNERS', string | null>): string | null {
    return files['.github/CODEOWNERS'] ?? files.CODEOWNERS ?? files['docs/CODEOWNERS'];
}

/** A line whose pattern matches every file: *, ** or /**. */
export function isStarLine(line: string): boolean {
    const [pattern] = line.replace(/#.*/, '').trim().split(/\s+/);
    return pattern === '*' || pattern === '**' || pattern === '/**';
}

/** The owners on the last line that matches every file; null when there is none. */
function starOwners(text: string): string[] | null {
    let owners: string[] | null = null;
    for (const line of text.split('\n')) {
        if (isStarLine(line)) owners = line.replace(/#.*/, '').trim().split(/\s+/).slice(1);
    }
    return owners;
}

const isSeniorTeam = (owner: string): boolean => owner.toLowerCase() === SENIOR_TEAM.toLowerCase();
const isUser = (owner: string): boolean => /^@[A-Za-z0-9-]+$/.test(owner);

/** One branch: its profile, or why it falls back to standard. */
function branchProfile(b: BranchOwners): { profile: Profile; finding?: string } {
    if (b.errors === null) return { profile: STANDARD, finding: `${b.branch}: could not check CODEOWNERS for errors` };
    if (b.errors.length) return { profile: STANDARD, finding: `${b.branch}: CODEOWNERS has errors: ${b.errors.map(e => `line ${e.line}: ${e.kind}`).join('; ')}` };
    const owners = b.codeowners === null ? null : starOwners(b.codeowners);
    if (owners === null || owners.length === 0) return { profile: STANDARD, finding: `${b.branch}: no '* ${SENIOR_TEAM}' line in CODEOWNERS: any reviewer would do` };
    if (owners.every(isSeniorTeam)) return { profile: STANDARD };
    if (owners.every(isUser)) return { profile: { kind: 'light', owners } };
    return { profile: STANDARD, finding: `${b.branch}: the * line in CODEOWNERS (${owners.join(' ')}) is neither ${SENIOR_TEAM} alone nor users only` };
}

export const same = (a: Profile, b: Profile): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The repo's profile: light only when every protected branch says light with the same owners. */
export function profileFrom(branches: BranchOwners[]): { profile: Profile; findings: string[] } {
    const each = branches.map(branchProfile);
    const findings = each.flatMap(e => (e.finding ? [e.finding] : []));
    if (findings.length) return { profile: STANDARD, findings };
    const [first, ...rest] = each.map(e => e.profile);
    if (!first) return { profile: STANDARD, findings };
    if (rest.some(p => !same(p, first))) {
        return { profile: STANDARD, findings: [`CODEOWNERS differs between ${branches.map(b => b.branch).join(' and ')}: protection stays standard`] };
    }
    return { profile: first, findings };
}

// --- rulesets ---------------------------------------------------------------

const ADMIN_ROLE = 5; // RepositoryRole admin: the senior-developers team
export const TAG_RULESET = 'release tags: seniors only';

export interface Ruleset {
    id: number;
    name: string;
    target: string;
    enforcement: string;
    bypass_actors?: { actor_id: number | null; actor_type: string; bypass_mode: string }[];
    conditions?: { ref_name?: { include?: string[]; exclude?: string[] } };
    rules?: { type: string; parameters?: Record<string, unknown> }[];
}
export type Desired = Omit<Ruleset, 'id'>;

/** Rules by type and checks by name, so the order GitHub returns them in does not count. */
export function normalize(rs: Desired): Desired {
    const rules = [...(rs.rules ?? [])].sort((a, b) => a.type.localeCompare(b.type)).map(r => {
        const checks = r.parameters?.required_status_checks as { context: string }[] | undefined;
        if (!checks) return r;
        return { ...r, parameters: { ...r.parameters, required_status_checks: [...checks].sort((a, b) => a.context.localeCompare(b.context)) } };
    });
    return { ...rs, rules };
}

/** Everything the desired value sets, the actual value has too. GitHub adds defaults of its own. */
export function covers(desired: unknown, actual: unknown): boolean {
    if (Array.isArray(desired)) {
        return Array.isArray(actual) && desired.length === actual.length && desired.every((d, i) => covers(d, actual[i]));
    }
    if (typeof desired === 'object' && desired !== null) {
        if (typeof actual !== 'object' || actual === null) return false;
        return Object.entries(desired).every(([k, v]) => covers(v, (actual as Record<string, unknown>)[k]));
    }
    return desired === actual;
}

/** Review, force push and deletion; admins (the seniors) may skip the review on a PR. Light: a PR, but no review. */
export function reviewRuleset(branch: string, profile: Profile): Desired {
    const light = profile.kind === 'light';
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
                    require_code_owner_review: !light,
                    require_last_push_approval: false,
                    required_approving_review_count: light ? 0 : 1,
                    required_review_thread_resolution: false,
                },
            },
        ],
    };
}

/** Release tags v*: only seniors create, change or remove one. Light: anyone with write creates one. */
export function tagRuleset(profile: Profile): Desired {
    const rules = [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }];
    return {
        name: TAG_RULESET,
        target: 'tag',
        enforcement: 'active',
        bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
        conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } },
        rules: profile.kind === 'light' ? rules.filter(r => r.type !== 'creation') : rules,
    };
}

/**
 * What setup-consumer does with a ruleset that depends on the profile. Tightening
 * needs no question; making it light does, so only with --apply in a terminal.
 * Without one it is a todo, and the standard ruleset is what gets set.
 */
export function rulesetAction(
    profile: Profile,
    pair: { standard: Desired; light: Desired },
    actual: Ruleset | null,
    opts: { apply: boolean; tty: boolean },
): { action: 'none' | 'set' | 'ask' | 'todo'; want: Desired } {
    const fits = (want: Desired) => actual !== null && covers(normalize(want), normalize(actual));
    if (profile.kind === 'standard') return { action: fits(pair.standard) ? 'none' : 'set', want: pair.standard };
    if (fits(pair.light)) return { action: 'none', want: pair.light };
    return opts.apply && opts.tty ? { action: 'ask', want: pair.light } : { action: 'todo', want: pair.standard };
}

// --- what the audit checks ----------------------------------------------------

/** The review rules on one branch, from classic protection and rulesets together. */
export interface ReviewView {
    prRule: boolean;
    reviews: number;
    codeOwners: boolean;
    deletion: boolean;
}

/** Standard: one review from a code owner. Light: a PR without a review, and the branch cannot be deleted. */
export function reviewFindings(profile: Profile, branch: string, v: ReviewView): string[] {
    if (profile.kind === 'standard') {
        return [...(v.reviews < 1 ? [`${branch}: no review required`] : []), ...(!v.codeOwners ? [`${branch}: review from code owners not required`] : [])];
    }
    if (v.reviews > 0 || v.codeOwners) return [`${branch}: CODEOWNERS says light, but a review is still required: run setup-consumer --apply`];
    return [
        ...(!v.prRule ? [`${branch}: no pull request required (light protection still needs one)`] : []),
        ...(!v.deletion ? [`${branch}: branch can be deleted`] : []),
    ];
}

/** Standard: only seniors create v* tags. Light: anyone with write creates one, nobody else changes or removes it. */
export function tagFindings(profile: Profile, tagRulesets: { include: string[]; rules: string[] }[]): string[] {
    const onV = tagRulesets.filter(r => r.include.includes('refs/tags/v*'));
    const has = (type: string) => onV.some(r => r.rules.includes(type));
    if (profile.kind === 'standard') return has('creation') ? [] : ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release'];
    if (has('creation')) return ['CODEOWNERS says light, but only seniors create v* tags: run setup-consumer --apply'];
    return has('update') && has('deletion') ? [] : ['no tag ruleset on refs/tags/v* (update, deletion): anyone with push can move or remove a release tag'];
}
