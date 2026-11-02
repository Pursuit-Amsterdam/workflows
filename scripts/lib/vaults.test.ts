// The pure part of review-vaults: which 1Password items a repo uses, and which
// fields deserve a look. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWorkflow } from './workflow.ts';
import { autoAccept, expected, fix, onePasswordRefs, reviewField, state } from './vaults.ts';

test('onePasswordRefs: v1 inputs, v2 inputs, and vars references are skipped', () => {
    const v1 = parseWorkflow('cd.yml', `on: push
jobs:
    staging:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
        with:
            environment: 'staging'
            onepassword_vault: my-site-staging
            onepassword_item: my-site-staging-secrets
    production:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
        with:
            environment: Production
            onepassword_vault: 'my-site-production'
            onepassword_item: "my-site-production-secrets"
    swarm:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/vm-cd.yml@main
        with:
            onepassword_vault: \${{ vars.OP_VAULT }}
            onepassword_item: \${{ vars.OP_ITEM }}
`);
    assert.deepEqual(onePasswordRefs(v1), [
        { vault: 'my-site-staging', item: 'my-site-staging-secrets', environment: 'staging' },
        { vault: 'my-site-production', item: 'my-site-production-secrets', environment: 'production' },
    ]);
    const v2 = parseWorkflow('ci.yml', `on: push
jobs:
    run-ci:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/ci.yml@v2
        with:
            onepassword-vault: tellr-webapp-staging
            onepassword-item: tellr-webapp-staging-secrets
`);
    assert.deepEqual(onePasswordRefs(v2), [{ vault: 'tellr-webapp-staging', item: 'tellr-webapp-staging-secrets' }]);
    assert.deepEqual(onePasswordRefs(parseWorkflow('x.yml', 'on: push\njobs:\n    a:\n        runs-on: ubuntu-latest\n        steps: []\n')), []);
});

test('reviewField: a plain-text field that looks like a secret', () => {
    for (const label of ['JWT_SECRET_KEY', 'DATABASE_URL', 'AZURE_OPENAI_KEY', 'SMTP_PASSWORD', 'VERCEL_TOKEN', 'CLOUDFLARE_ORIGIN_KEY', 'AUTH_MICROSOFT_ENTRA_SECRET', 'SENTRY_DSN']) {
        assert.match(reviewField({ label, type: 'STRING', length: 40 }) ?? '', /looks like a secret/, label);
    }
    for (const label of ['NEXT_PUBLIC_API_KEY', 'WORKER_REPLICAS', 'LOG_LEVEL', 'APP_HOST', 'ACME_EMAIL', 'STRIPE_PUBLIC_KEY', 'NEXT_PUBLIC_SENTRY_DSN']) {
        assert.doesNotMatch(reviewField({ label, type: 'STRING', length: 40 }) ?? '', /looks like a secret/, label);
    }
    assert.equal(reviewField({ label: 'JWT_SECRET_KEY', type: 'CONCEALED', length: 40 }), null, 'concealed is fine');
});

test('reviewField: short values damage the logs once masked', () => {
    assert.match(reviewField({ label: 'WORKER_REPLICAS', type: 'STRING', length: 1 }) ?? '', /short: might damage the logs while masked/);
    assert.match(reviewField({ label: 'DB_POOL', type: 'CONCEALED', length: 2 }) ?? '', /short password/);
    assert.equal(reviewField({ label: 'LOG_LEVEL', type: 'STRING', length: 5 }), null);
    assert.equal(reviewField({ label: 'notesPlain', type: 'STRING', length: 1 }), null, 'notes are not exported');
});

test('state: concealed or plain', () => {
    assert.equal(state({ type: 'CONCEALED' }), 'concealed');
    for (const type of ['STRING', 'URL', 'EMAIL', '']) assert.equal(state({ type }), 'plain', type || 'empty');
});

test('expected: what the label says', () => {
    const cases: Record<string, ReturnType<typeof expected>> = {
        JWT_SECRET_KEY: 'concealed', DATABASE_URL: 'concealed', DATABASE_URL_SYNC: 'concealed', REDIS_URL: 'concealed', SMTP_PASSWORD: 'concealed', VERCEL_TOKEN: 'concealed',
        AZURE_OPENAI_KEY: 'concealed', SENTRY_DSN: 'concealed', AUTH_MICROSOFT_ENTRA_SECRET: 'concealed', OP_SERVICE_ACCOUNT_TOKEN: 'concealed', CLOUDFLARE_ORIGIN_CERT: 'concealed',
        NEXT_PUBLIC_API_URL: 'plain', NEXT_PUBLIC_SENTRY_DSN: 'plain', STRIPE_PUBLISHABLE_KEY: 'plain', APP_HOST: 'plain', WORKER_REPLICAS: 'plain', LOG_LEVEL: 'plain',
        ACME_EMAIL: 'plain', AUTH_MICROSOFT_ENTRA_ID: 'plain', VERCEL_ORG_ID: 'plain', API_URL: 'plain', CORS_ORIGINS: 'plain', S3_BUCKET: 'plain',
        FEATURE_X: 'unsure', AUTH_TRUST_HOST: 'plain', ASANA_WORKSPACE: 'unsure',
        BACKUP_BLOB_SAS_URL: 'concealed', AZURE_STORAGE_SAS: 'concealed', SLACK_WEBHOOK_URL: 'concealed', TEAMS_WEBHOOK: 'concealed', CLASS_NAME: 'plain', SASS_PATH: 'plain',
        NEXT_PRIVATE_DEBUG_CACHE: 'plain', PUBLIC_SITE_TOKEN: 'plain', SUPABASE_PUBLIC_ANON_KEY: 'plain', NEXT_PUBLIC_SECRET_SAUCE: 'plain', SMTP_PASS: 'concealed', DB_PASS: 'concealed', ENCRYPTION_KEY1: 'concealed', KEYCLOAK_CLIENT_SECRET: 'concealed', AZURE_KEY_VAULT: 'plain', SESSION_SECRET: 'concealed',
    };
    for (const [label, want] of Object.entries(cases)) assert.equal(expected(label), want, label);
});

test('reviewField: a public build-time value kept as password breaks the build-args', () => {
    assert.match(reviewField({ label: 'NEXT_PUBLIC_API_URL', type: 'CONCEALED', length: 30 }) ?? '', /build-arg/);
    assert.match(reviewField({ label: 'APP_HOST', type: 'CONCEALED', length: 30 }) ?? '', /config kept as password/);
    assert.equal(reviewField({ label: 'FEATURE_X', type: 'STRING', length: 30 }), null, 'unsure stays quiet');
});

test('fix: the type-only assignment for op item edit', () => {
    assert.deepEqual(fix({ label: 'RESEND_API_KEY', type: 'STRING', length: 36 }), { assignment: 'RESEND_API_KEY[password]', to: 'concealed' });
    assert.deepEqual(fix({ label: 'NEXT_PUBLIC_API_URL', type: 'CONCEALED', length: 30 }), { assignment: 'NEXT_PUBLIC_API_URL[text]', to: 'plain' });
    assert.deepEqual(fix({ label: 'APP_HOST', type: 'CONCEALED', length: 30 }), { assignment: 'APP_HOST[text]', to: 'plain' });
    assert.equal(fix({ label: 'WORKER_REPLICAS', type: 'STRING', length: 1 }), null, 'a short value needs a new value, not a type');
    assert.equal(fix({ label: 'JWT_SECRET_KEY', type: 'CONCEALED', length: 40 }), null, 'nothing to fix');
    assert.equal(fix({ label: 'BACKUP_BLOB_SAS_URL', type: 'CONCEALED', length: 180 }), null, 'a SAS URL carries its token: stays a password');
    assert.deepEqual(fix({ label: 'BACKUP_BLOB_SAS_URL', type: 'STRING', length: 180 }), { assignment: 'BACKUP_BLOB_SAS_URL[password]', to: 'concealed' });
    assert.equal(fix({ label: 'api.key', type: 'STRING', length: 40 }), null, 'a dot would be read as a section');
});

test('autoAccept: only NEXT_PUBLIC_ to plain goes without a question', () => {
    assert.equal(autoAccept('NEXT_PUBLIC_RECAPTCHA_SITE_KEY', { assignment: 'NEXT_PUBLIC_RECAPTCHA_SITE_KEY[text]', to: 'plain' }), true, 'in the browser bundle anyway');
    assert.equal(autoAccept('next_public_api_url', { assignment: 'next_public_api_url[text]', to: 'plain' }), true, 'case does not matter');
    assert.equal(autoAccept('SMTP_PORT', { assignment: 'SMTP_PORT[text]', to: 'plain' }), false, 'config by its label, but the label can be wrong');
    assert.equal(autoAccept('RESEND_API_KEY', { assignment: 'RESEND_API_KEY[password]', to: 'concealed' }), false, 'to password can drop a build-arg');
    assert.equal(autoAccept('NEXT_PUBLIC_X', { assignment: 'NEXT_PUBLIC_X[password]', to: 'concealed' }), false);
});
