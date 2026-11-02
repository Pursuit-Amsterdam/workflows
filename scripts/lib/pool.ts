// At most `n` calls at a time, each started as soon as a slot is free: for
// the GitHub and 1Password reads of review-vaults, which are slow one by one
// and fine side by side. Run: node --test scripts/lib/

/** A function that runs jobs with at most `n` at once; each job gets its own promise. */
export function limiter(n: number): <T>(job: () => Promise<T>) => Promise<T> {
    let active = 0;
    const queue: (() => void)[] = [];
    const next = (): void => {
        if (active >= n) return;
        const start = queue.shift();
        if (!start) return;
        active++;
        start();
    };
    return <T>(job: () => Promise<T>): Promise<T> =>
        new Promise<T>((resolve, reject) => {
            queue.push(() => {
                job().then(resolve, reject).finally(() => {
                    active--;
                    next();
                });
            });
            next();
        });
}

export interface Channel<T> extends AsyncIterable<T> {
    push(value: T): void;
    /** No more values; with an error, the reader gets it after the values before it. */
    close(error?: Error): void;
}

/**
 * A queue between a producer and one reader that does not wait for the
 * producer to finish: review-vaults reviews an item as soon as the GitHub
 * side has found it.
 */
export function channel<T>(): Channel<T> {
    const values: T[] = [];
    let closed = false;
    let failure: Error | undefined;
    let wake: (() => void) | null = null;
    const notify = (): void => {
        wake?.();
        wake = null;
    };
    return {
        push(value) {
            values.push(value);
            notify();
        },
        close(error) {
            closed = true;
            failure = error;
            notify();
        },
        async *[Symbol.asyncIterator]() {
            for (let i = 0; ; i++) {
                while (i >= values.length) {
                    if (closed) {
                        if (failure) throw failure;
                        return;
                    }
                    await new Promise<void>(resolve => (wake = resolve));
                }
                yield values[i]!;
            }
        },
    };
}
