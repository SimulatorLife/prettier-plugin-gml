/**
 * Callback function type for sequential iteration.
 *
 * @template T - Type of value being iterated over
 * @param value - Current value in the iteration
 * @param index - Zero-based index of the current value
 */
export type SequentialCallback<T> = (value: T, index: number) => void | Promise<void>;

/**
 * Execute an async callback sequentially for each value in an iterable.
 * Ensures that callbacks complete in order, even when they return promises,
 * preventing race conditions and maintaining predictable execution order.
 *
 * This utility is used across the codebase for operations that must happen
 * in sequence, such as:
 * - Processing file changes in watch mode
 * - Applying refactor edits in order
 * - Running performance benchmarks sequentially
 * - Updating hot-reload modules one at a time
 *
 * @template T - Type of values in the iterable
 * @param values - Iterable collection of values to process
 * @param callback - Async callback to execute for each value
 * @returns Promise that resolves when all callbacks have completed
 *
 * @example
 * ```ts
 * await runSequentially([1, 2, 3], async (num, index) => {
 *   console.log(`Processing ${num} at index ${index}`);
 *   await someAsyncOperation(num);
 * });
 * ```
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
