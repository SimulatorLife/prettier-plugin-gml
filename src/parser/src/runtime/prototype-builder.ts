export type MethodFactory = (methodName: string) => (...args: unknown[]) => unknown;

export function definePrototypeMethods(
    prototype: unknown,
    methodNames: ReadonlyArray<string>,
    createMethod: MethodFactory
): void {
    if (!prototype || typeof prototype !== "object" || typeof createMethod !== "function") {
        return;
    }

    for (const methodName of methodNames) {
        Object.defineProperty(prototype, methodName, {
            value: createMethod(methodName),
            writable: true,
            configurable: true
        });
    }
}
