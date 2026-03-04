/**
 * Callback invoked for each value during sequential iteration.
 * @template T The type of values being processed
 */
export type SequentialCallback<T> = (value: T, index: number) => void | Promise<void>;

/**
 * Executes an async callback sequentially for each value in an iterable.
 * Guarantees that callbacks complete in order before the next one starts.
 *
 * @template T The type of values being processed
 * @param values The iterable collection to process
 * @param fn The async function to invoke for each value
 * @returns A promise that resolves when all callbacks complete
 *
 * @example
 * await runSequentially([1, 2, 3], async (num, index) => {
 *   console.log(`Processing ${num} at index ${index}`);
 * });
 */
export function runSequentially<T>(values: Iterable<T>, fn: SequentialCallback<T>): Promise<void> {
    return Array.from(values).reduce(
        (chain: Promise<void>, value: T, index: number) => chain.then(() => fn(value, index)),
        Promise.resolve()
    );
}

/**
 * Callback invoked for each value during parallel iteration.
 * @template T The type of values being processed
 * @template R The type of result returned by the callback
 */
export type ParallelCallback<T, R> = (value: T, index: number) => R | Promise<R>;

/**
 * Executes an async callback in parallel for each value in an iterable.
 * All callbacks run concurrently and the function waits for all to complete.
 *
 * @template T The type of values being processed
 * @template R The type of result returned by the callback
 * @param values The iterable collection to process
 * @param callback The async function to invoke for each value
 * @returns A promise that resolves with an array of all results when all callbacks complete
 *
 * @example
 * const results = await runInParallel([1, 2, 3], async (num, index) => {
 *   return num * 2;
 * });
 * // results = [2, 4, 6]
 */
export function runInParallel<T, R>(values: Iterable<T>, callback: ParallelCallback<T, R>): Promise<Array<R>> {
    const entries = Array.from(values);
    const promises = entries.map((value, index) => callback(value, index));
    return Promise.all(promises);
}

/**
 * Executes an async callback in parallel for each value in an iterable with bounded concurrency.
 * Limits the number of concurrent operations to avoid resource exhaustion while maintaining parallelism.
 *
 * @template T The type of values being processed
 * @template R The type of result returned by the callback
 * @param values The iterable collection to process
 * @param callback The async function to invoke for each value
 * @param limit Maximum number of concurrent operations (must be >= 1)
 * @returns A promise that resolves with an array of all results when all callbacks complete
 *
 * @example
 * // Process directories with max 4 concurrent operations
 * const results = await runInParallelWithLimit(directories, async (dir) => {
 *   return await processDirectory(dir);
 * }, 4);
 */
export async function runInParallelWithLimit<T, R>(
    values: Iterable<T>,
    callback: ParallelCallback<T, R>,
    limit: number
): Promise<Array<R>> {
    if (limit <= 0) {
        throw new Error("Concurrency limit must be at least 1");
    }

    const entries = Array.from(values);

    if (entries.length === 0) {
        return [];
    }

    const results: Array<R> = Array.from({ length: entries.length });
    let nextIndex = 0;

    // Each worker claims the next available slot synchronously (before any await),
    // so no two workers can process the same item. Workers recurse after completing
    // one item, rather than looping, to comply with the no-await-in-loop rule.
    const worker = async (): Promise<void> => {
        const index = nextIndex;
        if (index >= entries.length) {
            return;
        }
        nextIndex += 1;
        results[index] = await callback(entries[index], index);
        await worker();
    };

    await Promise.all(Array.from({ length: Math.min(limit, entries.length) }, worker));

    return results;
}
