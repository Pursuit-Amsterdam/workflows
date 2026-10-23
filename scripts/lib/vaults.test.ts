// The pure part of review-vaults: which 1Password items a repo uses, and which
// fields deserve a look. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseWorkflow } from './workflow.ts';
import { onePasswordRefs, reviewField } from './vaults.ts';

test('onePasswordRefs: v1 inputs, v2 inputs, and vars references are skipped', () => {
    const v1 = parseWorkflow('cd.yml', `on: push
jobs:
    staging:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
        with:
            onepassword_vault: my-site-staging
            onepassword_item: my-site-staging-secrets
    production:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/web-cd.yml@main
        with:
            onepassword_vault: 'my-site-production'
            onepassword_item: "my-site-production-secrets"
    swarm:
        uses: Pursuit-Amsterdam/workflows/.github/workflows/vm-cd.yml@main
        with:
            onepassword_vault: \${{ vars.OP_VAULT }}
            onepassword_item: \${{ vars.OP_ITEM }}
`);
    assert.deepEqual(onePasswordRefs(v1), [
        { vault: 'my-site-staging', item: 'my-site-staging-secrets' },
        { vault: 'my-site-production', item: 'my-site-production-secrets' },
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

test('reviewField: short values shred the logs once masked', () => {
    assert.match(reviewField({ label: 'WORKER_REPLICAS', type: 'STRING', length: 1 }) ?? '', /masked today.*#23/);
    assert.match(reviewField({ label: 'DB_POOL', type: 'CONCEALED', length: 2 }) ?? '', /concealed.*2 chars/);
    assert.equal(reviewField({ label: 'LOG_LEVEL', type: 'STRING', length: 5 }), null);
    assert.equal(reviewField({ label: 'notesPlain', type: 'STRING', length: 1 }), null, 'notes are not exported');
});
