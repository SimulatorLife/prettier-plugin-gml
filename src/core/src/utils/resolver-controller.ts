import { assertFunction } from "./object.js";

type ResolverControllerConfig<TResult> = {
    name?: string;
    errorMessage?: string;
    defaultFactory: () => TResult;
    normalize?: (result: unknown) => TResult;
};

/**
 * Create a controller for managing optional resolver functions with fallback to
 * a default value. Resolvers allow external customization of configuration or
 * behavior while maintaining sensible defaults when no customization is provided.
 *
 * When a custom resolver is registered via `set()`, calls to `resolve()` invoke
 * that resolver and return its result after normalization. When no resolver is
 * registered, `resolve()` returns a fresh default value from `defaultFactory`.
 *
 * @template TOptions - Options object passed to resolver functions
 * @template TResult - The resolved value type
 * @param config - Configuration for the controller
 * @returns Controller with resolve, set, and restore methods
 */
export function createResolverController<TOptions, TResult>(
    config: ResolverControllerConfig<TResult>
) {
    const {
        name = "resolver",
        errorMessage,
        defaultFactory,
        normalize = (result) => result as TResult
    } = config;

    if (typeof defaultFactory !== "function") {
        throw new TypeError("defaultFactory must be a function.");
    }

    let resolver: ((options?: TOptions) => unknown) | null = null;
    let cachedDefault: TResult | null = null;

    function resolve(options?: TOptions): TResult {
        if (!resolver) {
            if (!cachedDefault) {
                cachedDefault = defaultFactory();
            }
            return cachedDefault;
        }
        const result = resolver(options ?? ({} as TOptions));
        return normalize(result);
    }

    function set(candidate: unknown): TResult {
        resolver = assertFunction(candidate, name, { errorMessage });
        return resolve();
    }

    function restore(): TResult {
        resolver = null;
        cachedDefault = null;
        return resolve();
    }

    return Object.freeze({ resolve, set, restore });
}
