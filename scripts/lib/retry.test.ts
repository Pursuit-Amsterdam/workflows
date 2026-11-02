// When the scripts try a GitHub call again: a GET that failed on GitHub's side
// (5xx) or on the network. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { retrying, transient } from './retry.ts';

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
const noWait = async (): Promise<void> => {};

test('transient: 5xx and network errors, not 4xx', () => {
    for (const s of [500, 502, 503, 504]) assert.equal(transient(httpError(s)), true, String(s));
    for (const s of [400, 401, 403, 404, 422]) assert.equal(transient(httpError(s)), false, String(s));
    assert.equal(transient(new Error('fetch failed')), true, 'no status: the request never got an answer');
});

test('retrying: a transient failure is tried again, and the answer comes back', async () => {
    let calls = 0;
    const r = await retrying(async () => {
        calls++;
        if (calls < 3) throw httpError(502);
        return 'ok';
    }, { attempts: 3, wait: noWait });
    assert.equal(r, 'ok');
    assert.equal(calls, 3);
});

test('retrying: after the last attempt the error is thrown', async () => {
    let calls = 0;
    await assert.rejects(retrying(async () => { calls++; throw httpError(502); }, { attempts: 3, wait: noWait }), /HTTP 502/);
    assert.equal(calls, 3);
});

test('retrying: a 404 is an answer, thrown at once', async () => {
    let calls = 0;
    await assert.rejects(retrying(async () => { calls++; throw httpError(404); }, { attempts: 3, wait: noWait }), /HTTP 404/);
    assert.equal(calls, 1);
});

test('retrying: waits longer each time', async () => {
    const waits: number[] = [];
    await assert.rejects(retrying(async () => { throw httpError(503); }, { attempts: 3, wait: async (ms) => { waits.push(ms); } }));
    assert.deepEqual(waits, [1000, 2000]);
});
