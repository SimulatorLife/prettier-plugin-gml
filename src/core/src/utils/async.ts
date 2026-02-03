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
export function runSequentially<T>(values: Iterable<T>, callback: SequentialCallback<T>): Promise<void> {
    const entries = Array.from(values);
    let index = 0;

    const runNext = async (): Promise<void> => {
        if (index >= entries.length) {
            return;
        }

        const currentIndex = index++;
        await callback(entries[currentIndex], currentIndex);
        await runNext();
    };

    return runNext();
}
