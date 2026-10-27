// The steps of cd-supabase.yml against a fake `supabase` on PATH: what the
// workflow refuses and what it asks of the CLI. Validation, function secrets
// (written to a file, never on the command line), migrations (link + db push,
// password from the 1Password variable) and the edge function deploys.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const workflow = steps('.github/workflows/cd-supabase.yml', 'deploy');
const bin = fakes('cd-supabase');
const ref = 'abcdefghijklmnop';

function run(id: string, env: Record<string, string>) {
    const log = join(tempDir(), 'log');
    writeFileSync(log, '');
    const r = bash(script(workflow, id), {
        bin,
        env: { SUPABASE_LOG: log, PROJECT_REF: ref, SUPABASE_ACCESS_TOKEN: 'sbp_token', ...env },
    });
    return { ...r, log: lines(log).join('\n') };
}

test('validate: migrations off and functions none is refused', () => {
    const r = run('validate', { MIGRATIONS: 'false', FUNCTIONS: 'none', ENV_KEYS: '' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /Nothing to deploy/);
});

test('validate: no project ref is refused, naming the environment', () => {
    const r = run('validate', { MIGRATIONS: 'true', FUNCTIONS: '', ENV_KEYS: '', PROJECT_REF: '', ENVIRONMENT: 'staging' });
    assert.notEqual(r.code, 0);
    assert.ok(r.output.includes("vars.SUPABASE_PROJECT_REF is not set on environment 'staging'"), r.output);
});

test('validate: no access token is refused', () => {
    const r = run('validate', { MIGRATIONS: 'true', FUNCTIONS: '', ENV_KEYS: '', SUPABASE_ACCESS_TOKEN: '' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /SUPABASE_ACCESS_TOKEN is not available/);
});

test('validate: SUPABASE_URL as a function secret is refused', () => {
    const r = run('validate', { MIGRATIONS: 'true', FUNCTIONS: '', ENV_KEYS: 'RESEND_KEY SUPABASE_URL' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /SUPABASE_URL is provided by the platform/);
});

test('validate: migrations only is accepted', () => {
    assert.equal(run('validate', { MIGRATIONS: 'true', FUNCTIONS: 'none', ENV_KEYS: '' }).code, 0);
});

test('secrets: a key without a value in the 1Password item is refused, and nothing is set', () => {
    const r = run('secrets', { ENV_KEYS: 'RESEND_KEY MAPS_KEY', RESEND_KEY: 'r1' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /MAPS_KEY/);
    assert.ok(!r.log.includes('secrets set'), r.log);
});

test('secrets: all keys present are set through an env file, never on the command line', () => {
    const r = run('secrets', { ENV_KEYS: 'RESEND_KEY MAPS_KEY', RESEND_KEY: 'r1', MAPS_KEY: 'm2' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes(`supabase secrets set --project-ref ${ref} --env-file`), r.log);
    assert.ok(r.log.includes('file: MAPS_KEY=m2'), r.log);
    assert.doesNotMatch(r.log, /secrets set.*r1/);
});

test('migrations: without a password variable, link and push through the access token', () => {
    const variants: Record<string, string>[] = [{}, { SUPABASE_DB_PASSWORD: 'stale' }];
    for (const env of variants) {
        const r = run('migrations', { DB_PASSWORD_VARIABLE: '', ...env });
        assert.equal(r.code, 0, r.output);
        assert.ok(r.log.includes('supabase db push'), r.log);
        assert.ok(r.log.includes('password seen: none'), 'the password is left out');
    }
});

test('migrations: a password variable that is empty in the 1Password item is refused, and nothing is pushed', () => {
    const r = run('migrations', { DB_PASSWORD_VARIABLE: 'SUPABASE_DB_PASSWORD' });
    assert.notEqual(r.code, 0);
    assert.match(r.output, /SUPABASE_DB_PASSWORD is not in the environment's 1Password item/);
    assert.ok(!r.log.includes('db push'), r.log);
});

test('migrations: with the password from the chosen variable, never on the command line', () => {
    const r = run('migrations', { DB_PASSWORD_VARIABLE: 'DB_PASS', DB_PASS: 's3cret' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes(`supabase link --project-ref ${ref}`), r.log);
    assert.ok(r.log.includes('supabase db push'), r.log);
    assert.ok(r.log.includes('password seen: s3cret'), r.log);
    assert.doesNotMatch(r.log, /^supabase .*s3cret/m);
});

test('functions: empty deploys every function in config.toml in one call, bundled by the API', () => {
    const r = run('functions', { FUNCTIONS: '' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes(`supabase functions deploy --project-ref ${ref} --use-api`), r.log);
});

test('functions: named ones deploy one call each', () => {
    const r = run('functions', { FUNCTIONS: 'hello mail' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.log.includes(`supabase functions deploy hello --project-ref ${ref} --use-api`), r.log);
    assert.ok(r.log.includes(`supabase functions deploy mail --project-ref ${ref} --use-api`), r.log);
});

test('report: warns about a live key that is not listed, not about listed or platform ones', () => {
    const r = run('report', { ENV_KEYS: 'RESEND_KEY', FAKE_LIVE_SECRETS: 'RESEND_KEY OLD_KEY SUPABASE_URL' });
    assert.equal(r.code, 0, r.output);
    assert.ok(r.output.includes(`OLD_KEY is live on ${ref} but not listed`), r.output);
    assert.ok(!r.output.includes('RESEND_KEY is live'), r.output);
    assert.ok(!r.output.includes('SUPABASE_URL is live'), r.output);
});
