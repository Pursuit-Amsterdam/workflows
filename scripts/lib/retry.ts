// Trying a GitHub call again: the pure part, without GitHub access, so it can
// be tested without a token. github.ts applies it to every GET.

/** A failure on GitHub's side (5xx) or on the way there (no status at all). A 4xx is an answer. */
export function transient(err: unknown): boolean {
    const status = typeof err === 'object' && err !== null && 'status' in err ? Number(err.status) : undefined;
    return status === undefined || status >= 500;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** `fn`, tried again after a transient failure: `attempts` in all, waiting 1 s, 2 s, ... in between. */
export async function retrying<T>(fn: () => Promise<T>, { attempts = 3, wait = sleep }: { attempts?: number; wait?: (ms: number) => Promise<void> } = {}): Promise<T> {
    for (let attempt = 1; ; attempt++) {
        try {
            return await fn();
        } catch (err) {
            if (attempt >= attempts || !transient(err)) throw err;
            await wait(1000 * attempt);
        }
    }
}
