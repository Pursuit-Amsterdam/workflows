// Where CUSTOM_GITHUB_TOKEN belongs: the shared PAT (packages:read) that reads
// the private @pursuit-amsterdam packages. A job sees an environment secret only
// when it runs in that environment, so the token goes on every environment whose
// jobs install private packages, and nowhere else. Dependabot secrets have no
// environments: Dependabot gets it as a repo-level Dependabot secret.
import { jobs, type Workflow } from './workflow.ts';

const CALL = /\/workflows\/\.github\/workflows\/([a-z-]+)\.yml@/;
const DEPLOY_ENVIRONMENTS = ['staging', 'acceptance', 'production'];

const truthy = (v: unknown): boolean => v === true || v === 'true';

/** The environments whose jobs read the token: where each v2 caller with `use-custom-token` runs. */
export function tokenEnvironments(workflows: Workflow[]): string[] {
    const envs = new Set<string>();
    for (const wf of workflows) {
        for (const [, job] of jobs(wf)) {
            const called = typeof job.uses === 'string' ? CALL.exec(job.uses)?.[1] : undefined;
            const w = (job.with ?? {}) as Record<string, unknown>;
            if (!called || !truthy(w['use-custom-token'])) continue;
            if (called === 'ci' || called === 'ci-images') envs.add('integration');
            // ci.yml's tms-sync job runs in staging.
            if (called === 'ci' && typeof w['tms-sync-branch'] === 'string' && w['tms-sync-branch'] !== '') envs.add('staging');
            if (called === 'cd-pages') envs.add('github-pages');
            if (['cd-vercel', 'cd-swarm', 'cd-packages'].includes(called)) {
                const env = typeof w.environment === 'string' ? w.environment.toLowerCase() : '';
                // An expression is cd-gate's target: any of the deploy environments.
                for (const e of env.includes('${{') ? DEPLOY_ENVIRONMENTS : env ? [env] : []) envs.add(e);
            }
        }
    }
    return [...envs].sort();
}

/**
 * A job of the repo's own (with steps) reads the secret: without an environment
 * it sees only the repo secret. A caller of a v2 workflow does not count, also
 * when it passes the secret explicitly: the environment secret of the called
 * job wins over what the caller passes.
 */
export function readsTokenDirectly(workflows: Workflow[]): boolean {
    return workflows.some(wf => jobs(wf).some(([, job]) => job.uses === undefined && JSON.stringify(job).includes('secrets.CUSTOM_GITHUB_TOKEN')));
}

/** Dependabot reads GitHub Packages with the token, so it needs the Dependabot secret. */
export function dependabotNeedsToken(dependabotYaml: string | null): boolean {
    return dependabotYaml !== null && /secrets\.CUSTOM_GITHUB_TOKEN/.test(dependabotYaml);
}
