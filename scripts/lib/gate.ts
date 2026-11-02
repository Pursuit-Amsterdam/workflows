// Where cd-gate sends a branch: the pure part of the consumer model, without
// GitHub access, so it can be tested without a token. Run: node --test scripts/lib/
import { jobs, type Workflow } from './workflow.ts';

// cd-gate's default for branch-targets: "develop=staging acceptance=acceptance".
const GATE_DEFAULT_TARGETS = ['acceptance', 'staging'];

/**
 * The environments cd-gate deploys a branch to, from `branch-targets` on every
 * call, sorted; null when no workflow calls cd-gate. No input (or an
 * expression, which cannot be read here) is the gate's default; "" is
 * production only.
 */
export function gateBranchTargets(workflows: Workflow[]): string[] | null {
    let gated = false;
    const targets = new Set<string>();
    for (const wf of workflows) {
        for (const [, job] of jobs(wf)) {
            if (typeof job.uses !== 'string' || !job.uses.includes('/workflows/.github/workflows/cd-gate.yml@')) continue;
            gated = true;
            const value = (job.with as Record<string, unknown> | undefined)?.['branch-targets'];
            if (typeof value !== 'string' || value.includes('${{')) {
                for (const t of GATE_DEFAULT_TARGETS) targets.add(t);
                continue;
            }
            for (const pair of value.split(/\s+/).filter(Boolean)) {
                const env = pair.split('=')[1];
                if (env) targets.add(env);
            }
        }
    }
    return gated ? [...targets].sort() : null;
}
