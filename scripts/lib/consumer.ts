// What a consumer repo is: its workflow files, and what it calls from
// Pursuit-Amsterdam/workflows. The audit and setup-consumer expect different
// things of a repo depending on that.
import { ORG, get, readFile } from './github.ts';
import { jobs, parseWorkflow, triggers, type Workflow } from './workflow.ts';

export const CI_CALL = /\/workflows\/\.github\/workflows\/(ci|ci-images|web-ci|backend-ci|fullstack-ci)\.yml@/;
/** Calls that produce a required check: `<caller job> / pipeline`. */
export const CHECK_CALL = /\/workflows\/\.github\/workflows\/(ci|ci-images|web-ci|backend-ci|fullstack-ci|check-pr)\.yml@/;

export interface Consumer {
    repo: string;
    defaultBranch: string;
    workflows: Workflow[];
    /** Workflow files that could not be read or parsed, with the reason. */
    unreadable: { file: string; reason: string }[];
    /** All workflow text, for the reference checks. */
    all: string;
    calls: boolean;
    hasCi: boolean;
    deploys: boolean;
    publishes: boolean;
    vercel: boolean;
    swarm: boolean;
    supabase: boolean;
    pages: boolean;
    /** Releases through cd-gate: a release tag is how this repo goes live, whatever the target. */
    releases: boolean;
    /** Calls cd-pages from a workflow that runs on a release: Pages is published from the release tag. */
    pagesOnRelease: boolean;
    hasDevelop: boolean;
    hasAcceptance: boolean;
    usesCustomToken: boolean;
}

export async function branchExists(repo: string, branch: string): Promise<boolean> {
    return (await get(`/repos/{owner}/{repo}/branches/{branch}`, { owner: ORG, repo, branch })) !== null;
}

/** The workflows on `ref` (default: the default branch); null when the repo cannot be read. */
export async function loadConsumer(repo: string, ref?: string): Promise<Consumer | null> {
    const p = { owner: ORG, repo };
    const meta = await get<{ default_branch: string }>(`/repos/{owner}/{repo}`, p);
    if (!meta) return null;

    const entries = (await get<{ name: string; type: string }[]>(`/repos/{owner}/{repo}/contents/{path}`, { ...p, path: '.github/workflows', ...(ref ? { ref } : {}) })) ?? [];
    const workflows: Workflow[] = [];
    const unreadable: Consumer['unreadable'] = [];
    for (const e of entries.filter(x => x.type === 'file' && /\.ya?ml$/.test(x.name))) {
        const text = await readFile(repo, `.github/workflows/${e.name}`, ref);
        if (text === null) {
            unreadable.push({ file: e.name, reason: 'cannot read' });
            continue;
        }
        try {
            workflows.push(parseWorkflow(e.name, text));
        } catch {
            unreadable.push({ file: e.name, reason: 'not valid YAML' });
        }
    }
    const all = workflows.map(w => w.text).join('\n');
    return {
        repo,
        defaultBranch: meta.default_branch,
        workflows,
        unreadable,
        all,
        calls: all.includes(`${ORG}/workflows/`),
        hasCi: CI_CALL.test(all),
        deploys: /\/workflows\/\.github\/workflows\/(cd-vercel|cd-swarm|cd-supabase|web-cd|backend-cd|vm-cd|azure-cd)\.yml@/.test(all),
        publishes: all.includes('cd-packages.yml@'),
        vercel: /cd-vercel\.yml@|web-cd\.yml@/.test(all),
        swarm: /cd-swarm\.yml@|vm-cd\.yml@/.test(all),
        supabase: all.includes('cd-supabase.yml@'),
        pages: /(cd-pages|storybook-cd)\.yml@/.test(all),
        releases: all.includes('cd-gate.yml@'),
        pagesOnRelease: workflows.some(wf => wf.text.includes('cd-pages.yml@') && 'release' in triggers(wf)),
        hasDevelop: await branchExists(repo, 'develop'),
        hasAcceptance: await branchExists(repo, 'acceptance'),
        usesCustomToken: all.includes('use-custom-token: true'),
    };
}

/** The checks this repo's own workflows produce: `<caller job> / pipeline`, sorted. */
export function producedChecks(c: Consumer): string[] {
    const ids = c.workflows.flatMap(wf => jobs(wf).filter(([, j]) => typeof j.uses === 'string' && CHECK_CALL.test(j.uses)).map(([id]) => `${id} / pipeline`));
    return [...new Set(ids)].sort();
}

/**
 * Whether the deploys load a 1Password item: the workflows name one, or a deploy
 * environment already has the variables or the token for it. A repo whose app
 * gets its values from Vercel itself does not, and needs none of the three.
 */
export async function usesOnePassword(c: Consumer, envNames: string[]): Promise<boolean> {
    if (/onepassword/i.test(c.all)) return true;
    for (const environment_name of envNames) {
        const q = { owner: ORG, repo: c.repo, environment_name, per_page: 100 };
        const vars = (await get<{ variables: { name: string }[] }>('/repos/{owner}/{repo}/environments/{environment_name}/variables', q))?.variables ?? [];
        const secrets = (await get<{ secrets: { name: string }[] }>('/repos/{owner}/{repo}/environments/{environment_name}/secrets', q))?.secrets ?? [];
        if ([...vars, ...secrets].some(x => ['OP_VAULT', 'OP_ITEM', 'OP_SERVICE_ACCOUNT_TOKEN'].includes(x.name))) return true;
    }
    return false;
}
