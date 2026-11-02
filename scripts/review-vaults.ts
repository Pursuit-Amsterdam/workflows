// Which 1Password items the consumer repos deploy with, and the state of
// every field in them: concealed (a password field) or plain. That state
// decides what setup-onepassword masks once PR #23 (main) is on v2, and what
// may go into an image as a build-arg. Prints labels, states and value
// lengths, never a value, with one exception: --apply shows the value when it
// asks whether a password field may become text, since that is when you judge
// whether it is config (and after a yes it is plain anyway). Per field also what the label suggests
// (concealed, plain or unsure), and a note when the two differ, when a
// NEXT_PUBLIC_* value is a password (then it is not a build-arg), or when a
// value is short (masking a short value damages every log line with it).
//
//   pnpm review-vaults                         # every consumer repo
//   pnpm review-vaults -- gp-map-webapp tellr-webapp
//   pnpm review-vaults -- --list               # only which repo uses which item, no 1Password access
//   pnpm review-vaults -- --apply              # ask per field, and change the type on "y"
//   pnpm review-vaults -- --env staging        # only the items of that environment (also ci, or a workflow file name)
//
// Dry run by default: every field whose fix is a type change (plain to
// password, or a NEXT_PUBLIC_ password to text) is listed. With --apply, in a
// terminal, each one is a question first, and a yes runs
// `op item edit <item> 'LABEL[password]'`: the type only, never a value. A
// NEXT_PUBLIC_* field to text goes without a question: it is public anyway. A
// short value needs a new value and is only reported.
//
// Needs the local `gh` login (environments and workflows) and the 1Password
// CLI signed in as a person with access to the vaults (`brew install
// 1password-cli`, `op signin`); the service accounts see one vault each.
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { createInterface } from 'node:readline/promises';
import { loadConsumer } from './lib/consumer.ts';
import { ORG, get, orgRepos } from './lib/github.ts';
import { channel, limiter } from './lib/pool.ts';
import { autoAccept, expected, fix, onePasswordRefs, preview, reviewField, state, type VaultRef } from './lib/vaults.ts';

const args = process.argv.slice(2).filter(a => a !== '--');
const listOnly = args.includes('--list');
const apply = args.includes('--apply');
// --env staging, or --env=staging
const envIndex = args.indexOf('--env');
const envFilter = (args.find(a => a.startsWith('--env='))?.slice(6) ?? (envIndex >= 0 ? args[envIndex + 1] : '') ?? '').toLowerCase();
if (apply && !process.stdin.isTTY) {
    console.error('--apply asks a question per field and needs a terminal.');
    process.exit(2);
}
const repos = args.filter((a, i) => !a.startsWith('--') && !(envIndex >= 0 && i === envIndex + 1));

// --- 1Password first, unless only listing: a CLI that is not signed in is
// known at once, not after the whole collection. Every op call gets a
// timeout: a locked app or an unlock prompt would otherwise hang without a word.
const OP_TIMEOUT = 30_000;
const op = (opArgs: string[]): string => execFileSync('op', [...opArgs, '--no-color'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: OP_TIMEOUT });
const opError = (err: unknown): string => {
    const e = err as { code?: string; signal?: string; stderr?: string };
    if (e.signal === 'SIGTERM' || e.code === 'ETIMEDOUT') return `no answer from op within ${OP_TIMEOUT / 1000}s: is the 1Password app locked or asking to unlock?`;
    return String(e.stderr ?? err).trim().split('\n')[0] ?? 'unknown error';
};
let visible = new Set<string>();
if (!listOnly) {
    try {
        op(['whoami']);
    } catch (err) {
        console.error(`1Password CLI not usable (${opError(err)}): \`brew install 1password-cli\`, then \`op signin\` as someone with access to the vaults.`);
        process.exit(2);
    }
    // The vaults this account can see, once: an item in any other vault is
    // reported as "no access" without a call per item.
    visible = new Set((JSON.parse(op(['vault', 'list', '--format', 'json'])) as { name: string }[]).map(v => v.name));
    process.stderr.write(`Signed in with access to ${visible.size} vault(s).\n`);
}

// Each item is fetched from 1Password as soon as GitHub has named it, 4 at a
// time, in the background. A read settles into a result, so a failure waits
// for its turn instead of ending the run as an unhandled rejection.
const opAsync = promisify(execFile);
const onePassword = limiter(4);
type Read = { ok: true; json: string } | { ok: false; err: unknown };
const reads = new Map<string, Promise<Read>>();
const fetchItem = (ref: VaultRef): void => {
    const opArgs = ['item', 'get', ref.item, '--vault', ref.vault, '--format', 'json', '--no-color'];
    reads.set(`${ref.vault}/${ref.item}`, onePassword(() => opAsync('op', opArgs, { encoding: 'utf8', timeout: OP_TIMEOUT })).then(
        (r): Read => ({ ok: true, json: r.stdout }),
        (err: unknown): Read => ({ ok: false, err }),
    ));
};

// --- which repo uses which item: the environments' OP_VAULT/OP_ITEM, and the workflow inputs
// `where` is the environment (lowercase) when known, else the workflow file.
// A new item goes into `found` at once, and the review below takes it from there.
const users = new Map<string, { ref: VaultRef; uses: { repo: string; where: string }[]; shown?: number }>();
const found = channel<string>();
const add = (ref: VaultRef, repo: string, where: string): void => {
    if (envFilter && where.toLowerCase() !== envFilter) return;
    const key = `${ref.vault}/${ref.item}`;
    let u = users.get(key);
    if (!u) {
        u = { ref: { vault: ref.vault, item: ref.item }, uses: [] };
        users.set(key, u);
        if (!listOnly) {
            if (visible.has(ref.vault)) fetchItem(u.ref);
            found.push(key);
        }
    }
    if (!u.uses.some(x => x.repo === repo && x.where === where)) u.uses.push({ repo, where });
};
const all = repos.length ? repos : await orgRepos();
process.stderr.write(`Collecting the items of ${all.length} repo(s) through GitHub, 8 at a time${listOnly ? '' : ', reviewing each item as it comes in'}...\n\n`);
// Repos side by side, at most 8: one at a time took minutes for the org, and
// more at once runs into GitHub's limit on concurrent requests. While
// reviewing, the progress per repo stays quiet: it would write over a question.
const github = limiter(8);
let collected = 0;
const collecting = Promise.all(all.map(repo => github(async () => {
    const c = await loadConsumer(repo);
    if (c && c.calls) {
        const p = { owner: ORG, repo };
        const envs = (await get<{ environments: { name: string }[] }>('/repos/{owner}/{repo}/environments', p))?.environments.map(e => e.name) ?? [];
        await Promise.all(envs.map(async environment_name => {
            const vars = (await get<{ variables: { name: string; value: string }[] }>('/repos/{owner}/{repo}/environments/{environment_name}/variables', { ...p, environment_name, per_page: 100 }))?.variables ?? [];
            const vault = vars.find(v => v.name === 'OP_VAULT')?.value;
            const item = vars.find(v => v.name === 'OP_ITEM')?.value;
            if (vault && item) add({ vault, item }, repo, environment_name.toLowerCase());
        }));
        for (const wf of c.workflows) for (const ref of onePasswordRefs(wf)) add(ref, repo, ref.environment ?? (wf.file.startsWith('ci') ? 'ci' : wf.file));
    }
    collected++;
    if (listOnly) process.stderr.write(`  ${collected}/${all.length} ${repo}\n`);
}))).then(
    () => found.close(),
    (err: unknown) => found.close(err instanceof Error ? err : new Error(String(err))),
);

const usesOf = (u: { uses: { repo: string; where: string }[] }, from = 0): string => u.uses.slice(from).map(x => `${x.repo} (${x.where})`).join(', ');
if (listOnly) {
    await collecting;
    const items = [...users.values()].sort((a, b) => `${a.ref.vault}/${a.ref.item}`.localeCompare(`${b.ref.vault}/${b.ref.item}`));
    console.log(`${items.length} item(s) across ${new Set(items.flatMap(u => u.uses.map(x => x.repo))).size} repo(s)${envFilter ? ` for environment '${envFilter}'` : ''}\n`);
    for (const u of items) console.log(`${u.ref.vault}/${u.ref.item}\n    ${usesOf(u)}`);
    process.exit(0);
}

const rl = apply ? createInterface({ input: process.stdin, output: process.stdout }) : null;
const ask = async (q: string): Promise<string> => (rl ? (await rl.question(q)).trim().toLowerCase() : 'n');
let flagged = 0;
let unreadable = 0;
let changed = 0;
let failed = 0;
let offered = 0;
let quit = false;
for await (const key of found) {
    const u = users.get(key)!;
    u.shown = u.uses.length;
    const { vault, item } = u.ref;
    if (!visible.has(vault)) {
        unreadable++;
        console.log(`${vault}/${item}: no access to this vault for the signed-in account\n    ${usesOf(u)}\n`);
        continue;
    }
    let fields: { label?: string; type?: string; value?: string }[];
    try {
        const read = await reads.get(`${vault}/${item}`)!;
        if (!read.ok) throw read.err;
        fields = (JSON.parse(read.json) as { fields?: typeof fields }).fields ?? [];
    } catch (err) {
        unreadable++;
        console.log(`${vault}/${item}: cannot read (${opError(err)})\n    ${usesOf(u)}\n`);
        continue;
    }
    const rows = fields
        .filter(f => f.label && f.label !== 'notesPlain')
        .map(f => ({ label: f.label!, type: f.type ?? '', length: f.value?.length ?? 0, value: f.value ?? '' }))
        .map(f => ({ ...f, note: reviewField(f) }));
    const n = rows.filter(r => r.note).length;
    flagged += n;
    console.log(`${vault}/${item}: ${rows.length} field(s), ${n} to look at\n    ${usesOf(u)}`);
    const width = Math.max(12, ...rows.map(r => r.label.length));
    // `!` a problem, with what to do; `?` a label the rules cannot place (tell the rules in lib/vaults.ts).
    for (const r of rows) console.log(`    ${r.note ? '!' : expected(r.label) === 'unsure' ? '?' : ' '} ${r.label.padEnd(width)}  ${state(r).padEnd(9)} ${String(r.length).padStart(4)} chars${r.note ? `  ${r.note}` : ''}`);
    // The offers: one per field whose fix is a type change. A label that
    // occurs twice in the item cannot be addressed by name: left to the app.
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.label, (counts.get(r.label) ?? 0) + 1);
    for (const r of rows) {
        if (!r.note || quit) continue;
        const f = fix(r);
        if (!f) continue;
        if ((counts.get(r.label) ?? 0) > 1) {
            console.log(`    ${r.label}: occurs ${counts.get(r.label)} times in this item, change it in the 1Password app`);
            continue;
        }
        offered++;
        const to = f.to === 'concealed' ? 'password' : 'text';
        const auto = autoAccept(r.label, f);
        if (!rl) {
            console.log(`    → would set ${r.label} to ${to}${auto ? ' (without asking: NEXT_PUBLIC_ is public)' : ''}`);
            continue;
        }
        if (auto) console.log(`    → set ${r.label} to ${to} (NEXT_PUBLIC_ is public)`);
        else {
            if (f.to === 'plain') console.log(`      value: ${preview(r.value)}`);
            const answer = await ask(`    → set ${r.label} to ${to}? [y/N/q] `);
            if (answer === 'q') { quit = true; break; }
            if (answer !== 'y' && answer !== 'yes') continue;
        }
        try {
            op(['item', 'edit', item, '--vault', vault, f.assignment, '--format', 'json']);
            const after = (JSON.parse(op(['item', 'get', item, '--vault', vault, '--format', 'json'])) as { fields?: { label?: string; type?: string; value?: string }[] }).fields?.find(x => x.label === r.label);
            const now = after ? state({ type: after.type ?? '' }) : 'unknown';
            // A type-only edit keeps the value (1Password documents it); the
            // length, never the value, says whether it did.
            const kept = (after?.value ?? '').length === r.length;
            changed += now === f.to && kept ? 1 : 0;
            if (now !== f.to || !kept) failed++;
            console.log(`      ${r.label} is now ${now}${now === f.to ? '' : ' (not what was asked: check it in the app)'}`);
            if (!kept) console.log(`      ${r.label}: the value changed length (${r.length} → ${(after?.value ?? '').length} chars): restore it from the item's history in the app`);
        } catch (err) {
            failed++;
            console.log(`      could not change ${r.label}: ${opError(err)}`);
        }
    }
    console.log();
    if (quit) break;
}
rl?.close();
// Repos that named an item after it was reviewed: same item, more users.
if (!quit) {
    const later = [...users.values()].filter(u => u.shown !== undefined && u.uses.length > u.shown);
    if (later.length) {
        console.log('Also used by (found after the item was shown):');
        for (const u of later) console.log(`    ${u.ref.vault}/${u.ref.item}: ${usesOf(u, u.shown)}`);
        console.log();
    }
}
console.log(`${quit ? 'Stopped at your request.' : `That was the last item, from ${collected} repo(s).`} ${flagged} field(s) to look at in ${users.size} item(s)${unreadable ? `, ${unreadable} unreadable` : ''}. ${apply ? `${changed} changed, ${failed} failed.` : `${offered} change(s) available; dry run, run again with --apply to be asked per field.`}`);
// Findings are the point of a review, not a failure, and so is an item this
// account cannot read: the summary names them. Exit 1 only when a change you
// asked for went wrong (op refused it, the type did not take, or the value
// changed length); exit 2 is a run that could not start.
process.exit(failed ? 1 : 0);
