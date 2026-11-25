// The protection every consumer repo gets (Task 32, docs/v2/beslissingen.md).
// A PR to a protected branch needs one review from anyone with write access;
// admins (the senior developers) may skip it, only on a PR. Only seniors
// create release tags. No CODEOWNERS: GitHub asks the owners in it for a review
// on every PR, and a team as owner means the whole team on every PR.

export const SENIOR_TEAM = '@Pursuit-Amsterdam/senior-developers';

/** Where GitHub looks for CODEOWNERS, in its order. */
export const CODEOWNERS_PATHS = ['.github/CODEOWNERS', 'CODEOWNERS', 'docs/CODEOWNERS'] as const;
export type CodeownersPath = (typeof CODEOWNERS_PATHS)[number];
export interface Codeowners {
    path: CodeownersPath;
    text: string;
}

/** The file GitHub uses: the first of .github/, the root and docs/ that exists. */
export function pickCodeowners(files: Record<CodeownersPath, string | null>): Codeowners | null {
    for (const path of CODEOWNERS_PATHS) {
        const text = files[path];
        if (text !== null) return { path, text };
    }
    return null;
}

/** A line whose pattern matches every file: *, ** or /**. */
export function isStarLine(line: string): boolean {
    const [pattern] = line.replace(/#.*/, '').trim().split(/\s+/);
    return pattern === '*' || pattern === '**' || pattern === '/**';
}

/** Every owner a rule line names, once, in order; comments left out. */
function owners(text: string): string[] {
    const all = text.split('\n').flatMap(line => line.replace(/#.*/, '').trim().split(/\s+/).slice(1));
    return [...new Set(all.filter(Boolean))];
}

/** CODEOWNERS that asks anyone for a review is a finding: v2 uses none. */
export function codeownersFinding(branch: string, file: Codeowners | null): string | null {
    const who = file ? owners(file.text) : [];
    if (!file || who.length === 0) return null;
    return `${branch}: ${file.path} asks ${who.join(' ')} for a review on every PR it covers; v2 uses no code owners: remove it`;
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

/** One line for a ruleset: its checks, or its rules, with the reviews a pull_request rule asks. */
export function describe(rs: Desired): string {
    const checks = rs.rules?.flatMap(r => (r.parameters?.required_status_checks as { context: string }[] | undefined)?.map(c => c.context) ?? []) ?? [];
    const strict = rs.rules?.some(r => r.parameters?.strict_required_status_checks_policy === true);
    if (checks.length) return `${checks.join(', ')}${strict ? '; up to date' : ''}`;
    return (rs.rules ?? [])
        .map(r => {
            if (r.type !== 'pull_request') return r.type;
            const n = Number(r.parameters?.required_approving_review_count ?? 0);
            return `pull_request (${n === 0 ? 'no review' : `${n} review${n > 1 ? 's' : ''}`}${r.parameters?.require_code_owner_review ? ', code owners' : ''})`;
        })
        .join(', ');
}

/** Review, force push and deletion: one review from anyone with write; admins (the seniors) may skip it on a PR. */
export function reviewRuleset(branch: string): Desired {
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
                    require_code_owner_review: false,
                    require_last_push_approval: false,
                    required_approving_review_count: 1,
                    required_review_thread_resolution: false,
                },
            },
        ],
    };
}

/** Release tags v*: only seniors create, change or remove one. */
export function tagRuleset(): Desired {
    return {
        name: TAG_RULESET,
        target: 'tag',
        enforcement: 'active',
        bypass_actors: [{ actor_id: ADMIN_ROLE, actor_type: 'RepositoryRole', bypass_mode: 'always' }],
        conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } },
        rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }],
    };
}

// --- what the audit checks ----------------------------------------------------

/** The review rules on one branch, from classic protection and rulesets together. */
export interface ReviewView {
    reviews: number;
    codeOwners: boolean;
}

/** One review, not from code owners: with code-owner review on, a CODEOWNERS file would decide who. */
export function reviewFindings(branch: string, v: ReviewView): string[] {
    return [...(v.reviews < 1 ? [`${branch}: no review required`] : []), ...(v.codeOwners ? [`${branch}: review from code owners required: run setup-consumer --apply`] : [])];
}

/** Only seniors create v* tags. */
export function tagFindings(tagRulesets: { include: string[]; rules: string[] }[]): string[] {
    const created = tagRulesets.some(r => r.include.includes('refs/tags/v*') && r.rules.includes('creation'));
    return created ? [] : ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release'];
}
