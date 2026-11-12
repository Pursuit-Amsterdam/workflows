// The setup-onepassword action against a fake `op` on PATH: it masks only the
// CONCEALED fields (each line apart), and every field reaches GITHUB_ENV, the
// Vercel env file and the build args whole, a multiline one (a PEM) included.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const action = steps('.github/actions/setup-onepassword/action.yml');
const bin = fakes('setup-onepassword');

const pem = ['-----BEGIN CERTIFICATE-----', 'MIIBszCCAVmgAwIBAgIUQ', 'Zm9vYmFy==', '-----END CERTIFICATE-----'].join('\n');

// An item as `op item get --format json` prints it. A field without a value
// and the notes field are skipped.
const item = {
    fields: [
        { id: 'notesPlain', label: 'notesPlain', type: 'STRING', purpose: 'NOTES', value: 'not a variable' },
        { id: 'a', label: 'API_KEY', type: 'CONCEALED', value: 's3cr3t-value' },
        { id: 'b', label: 'DATABASE_URL', type: 'CONCEALED', value: 'postgres://u:p@h/db?a=b|c' },
        { id: 'c', label: 'TLS_CERT', type: 'CONCEALED', value: pem },
        { id: 'd', label: 'WORKER_REPLICAS', type: 'STRING', value: '3' },
        { id: 'e', label: 'NEXT_PUBLIC_SITE', type: 'URL', value: 'https://example.com/?x=1' },
        // A line that equals the old fixed delimiter must not end the block.
        { id: 'f', label: 'BANNER', type: 'STRING', value: 'line one\n__OP_EOF__\nINJECTED=1' },
        { id: 'g', label: 'UNSET', type: 'STRING' },
    ],
};

const exported: Record<string, string> = {
    API_KEY: 's3cr3t-value',
    DATABASE_URL: 'postgres://u:p@h/db?a=b|c',
    TLS_CERT: pem,
    WORKER_REPLICAS: '3',
    NEXT_PUBLIC_SITE: 'https://example.com/?x=1',
    BANNER: 'line one\n__OP_EOF__\nINJECTED=1',
};

function run(env: Record<string, string> = {}) {
    const dir = tempDir();
    const itemFile = join(dir, 'item.json');
    const githubEnv = join(dir, 'env');
    const out = join(dir, 'out');
    writeFileSync(itemFile, JSON.stringify(item));
    writeFileSync(githubEnv, '');
    writeFileSync(out, '');
    const r = bash(script(action, 'export-secrets'), {
        bin,
        cwd: dir,
        env: {
            FAKE_OP_ITEM: itemFile,
            OP_LOG: join(dir, 'log'),
            GITHUB_ENV: githubEnv,
            GITHUB_OUTPUT: out,
            OP_SERVICE_ACCOUNT_TOKEN: 'ops_x',
            OP_VAULT_NAME: 'vault',
            OP_ITEM_NAME: 'item',
            EXPORT_FOR_VERCEL: 'false',
            EXPORT_BUILD_ARGS: 'false',
            VERCEL_ENV_FILE: 'vercel_env_args.bin',
            ...env,
        },
    });
    return { ...r, env: fileCommand(githubEnv), out: fileCommand(out), dir };
}

/** A GITHUB_ENV or GITHUB_OUTPUT file read the way the runner does: NAME=value or a NAME<<DELIM block. */
function fileCommand(file: string): Record<string, string> {
    const all = lines(file);
    const vars: Record<string, string> = {};
    for (let i = 0; i < all.length; i++) {
        const line = all[i];
        if (!line) continue;
        const block = /^([^=]+?)<<(.+)$/.exec(line);
        if (!block) {
            const eq = line.indexOf('=');
            vars[line.slice(0, eq)] = line.slice(eq + 1);
            continue;
        }
        const end = all.indexOf(block[2], i + 1);
        assert.notEqual(end, -1, `no ${block[2]} after ${block[1]}`);
        vars[block[1]] = all.slice(i + 1, end).join('\n');
        i = end;
    }
    return vars;
}

/** The values the run masked. */
function masks(output: string): string[] {
    return output
        .split('\n')
        .filter((l) => l.startsWith('::add-mask::'))
        .map((l) => l.slice('::add-mask::'.length))
        .sort();
}

test('masks the CONCEALED fields, each line apart, and no plain field', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.deepEqual(masks(r.output), ['s3cr3t-value', 'postgres://u:p@h/db?a=b|c', ...pem.split('\n')].sort());
});

test('every field reaches GITHUB_ENV whole, a PEM and a line like the old delimiter included', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.deepEqual(r.env, exported);
});

test('the Vercel env file has every field as --env NAME=value', () => {
    const r = run({ EXPORT_FOR_VERCEL: 'true' });
    assert.equal(r.code, 0, r.output);
    // $PWD of the step: the real path (on macOS the temp dir is a symlink).
    const file = join(realpathSync(r.dir), 'vercel_env_args.bin');
    assert.equal(r.env.VERCEL_ENV_ARGS_BIN, file);
    const args = readFileSync(file, 'utf8').split('\0').slice(0, -1);
    const pairs: string[] = [];
    for (let i = 0; i < args.length; i += 2) {
        assert.equal(args[i], '--env');
        pairs.push(args[i + 1]);
    }
    assert.deepEqual(
        pairs,
        Object.entries(exported).map(([k, v]) => `${k}=${v}`),
    );
});

// A build arg ends up in the image, so never a CONCEALED field. The list is
// one line, so a multiline plain field stays out, with a warning.
test('build args: the plain single-line fields', () => {
    const r = run({ EXPORT_BUILD_ARGS: 'true' });
    assert.equal(r.code, 0, r.output);
    assert.equal(r.out.build_args, 'WORKER_REPLICAS=3 NEXT_PUBLIC_SITE=https://example.com/?x=1');
    assert.match(r.output, /::warning::BANNER /);
});

test('no build args and no Vercel file unless asked', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.equal(r.out.build_args, undefined);
    assert.equal(r.env.VERCEL_ENV_ARGS_BIN, undefined);
});
