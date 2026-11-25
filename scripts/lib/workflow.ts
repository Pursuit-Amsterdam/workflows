// A consumer's workflow file: its raw text (for the `uses:` references) and
// the parsed YAML (for triggers, filters and job ids, whatever the indent).
import { parse } from 'yaml';

type Mapping = Record<string, unknown>;

export interface Workflow {
    file: string;
    text: string;
    doc: Mapping;
}

function isMapping(v: unknown): v is Mapping {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function parseWorkflow(file: string, text: string): Workflow {
    const doc: unknown = parse(text);
    return { file, text, doc: isMapping(doc) ? doc : {} };
}

/** `on:` as a map from trigger to its config; `on: push` and `on: [push]` included. */
export function triggers(wf: Workflow): Mapping {
    // YAML 1.1 reads a bare `on` key as true; the yaml library keeps it a string.
    const on = wf.doc.on ?? wf.doc.true;
    if (typeof on === 'string') return { [on]: null };
    if (Array.isArray(on)) return Object.fromEntries(on.map(t => [String(t), null]));
    return isMapping(on) ? on : {};
}

export function trigger(wf: Workflow, name: string): Mapping | null | undefined {
    const t = triggers(wf);
    if (!(name in t)) return undefined;
    const v = t[name];
    return isMapping(v) ? v : null;
}

/** A filter such as `branches` as a list of strings; [] when absent. */
export function stringList(v: unknown): string[] {
    if (typeof v === 'string') return [v];
    return Array.isArray(v) ? v.map(String) : [];
}

export function jobs(wf: Workflow): [string, Mapping][] {
    const j = wf.doc.jobs;
    return isMapping(j) ? Object.entries(j).filter((e): e is [string, Mapping] => isMapping(e[1])) : [];
}

/** `workflow_dispatch` inputs, by name. */
export function dispatchInputs(wf: Workflow): string[] {
    const wd = trigger(wf, 'workflow_dispatch');
    return wd && isMapping(wd.inputs) ? Object.keys(wd.inputs) : [];
}

/**
 * The branch whose workflows describe a repo: the first that calls
 * Pursuit-Amsterdam/workflows, default branch first; else the default branch.
 * A repo can keep `.github/` on develop only (den-haag-casusregie-automations).
 */
export function workflowBranch(branches: { branch: string; calls: boolean }[]): string {
    return (branches.find(b => b.calls) ?? branches[0]).branch;
}

/** What the audit says when the workflows come from another branch than the default. */
export function workflowBranchFinding(def: string, from: string): string | null {
    if (from === def) return null;
    return `only ${from} has workflows that call Pursuit-Amsterdam/workflows, ${def} has none: workflow_run, workflow_dispatch and schedule only start workflows on ${def}, so CD never starts; merge .github/ into ${def}`;
}
