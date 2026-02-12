/**
 * Prototype method definition utilities.
 *
 * This module provides utilities for dynamically defining methods on prototype objects.
 * Used to generate wrapper methods for ANTLR-generated visitors and listeners without
 * manual boilerplate.
 *
 * @module parser/runtime/prototype-builder
 */

export type MethodFactory = (methodName: string) => (...args: unknown[]) => unknown;

/**
 * Defines a set of methods on a prototype object using a factory function.
 *
 * @param prototype - The prototype object to add methods to
 * @param methodNames - Array of method names to define
 * @param createMethod - Factory function that creates method implementations
 *
 * @remarks
 * Methods are defined with configurable and writable descriptors, allowing them
 * to be overridden if needed. This is used to generate wrapper methods that delegate
 * to a shared dispatch mechanism.
 */
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
