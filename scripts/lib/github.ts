// GitHub access for the consumer scripts. The token comes from GH_TOKEN or
// GITHUB_TOKEN (the audit workflow passes its GitHub App token), else from the
// local `gh` login.
import { execFileSync } from 'node:child_process';
import { Octokit } from '@octokit/rest';

export const ORG = 'Pursuit-Amsterdam';

function token(): string {
    const fromEnv = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (fromEnv) return fromEnv;
    try {
        return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim();
    } catch {
        throw new Error('No GitHub token: set GH_TOKEN or log in with `gh auth login`.');
    }
}

// A 404 or 403 is an answer here ("not configured", "not visible"), not a
// problem: Octokit's own request log would print one line per such call.
// Any other failure is thrown by get() and list(), so nothing is lost.
const quiet = (): void => {};
export const octokit = new Octokit({ auth: token(), log: { debug: quiet, info: quiet, warn: quiet, error: quiet } });

function status(err: unknown): number | undefined {
    return typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : undefined;
}

/**
 * GET a route; null when it does not exist or this token may not see it
 * (404, 403). Any other error is thrown: an audit must not read a failure as
 * "not configured".
 */
export async function get<T>(route: string, params: Record<string, unknown> = {}): Promise<T | null> {
    try {
        const res = await octokit.request(`GET ${route}`, params);
        return res.data as T;
    } catch (err) {
        if (status(err) === 404 || status(err) === 403) return null;
        throw err;
    }
}

/** Every page of a list route; [] when it does not exist or is not visible. */
export async function list<T>(route: string, params: Record<string, unknown> = {}): Promise<T[]> {
    try {
        return (await octokit.paginate(`GET ${route}`, { per_page: 100, ...params })) as T[];
    } catch (err) {
        if (status(err) === 404 || status(err) === 403) return [];
        throw err;
    }
}

/** A file's content on the default branch; null when it does not exist. */
export async function readFile(repo: string, path: string): Promise<string | null> {
    return get<string>(`/repos/{owner}/{repo}/contents/{path}`, {
        owner: ORG,
        repo,
        path,
        mediaType: { format: 'raw' },
    });
}

export async function exists(repo: string, path: string): Promise<boolean> {
    return (await get(`/repos/{owner}/{repo}/contents/{path}`, { owner: ORG, repo, path })) !== null;
}

/** Every non-archived repo of the org, by name. */
export async function orgRepos(): Promise<string[]> {
    const repos = await list<{ name: string; archived: boolean }>(`/orgs/{org}/repos`, { org: ORG, type: 'all' });
    return repos
        .filter(r => !r.archived)
        .map(r => r.name)
        .sort();
}
