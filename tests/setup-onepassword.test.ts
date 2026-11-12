// The setup-onepassword action against a fake `op` on PATH: it masks only the
// secret fields (every type but the plain ones), escaped, a multiline one line
// by line; every field with a valid name reaches GITHUB_ENV, the Vercel env
// file and the build args whole, a multiline one (a PEM) included.
import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { bash, fakes, lines, script, steps, tempDir } from './steps.ts';

const action = steps('.github/actions/setup-onepassword/action.yml');
const bin = fakes('setup-onepassword');

// The last base64 line is 4 characters: too short to mask.
const pem = ['-----BEGIN CERTIFICATE-----', 'MIIBszCCAVmgAwIBAgIUQ', 'Zm9=', '-----END CERTIFICATE-----'].join('\n');
// Pretty-printed JSON: {, ], } and the whitespace-only line are not masked.
const serviceAccount = ['{', '  "type": "service_account",', '   ', '  "scopes": [', '    "x"', '  ]', '}'].join('\n');
const sshKey = ['-----BEGIN OPENSSH PRIVATE KEY-----', 'b3BlbnNzaC1rZXktdjE=', '-----END OPENSSH PRIVATE KEY-----'].join('\n');

// An item as `op item get --format json` prints it. Skipped: the notes field,
// a field without a value, and a label that is no variable name.
const item = {
    fields: [
        { id: 'notesPlain', label: 'notesPlain', type: 'STRING', purpose: 'NOTES', value: 'not a variable' },
        { id: 'a', label: 'API_KEY', type: 'CONCEALED', value: 's3cr3t-value' },
        // The runner unescapes %25 and %0A in a mask: escaped, the mask is the value.
        { id: 'b', label: 'DATABASE_URL', type: 'CONCEALED', value: 'postgres://u:p%25ss@h/db?x=%0A|c' },
        { id: 'c', label: 'TLS_CERT', type: 'CONCEALED', value: pem },
        { id: 'd', label: 'GOOGLE_SERVICE_ACCOUNT', type: 'CONCEALED', value: serviceAccount },
        // Secret types besides CONCEALED.
        { id: 'e', label: 'DEPLOY_KEY', type: 'SSHKEY', value: sshKey },
        { id: 'f', label: 'MFA', type: 'OTP', value: 'otpauth://totp/x?secret=ABCDEF' },
        { id: 'g', label: 'WORKER_REPLICAS', type: 'STRING', value: '3' },
        { id: 'h', label: 'NEXT_PUBLIC_SITE', type: 'URL', value: 'https://example.com/?x=1' },
        // A trailing newline from a paste is dropped, so this stays a build arg.
        { id: 'i', label: 'NEXT_PUBLIC_API_URL', type: 'URL', value: 'https://api.example.com\n' },
        // A line that equals the old fixed delimiter must not end the block.
        { id: 'j', label: 'BANNER', type: 'STRING', value: 'line one\n__OP_EOF__\nINJECTED=1' },
        { id: 'k', label: 'EMPTY', type: 'STRING', value: '' },
        // = in a name breaks the GITHUB_ENV format; a newline split it into two entries.
        { id: 'l', label: 'A=B', type: 'CONCEALED', value: pem },
        { id: 'm', label: 'LINE\nBREAK', type: 'STRING', value: 'x' },
        { id: 'n', label: 'UNSET', type: 'STRING' },
    ],
};

const exported: Record<string, string> = {
    API_KEY: 's3cr3t-value',
    DATABASE_URL: 'postgres://u:p%25ss@h/db?x=%0A|c',
    TLS_CERT: pem,
    GOOGLE_SERVICE_ACCOUNT: serviceAccount,
    DEPLOY_KEY: sshKey,
    MFA: 'otpauth://totp/x?secret=ABCDEF',
    WORKER_REPLICAS: '3',
    NEXT_PUBLIC_SITE: 'https://example.com/?x=1',
    NEXT_PUBLIC_API_URL: 'https://api.example.com',
    BANNER: 'line one\n__OP_EOF__\nINJECTED=1',
    EMPTY: '',
};

function run(env: Record<string, string> = {}, json: string = JSON.stringify(item)) {
    const dir = tempDir();
    const itemFile = join(dir, 'item.json');
    const githubEnv = join(dir, 'env');
    const out = join(dir, 'out');
    writeFileSync(itemFile, json);
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

/** The values the run masked, unescaped as the runner does (%0D, %0A, then %25). */
function masks(output: string): string[] {
    return output
        .split('\n')
        .filter((l) => l.startsWith('::add-mask::'))
        .map((l) => l.slice('::add-mask::'.length).replaceAll('%0D', '\r').replaceAll('%0A', '\n').replaceAll('%25', '%'))
        .sort();
}

test('masks the secret types, escaped, a multiline one line by line without the short lines', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.deepEqual(
        masks(r.output),
        [
            's3cr3t-value',
            'postgres://u:p%25ss@h/db?x=%0A|c',
            '-----BEGIN CERTIFICATE-----',
            'MIIBszCCAVmgAwIBAgIUQ',
            '-----END CERTIFICATE-----',
            '"type": "service_account",',
            '"scopes": [',
            ...sshKey.split('\n'),
            'otpauth://totp/x?secret=ABCDEF',
        ].sort(),
    );
});

test('every field with a valid name reaches GITHUB_ENV whole', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.deepEqual(r.env, exported);
});

test('a label that is no variable name is skipped, with a warning', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.match(r.output, /::warning::1Password field A\\?=B skipped/);
    assert.match(r.output, /::warning::1Password field \$'LINE\\nBREAK' skipped/);
});

// jq used to run in a process substitution: its failure went unnoticed, and
// the step exported nothing and stayed green.
test('an item without fields, or no JSON, fails the step', () => {
    for (const json of ['{"id":"x"}', 'not json']) {
        const r = run({}, json);
        assert.notEqual(r.code, 0, json);
        assert.deepEqual(r.env, {}, json);
    }
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

// A build arg ends up in the image, so never a secret type. The list is one
// line, so a multiline plain field stays out, with a warning.
test('build args: the plain single-line fields', () => {
    const r = run({ EXPORT_BUILD_ARGS: 'true' });
    assert.equal(r.code, 0, r.output);
    assert.equal(
        r.out.build_args,
        'WORKER_REPLICAS=3 NEXT_PUBLIC_SITE=https://example.com/?x=1 NEXT_PUBLIC_API_URL=https://api.example.com EMPTY=',
    );
    assert.match(r.output, /::warning::BANNER /);
    assert.doesNotMatch(r.output, /::warning::NEXT_PUBLIC_API_URL /);
});

test('no build args and no Vercel file unless asked', () => {
    const r = run();
    assert.equal(r.code, 0, r.output);
    assert.equal(r.out.build_args, undefined);
    assert.equal(r.env.VERCEL_ENV_ARGS_BIN, undefined);
});
