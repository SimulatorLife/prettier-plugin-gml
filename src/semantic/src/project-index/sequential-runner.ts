export type SequentialCallback<T> = (value: T, index: number) => void | Promise<void>;

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
