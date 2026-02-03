/**
 * Parallel execution utility with controlled concurrency.
 *
 * This module provides utilities for running async operations in parallel
 * while limiting the number of concurrent executions. This is critical for
 * hot-reload performance where we need to process many files quickly without
 * overwhelming the system.
 */

export type ParallelCallback<T> = (value: T, index: number) => void | Promise<void>;

export interface ParallelRunnerOptions {
    /**
     * Maximum number of concurrent operations.
     * Defaults to 4 if not specified.
     */
    concurrency?: number;
}

/**
 * Runs async operations in parallel with controlled concurrency.
 *
 * Unlike `runSequentially`, this utility processes multiple items at once
 * up to the specified concurrency limit, significantly reducing total
 * processing time for large batches.
 *
 * @param values - Items to process
 * @param callback - Async function to run for each item
 * @param options - Configuration options
 *
 * @example
 * ```ts
 * // Process 100 files with max 8 concurrent reads
 * await runInParallel(files, async (file) => {
 *   const content = await readFile(file);
 *   await processContent(content);
 * }, { concurrency: 8 });
 * ```
 */
export async function runInParallel<T>(
    values: Iterable<T>,
    callback: ParallelCallback<T>,
    options: ParallelRunnerOptions = {}
): Promise<void> {
    const { concurrency = 4 } = options;
    const entries = Array.from(values);

    if (entries.length === 0) {
        return;
    }

    if (concurrency <= 0) {
        throw new Error("Concurrency must be a positive integer");
    }

    if (concurrency === 1) {
        for (const [i, entry] of entries.entries()) {
            // eslint-disable-next-line no-await-in-loop -- Sequential processing is intentional when concurrency is 1
            await callback(entry, i);
        }
        return;
    }

    if (entries.length === 1) {
        await callback(entries[0], 0);
        return;
    }

    let index = 0;
    const workers: Array<Promise<void>> = [];

    const worker = async (): Promise<void> => {
        while (index < entries.length) {
            const currentIndex = index++;
            // eslint-disable-next-line no-await-in-loop -- Workers process items sequentially from shared queue
            await callback(entries[currentIndex], currentIndex);
        }
    };

    const workerCount = Math.min(concurrency, entries.length);
    for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
    }

    await Promise.all(workers);
}
