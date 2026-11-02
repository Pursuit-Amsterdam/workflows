// Running calls side by side, at most `n` at a time. Run: node --test scripts/lib/
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { channel, limiter } from './pool.ts';

const tick = (): Promise<void> => new Promise(resolve => setImmediate(resolve));

test('limiter: never more than n at once, and every job runs', async () => {
    const run = limiter(3);
    let active = 0;
    let peak = 0;
    const jobs = Array.from({ length: 10 }, (_, i) => run(async () => {
        active++;
        peak = Math.max(peak, active);
        await tick();
        active--;
        return i;
    }));
    assert.deepEqual(await Promise.all(jobs), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'each promise gets its own result, in order');
    assert.equal(peak, 3);
});

test('limiter: a failing job rejects its own promise, and the rest still runs', async () => {
    const run = limiter(2);
    const results = await Promise.allSettled([
        run(async () => 'a'),
        run(async () => { throw new Error('boom'); }),
        run(async () => 'c'),
    ]);
    assert.deepEqual(results.map(r => r.status), ['fulfilled', 'rejected', 'fulfilled']);
});

test('limiter: a job starts when it is handed over, not when it is awaited', async () => {
    const run = limiter(1);
    const started: string[] = [];
    const a = run(async () => { started.push('a'); });
    const b = run(async () => { started.push('b'); });
    await tick();
    await tick();
    assert.deepEqual(started, ['a', 'b'], 'b ran before anyone awaited it');
    await Promise.all([a, b]);
});

test('channel: values come out in the order they went in, also while they are still coming', async () => {
    const c = channel<number>();
    c.push(1);
    const seen: number[] = [];
    const reading = (async () => { for await (const v of c) seen.push(v); })();
    await tick();
    c.push(2);
    c.push(3);
    await tick();
    assert.deepEqual(seen, [1, 2, 3], 'read before close');
    c.close();
    await reading;
    assert.deepEqual(seen, [1, 2, 3]);
});

test('channel: close ends the reading once everything in it is read', async () => {
    const c = channel<string>();
    c.push('a');
    c.push('b');
    c.close();
    const seen: string[] = [];
    for await (const v of c) seen.push(v);
    assert.deepEqual(seen, ['a', 'b']);
});

test('channel: close with an error throws it after the values that came before', async () => {
    const c = channel<string>();
    c.push('a');
    c.close(new Error('collecting failed'));
    const seen: string[] = [];
    await assert.rejects((async () => { for await (const v of c) seen.push(v); })(), /collecting failed/);
    assert.deepEqual(seen, ['a']);
});
