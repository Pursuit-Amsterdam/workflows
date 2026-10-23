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

/** Why a field deserves a look, or null. */
export function reviewField(f: Field): string | null {
    if (f.label === 'notesPlain') return null;
    const concealed = f.type === 'CONCEALED';
    if (!concealed && SECRET_LABEL.test(f.label) && !PUBLIC_LABEL.test(f.label)) {
        return 'plain text but looks like a secret: set the field to password, or it is in the logs once only concealed fields are masked';
    }
    if (f.length > 0 && f.length <= SHORT) {
        return concealed
            ? `concealed but ${f.length} chars: masking it removes every "${'…'}" of that length from the logs; make it config (plain text) or longer`
            : `${f.length} chars: masked today, which shreds the logs (the #23 symptom); harmless once only concealed fields are masked`;
    }
    return null;
}
