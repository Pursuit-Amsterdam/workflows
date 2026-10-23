// The pure part of review-vaults (scripts/review-vaults.ts): which 1Password
// items a repo's workflows name, and which fields of an item deserve a look
// before setup-onepassword masks only CONCEALED fields (PR #23 on main).
import { jobs, type Workflow } from './workflow.ts';

export interface VaultRef {
    vault: string;
    item: string;
    /** The environment the job deploys to (its `environment` input or key, lowercase), when it names one literally. */
    environment?: string;
}

/** The `onepassword_vault`/`_item` (v1) and `onepassword-vault`/`-item` (v2) inputs of the jobs; `${{ vars.* }}` references are the environments' business. */
export function onePasswordRefs(wf: Workflow): VaultRef[] {
    const refs: VaultRef[] = [];
    for (const [, job] of jobs(wf)) {
        const w = (job.with ?? {}) as Record<string, unknown>;
        const vault = String(w['onepassword-vault'] ?? w['onepassword_vault'] ?? '');
        const item = String(w['onepassword-item'] ?? w['onepassword_item'] ?? '');
        if (!vault || !item || vault.includes('${{') || item.includes('${{')) continue;
        const env = String(w['environment'] ?? (typeof job.environment === 'string' ? job.environment : '') ?? '').toLowerCase();
        const ref: VaultRef = { vault, item, ...(env && !env.includes('${{') ? { environment: env } : {}) };
        if (!refs.some(r => r.vault === vault && r.item === item && r.environment === ref.environment)) refs.push(ref);
    }
    return refs;
}

// What a label usually holds. Config may stay plain; a secret belongs in a
// password field (concealed): that is what gets masked, and what never goes
// into an image as a build-arg. A connection string carries a password.
const SECRET_LABEL = /(SECRET|TOKEN|PASS|PWD|KEY|PRIVATE|CREDENTIAL|LICENSE|SIGNING|SALT|DSN|CONNECTION_STRING|JWT|SERVICE_ACCOUNT|CERT)/i;
const CREDENTIALED_URL = /^(DATABASE|DB|POSTGRES|POSTGRESQL|PG|MYSQL|REDIS|MONGO|MONGODB|AMQP|RABBITMQ|KAFKA|SMTP|ELASTIC|QUEUE|STORAGE)[A-Z_]*_(URL|URI)/i;
const CONFIG_LABEL = /^NEXT_PUBLIC_|PUBLIC_KEY|PUBLISHABLE|(^|_)(HOST|HOSTNAME|PORT|URL|URI|DOMAIN|ORIGIN|ORIGINS|EMAIL|FROM|NAME|ID|REGION|BUCKET|REPLICAS|LEVEL|ENV|ENVIRONMENT|MODE|LOCALE|TIMEZONE|TZ|VERSION|PREFIX|PATH|DIR|TIMEOUT|LIMIT|SIZE|COUNT|ENABLED|DISABLED|FLAG|FLAGS)$|^(DEBUG|NODE_ENV|LOG_LEVEL|CORS_ORIGINS|APP_HOST|API_HOST|ACME_EMAIL)$/i;
/** GitHub masks a value everywhere it appears in output: a 1-character value removes that character from every log line. */
const SHORT = 4;

export type Expected = 'concealed' | 'plain' | 'unsure';

/** What the label says the field should be. */
export function expected(label: string): Expected {
    if (CREDENTIALED_URL.test(label)) return 'concealed';
    // Starts with NEXT_PUBLIC_ or contains PUBLIC: public by nature. PUBLISHABLE is
    // Stripe's word for the same; KEY_VAULT is a vault's name, not a key.
    if (/^NEXT_PUBLIC_|PUBLIC|PUBLISHABLE|KEY_VAULT/i.test(label)) return 'plain';
    if (SECRET_LABEL.test(label)) return 'concealed';
    if (CONFIG_LABEL.test(label)) return 'plain';
    return 'unsure';
}

export interface Field {
    label: string;
    type: string;
    /** Length of the value; the value itself never leaves `op`. */
    length: number;
}

/** `concealed` (a password field) or `plain`: what 1Password shows, and what decides masking and build-args. */
export function state(f: Pick<Field, 'type'>): 'concealed' | 'plain' {
    return f.type === 'CONCEALED' ? 'concealed' : 'plain';
}

/** What to do with a field, or null when it is fine as it is. */
export function reviewField(f: Field): string | null {
    if (f.label === 'notesPlain') return null;
    const now = state(f);
    const want = expected(f.label);
    if (now === 'plain' && want === 'concealed') return 'looks like a secret: set it to password';
    if (now === 'concealed' && /^NEXT_PUBLIC_/i.test(f.label)) return 'a public build-time value kept as password: it is not passed as a build-arg, make it plain';
    if (f.length > 0 && f.length <= SHORT) {
        return now === 'concealed' ? 'short password: masking it damages the logs, make it plain or longer' : 'short: damages the logs while masked (fixed by #23)';
    }
    if (now === 'concealed' && want === 'plain') return 'looks like config kept as password: fine, only masked for nothing';
    return null;
}

/**
 * The one-line fix for a note, as a field assignment for `op item edit`
 * (`LABEL[password]` or `LABEL[text]`: the type only, no value), or null when
 * the fix needs a new value or the label cannot be addressed that way (a dot
 * or brackets in it would be read as a section or a type).
 */
export function fix(f: Field): { assignment: string; to: 'concealed' | 'plain' } | null {
    if (!/^[A-Za-z0-9_-]+$/.test(f.label)) return null;
    const now = state(f);
    const want = expected(f.label);
    if (now === 'plain' && want === 'concealed') return { assignment: `${f.label}[password]`, to: 'concealed' };
    if (now === 'concealed' && (/^NEXT_PUBLIC_/i.test(f.label) || want === 'plain')) return { assignment: `${f.label}[text]`, to: 'plain' };
    return null;
}
