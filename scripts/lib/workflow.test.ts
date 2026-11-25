// Which branch's workflows describe a consumer, and what the audit says when
// that is not the default branch. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { workflowBranch, workflowBranchFinding } from './workflow.ts';

test('workflowBranch: the default branch when its workflows call this repo', () => {
    assert.equal(workflowBranch([{ branch: 'main', calls: true }]), 'main');
    assert.equal(workflowBranch([{ branch: 'main', calls: true }, { branch: 'develop', calls: true }]), 'main');
});

test('workflowBranch: develop when only develop calls this repo (.github/ not yet on main)', () => {
    assert.equal(workflowBranch([{ branch: 'main', calls: false }, { branch: 'develop', calls: true }]), 'develop');
});

test('workflowBranch: the default branch when no branch calls this repo', () => {
    assert.equal(workflowBranch([{ branch: 'main', calls: false }, { branch: 'develop', calls: false }]), 'main');
    assert.equal(workflowBranch([{ branch: 'main', calls: false }]), 'main');
});

test('workflowBranchFinding: nothing when the workflows come from the default branch', () => {
    assert.equal(workflowBranchFinding('main', 'main'), null);
});

test('workflowBranchFinding: workflows only on develop cannot start CD', () => {
    assert.equal(
        workflowBranchFinding('main', 'develop'),
        'only develop has workflows that call Pursuit-Amsterdam/workflows, main has none: workflow_run, workflow_dispatch and schedule only start workflows on main, so CD never starts; merge .github/ into main',
    );
});
