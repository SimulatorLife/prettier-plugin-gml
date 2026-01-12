import * as Core from "@gml-modules/core";

export type BuiltInEmitter = (args: ReadonlyArray<string>) => string;

/**
 * Lazy-loaded set of builtin function names.
 *
 * Loading GameMaker's manual metadata (~1.3 MB JSON, ~1787 functions) at
 * module initialization was causing ~7 MB of persistent heap allocation.
 * By deferring the load until first use and caching only the name Set
 * (not thousands of identical closure instances), we reduce peak memory
 * significantly while preserving the same public API.
 */
let cachedBuiltinNames: Set<string> | null = null;

function getBuiltinNames(): Set<string> {
    if (cachedBuiltinNames === null) {
        cachedBuiltinNames = Core.Core.loadManualFunctionNames();
    }
    return cachedBuiltinNames;
}

/**
 * Generic builtin function emitter.
 *
 * All GameMaker builtin functions emit as simple calls: `name(args)`.
 * Rather than storing 1787 identical closure instances, we use a single
 * formatter and look up names on demand.
 */
function emitBuiltinCall(name: string, args: ReadonlyArray<string>): string {
    return `${name}(${args.join(", ")})`;
}

/**
 * Proxy object that lazily checks if a name is a builtin and emits the call.
 *
 * This object behaves like the old `Record<string, BuiltInEmitter>` but
 * doesn't pre-allocate entries. Instead, property access triggers a
 * runtime lookup against the cached name Set.
 *
 * **DEPRECATED for internal use**: New code should call `isBuiltinFunction`
 * and `emitBuiltinFunction` directly rather than indexing this proxy. The proxy
 * exists only for backward compatibility with existing emitter code that
 * expects `builtInFunctions[name]`.
 */
export const builtInFunctions: Record<string, BuiltInEmitter> = new Proxy({} as Record<string, BuiltInEmitter>, {
    get(_target, prop: string): BuiltInEmitter | undefined {
        const builtins = getBuiltinNames();
        if (builtins.has(prop)) {
            return (args: ReadonlyArray<string>) => emitBuiltinCall(prop, args);
        }
        // eslint-disable-next-line consistent-return -- Returning undefined for non-builtin names is intentional
        return undefined;
    },
    has(_target, prop: string): boolean {
        return getBuiltinNames().has(prop);
    },
    ownKeys(): ArrayLike<string | symbol> {
        return Array.from(getBuiltinNames());
    },
    getOwnPropertyDescriptor(_target, prop: string): PropertyDescriptor | undefined {
        const builtins = getBuiltinNames();
        if (builtins.has(prop)) {
            return {
                enumerable: true,
                configurable: true,
                writable: false,
                value: (args: ReadonlyArray<string>) => emitBuiltinCall(prop, args)
            };
        }
        // eslint-disable-next-line consistent-return -- Returning undefined for non-builtin names is intentional
        return undefined;
    }
});

/**
 * Check if a given name is a known GameMaker builtin function.
 *
 * Prefer this over indexing `builtInFunctions[name]` for new code.
 */
export function isBuiltinFunction(name: string): boolean {
    return getBuiltinNames().has(name);
}

/**
 * Emit a builtin function call.
 *
 * Prefer this over `builtInFunctions[name](args)` for new code.
 */
export function emitBuiltinFunction(name: string, args: ReadonlyArray<string>): string {
    return emitBuiltinCall(name, args);
}
