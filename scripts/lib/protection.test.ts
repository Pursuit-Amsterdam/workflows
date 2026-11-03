// Which protection profile a repo has, from the * line in CODEOWNERS, and the
// rulesets and findings that go with it (use case 30, docs/v2/use-cases.md#light).
// Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describe, isYes, pickCodeowners, profileFrom, reviewFindings, reviewRuleset, rulesetAction, tagFindings, tagRuleset, type BranchOwners, type Profile } from './protection.ts';

const SENIORS = '* @Pursuit-Amsterdam/senior-developers\n';
const on = (codeowners: string | null, branch = 'main', errors: BranchOwners['errors'] = []): BranchOwners => ({ branch, codeowners, errors });
const profile = (...branches: BranchOwners[]) => profileFrom(branches);

test('profileFrom: only the senior team is standard, without findings', () => {
    assert.deepEqual(profile(on(SENIORS), on(SENIORS, 'develop')), { profile: { kind: 'standard' }, findings: [] });
});

test('profileFrom: the senior team in other letter case is still standard', () => {
    assert.deepEqual(profile(on('* @pursuit-amsterdam/Senior-Developers\n')).profile, { kind: 'standard' });
});

test('profileFrom: users only is light, with the owners', () => {
    const r = profile(on('* @matthijs-pursuit @jipharthoorn-pursuit\n'), on('* @matthijs-pursuit @jipharthoorn-pursuit\n', 'develop'));
    assert.deepEqual(r, { profile: { kind: 'light', owners: ['@matthijs-pursuit', '@jipharthoorn-pursuit'] }, findings: [] });
});

test('profileFrom: a senior as a user is light too', () => {
    assert.deepEqual(profile(on('* @baspursuit\n')).profile, { kind: 'light', owners: ['@baspursuit'] });
});

test('profileFrom: seniors plus others is standard, with a finding', () => {
    const r = profile(on('* @Pursuit-Amsterdam/senior-developers @matthijs-pursuit\n'));
    assert.deepEqual(r.profile, { kind: 'standard' });
    assert.match(r.findings.join('\n'), /main: .*senior-developers.* @matthijs-pursuit/);
});

test('profileFrom: another team or an email address is standard, with a finding', () => {
    for (const owners of ['@Pursuit-Amsterdam/developers', 'dev@pursuit.amsterdam', '@matthijs-pursuit @Pursuit-Amsterdam/developers']) {
        const r = profile(on(`* ${owners}\n`));
        assert.deepEqual(r.profile, { kind: 'standard' }, owners);
        assert.equal(r.findings.length, 1, owners);
    }
});

test('profileFrom: * without owners, no * line, or no file is standard, with a finding', () => {
    for (const text of ['*\n', '/docs/ @matthijs-pursuit\n', '', null]) {
        const r = profile(on(text));
        assert.deepEqual(r.profile, { kind: 'standard' }, String(text));
        assert.equal(r.findings.length, 1, String(text));
    }
});

test('profileFrom: ** and /** count as the * line', () => {
    assert.deepEqual(profile(on('** @matthijs-pursuit\n')).profile, { kind: 'light', owners: ['@matthijs-pursuit'] });
    assert.deepEqual(profile(on('/** @matthijs-pursuit\n')).profile, { kind: 'light', owners: ['@matthijs-pursuit'] });
});

test('profileFrom: the last * line wins', () => {
    assert.deepEqual(profile(on(`${SENIORS}* @matthijs-pursuit\n`)).profile, { kind: 'light', owners: ['@matthijs-pursuit'] });
    assert.deepEqual(profile(on(`* @matthijs-pursuit\n${SENIORS}`)).profile, { kind: 'standard' });
});

test('profileFrom: comments, blank lines and path rules do not count', () => {
    const text = '# Light protection\n\n* @matthijs-pursuit # the owner\n/docs/ @Pursuit-Amsterdam/developers\n';
    assert.deepEqual(profile(on(text)), { profile: { kind: 'light', owners: ['@matthijs-pursuit'] }, findings: [] });
});

test('profileFrom: the default branch and develop differ is standard, with a finding', () => {
    const r = profile(on('* @matthijs-pursuit\n'), on(SENIORS, 'develop'));
    assert.deepEqual(r.profile, { kind: 'standard' });
    assert.match(r.findings.join('\n'), /main and develop/);
});

test('profileFrom: different owners on the two branches also differ', () => {
    const r = profile(on('* @matthijs-pursuit\n'), on('* @jipharthoorn-pursuit\n', 'develop'));
    assert.deepEqual(r.profile, { kind: 'standard' });
});

test('profileFrom: a repo without develop reads only the default branch', () => {
    assert.deepEqual(profile(on('* @matthijs-pursuit\n')).profile, { kind: 'light', owners: ['@matthijs-pursuit'] });
});

test('profileFrom: an error from GitHub is standard, with a finding', () => {
    const r = profile(on('* @matthijs-pursuitt\n', 'main', [{ line: 1, kind: 'Unknown owner', message: 'Unknown owner on line 1' }]));
    assert.deepEqual(r.profile, { kind: 'standard' });
    assert.match(r.findings.join('\n'), /main: .*Unknown owner/);
});

test('profileFrom: no answer from GitHub about errors (null) is standard, with a finding', () => {
    const r = profile(on('* @matthijs-pursuit\n', 'main', null));
    assert.deepEqual(r.profile, { kind: 'standard' });
    assert.match(r.findings.join('\n'), /main: .*could not check/);
});

test('pickCodeowners: .github/ first, then the root, then docs/, as GitHub does', () => {
    assert.equal(pickCodeowners({ '.github/CODEOWNERS': 'a', CODEOWNERS: 'b', 'docs/CODEOWNERS': 'c' }), 'a');
    assert.equal(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: 'b', 'docs/CODEOWNERS': 'c' }), 'b');
    assert.equal(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: null, 'docs/CODEOWNERS': 'c' }), 'c');
    assert.equal(pickCodeowners({ '.github/CODEOWNERS': null, CODEOWNERS: null, 'docs/CODEOWNERS': null }), null);
});

const STANDARD: Profile = { kind: 'standard' };
const LIGHT: Profile = { kind: 'light', owners: ['@matthijs-pursuit'] };
const pr = (rs: ReturnType<typeof reviewRuleset>) => rs.rules?.find(r => r.type === 'pull_request')?.parameters;
const types = (rs: ReturnType<typeof tagRuleset>) => (rs.rules ?? []).map(r => r.type).sort();

test('reviewRuleset: standard needs one review from a code owner', () => {
    assert.equal(pr(reviewRuleset('main', STANDARD))?.required_approving_review_count, 1);
    assert.equal(pr(reviewRuleset('main', STANDARD))?.require_code_owner_review, true);
});

test('reviewRuleset: light needs a PR but no review', () => {
    const rs = reviewRuleset('develop', LIGHT);
    assert.equal(pr(rs)?.required_approving_review_count, 0);
    assert.equal(pr(rs)?.require_code_owner_review, false);
    assert.deepEqual((rs.rules ?? []).map(r => r.type).sort(), ['deletion', 'non_fast_forward', 'pull_request']);
});

test('reviewRuleset: the name, branch and bypass are the same for both profiles', () => {
    const { rules: _s, ...standard } = reviewRuleset('acceptance', STANDARD);
    const { rules: _l, ...light } = reviewRuleset('acceptance', LIGHT);
    assert.deepEqual(light, standard);
    assert.equal(standard.name, 'protect acceptance (review, seniors may skip)');
});

test('tagRuleset: standard leaves creating, changing and removing v* tags to seniors', () => {
    assert.deepEqual(types(tagRuleset(STANDARD)), ['creation', 'deletion', 'update']);
});

test('tagRuleset: light lets anyone with write create a tag, not change or remove one', () => {
    assert.deepEqual(types(tagRuleset(LIGHT)), ['deletion', 'update']);
    assert.equal(tagRuleset(LIGHT).name, tagRuleset(STANDARD).name);
});

const pair = { standard: reviewRuleset('main', STANDARD), light: reviewRuleset('main', LIGHT) };
const actual = (rs: ReturnType<typeof reviewRuleset>) => ({ id: 1, ...rs });
const tty = { apply: true, tty: true };

test('rulesetAction: standard sets the standard ruleset without a question, also to tighten a light one', () => {
    assert.deepEqual(rulesetAction(STANDARD, pair, actual(pair.light), tty), { action: 'set', want: pair.standard });
    assert.deepEqual(rulesetAction(STANDARD, pair, null, tty), { action: 'set', want: pair.standard });
});

test('rulesetAction: nothing to do when the ruleset already fits the profile', () => {
    assert.deepEqual(rulesetAction(STANDARD, pair, actual(pair.standard), tty), { action: 'none', want: pair.standard });
    assert.deepEqual(rulesetAction(LIGHT, pair, actual(pair.light), { apply: false, tty: false }), { action: 'none', want: pair.light });
});

test('rulesetAction: making a ruleset light asks, with --apply in a terminal', () => {
    assert.deepEqual(rulesetAction(LIGHT, pair, actual(pair.standard), tty), { action: 'ask', want: pair.light });
    assert.deepEqual(rulesetAction(LIGHT, pair, null, tty), { action: 'ask', want: pair.light });
});

test('rulesetAction: without --apply or a terminal, light is a todo and the standard stays', () => {
    for (const opts of [{ apply: false, tty: true }, { apply: true, tty: false }]) {
        assert.deepEqual(rulesetAction(LIGHT, pair, actual(pair.standard), opts), { action: 'todo', want: pair.standard });
    }
});

// What the audit sees on a branch: classic protection and rulesets together.
const view = (o: Partial<{ prRule: boolean; reviews: number; codeOwners: boolean; deletion: boolean }> = {}) => ({ prRule: true, reviews: 1, codeOwners: true, deletion: true, ...o });

test('reviewFindings: standard wants one review from a code owner', () => {
    assert.deepEqual(reviewFindings(STANDARD, 'main', view()), []);
    assert.deepEqual(reviewFindings(STANDARD, 'main', view({ reviews: 0, codeOwners: false })), ['main: no review required', 'main: review from code owners not required']);
});

test('reviewFindings: light wants a PR without a review, and no deletion', () => {
    assert.deepEqual(reviewFindings(LIGHT, 'develop', view({ reviews: 0, codeOwners: false })), []);
    assert.deepEqual(reviewFindings(LIGHT, 'develop', view({ prRule: false, reviews: 0, codeOwners: false, deletion: false })), [
        'develop: no pull request required (light protection still needs one)',
        'develop: branch can be deleted',
    ]);
});

test('reviewFindings: light with the standard review still in place says so', () => {
    assert.deepEqual(reviewFindings(LIGHT, 'main', view()), ['main: CODEOWNERS says light, but a review is still required: run setup-consumer --apply']);
});

const tag = (...rules: string[]) => ({ include: ['refs/tags/v*'], rules });

test('tagFindings: standard wants seniors to create the v* tags', () => {
    assert.deepEqual(tagFindings(STANDARD, [tag('creation', 'update', 'deletion')]), []);
    assert.deepEqual(tagFindings(STANDARD, [tag('update', 'deletion')]), ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release']);
    assert.deepEqual(tagFindings(STANDARD, []), ['no tag ruleset on refs/tags/v* (creation): anyone with push can publish a release']);
});

test('tagFindings: light wants v* tags safe from change and removal, creation free', () => {
    assert.deepEqual(tagFindings(LIGHT, [tag('update', 'deletion')]), []);
    assert.deepEqual(tagFindings(LIGHT, []), ['no tag ruleset on refs/tags/v* (update, deletion): anyone with push can move or remove a release tag']);
    assert.deepEqual(tagFindings(LIGHT, [tag('creation', 'update', 'deletion')]), ['CODEOWNERS says light, but only seniors create v* tags: run setup-consumer --apply']);
});

test('describe: the review ruleset says how many reviews, so a change to light shows', () => {
    assert.equal(describe(reviewRuleset('main', STANDARD)), 'deletion, non_fast_forward, pull_request (1 review, code owners)');
    assert.equal(describe(reviewRuleset('main', LIGHT)), 'deletion, non_fast_forward, pull_request (no review)');
    assert.equal(describe(tagRuleset(LIGHT)), 'update, deletion');
});

test('isYes: the question to make a repo light defaults to yes; only n or no says no', () => {
    for (const a of ['', 'y', 'Y', 'yes', ' y ', 'j', 'ja']) assert.equal(isYes(a), true, JSON.stringify(a));
    for (const a of ['n', 'N', 'no', 'q', 'nee']) assert.equal(isYes(a), false, JSON.stringify(a));
});
