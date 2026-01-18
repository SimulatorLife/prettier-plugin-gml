declare global {
    interface Array<T> {
        toSorted(compareFn?: (left: T, right: T) => number): T[];
    }
}

export {};
