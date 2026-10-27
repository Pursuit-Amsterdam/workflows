// The deploy-vercel action against a fake `vercel` on PATH: which environment
// it pulls, which flags it builds and deploys with, where the 1Password env
// file goes, and the `url` output.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const action = steps('.github/actions/deploy-vercel/action.yml');
const bin = fakes('deploy-vercel');

// A 1Password export as setup-onepassword writes it: NUL-delimited --env args.
const envArgs = join(tempDir(), 'env-args');
writeFileSync(envArgs, '--env\0API_KEY=secret\0');

function run(id: string, env: Record<string, string>) {
    const dir = tempDir();
    const work = join(dir, 'work');
    const log = join(dir, 'log');
    const out = join(dir, 'out');
    mkdirSync(work);
    writeFileSync(log, '');
    writeFileSync(out, '');
    const r = bash(script(action, id), {
        bin,
        cwd: work,
        env: {
            VERCEL_LOG: log,
            GITHUB_OUTPUT: out,
            VERCEL_TOKEN: 'tok',
            VERCEL_ORG_ID: 'team_x',
            VERCEL_PROJECT_ID: 'prj_x',
            ...env,
        },
    });
    return { ...r, log: lines(log), out: lines(out), work };
}

/** The arguments of the first `vercel <command>` call in the log. */
function args(log: string[], command: string): string[] {
    return (log.find((l) => l.startsWith(`vercel ${command} `)) ?? '').split(' ');
}

// Vercel knows staging (the custom environment of develop) and production;
// nothing else was decided, and a typo must not deploy anywhere.
test('validate: build-mode and environment', () => {
    for (const mode of ['github', 'vercel']) {
        assert.equal(run('validate', { BUILD_MODE: mode, ENVIRONMENT: 'staging' }).code, 0, `build-mode ${mode}`);
    }
    for (const mode of ['azure', '']) {
        assert.notEqual(run('validate', { BUILD_MODE: mode, ENVIRONMENT: 'staging' }).code, 0, `build-mode '${mode}'`);
    }
    for (const env of ['staging', 'production']) {
        assert.equal(run('validate', { BUILD_MODE: 'github', ENVIRONMENT: env }).code, 0, `environment ${env}`);
    }
    for (const env of ['acceptance', 'prod', '']) {
        assert.notEqual(run('validate', { BUILD_MODE: 'github', ENVIRONMENT: env }).code, 0, `environment '${env}'`);
    }
});

test('the CLI is pinned to an exact version', () => {
    assert.match(script(action, 'install'), /vercel@\d+\.\d+\.\d+/);
});

// staging is the Vercel custom environment `staging` (the develop branch, with
// its own URL): pulled, built and deployed with --target=staging. production
// is --prod and never has a --target.
for (const mode of ['github', 'vercel']) {
    for (const env of ['staging', 'production']) {
        test(`deploy ${mode}/${env}`, () => {
            const r = run(`deploy-${mode}`, { ENVIRONMENT: env, VERCEL_ENV_ARGS_BIN: envArgs });
            assert.equal(r.code, 0, r.output);
            const deploy = args(r.log, 'deploy');
            const all = r.log.flatMap((l) => l.split(' '));
            if (env === 'production') {
                assert.ok(deploy.includes('--prod'), `deploy --prod: ${deploy.join(' ')}`);
                assert.ok(!all.some((a) => a.startsWith('--target')), 'no --target');
            } else {
                assert.ok(deploy.includes('--target=staging'), `deploy --target=staging: ${deploy.join(' ')}`);
                assert.ok(!all.includes('--prod'), 'no --prod');
            }
            assert.ok(r.out.includes('url=https://app-abc123.vercel.app'), 'url output');
            if (mode === 'github') {
                assert.ok(args(r.log, 'pull').includes(`--environment=${env}`), `pulls ${env}`);
                assert.ok(
                    lines(join(r.work, '.vercel', `.env.${env}.local`)).includes('API_KEY="secret"'),
                    `secrets in .vercel/.env.${env}.local`,
                );
                const flag = env === 'production' ? '--prod' : '--target=staging';
                assert.ok(args(r.log, 'build').includes(flag), `build ${flag}`);
            }
        });
    }
}

// The health check after the deploy needs the URL.
test('a deploy that prints no URL fails', () => {
    for (const mode of ['github', 'vercel']) {
        assert.notEqual(run(`deploy-${mode}`, { ENVIRONMENT: 'staging', FAKE_NO_URL: '1' }).code, 0, mode);
    }
});
