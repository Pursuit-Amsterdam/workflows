// The health check of cd-vercel against a fake `curl` on PATH: where the
// bypass secret for Vercel Deployment Protection comes from, and what a
// redirect to the Vercel login means.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const workflow = steps('.github/workflows/cd-vercel.yml', 'deploy');
const bin = fakes('cd-vercel');
const SSO = 'https://vercel.com/sso-api?url=https%3A%2F%2Fapp-abc123.vercel.app%2Fapi%2Fhealth';

function health(env: Record<string, string>) {
    const log = join(tempDir(), 'curl');
    writeFileSync(log, '');
    const r = bash(script(workflow, 'health'), {
        bin,
        env: { CURL_LOG: log, URL: 'https://app-abc123.vercel.app', HEALTH_PATH: '/api/health', BYPASS: '', VERCEL_AUTOMATION_BYPASS_SECRET: '', ...env },
    });
    return { ...r, calls: lines(log).filter(Boolean) };
}

test('a 2xx is healthy, at the deployment URL plus the path', () => {
    const r = health({ FAKE_CODE: '200' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /healthy \(200\)/);
    assert.equal(r.calls.length, 1);
    assert.match(r.calls[0], /https:\/\/app-abc123\.vercel\.app\/api\/health$/);
    assert.doesNotMatch(r.calls[0], /x-vercel-protection-bypass/);
});

test('no URL from the deploy: refused before any request', () => {
    const r = health({ URL: '' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /returned no url/);
    assert.equal(r.calls.length, 0);
});

test('the bypass secret from the environment secret is sent as a header', () => {
    const r = health({ FAKE_CODE: '200', BYPASS: 'from-github' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.calls[0], /-H x-vercel-protection-bypass: from-github/);
});

test('without the environment secret, the value from the 1Password item is sent', () => {
    const r = health({ FAKE_CODE: '200', VERCEL_AUTOMATION_BYPASS_SECRET: 'from-1password' });
    assert.equal(r.code, 0, r.output);
    assert.match(r.calls[0], /-H x-vercel-protection-bypass: from-1password/);
});

test('the environment secret wins over the 1Password item', () => {
    const r = health({ FAKE_CODE: '200', BYPASS: 'from-github', VERCEL_AUTOMATION_BYPASS_SECRET: 'from-1password' });
    assert.match(r.calls[0], /from-github/);
    assert.doesNotMatch(r.calls[0], /from-1password/);
});

test('a redirect to the Vercel login fails at once, naming the bypass secret', () => {
    const r = health({ FAKE_CODE: '302', FAKE_REDIRECT: SSO });
    assert.notEqual(r.code, 0);
    assert.equal(r.calls.length, 1, 'no retries: waiting does not get past the login');
    assert.match(r.output, /Deployment Protection/);
    assert.match(r.output, /VERCEL_AUTOMATION_BYPASS_SECRET/);
});

test('a login redirect despite a bypass secret says the secret is wrong', () => {
    const r = health({ FAKE_CODE: '302', FAKE_REDIRECT: SSO, VERCEL_AUTOMATION_BYPASS_SECRET: 'stale' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /bypass secret was sent/);
});

test('no 2xx in ten attempts fails, naming the URL', () => {
    const r = health({ FAKE_CODE: '503' });
    assert.notEqual(r.code, 0);
    assert.equal(r.calls.length, 10);
    assert.match(r.output, /app-abc123\.vercel\.app\/api\/health did not answer 2xx/);
});
