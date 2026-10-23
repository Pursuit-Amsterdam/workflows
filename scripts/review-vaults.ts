// Which 1Password items the consumer repos deploy with, and the state of
// every field in them: concealed (a password field) or plain. That state
// decides what setup-onepassword masks once PR #23 (main) is on v2, and what
// may go into an image as a build-arg. Read-only; prints labels, states and
// value lengths, never a value. A field gets a note when it looks like a
// secret but is plain (set it to password), or when it is short (masking a
// short value damages every log line that contains it).
//
//   pnpm review-vaults                         # every consumer repo
//   pnpm review-vaults -- gp-map-webapp tellr-webapp
//   pnpm review-vaults -- --list               # only which repo uses which item, no 1Password access
//
// Needs the local `gh` login (environments and workflows) and the 1Password
// CLI signed in as a person with access to the vaults (`brew install
// 1password-cli`, `op signin`); the service accounts see one vault each.
import { execFileSync } from 'node:child_process';
import { loadConsumer } from './lib/consumer.ts';
import { ORG, get, orgRepos } from './lib/github.ts';
import { onePasswordRefs, reviewField, state, type VaultRef } from './lib/vaults.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const listOnly = args.includes('--list');
const repos = args.filter(a => !a.startsWith('--'));

// --- which repo uses which item: the environments' OP_VAULT/OP_ITEM, and the workflow inputs
const users = new Map<string, { ref: VaultRef; repos: Set<string> }>();
const add = (ref: VaultRef, repo: string, where: string): void => {
    const key = `${ref.vault}/${ref.item}`;
    const u = users.get(key) ?? { ref, repos: new Set<string>() };
    u.repos.add(`${repo} (${where})`);
    users.set(key, u);
};
for (const repo of repos.length ? repos : await orgRepos()) {
    const c = await loadConsumer(repo);
    if (!c || !c.calls) continue;
    const p = { owner: ORG, repo };
    const envs = (await get<{ environments: { name: string }[] }>('/repos/{owner}/{repo}/environments', p))?.environments.map(e => e.name) ?? [];
    for (const environment_name of envs) {
        const vars = (await get<{ variables: { name: string; value: string }[] }>('/repos/{owner}/{repo}/environments/{environment_name}/variables', { ...p, environment_name, per_page: 100 }))?.variables ?? [];
        const vault = vars.find(v => v.name === 'OP_VAULT')?.value;
        const item = vars.find(v => v.name === 'OP_ITEM')?.value;
        if (vault && item) add({ vault, item }, repo, environment_name);
    }
    for (const wf of c.workflows) for (const ref of onePasswordRefs(wf)) add(ref, repo, wf.file);
}

const items = [...users.values()].sort((a, b) => `${a.ref.vault}/${a.ref.item}`.localeCompare(`${b.ref.vault}/${b.ref.item}`));
console.log(`${items.length} item(s) across ${new Set(items.flatMap(u => [...u.repos].map(r => r.split(' ')[0]))).size} repo(s)\n`);
if (listOnly) {
    for (const u of items) console.log(`${u.ref.vault}/${u.ref.item}\n    ${[...u.repos].join(', ')}`);
    process.exit(0);
}

// --- the fields, through the 1Password CLI; values stay inside this process
try {
    execFileSync('op', ['whoami'], { stdio: 'ignore' });
} catch {
    console.error('1Password CLI not signed in: `brew install 1password-cli`, then `op signin` as someone with access to the vaults.');
    process.exit(2);
}
let flagged = 0;
let unreadable = 0;
for (const u of items) {
    const { vault, item } = u.ref;
    let fields: { label?: string; type?: string; value?: string }[];
    try {
        fields = (JSON.parse(execFileSync('op', ['item', 'get', item, '--vault', vault, '--format', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) as { fields?: typeof fields }).fields ?? [];
    } catch (err) {
        unreadable++;
        console.log(`${vault}/${item}: cannot read (${String((err as { stderr?: string }).stderr ?? err).trim().split('\n')[0]})\n    ${[...u.repos].join(', ')}`);
        continue;
    }
    const rows = fields
        .filter(f => f.label && f.label !== 'notesPlain')
        .map(f => ({ label: f.label!, type: f.type ?? '', length: f.value?.length ?? 0 }))
        .map(f => ({ ...f, note: reviewField(f) }));
    const n = rows.filter(r => r.note).length;
    flagged += n;
    console.log(`${vault}/${item}: ${rows.length} field(s), ${n} to look at\n    ${[...u.repos].join(', ')}`);
    const width = Math.max(12, ...rows.map(r => r.label.length));
    for (const r of rows) console.log(`    ${r.note ? '!' : ' '} ${r.label.padEnd(width)}  ${state(r).padEnd(9)} ${String(r.length).padStart(4)} chars${r.note ? `  ${r.note}` : ''}`);
    console.log();
}
console.log(`${flagged} field(s) to look at, ${unreadable} item(s) unreadable.`);
process.exit(flagged || unreadable ? 1 : 0);
