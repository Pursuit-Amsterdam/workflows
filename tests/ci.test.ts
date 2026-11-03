// The Playwright steps of ci.yml against a fake `pnpm` on PATH: which package
// gives the Playwright version, what a browser name may be, and what a cache hit
// changes (only the system packages, not the browsers).
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const workflow = steps('.github/workflows/ci.yml', 'pipeline');
const bin = fakes('ci');

/** A repo with these package.json files (path → contents) and the files to log to. */
function repo(packages: Record<string, object>) {
    const dir = tempDir();
    const work = join(dir, 'work');
    for (const [path, pkg] of Object.entries(packages)) {
        mkdirSync(join(work, path, '..'), { recursive: true });
        writeFileSync(join(work, path), JSON.stringify(pkg));
    }
    const [log, out] = ['log', 'out'].map((f) => join(dir, f));
    for (const f of [log, out]) writeFileSync(f, '');
    return { work, log, out };
}

function find(packages: Record<string, object>, browsers: string, env: Record<string, string> = {}) {
    const { work, log, out } = repo(packages);
    const r = bash(script(workflow, 'playwright'), {
        bin,
        cwd: work,
        env: { PNPM_LOG: log, GITHUB_OUTPUT: out, BROWSERS: browsers, ...env },
    });
    return { ...r, log: lines(log).join('\n'), out: lines(out) };
}

const web = { name: 'web', devDependencies: { playwright: '^1.64.0' } };

test('the package that lists playwright gives the version, and the step outputs it', () => {
    const r = find({ 'package.json': { name: 'root' }, 'apps/web/package.json': web }, 'chromium');
    assert.equal(r.code, 0, r.output);
    assert.ok(r.out.includes('dir=./apps/web'), r.out.join('\n'));
    assert.ok(r.out.includes('version=1.64.0'));
    assert.ok(r.out.includes('browsers=chromium'));
    assert.match(r.log, /^web: exec playwright --version$/m, 'the version comes from that package');
});

test('pnpm prints lines of its own first: only the version line counts', () => {
    const r = find({ 'package.json': web }, 'chromium', { FAKE_NOISE: '1' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.out.includes('version=1.64.0'), r.out.join('\n'));
});

test('@playwright/test counts too, also in dependencies', () => {
    const r = find({ 'package.json': { name: 'e2e', dependencies: { '@playwright/test': '1.64.0' } } }, 'chromium');
    assert.equal(r.code, 0, r.output);
    assert.ok(r.out.includes('dir=.'), r.out.join('\n'));
});

test('several browsers: one line for the install, dashes for the cache key', () => {
    const r = find({ 'package.json': web }, ' chromium\n  firefox ');
    assert.equal(r.code, 0, r.output);
    assert.ok(r.out.includes('browsers=chromium firefox'), r.out.join('\n'));
    assert.ok(r.out.includes('key=chromium-firefox'));
});

test('no package lists playwright: refused', () => {
    const r = find({ 'package.json': { name: 'root' }, 'apps/web/package.json': { name: 'web' } }, 'chromium');
    assert.notEqual(r.code, 0);
    assert.match(r.output, /no package\.json lists playwright/);
});

test('playwright only under node_modules does not count', () => {
    const r = find({ 'package.json': { name: 'root' }, 'node_modules/x/package.json': web }, 'chromium');
    assert.notEqual(r.code, 0);
    assert.match(r.output, /no package\.json lists playwright/);
});

test('not a browser name: refused before anything runs', () => {
    for (const bad of ['Chromium', 'chromium;rm', '--with-deps', '$(id)']) {
        const r = find({ 'package.json': web }, bad);
        assert.notEqual(r.code, 0, bad);
        assert.match(r.output, /not a browser name/, bad);
        assert.equal(r.log, '', `${bad}: pnpm not called`);
    }
});

test('only whitespace: refused, not an install of nothing', () => {
    const r = find({ 'package.json': web }, ' \n ');
    assert.notEqual(r.code, 0);
    assert.match(r.output, /only whitespace/);
});

test('Playwright gives no version: refused', () => {
    const r = find({ 'package.json': web }, 'chromium', { FAKE_PLAYWRIGHT: 'none' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /no Playwright version/);
});

function install(cacheHit: string) {
    const { work, log } = repo({});
    mkdirSync(work, { recursive: true });
    const r = bash(script(workflow, 'browsers'), {
        bin,
        cwd: work,
        env: { PNPM_LOG: log, BROWSERS: 'chromium firefox', CACHE_HIT: cacheHit },
    });
    return { ...r, log: lines(log).join('\n') };
}

test('cache miss: browsers and their system packages', () => {
    const r = install('');
    assert.equal(r.code, 0, r.output);
    assert.match(r.log, /exec playwright install --with-deps chromium firefox$/m);
});

test('cache hit: only the system packages', () => {
    const r = install('true');
    assert.equal(r.code, 0, r.output);
    assert.match(r.log, /exec playwright install-deps chromium firefox$/m);
    assert.doesNotMatch(r.log, /install --with-deps/);
});
