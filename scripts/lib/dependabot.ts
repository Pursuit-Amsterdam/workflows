// What Dependabot needs to run, and to land its PRs where check-pr lets them in.
// Pure: dependabot.yml and .npmrc text in, findings out; the audit and the
// migration read the files.
//
// - check-pr lets dependabot/* into develop, or into main when there is no develop.
//   Dependabot opens its PRs against the default branch unless target-branch says
//   otherwise.
// - Dependabot rejects an npm-registry without credentials, and the whole file with
//   it: it then never runs.
// - Without a default registry in .npmrc, Dependabot asks the registries an update
//   lists first, for every package. GitHub Packages answers @types/* with a copy
//   from 2022 and the rest with a 404; with /Pursuit-Amsterdam in the URL it proxies
//   npmjs, but slowly. Either way the runs fail or time out (tms-test #28).
import { parse } from 'yaml';

export interface Update {
    ecosystem: string;
    directories: string[];
    /** target-branch; null: the default branch. */
    targetBranch: string | null;
    /** The registries the update may use, by name, or '*' for all. */
    registries: string[] | '*';
}

export interface Registry {
    name: string;
    type: string;
    url: string;
    token: string | null;
    /** A token, or a username (with a password). */
    hasCredentials: boolean;
    replacesBase: boolean;
}

export interface Dependabot {
    updates: Update[];
    registries: Registry[];
}

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const CENTRAL = /registry\.npmjs\.org|registry\.yarnpkg\.com/;
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/** dependabot.yml, as far as these checks need it. Throws on invalid YAML. */
export function parseDependabot(text: string): Dependabot {
    const doc = (parse(text) ?? {}) as { updates?: Record<string, unknown>[]; registries?: Record<string, Record<string, unknown>> };
    const updates = (Array.isArray(doc.updates) ? doc.updates : []).map(u => ({
        ecosystem: str(u['package-ecosystem']) ?? '',
        directories: Array.isArray(u.directories) ? u.directories.map(String) : [str(u.directory) ?? '/'],
        targetBranch: str(u['target-branch']),
        registries: u.registries === '*' ? ('*' as const) : Array.isArray(u.registries) ? u.registries.map(String) : [],
    }));
    const registries = Object.entries(doc.registries ?? {}).map(([name, r]) => ({
        name,
        type: str(r?.type) ?? '',
        url: str(r?.url) ?? '',
        token: str(r?.token),
        hasCredentials: str(r?.token) !== null || str(r?.username) !== null,
        replacesBase: r?.['replaces-base'] === true,
    }));
    return { updates, registries };
}

/** The branch Dependabot's PRs must target: what check-pr lets dependabot/* into. */
export function dependabotBase(defaultBranch: string, hasDevelop: boolean): string {
    return hasDevelop ? 'develop' : defaultBranch;
}

const label = (u: Update): string => `${u.ecosystem} in ${u.directories.join(', ')}`;

/** Each update whose PRs go to another branch than check-pr lets dependabot/* into. */
export function targetBranchFindings(d: Dependabot, defaultBranch: string, hasDevelop: boolean): string[] {
    const want = dependabotBase(defaultBranch, hasDevelop);
    return d.updates
        .filter(u => (u.targetBranch ?? defaultBranch) !== want)
        .map(u => `${label(u)}: PRs go to ${u.targetBranch ?? defaultBranch}, check-pr lets dependabot/* into ${want} only: ${want === defaultBranch ? 'remove target-branch' : `set target-branch: ${want}`}`);
}

/** Each npm-registry without credentials: Dependabot rejects the whole file, so it never runs. */
export function credentiallessFindings(d: Dependabot): string[] {
    return d.registries
        .filter(r => r.type === 'npm-registry' && !r.hasCredentials)
        .map(r => `registry '${r.name}' (${r.url}) has no token or username: Dependabot rejects the whole dependabot.yml and never runs; ${CENTRAL.test(r.url) ? 'remove it, registry.npmjs.org needs no entry' : 'give it a token'}`);
}

/** An npm update that lists private registries (their URLs): without a default registry in .npmrc, Dependabot asks them first for every package. */
export interface Probe {
    update: Update;
    urls: string[];
}

export function probingUpdates(d: Dependabot): Probe[] {
    const probed = d.registries.filter(r => r.type === 'npm-registry' && !CENTRAL.test(r.url) && !r.replacesBase);
    return d.updates
        .filter(u => u.ecosystem === 'npm')
        .map(update => ({ update, urls: probed.filter(r => update.registries === '*' || update.registries.includes(r.name)).map(r => r.url) }))
        .filter(p => p.urls.length > 0);
}

/** Where Dependabot reads .npmrc for an update directory: there, else the nearest parent. */
export function npmrcPaths(directory: string): string[] {
    const parts = directory.split('/').filter(Boolean);
    return parts.map((_, i) => `${parts.slice(0, parts.length - i).join('/')}/.npmrc`).concat('.npmrc');
}

export function hasDefaultRegistry(npmrc: string | null): boolean {
    return npmrc !== null && /^\s*registry\s*=/m.test(npmrc);
}

/** The finding for a probing update whose .npmrc (path, or null when there is none) names no default registry. */
export function defaultRegistryFinding(p: Probe, directory: string, branch: string, path: string | null): string {
    const where = path ? `${path} on ${branch} names no default registry` : `no .npmrc on ${branch} names a default registry`;
    return `${p.update.ecosystem} in ${directory}: ${where}, so Dependabot asks ${p.urls.join(', ')} first for every package, and GitHub Packages answers slowly, stale or with a 404, so the runs fail or time out: add registry=${DEFAULT_REGISTRY}`;
}

const HEADER = '# Default registry, spelled out for Dependabot: without it Dependabot asks\n# GitHub Packages first for every public package (see .github/dependabot.yml).\n';
const SCOPE = '@pursuit-amsterdam:registry=https://npm.pkg.github.com';

/** .npmrc with the default registry and the @pursuit-amsterdam registry added at the top; null when both are there. */
export function npmrcWithRegistries(current: string | null): string | null {
    const text = current ?? '';
    const add = [...(hasDefaultRegistry(text) ? [] : [`${HEADER}registry=${DEFAULT_REGISTRY}`]), ...(/^\s*@pursuit-amsterdam:registry\s*=/m.test(text) ? [] : [SCOPE])];
    if (add.length === 0) return null;
    const rest = text.trim() === '' ? '' : `${text.replace(/\n*$/, '')}\n`;
    return `${add.join('\n')}\n${rest}`;
}

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

/** The open alerts (their severities) as one finding; null when none are open. */
export function alertFinding(severities: string[]): string | null {
    if (severities.length === 0) return null;
    const counts = SEVERITIES.map(s => [s, severities.filter(x => x === s).length] as const).filter(([, n]) => n > 0);
    const one = severities.length === 1;
    return `${severities.length} open Dependabot alert${one ? '' : 's'} (${counts.map(([s, n]) => `${n} ${s}`).join(', ')}) on the default branch: fix ${one ? 'it' : 'them'} with a hotfix/* PR, or dismiss ${one ? 'it' : 'them'} with a reason`;
}
