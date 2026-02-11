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
 * @param callback The async function to invoke for each value
 * @returns A promise that resolves when all callbacks complete
 *
 * @example
 * await runSequentially([1, 2, 3], async (num, index) => {
 *   console.log(`Processing ${num} at index ${index}`);
 * });
 */
export async function runSequentially<T>(values: Iterable<T>, callback: SequentialCallback<T>): Promise<void> {
    const entries = Array.from(values);

    await entries.reduce(async (previousPromise, value, index) => {
        await previousPromise;
        return callback(value, index);
    }, Promise.resolve());
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
