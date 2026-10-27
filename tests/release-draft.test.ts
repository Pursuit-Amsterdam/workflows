// The draft step of release-draft.yml against a fake `gh` on PATH, and the
// decision it takes: refuse off the default branch or without a semver version,
// nothing when the tag exists, a new draft with the tag from package.json, an
// existing draft moved to the new commit, stale drafts for other versions
// removed, published releases never touched.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const workflow = steps('.github/workflows/release-draft.yml', 'draft');
const bin = fakes('release-draft');
const created = 'POST repos/{owner}/{repo}/releases ';

/** Runs the draft step with package.json's version set to `version` (raw JSON). */
function draft(version: string, env: Record<string, string> = {}) {
    const dir = tempDir();
    const work = join(dir, 'work');
    const [log, out, summary] = ['log', 'out', 'summary'].map((f) => join(dir, f));
    mkdirSync(join(work, 'pkg'), { recursive: true });
    writeFileSync(join(work, 'pkg', 'package.json'), `{"name":"@pursuit-amsterdam/x","version":${version}}\n`);
    for (const f of [log, out, summary]) writeFileSync(f, '');
    const r = bash(script(workflow, 'draft'), {
        bin,
        cwd: work,
        env: {
            GH_LOG: log,
            GITHUB_OUTPUT: out,
            GITHUB_STEP_SUMMARY: summary,
            PACKAGE_DIR: 'pkg',
            NOTES_COMMAND: '',
            SHA: 'abc1234',
            REF: 'refs/heads/main',
            ...env,
        },
    });
    return { ...r, log: lines(log).join('\n'), out: lines(out) };
}

test('not the default branch: refused, and nothing else is called', () => {
    const r = draft('"1.2.3"', { REF: 'refs/heads/develop' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /main only/);
    assert.ok(!r.log.includes('releases'), r.log);
});

test('no semver version: refused, naming the file', () => {
    const r = draft('"next"');
    assert.notEqual(r.code, 0);
    assert.match(r.output, /pkg\/package\.json/);
    assert.notEqual(draft('null').code, 0, 'a missing version is refused too');
});

test('the tag exists: nothing to do', () => {
    const r = draft('"1.2.3"', { FAKE_TAGS: 'v1.0.0 v1.2.3' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /v1\.2\.3 exists/);
    assert.ok(r.out.includes('action=none'));
    assert.ok(!r.log.includes(created), 'no draft created');
});

// cd-packages reads v1.2.3+2 as 1.2.3 (build metadata): that version is released too.
test('a +N tag for this version: nothing to do', () => {
    const r = draft('"1.2.3"', { FAKE_TAGS: 'v1.2.3+2' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /v1\.2\.3\+2 exists/);
    assert.ok(!r.log.includes(created), 'no draft created');
});

// Older repos tagged without the v (nextjs-feature-flags: 0.6.0-beta.1): that version is out too.
test('a tag without the v for this version: nothing to do', () => {
    const r = draft('"0.6.0-beta.1"', { FAKE_TAGS: '0.5.0-beta.3 0.6.0-beta.1' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /0\.6\.0-beta\.1 exists/);
    assert.ok(!r.log.includes(created), 'no draft created');
    assert.equal(draft('"1.2.3"', { FAKE_TAGS: '1.2.3+1' }).code, 0, 'with build metadata too');
});

test('a tag that only starts the same is not this version', () => {
    const r = draft('"1.2.3"', { FAKE_TAGS: 'v1.2.30 v1.2.3-rc.1 1.2.30' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes('tag_name=v1.2.3'), 'draft created');
});

test('no draft yet: a draft with the tag from package.json at the pushed commit', () => {
    const r = draft('"1.2.3"');
    assert.equal(r.code, 0, r.output);
    for (const field of ['tag_name=v1.2.3', 'target_commitish=abc1234', 'draft=true', 'prerelease=false']) {
        assert.ok(r.log.includes(field), field);
    }
    assert.ok(r.log.includes('body=generated notes'), "GitHub's generated notes");
    for (const line of ['action=created', 'tag=v1.2.3', 'url=https://github.com/o/r/releases/tag/new']) {
        assert.ok(r.out.includes(line), line);
    }
});

test('notes-command: its output is the body, with the version in VERSION', () => {
    const r = draft('"1.2.3"', { NOTES_COMMAND: 'echo "notes for $VERSION"' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes('body=notes for 1.2.3'), r.log);
    assert.ok(!r.log.includes('generate-notes'), 'no generated notes');
});

test('notes-command that prints nothing: refused, no draft', () => {
    const r = draft('"1.2.3"', { NOTES_COMMAND: 'true' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /printed nothing/);
    assert.ok(!r.log.includes(created), 'no draft created');
});

test('a prerelease version: the draft is marked prerelease', () => {
    const r = draft('"1.3.0-rc.1"');
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes('prerelease=true'));
    assert.ok(r.log.includes('tag_name=v1.3.0-rc.1'));
});

test('a draft already at this commit: nothing', () => {
    const r = draft('"1.2.3"', {
        FAKE_RELEASES: '[{"id":7,"tag_name":"v1.2.3","draft":true,"target_commitish":"abc1234"}]',
    });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.out.includes('action=none'));
    assert.ok(!r.log.includes('PATCH'), 'nothing patched');
    assert.ok(!r.log.includes(created), 'nothing created');
});

test('a draft at an older commit: moved to the pushed commit, with fresh notes', () => {
    const r = draft('"1.2.3"', {
        FAKE_RELEASES: '[{"id":7,"tag_name":"v1.2.3","draft":true,"target_commitish":"old0000"}]',
    });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes('PATCH repos/{owner}/{repo}/releases/7 target_commitish=abc1234'), r.log);
    assert.ok(r.log.includes('body=generated notes'));
    assert.ok(r.out.includes('action=updated'));
    assert.ok(!r.log.includes(created), 'nothing created');
});

test('drafts for other versions are removed, published releases untouched', () => {
    const r = draft('"1.2.3"', {
        FAKE_RELEASES: JSON.stringify([
            { id: 3, tag_name: 'v1.2.2', draft: true, target_commitish: 'x' },
            { id: 4, tag_name: 'v1.2.1', draft: false, target_commitish: 'y' },
            { id: 5, tag_name: 'v1.1.0', draft: true, target_commitish: 'z' },
        ]),
    });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes('DELETE repos/{owner}/{repo}/releases/3'), 'v1.2.2 draft deleted');
    assert.ok(r.log.includes('DELETE repos/{owner}/{repo}/releases/5'), 'v1.1.0 draft deleted');
    assert.ok(!r.log.includes('releases/4'), 'the published v1.2.1 untouched');
    assert.ok(r.log.includes('tag_name=v1.2.3'), 'new draft created');
    assert.match(r.output, /v1\.2\.2/, 'says which were removed');
});
