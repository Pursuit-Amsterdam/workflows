// The pure part of review-vaults (scripts/review-vaults.ts): which 1Password
// items a repo's workflows name, and which fields of an item deserve a look
// before setup-onepassword masks only CONCEALED fields (PR #23 on main).
import { jobs, type Workflow } from './workflow.ts';

export interface VaultRef {
    vault: string;
    item: string;
}

/** The `onepassword_vault`/`_item` (v1) and `onepassword-vault`/`-item` (v2) inputs of the jobs; `${{ vars.* }}` references are the environments' business. */
export function onePasswordRefs(wf: Workflow): VaultRef[] {
    const refs: VaultRef[] = [];
    for (const [, job] of jobs(wf)) {
        const w = (job.with ?? {}) as Record<string, unknown>;
        const vault = String(w['onepassword-vault'] ?? w['onepassword_vault'] ?? '');
        const item = String(w['onepassword-item'] ?? w['onepassword_item'] ?? '');
        if (!vault || !item || vault.includes('${{') || item.includes('${{')) continue;
        if (!refs.some(r => r.vault === vault && r.item === item)) refs.push({ vault, item });
    }
    return refs;
}

// A label that usually holds a secret. Public keys, hosts, emails and
// NEXT_PUBLIC_* values are config and may stay plain text.
const SECRET_LABEL = /(SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_KEY|ACCESS_KEY|_KEY$|_KEY_|SIGNING|SALT|DSN|DATABASE_URL|CONNECTION_STRING|JWT)/i;
const PUBLIC_LABEL = /^NEXT_PUBLIC_|PUBLIC_KEY|PUBLISHABLE/i;
/** GitHub masks a value everywhere it appears in output: a 1-character value removes that character from every log line. */
const SHORT = 4;

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
    const concealed = f.type === 'CONCEALED';
    if (!concealed && SECRET_LABEL.test(f.label) && !PUBLIC_LABEL.test(f.label)) {
        return 'looks like a secret: set it to password';
    }
    if (f.length > 0 && f.length <= SHORT) {
        return concealed ? 'short password: masking it damages the logs, make it plain or longer' : 'short: damages the logs while masked (fixed by #23)';
    }
    return null;
}
