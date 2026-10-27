// Shared by the tests of the actions and workflows: pull a step's `run:` script
// out of the YAML and run it with bash, as a runner does, against the fake CLIs
// in tests/fakes/<suite>/ on PATH. The scripts read every input from env.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { parse } from 'yaml';

export const root = join(import.meta.dirname, '..');

export interface Step {
    id?: string;
    name?: string;
    run?: string;
}

/** The steps of a composite action (`runs.steps`), or of one job of a workflow. */
export function steps(file: string, job?: string): Step[] {
    const doc = parse(readFileSync(join(root, file), 'utf8'));
    return job ? doc.jobs[job].steps : doc.runs.steps;
}

/** The `run:` script of the step with this id. */
export function script(all: Step[], id: string): string {
    const step = all.find((s) => s.id === id);
    if (!step?.run) throw new Error(`no step with id '${id}' and a run:`);
    return step.run;
}

/** The directory of a suite's fake CLIs, to put first on PATH. */
export function fakes(suite: string): string {
    return join(root, 'tests', 'fakes', suite);
}

/** A fresh temporary directory, removed when the test file is done. */
export function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'workflows-test-'));
    after(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
}

export interface Result {
    code: number;
    output: string;
}

/** Runs a script the way `shell: bash` does (-eo pipefail), with `bin` first on PATH. */
export function bash(source: string, opts: { bin: string; cwd?: string; env?: Record<string, string> }): Result {
    const r = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', source], {
        cwd: opts.cwd ?? tmpdir(),
        env: { ...process.env, PATH: `${opts.bin}:${process.env.PATH}`, ...opts.env },
        encoding: 'utf8',
    });
    return { code: r.status ?? 1, output: r.stdout + r.stderr };
}

/** The lines of a file, or none when it does not exist. */
export function lines(file: string): string[] {
    try {
        return readFileSync(file, 'utf8').split('\n');
    } catch {
        return [];
    }
}
