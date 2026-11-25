// The protection every repo gets, and what the audit says about it (Task 32):
// one review from anyone with write, admins (the seniors) may skip it on a PR,
// and no CODEOWNERS. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { codeownersFinding, describe, pickCodeowners, reviewFindings, reviewRuleset, tagFindings, tagRuleset } from './protection.ts';

test('pickCodeowners: .github/ first, then the root, then docs/, as GitHub does', () => {
    assert.deepEqual(pickCodeowners({ '.github/CODEOWNERS': 'a', CODEOWNERS: 'b', 'docs/CODEOWNERS': 'c' }), { path: '.github/CODEOWNERS', text: 'a' });
    assert.deepEqual(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: 'b', 'docs/CODEOWNERS': 'c' }), { path: 'CODEOWNERS', text: 'b' });
    assert.deepEqual(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: null, 'docs/CODEOWNERS': 'c' }), { path: 'docs/CODEOWNERS', text: 'c' });
    assert.equal(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: null, 'docs/CODEOWNERS': null }), null);
});

test('codeownersFinding: a file with owners asks them for reviews, so it has to go', () => {
    assert.equal(
        codeownersFinding('develop', { path: '.github/CODEOWNERS', text: '# seniors\n* @Pursuit-Amsterdam/senior-developers\n' }),
        'develop: .github/CODEOWNERS asks @Pursuit-Amsterdam/senior-developers for a review on every PR it covers; v2 uses no code owners: remove it',
    );
});

test('codeownersFinding: every owner once, from path rules too, comments left out', () => {
    const text = '* @matthijs-pursuit # the owner\n/docs/ @someone @matthijs-pursuit\n\n# /old/ @gone\n';
    assert.match(codeownersFinding('main', { path: 'CODEOWNERS', text }) ?? '', /^main: CODEOWNERS asks @matthijs-pursuit @someone for a review/);
});

test('codeownersFinding: no file, or a file without owners, asks nobody', () => {
    assert.equal(codeownersFinding('main', null), null);
    assert.equal(codeownersFinding('main', { path: '.github/CODEOWNERS', text: '# nothing here\n\n' }), null);
    assert.equal(codeownersFinding('main', { path: '.github/CODEOWNERS', text: '*\n' }), null);
});

const pr = (rs: ReturnType<typeof reviewRuleset>) => rs.rules?.find(r => r.type === 'pull_request')?.parameters;
const types = (rs: ReturnType<typeof tagRuleset>) => (rs.rules ?? []).map(r => r.type).sort();

test('reviewRuleset: one review from anyone with write, no code owners', () => {
    const rs = reviewRuleset('main');
    assert.equal(pr(rs)?.required_approving_review_count, 1);
    assert.equal(pr(rs)?.require_code_owner_review, false);
    assert.deepEqual((rs.rules ?? []).map(r => r.type).sort(), ['deletion', 'non_fast_forward', 'pull_request']);
});

test('reviewRuleset: admins (the seniors) may skip the review, only on a PR', () => {
    const rs = reviewRuleset('acceptance');
    assert.equal(rs.name, 'protect acceptance (review, seniors may skip)');
    assert.deepEqual(rs.bypass_actors, [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }]);
    assert.deepEqual(rs.conditions, { ref_name: { include: ['refs/heads/acceptance'], exclude: [] } });
});

test('tagRuleset: only seniors create, change and remove v* tags', () => {
    assert.deepEqual(types(tagRuleset()), ['creation', 'deletion', 'update']);
    assert.deepEqual(tagRuleset().conditions, { ref_name: { include: ['refs/tags/v*'], exclude: [] } });
});

// What the audit sees on a branch: classic protection and rulesets together.
const view = (o: Partial<{ reviews: number; codeOwners: boolean }> = {}) => ({ reviews: 1, codeOwners: false, ...o });

test('reviewFindings: one review, without code owners, is the standard', () => {
    assert.deepEqual(reviewFindings('main', view()), []);
    assert.deepEqual(reviewFindings('main', view({ reviews: 2 })), []);
});

test('reviewFindings: no review required says so', () => {
    assert.deepEqual(reviewFindings('develop', view({ reviews: 0 })), ['develop: no review required']);
});

test('reviewFindings: review from code owners still required says what to run', () => {
    assert.deepEqual(reviewFindings('main', view({ codeOwners: true })), ['main: review from code owners required: run setup-consumer --apply']);
});

const tag = (...rules: string[]) => ({ include: ['refs/tags/v*'], rules });

test('tagFindings: only seniors create the v* tags', () => {
    assert.deepEqual(tagFindings([tag('creation', 'update', 'deletion')]), []);
    assert.deepEqual(tagFindings([tag('update', 'deletion')]), ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release']);
    assert.deepEqual(tagFindings([]), ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release']);
});

test('describe: the review ruleset says how many reviews, and code owners when a ruleset still asks them', () => {
    assert.equal(describe(reviewRuleset('main')), 'deletion, non_fast_forward, pull_request (1 review)');
    const old = { ...reviewRuleset('main'), rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 1, require_code_owner_review: true } }] };
    assert.equal(describe(old), 'pull_request (1 review, code owners)');
    const light = { ...reviewRuleset('main'), rules: [{ type: 'pull_request', parameters: { required_approving_review_count: 0 } }] };
    assert.equal(describe(light), 'pull_request (no review)');
    assert.equal(describe(tagRuleset()), 'creation, update, deletion');
});
